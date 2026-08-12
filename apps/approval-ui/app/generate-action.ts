'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../lib/supabase-server';
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

// Bấm nút thì chạy đúng luồng Bước 1 và 2: bốc một từ khóa chưa có bài, sinh 3 định dạng
// bằng Gemini, quét cả compliance lẫn brand-voice, đẩy vào hàng đợi duyệt. KHÔNG đăng gì.
export async function generateNow(): Promise<{ ok: boolean; message: string }> {
  const client = getServerClient();

  const { data: factRows } = await client
    .from('product_facts')
    .select('category,brand,model,attribute,value,verified');
  const facts: any[] = factRows || [];
  const known = (knownFactValues as any)(facts);
  const testVals = (testFactValues as any)(facts);

  const { data: existing } = await client.from('mkt_content').select('brief');
  const done = new Set((existing || []).map((r: any) => r?.brief?.keyword).filter(Boolean));

  const { data: kws } = await client
    .from('mkt_keywords')
    .select('keyword,intent,landing_url,priority')
    .order('priority', { ascending: false })
    .limit(80);
  const kw = (kws || []).find((k: any) => !done.has(k.keyword));
  if (!kw) return { ok: false, message: 'Hết từ khóa chưa có bài. Thêm từ khóa mới ở Kho từ khóa.' };

  const all: any = await (generateAllFormats as any)(kw, { facts });
  let count = 0;
  for (const fmt of FORMATS) {
    const piece = all[fmt.key];
    const text = `${piece.title}\n${piece.draft}`;
    const assess: any = (assessDraft as any)(text, { knownFactValues: known, testFactValues: testVals });
    const style: string[] = (scanStyle as any)(text);
    const risk = assess.risk === 'red' ? 'red' : assess.risk === 'amber' || style.length > 0 ? 'amber' : 'none';
    const flagsAll = { ...assess.flags, style };

    const { data: inserted } = await client
      .from('mkt_content')
      .insert({
        kind: fmt.kind,
        title: piece.title,
        brief: { ...all.brief, format: fmt.key, risk, compliance: flagsAll },
        draft: piece.draft,
        status: risk === 'red' ? 'review' : 'draft',
        needs_gov_review: risk === 'red'
      })
      .select('id')
      .single();

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

  revalidatePath('/');
  revalidatePath('/noi-dung');
  const gen = all.brief?.generator === 'gemini' ? 'Gemini' : 'bản mẫu';
  return { ok: true, message: `Đã sinh ${count} bản cho "${kw.keyword}" bằng ${gen}.` };
}
