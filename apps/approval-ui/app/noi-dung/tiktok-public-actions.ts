'use server';

// Đánh dấu bài TikTok đã đăng riêng tư (API) là ĐÃ ĐỔI CÔNG KHAI tay trên app TikTok.
// Nền tảng SDVICO không được TikTok audit ("internal company use" — reject 26/8/2026), video
// buộc lên chế độ SELF_ONLY. Người marketing mở app TikTok, 3 chấm, đổi Công khai, rồi bấm
// nút này để hệ thống biết bài đã được xử — thẻ ở /noi-dung chuyển từ chip vàng sang chip xanh.
// URL bài (tuỳ chọn): nếu user copy được link TikTok công khai thì paste vào để lần sau bấm
// mở được. Không paste vẫn OK.

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../lib/supabase-server';

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

export async function markTikTokPublic(postId: string, url?: string): Promise<void> {
  if (!postId) throw new Error('Thiếu postId.');
  const client = getServerClient();
  const patch: Record<string, any> = { made_public_at: new Date().toISOString() };
  const trimmed = (url || '').trim();
  if (trimmed && isHttpUrl(trimmed)) patch.external_url = trimmed;
  // Supabase client không throw khi insert/update lỗi (bảng thiếu cột, RLS, constraint) — phải
  // check error object thủ công (bẫy đã bắt ở webhook Facebook, xem [[sdvico-handoff-25-26-08]]).
  const { error } = await client.from('mkt_posts').update(patch).eq('id', postId);
  if (error) throw new Error('Cập nhật mkt_posts lỗi: ' + error.message);

  // Ghi audit trail — người nào bấm, có URL không. Fire-and-forget: lỗi log không chặn UI.
  try {
    await client.from('run_log').insert({
      task: 'mkt.tiktok_marked_public',
      actor: 'user',
      status: 'ok',
      detail: { postId, hasUrl: !!(trimmed && isHttpUrl(trimmed)) }
    });
  } catch {
    /* bỏ qua lỗi ghi log */
  }

  revalidatePath('/noi-dung');
}

export async function undoMarkTikTokPublic(postId: string): Promise<void> {
  if (!postId) throw new Error('Thiếu postId.');
  const client = getServerClient();
  const { error } = await client.from('mkt_posts').update({ made_public_at: null }).eq('id', postId);
  if (error) throw new Error('Bỏ đánh dấu lỗi: ' + error.message);
  revalidatePath('/noi-dung');
}
