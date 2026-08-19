import { getServerClient } from './supabase-server';
import { fetchWithRetry } from './retry';

// Đăng video lên TikTok qua Content Posting API (Direct Post). Token lưu ở mkt_oauth_tokens,
// tự refresh khi gần hết hạn (access_token 24h). Chưa qua audit thì video ép về SELF_ONLY (riêng tư).
const TT = 'https://open.tiktokapis.com';

type Client = ReturnType<typeof getServerClient>;

type TokenRow = {
  access_token: string;
  refresh_token: string | null;
  open_id: string | null;
  scope: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
};

async function refreshToken(client: Client, row: TokenRow): Promise<string> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) throw new Error('Thiếu TIKTOK_CLIENT_KEY/SECRET');
  if (!row.refresh_token) throw new Error('Không có refresh_token — kết nối lại TikTok.');
  const res = await fetch(`${TT}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token
    })
  });
  const t: any = await res.json();
  if (!res.ok || t.error || !t.access_token) {
    throw new Error('Refresh token TikTok lỗi: ' + (t.error_description || t.error || `HTTP ${res.status}`));
  }
  const now = Date.now();
  await client
    .from('mkt_oauth_tokens')
    .update({
      access_token: t.access_token,
      refresh_token: t.refresh_token || row.refresh_token,
      expires_at: new Date(now + (Number(t.expires_in) || 0) * 1000).toISOString(),
      refresh_expires_at: t.refresh_expires_in
        ? new Date(now + Number(t.refresh_expires_in) * 1000).toISOString()
        : row.refresh_expires_at,
      scope: t.scope || row.scope,
      updated_at: new Date().toISOString()
    })
    .eq('provider', 'tiktok');
  return t.access_token;
}

export async function getValidTikTokToken(client: Client): Promise<{ accessToken: string; openId: string | null }> {
  const { data } = await client.from('mkt_oauth_tokens').select('*').eq('provider', 'tiktok').maybeSingle();
  if (!data) throw new Error('Chưa kết nối TikTok. Vào /tiktok bấm Kết nối.');
  const row = data as TokenRow;
  const expMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  // Refresh nếu hết hạn hoặc còn dưới 5 phút.
  if (!expMs || expMs - Date.now() < 5 * 60 * 1000) {
    const at = await refreshToken(client, row);
    return { accessToken: at, openId: row.open_id };
  }
  return { accessToken: row.access_token, openId: row.open_id };
}

// TikTok trả error.code = 'ok' khi thành công. Coi là lỗi khi code khác 'ok'.
function ttErr(j: any): string | null {
  const c = j?.error?.code;
  if (c && c !== 'ok') return `${c}: ${j.error?.message || ''}`.trim();
  return null;
}

export async function postVideoToTikTok(
  client: Client,
  opts: { videoUrl: string; caption: string }
): Promise<{ ok: boolean; publishId?: string; status?: string; privacy?: string; steps: any; error?: string }> {
  const steps: any = {};
  try {
    const { accessToken } = await getValidTikTokToken(client);
    const authJson = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8'
    };

    // 1. creator_info (bắt buộc trước Direct Post) — lấy các mức riêng tư cho phép.
    const ciRes = await fetch(`${TT}/v2/post/publish/creator_info/query/`, { method: 'POST', headers: authJson });
    const ci: any = await ciRes.json();
    const ciErr = ttErr(ci);
    steps.creatorInfo = ciErr ? { error: ci.error } : { privacy_options: ci?.data?.privacy_level_options };
    if (!ciRes.ok || ciErr) return { ok: false, steps, error: 'creator_info: ' + (ciErr || `HTTP ${ciRes.status}`) };
    const options: string[] = ci?.data?.privacy_level_options || [];
    // Ưu tiên PUBLIC nếu TikTok cho phép. TikTok CHỈ trả 'PUBLIC_TO_EVERYONE' trong options khi app
    // ĐÃ QUA AUDIT — chưa audit thì options chỉ có 'SELF_ONLY' (riêng tư), không ép public được bằng
    // code. env TIKTOK_PRIVACY: 'public'|'auto' = lấy public khi có; 'self' = luôn riêng tư (mặc định
    // auto -> sau khi audit đậu là tự động đăng public, không phải sửa code).
    const pref = (process.env.TIKTOK_PRIVACY || 'auto').toLowerCase();
    const wantPublic = pref === 'public' || pref === 'auto';
    const privacy = wantPublic && options.includes('PUBLIC_TO_EVERYONE')
      ? 'PUBLIC_TO_EVERYONE'
      : options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0] || 'SELF_ONLY';
    steps.privacyChosen = privacy;

    // 2. Tải video về (từ Supabase). Chuẩn hóa bằng ffmpeg (nướng chiều xoay + H.264/AAC) để TikTok
    //    không hiển thị nghiêng 90 độ; lỗi/thiếu ffmpeg thì dùng file gốc, KHÔNG chặn đăng.
    const vRes = await fetch(opts.videoUrl);
    if (!vRes.ok) return { ok: false, steps, error: 'tải video lỗi HTTP ' + vRes.status };
    let buf = Buffer.from(await vRes.arrayBuffer());
    steps.originalSize = buf.length;
    try {
      const { normalizeVideo } = await import('./video-normalize');
      buf = await normalizeVideo(buf);
      steps.normalized = true;
      steps.normalizedSize = buf.length;
    } catch (e: any) {
      steps.normalizeError = String(e?.message || e);
    }
    const videoSize = buf.length;
    steps.videoSize = videoSize;

    // 3. init Direct Post. Video <= 64MB đẩy 1 chunk; lớn hơn chia 10MB.
    const MAX_SINGLE = 64 * 1024 * 1024;
    const single = videoSize <= MAX_SINGLE;
    const chunkSize = single ? videoSize : 10 * 1024 * 1024;
    const totalChunks = single ? 1 : Math.ceil(videoSize / chunkSize);
    const initBody = {
      post_info: {
        title: (opts.caption || '').slice(0, 2190),
        privacy_level: privacy,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks
      }
    };
    const initRes = await fetchWithRetry(`${TT}/v2/post/publish/video/init/`, {
      method: 'POST',
      headers: authJson,
      body: JSON.stringify(initBody)
    });
    const init: any = await initRes.json();
    const initErr = ttErr(init);
    steps.init = initErr ? { error: init.error } : { publish_id: init?.data?.publish_id };
    if (!initRes.ok || initErr || !init?.data?.upload_url) {
      return { ok: false, steps, error: 'init: ' + (initErr || `HTTP ${initRes.status}`) };
    }
    const uploadUrl: string = init.data.upload_url;
    const publishId: string = init.data.publish_id;

    // 4. Đẩy từng chunk lên upload_url (tuần tự).
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, videoSize) - 1;
      const chunk = buf.subarray(start, end + 1);
      const upRes = await fetchWithRetry(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${end}/${videoSize}`
        },
        body: chunk
      });
      if (![200, 201, 206].includes(upRes.status)) {
        const txt = await upRes.text().catch(() => '');
        steps.upload = { error: `chunk ${i} HTTP ${upRes.status} ${txt.slice(0, 200)}` };
        return { ok: false, publishId, steps, error: 'upload chunk lỗi HTTP ' + upRes.status };
      }
    }
    steps.upload = { ok: true, chunks: totalChunks };

    // 5. Kiểm tra trạng thái xử lý.
    let status = 'PROCESSING';
    for (let k = 0; k < 6; k++) {
      const stRes = await fetch(`${TT}/v2/post/publish/status/fetch/`, {
        method: 'POST',
        headers: authJson,
        body: JSON.stringify({ publish_id: publishId })
      });
      const st: any = await stRes.json();
      status = st?.data?.status || status;
      steps.status = st?.data || st?.error;
      if (['PUBLISH_COMPLETE', 'FAILED', 'SEND_TO_USER_INBOX'].includes(status)) break;
      await new Promise((r) => setTimeout(r, 3000));
    }

    const ok = status === 'PUBLISH_COMPLETE' || status === 'PROCESSING_DOWNLOAD' || status === 'PROCESSING_UPLOAD';
    return { ok, publishId, status, privacy, steps };
  } catch (e: any) {
    return { ok: false, steps, error: String(e?.message || e) };
  }
}
