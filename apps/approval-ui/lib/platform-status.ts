import { getServerClient } from './supabase-server';

// Trạng thái kết nối Facebook + TikTok, tách từ app/ket-noi/page.tsx (21/8) để trang
// Tổng quan kênh (/tong-quan) dùng chung, khỏi nhân đôi logic gọi Graph/token.

export async function fbStatus(): Promise<{ ok: boolean; text: string }> {
  const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!TOKEN) return { ok: false, text: 'Chưa đặt token (FACEBOOK_PAGE_ACCESS_TOKEN trên Vercel).' };
  try {
    const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
    // no-store: tranh Next Data Cache dong bang response loi (cung bai hoc voi YouTube 20/8).
    const r = await fetch(`https://graph.facebook.com/${VERSION}/me?fields=name`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store'
    });
    const j: any = await r.json();
    if (j?.error) return { ok: false, text: `Token lỗi: ${j.error.message}` };
    return { ok: true, text: `Đã kết nối Page: ${j?.name || '(không đọc được tên)'}. Máy tự đăng khi bấm Duyệt.` };
  } catch (e: any) {
    return { ok: false, text: 'Không gọi được Facebook: ' + String(e?.message || e) };
  }
}

export async function tiktokStatus(): Promise<{ ok: boolean; text: string }> {
  try {
    const client = getServerClient();
    const { data } = await client
      .from('mkt_oauth_tokens')
      .select('open_id, scope, refresh_expires_at')
      .eq('provider', 'tiktok')
      .maybeSingle();
    if (!data) return { ok: false, text: 'Chưa kết nối. Vào trang chi tiết bấm Kết nối TikTok.' };
    const hasPublish = String((data as any).scope || '').includes('video.publish');
    return {
      ok: hasPublish,
      text: hasPublish
        ? 'Đã kết nối, máy tự đăng video khi bấm Duyệt. Chưa qua audit nên chỉ đăng được chế độ riêng tư/bạn bè.'
        : 'Đã kết nối nhưng thiếu quyền video.publish, kết nối lại ở trang chi tiết.'
    };
  } catch {
    return { ok: false, text: 'Không đọc được trạng thái token.' };
  }
}
