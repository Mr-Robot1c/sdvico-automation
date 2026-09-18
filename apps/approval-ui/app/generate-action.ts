'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../lib/supabase-server';
// Lõi sinh 3 định dạng (web/Facebook/video) cho một từ khóa — tách sang module thuần TS 18/9
// để route cron /api/blog-keyword dùng CHUNG, không chép code 2 bản (xem lib/gen/generate-for-kw.ts).
import { generateForKw } from '../lib/gen/generate-for-kw';

// Bấm nút thì chạy đúng luồng Bước 1 và 2: bốc một từ khóa chưa có bài, sinh 3 định dạng
// bằng Gemini, quét cả compliance lẫn brand-voice, đẩy vào hàng đợi duyệt. KHÔNG đăng gì.
export async function generateNow(): Promise<{ ok: boolean; message: string }> {
  const client = getServerClient();

  const { data: existing } = await client.from('mkt_content').select('brief');
  const done = new Set((existing || []).map((r: any) => r?.brief?.keyword).filter(Boolean));

  const { data: kws } = await client
    .from('mkt_keywords')
    .select('id,keyword,intent,landing_url,priority')
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
    .select('id,keyword,intent,landing_url,priority')
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
