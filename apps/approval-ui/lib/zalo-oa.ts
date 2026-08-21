// lib/zalo-oa.ts — dang bai len Zalo Official Account (khung, user yeu cau 20/8).
//
// TRANG THAI: KHUNG DA NOI DAY, cho SDVICO cau hinh. Can lam 1 lan (xem
// docs/runbook-zalo-oa-setup.md):
//   1. Co Zalo OA da XAC THUC (OA thuong khong duoc dung API bai viet).
//   2. Tao app tren developers.zalo.me, lien ket OA, xin quyen Official Account API.
//   3. Lay access_token + refresh_token (OAuth) -> luu vao bang mkt_oauth_tokens
//      (provider='zalo') giong TikTok, hoac env ZALO_OA_ACCESS_TOKEN cho ban dau.
//
// Zalo access_token song 25 gio, refresh_token 3 thang — dung mkt_oauth_tokens de tu refresh
// nhu TikTok (lib/tiktok.ts lam mau). Phien nay: ham publishToZaloOA gui BAI VIET dang
// "broadcast article" don gian nhat: tao article (dang draft tren OA) — nguoi quan ly OA
// bam dang trong trinh quan ly OA neu API verify chua du quyen.

import { getServerClient } from './supabase-server';

type Client = ReturnType<typeof getServerClient>;

const ZALO_OA_API = 'https://openapi.zalo.me/v2.0/article';

async function getZaloToken(client: Client): Promise<string | null> {
  // Uu tien bang mkt_oauth_tokens (tu refresh sau nay), fallback env.
  try {
    const { data } = await client.from('mkt_oauth_tokens').select('access_token, expires_at').eq('provider', 'zalo').maybeSingle();
    if (data && (data as any).access_token) {
      const exp = (data as any).expires_at ? new Date((data as any).expires_at).getTime() : 0;
      if (!exp || exp - Date.now() > 5 * 60 * 1000) return (data as any).access_token as string;
    }
  } catch { /* bang chua co provider zalo */ }
  const envToken = (process.env.ZALO_OA_ACCESS_TOKEN || '').trim();
  return envToken || null;
}

export async function zaloOaStatus(client: Client): Promise<{ configured: boolean; text: string }> {
  const token = await getZaloToken(client);
  if (!token) {
    return { configured: false, text: 'Chưa kết nối. Cần Zalo OA đã xác thực + app developers.zalo.me. Xem docs/runbook-zalo-oa-setup.md.' };
  }
  return { configured: true, text: 'Đã có token Zalo OA. Bài có thể tạo dưới dạng bài viết OA (draft) chờ đăng.' };
}

// Tao BAI VIET (article) tren Zalo OA. Tra ve id/token de theo doi. Zalo tao article o trang
// thai "hide" — goi them /article/verify de xuat ban khi app du quyen.
export async function createZaloArticle(
  client: Client,
  opts: { title: string; body: string; coverUrl?: string | null }
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const token = await getZaloToken(client);
  if (!token) return { ok: false, error: 'Chua cau hinh Zalo OA (xem docs/runbook-zalo-oa-setup.md)' };
  try {
    const payload = {
      type: 'normal',
      title: opts.title.slice(0, 150),
      author: 'SDVICO',
      cover: opts.coverUrl
        ? { cover_type: 'photo', photo_url: opts.coverUrl, status: 'show' }
        : { cover_type: 'photo', photo_url: '', status: 'hide' },
      description: opts.body.slice(0, 200),
      body: [{ type: 'text', content: opts.body.slice(0, 5000) }],
      status: 'hide', // tao dang nhap; quan ly OA duyet dang trong OA Manager
      comment: 'show',
    };
    const r = await fetch(`${ZALO_OA_API}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: token },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const j: any = await r.json();
    if (j?.error && j.error !== 0) return { ok: false, error: `Zalo loi ${j.error}: ${j.message || ''}` };
    return { ok: true, token: j?.data?.token || null };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
