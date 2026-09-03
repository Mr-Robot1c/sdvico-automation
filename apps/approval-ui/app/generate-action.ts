'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../lib/supabase-server';
import { slugify, siteUrl } from '../lib/seo';
// Các module sinh nội dung dùng chung (bản .mjs chép từ packages/marketing).
// @ts-ignore module JS không có kiểu
import { generateAllFormats } from '../lib/gen/content.mjs';
// @ts-ignore
import { assessDraft } from '../lib/gen/compliance.mjs';
// @ts-ignore
import { scanStyle } from '../lib/gen/brand-voice-check.mjs';
// @ts-ignore
import { knownFactValues, testFactValues } from '../lib/gen/product-facts.mjs';

const FORMATS = [
  { key: 'article', kind: 'article', channel: 'website', label: 'Website' },
  { key: 'social', kind: 'social', channel: 'facebook', label: 'Facebook' },
  { key: 'video', kind: 'video', channel: 'youtube', label: 'Video' }
];

// Lõi dùng chung cho nút "Sinh bài" và nút "Viết bài" ở /tu-khoa: sinh 3 định dạng cho MỘT
// từ khóa. 3/9 (user chốt): bản WEBSITE sạch (risk none, không chạm quy định) TỰ ĐĂNG blog
// luôn — blog là web của mình; chỉ bài NỀN TẢNG (Facebook/video) mới qua hàng đợi duyệt
// (điều cấm 1 giữ nguyên cho mọi kênh ngoài). Bài red/amber hoặc chạm quy định vẫn vào
// duyệt như cũ (điều cấm 3 tuyệt đối).
async function generateForKw(client: any, kw: any): Promise<{ count: number; gen: string; blogUrl: string | null }> {
  const { data: factRows } = await client
    .from('product_facts')
    .select('category,brand,model,attribute,value,verified');
  const facts: any[] = factRows || [];
  const known = (knownFactValues as any)(facts);
  const testVals = (testFactValues as any)(facts);

  const all: any = await (generateAllFormats as any)(kw, { facts });
  let count = 0;
  let blogUrl: string | null = null;
  for (const fmt of FORMATS) {
    const piece = all[fmt.key];
    const text = `${piece.title}\n${piece.draft}`;
    const assess: any = (assessDraft as any)(text, { knownFactValues: known, testFactValues: testVals });
    const style: string[] = (scanStyle as any)(text);
    const risk = assess.risk === 'red' ? 'red' : assess.risk === 'amber' || style.length > 0 ? 'amber' : 'none';
    const flagsAll = { ...assess.flags, style };
    const autoBlog = fmt.key === 'article' && risk === 'none';

    const { data: inserted } = await client
      .from('mkt_content')
      .insert({
        kind: fmt.kind,
        title: piece.title,
        brief: { ...all.brief, format: fmt.key, risk, compliance: flagsAll },
        draft: piece.draft,
        status: autoBlog ? 'published' : risk === 'red' ? 'review' : 'draft',
        needs_gov_review: risk === 'red'
      })
      .select('id')
      .single();

    if (autoBlog && inserted?.id) {
      // Slug đúng format loadPublicPosts đang dò: <slug tiêu đề>-<8 ký tự đầu id>.
      const slug = `${slugify(piece.title)}-${String(inserted.id).slice(0, 8)}`;
      const url = `${siteUrl()}/blog/${slug}`;
      const { error: postErr } = await client.from('mkt_posts').insert({
        content_id: inserted.id,
        channel: 'website',
        status: 'published',
        external_url: url,
        published_at: new Date().toISOString()
      });
      if (!postErr) {
        blogUrl = url;
        await client.from('run_log').insert({
          task: 'mkt.blog_publish',
          actor: 'nguoi-bam',
          status: 'ok',
          detail: { content_id: inserted.id, url, keyword: kw.keyword, msg: 'bài Website sạch tự đăng blog' }
        });
        count++;
        continue; // đã đăng blog — KHÔNG vào hàng đợi duyệt
      }
      // Ghi mkt_posts lỗi -> rơi về đường duyệt bên dưới, không mất bài.
    }

    await client.from('approval_queue').insert({
      kind: 'mkt_publish_content',
      title: `[${fmt.label}] ${piece.title}`,
      payload: {
        content_id: inserted?.id,
        format: fmt.key,
        channel: fmt.channel,
        keyword: kw.keyword,
        intent: kw.intent,
        landing_url: kw.landing_url,
        risk,
        needs_manager_approval: assess.needsManagerApproval,
        compliance: flagsAll
      },
      ref_table: 'mkt_content',
      ref_id: inserted?.id,
      status: 'pending'
    });
    count++;
  }
  return { count, gen: all.brief?.generator === 'gemini' ? 'Gemini' : 'bản mẫu', blogUrl };
}

// Bấm nút thì chạy đúng luồng Bước 1 và 2: bốc một từ khóa chưa có bài, sinh 3 định dạng
// bằng Gemini, quét cả compliance lẫn brand-voice, đẩy vào hàng đợi duyệt. KHÔNG đăng gì.
export async function generateNow(): Promise<{ ok: boolean; message: string }> {
  const client = getServerClient();

  const { data: existing } = await client.from('mkt_content').select('brief');
  const done = new Set((existing || []).map((r: any) => r?.brief?.keyword).filter(Boolean));

  const { data: kws } = await client
    .from('mkt_keywords')
    .select('keyword,intent,landing_url,priority')
    .order('priority', { ascending: false })
    .limit(80);
  const kw = (kws || []).find((k: any) => !done.has(k.keyword));
  if (!kw) return { ok: false, message: 'Hết từ khóa chưa có bài. Thêm từ khóa mới ở Kho từ khóa.' };

  const { count, gen, blogUrl } = await generateForKw(client, kw);
  revalidatePath('/');
  revalidatePath('/noi-dung');
  if (blogUrl) revalidatePath('/blog');
  return {
    ok: true,
    message: `Đã sinh ${count} bản cho "${kw.keyword}" bằng ${gen}.${blogUrl ? ` Bài web đã lên blog: ${blogUrl}` : ''}`
  };
}

// 1/9: nút "Viết bài" từng dòng ở /tu-khoa — sinh bài từ MỘT từ khóa người chọn. Kho 152 từ
// mồ côi từ khi đường cron theo từ khóa tắt 21/8; đường này người bấm mới chạy, không có cron.
export async function generateFromKeyword(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const client = getServerClient();

  const { data: kw } = await client
    .from('mkt_keywords')
    .select('keyword,intent,landing_url,priority')
    .eq('id', id)
    .maybeSingle();
  if (!kw) return;

  // Từ khóa đã có bài thì thôi (UI cũng ẩn nút bằng badge "đã có bài").
  const { data: dup } = await client
    .from('mkt_content')
    .select('id')
    .eq('brief->>keyword', (kw as any).keyword)
    .limit(1);
  if (dup && dup.length) {
    revalidatePath('/tu-khoa');
    return;
  }

  const { blogUrl } = await generateForKw(client, kw);
  if (blogUrl) revalidatePath('/blog');
  revalidatePath('/tu-khoa');
  revalidatePath('/noi-dung');
}
