// lib/youtube-publish.ts — upload video len YouTube (Shorts) qua YouTube Data API v3.
//
// SDVICO chua co kenh + Google Cloud project khi build item 3. User phai:
//   1. Tao kenh YouTube
//   2. Tao Google Cloud project + enable "YouTube Data API v3"
//   3. Tao OAuth 2.0 credentials (Desktop app), tai xuong client_id + client_secret
//   4. Chay `node apps/approval-ui/scripts/youtube-oauth-token.mjs` mot lan de lay refresh_token
//   5. Dat 3 env vars tren Vercel: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
// Xem docs/runbook-youtube-setup.md cho tung buoc chi tiet.
//
// Tai sao KHONG lay OAuth qua UI /youtube nhu TikTok:
//   - Google Cloud yeu cau ung dung PUBLISHED de nguoi ngoai dung; app dang "Testing" chi cho
//     100 test user va token refresh chi song 7 ngay. Voi 1 kenh SDVICO (khong phai SaaS), dung
//     refresh_token dai han cua chinh chu kenh SET len Vercel goi la tot va don gian nhat.
//   - Chuyen sang OAuth flow day du khi can nhieu kenh/nguoi (khong phai gio).
//
// Shorts requirements (Youtube 2024+): video doc 9:16, duoi 60s, kem #Shorts trong title
// hoac description. Video pipeline hien tai da sinh ban vertical 9:16 60s => du dieu kien.

import { fetchWithRetry } from './retry';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';

export type YouTubeUploadResult = {
  ok: boolean;
  videoId?: string;
  url?: string;
  error?: string;
  steps: Record<string, any>;
};

// Doi refresh_token lay access_token moi. Google access_token song 1h; refresh_token vinh
// vien voi app "In production" (7 ngay voi app "Testing" — luu y trong runbook).
async function getAccessToken(): Promise<string> {
  const clientId = (process.env.YOUTUBE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || '').trim();
  const refreshToken = (process.env.YOUTUBE_REFRESH_TOKEN || '').trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Thieu 1 trong 3 bien moi truong YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN. Xem docs/runbook-youtube-setup.md.'
    );
  }
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }),
    cache: 'no-store'
  });
  const j: any = await res.json();
  if (!res.ok || !j.access_token) {
    throw new Error('YouTube refresh token loi: ' + (j.error_description || j.error || `HTTP ${res.status}`));
  }
  return String(j.access_token);
}

// Kiem tra ket noi YouTube cho trang /youtube: da cau hinh du 3 env chua, va neu co thi
// goi API lay ten kenh de hien "Da ket noi kenh X". Loi khong nem ra ngoai (trang van hien).
export async function getYouTubeChannelInfo(): Promise<{ configured: boolean; channelTitle: string | null; error: string | null }> {
  const configured = !!(
    (process.env.YOUTUBE_CLIENT_ID || '').trim() &&
    (process.env.YOUTUBE_CLIENT_SECRET || '').trim() &&
    (process.env.YOUTUBE_REFRESH_TOKEN || '').trim()
  );
  if (!configured) return { configured: false, channelTitle: null, error: null };
  try {
    const at = await getAccessToken();
    // cache: 'no-store' BAT BUOC — Next Data Cache tung dong bang mot response 401 thoang qua
    // cua request nay va tra lai loi do mai (bug bat duoc 20/8 khi lam trang /ket-noi).
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${at}` },
      cache: 'no-store'
    });
    const j: any = await r.json();
    if (!r.ok) return { configured: true, channelTitle: null, error: j?.error?.message || `HTTP ${r.status}` };
    const title = j?.items?.[0]?.snippet?.title || null;
    return { configured: true, channelTitle: title, error: title ? null : 'khong doc duoc ten kenh' };
  } catch (e: any) {
    return { configured: true, channelTitle: null, error: String(e?.message || e) };
  }
}

// Sanitize tieu de/mo ta cho YouTube (100 ky tu title, 5000 ky tu description).
function truncate(s: string, max: number): string {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

// Rut cau ngan cho YouTube title (thay vi caption dai). Uu tien dong dau.
function makeTitle(rawTitle: string, caption: string): string {
  const clean = truncate(rawTitle, 90);
  if (clean && clean.length >= 8) return clean;
  const firstLine = String(caption || '').split(/\n|\.|!/)[0]?.trim() || 'Video SDVICO';
  return truncate(firstLine, 90);
}

function makeDescription(caption: string): string {
  const body = String(caption || '').trim();
  // #Shorts + kem CTA + link Page/website (tuan brand-voice, khong gach dai/mui ten).
  const tail = [
    '',
    '',
    'Nhan tin cho Page SDVICO hoac goi tong dai 1900 23 23 49 de duoc tu van, bao gia va lap dat tan ben.',
    'Website: https://sdvico.vn',
    '',
    '#Shorts #SDVICO #tauca #thietbitauca'
  ].join('\n');
  return truncate(body + tail, 5000);
}

// Upload video theo cach RESUMABLE: (1) POST metadata + header X-Upload-Content-Type ->
// tra ve Location URL, (2) PUT binary vao URL do. Con 1 buoc metadata roi PUT truc tiep
// binary (khong resumable) cung duoc voi file duoi 128MB — YouTube Shorts thuong ~5-15MB.
// Dung MULTIPART upload cho don gian (1 request), phu hop file nho.
export async function postVideoToYouTube(opts: { videoUrl: string; title: string; caption: string; tags?: string[] }): Promise<YouTubeUploadResult> {
  const steps: Record<string, any> = {};
  try {
    // 1. Get access_token.
    const accessToken = await getAccessToken();
    steps.token = 'ok';

    // 2. Tai file video (Supabase Storage getPublicUrl da mo, khong can Auth).
    const vRes = await fetchWithRetry(opts.videoUrl);
    if (!vRes.ok) throw new Error(`Tai video that bai: HTTP ${vRes.status}`);
    const videoBuf = Buffer.from(await vRes.arrayBuffer());
    steps.videoBytes = videoBuf.length;
    if (videoBuf.length > 256 * 1024 * 1024) {
      throw new Error('Video qua lon (>256MB) — Shorts nen duoi 60MB. Kiem lai file.');
    }

    // 3. Metadata JSON body.
    const meta = {
      snippet: {
        title: makeTitle(opts.title, opts.caption),
        description: makeDescription(opts.caption),
        tags: (opts.tags && opts.tags.length ? opts.tags : ['SDVICO', 'tauca', 'Shorts']).slice(0, 15),
        categoryId: '22' // People & Blogs
      },
      status: {
        privacyStatus: 'public',  // Muon dat 'unlisted' hoac 'private' de test thi doi bien env YOUTUBE_PRIVACY
        selfDeclaredMadeForKids: false
      }
    };
    const privacyOverride = (process.env.YOUTUBE_PRIVACY || '').trim().toLowerCase();
    if (privacyOverride === 'private' || privacyOverride === 'unlisted') {
      meta.status.privacyStatus = privacyOverride;
    }

    // 4. Multipart body: metadata + video, tach bang boundary chuan RFC 1341.
    const boundary = 'sdvico_yt_' + Math.random().toString(36).slice(2);
    const metaPart = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
      'utf8'
    );
    const tailPart = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([metaPart, videoBuf, tailPart]);

    const url = `${UPLOAD_URL}?uploadType=multipart&part=snippet,status`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body
    });
    const j: any = await res.json();
    steps.upload = { status: res.status, id: j?.id, err: j?.error?.message };
    if (!res.ok || !j?.id) {
      const msg = j?.error?.message || j?.error_description || `HTTP ${res.status}`;
      throw new Error('Upload YouTube that bai: ' + msg);
    }
    const videoId = String(j.id);
    return { ok: true, videoId, url: `https://youtube.com/shorts/${videoId}`, steps };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e), steps };
  }
}
