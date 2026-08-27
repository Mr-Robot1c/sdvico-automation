import { getServerClient } from './supabase-server';

// Trạng thái kết nối Facebook + TikTok, tách từ app/ket-noi/page.tsx (21/8) để trang
// Tổng quan kênh (/tong-quan) dùng chung, khỏi nhân đôi logic gọi Graph/token.

export type FbStatus = {
  ok: boolean;
  text: string;
  pages: Array<{ label: 'test' | 'real'; name: string; url: string | null; pageId: string | null }>;
  realPageUrl: string | null;
};

// User 27/8 sep: neu khong the dang tu dong duoc thi it nhat phai hien LINK Page chinh
// thuc de bam vao xem. Hardcode https://www.facebook.com/SDVICOVN (SDVICO Page thuc),
// override duoc qua env FACEBOOK_REAL_PAGE_URL.
const DEFAULT_REAL_PAGE_URL = 'https://www.facebook.com/SDVICOVN';

export async function fbStatus(): Promise<FbStatus> {
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const realUrl = (process.env.FACEBOOK_REAL_PAGE_URL || DEFAULT_REAL_PAGE_URL).trim();
  const tokens: Array<{ label: 'test' | 'real'; token: string; pageId: string | null }> = [];
  if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN) tokens.push({ label: 'test', token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN, pageId: process.env.FACEBOOK_PAGE_ID || null });
  if (process.env.FACEBOOK_REAL_PAGE_ACCESS_TOKEN) tokens.push({ label: 'real', token: process.env.FACEBOOK_REAL_PAGE_ACCESS_TOKEN, pageId: process.env.FACEBOOK_REAL_PAGE_ID || null });

  if (!tokens.length) return { ok: false, text: 'Chưa đặt token (FACEBOOK_PAGE_ACCESS_TOKEN trên Vercel).', pages: [], realPageUrl: realUrl };

  const pages: FbStatus['pages'] = [];
  let firstErr = '';
  for (const t of tokens) {
    try {
      const r = await fetch(`https://graph.facebook.com/${VERSION}/me?fields=name,link`, {
        headers: { Authorization: `Bearer ${t.token}` },
        cache: 'no-store',
      });
      const j: any = await r.json();
      if (j?.error) { if (!firstErr) firstErr = j.error.message; continue; }
      pages.push({
        label: t.label,
        name: String(j?.name || '(không đọc được tên)'),
        url: String(j?.link || (t.label === 'real' ? realUrl : '')) || null,
        pageId: t.pageId,
      });
    } catch (e: any) {
      if (!firstErr) firstErr = String(e?.message || e);
    }
  }
  if (!pages.length) return { ok: false, text: 'Token lỗi: ' + (firstErr || 'không rõ'), pages: [], realPageUrl: realUrl };

  const labels = pages.map((p) => `${p.name}${p.label === 'real' ? ' (chính thức)' : ' (test)'}`).join(', ');
  return {
    ok: true,
    text: `Đã kết nối ${pages.length} Page: ${labels}. Máy tự đăng khi bấm Duyệt.`,
    pages,
    realPageUrl: realUrl,
  };
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
