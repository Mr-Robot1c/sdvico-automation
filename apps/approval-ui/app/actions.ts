'use server';

// Bật đăng Facebook khi Duyệt: đã cấu hình FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN (2026-08-12).
// Cron xoay vòng: CRON_SECRET đã đặt (2026-08-12).
import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';
import { getServerClient } from '../lib/supabase-server';
import { postVideoToTikTok } from '../lib/tiktok';
import { isEmergencyStopped, reservePostQuota, setEmergencyStop, isQuotaDisabled, setQuotaDisabled } from '../lib/safety';
import { fetchWithRetry } from '../lib/retry';
import { pullFacebookMetrics } from '../lib/fb-metrics';
import { generateAndStorePlan } from '../lib/plan';

// Chờ Facebook xử lý xong video mới thả được ảnh vào bình luận (comment ngay lúc video còn
// đang xử lý sẽ lỗi → ảnh bị bỏ). Hỏi trạng thái qua /{videoId}?fields=status. Trả true khi sẵn sàng.
async function waitFacebookVideoReady(
  videoId: string,
  version: string,
  token: string,
  maxWaitMs = 24000,
  intervalMs = 3000
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    try {
      const r = await fetch(`https://graph.facebook.com/${version}/${videoId}?fields=status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const j: any = await r.json();
      const vs = j?.status?.video_status;
      if (vs === 'ready') return true;
      if (vs === 'error') return false;
    } catch {
      // lỗi tạm thời, thử lại nhịp sau
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return false;
}

// Đăng một bài marketing đã duyệt lên Facebook Page qua Graph API. CHỈ đăng nội dung SDVICO
// lên Page của SDVICO (API chính thức). Máy soạn, người bấm Duyệt (điều cấm 1) — hàm này chạy
// SAU khi người đã bấm Duyệt. Chưa cấu hình token thì bỏ qua, không lỗi.
async function publishContentToFacebook(
  client: ReturnType<typeof getServerClient>,
  contentId: string
): Promise<{ ok: boolean; error?: string; url?: string; warn?: string }> {
  const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
  const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!PAGE_ID || !TOKEN) return { ok: false, error: 'chưa cấu hình Facebook token' };

  // Không đăng lại bài đã đăng thành công.
  const { data: posted } = await client
    .from('mkt_posts')
    .select('id')
    .eq('channel', 'facebook')
    .eq('content_id', contentId)
    .eq('status', 'published')
    .limit(1);
  if (posted && posted.length) return { ok: true, url: undefined };

  const { data: c } = await client
    .from('mkt_content')
    .select('id, title, draft, brief')
    .eq('id', contentId)
    .single();
  if (!c) return { ok: false, error: 'không tìm thấy nội dung' };
  // Chỉ đăng nội dung (bản nháp) — không ghép tiêu đề vào đầu để tránh lặp tên sản phẩm.
  const message = String((c as any).draft || (c as any).title || '').trim();

  // Đổi id ảnh/video đã gắn ra link công khai.
  const assetUrlOf = async (assetId?: string): Promise<string | null> => {
    if (!assetId) return null;
    const { data: a } = await client.from('brand_assets').select('storage_path').eq('id', assetId).single();
    const sp = (a as { storage_path?: string } | null)?.storage_path;
    return sp ? client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl : null;
  };
  const assets = (c as any).brief?.assets || {};
  const imageUrl = await assetUrlOf(assets.image);
  // Facebook ưu tiên bản NGANG 16:9 (video_h) nếu có, không thì dùng video chung.
  const videoUrl = await assetUrlOf(assets.video_h || assets.video);

  try {
    // Facebook không cho gộp video và ảnh vào CHUNG một post. Cách chọn:
    //  - Có video: đăng video (/videos); kèm ảnh thì thả ảnh vào BÌNH LUẬN đầu (chờ video xử lý xong).
    //  - Bài CHỮ DÀI + ảnh: đăng CHỮ (/feed) để hiện đủ nội dung, rồi thả ảnh vào bình luận đầu (thay
    //    vì nhét chữ dài làm caption ảnh /photos bị gấp lại "Xem thêm").
    //  - Bài NGẮN + ảnh: đăng ảnh (/photos) kèm caption (ảnh nổi bật, hợp bài quảng cáo ngắn).
    //  - Không ảnh không video: đăng chữ (/feed).
    const LONG_TEXT = 500; // ký tự: trên mức này coi là bài dài -> ưu tiên chữ làm bài chính
    let endpoint: string;
    let body: URLSearchParams;
    let commentImage = false; // có thả ảnh vào bình luận đầu sau khi đăng không
    let waitVideo = false;    // có phải chờ video xử lý xong trước khi thả ảnh không
    if (videoUrl) {
      endpoint = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/videos`;
      body = new URLSearchParams({ file_url: videoUrl, description: message, access_token: TOKEN });
      if (imageUrl) { commentImage = true; waitVideo = true; }
    } else if (imageUrl && message.length > LONG_TEXT) {
      endpoint = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/feed`;
      body = new URLSearchParams({ message, access_token: TOKEN });
      commentImage = true;
    } else if (imageUrl) {
      endpoint = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/photos`;
      body = new URLSearchParams({ url: imageUrl, caption: message, access_token: TOKEN });
    } else {
      endpoint = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/feed`;
      body = new URLSearchParams({ message, access_token: TOKEN });
    }
    const res = await fetchWithRetry(endpoint, { method: 'POST', body });
    const json: any = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
    // /videos trả {id: videoId}; /feed và /photos trả {id} hoặc {post_id}.
    const postId = json.post_id || json.id;
    const externalUrl = videoUrl
      ? `https://www.facebook.com/${PAGE_ID}/videos/${json.id}`
      : `https://www.facebook.com/${postId}`;

    // Thả ảnh vào BÌNH LUẬN đầu khi cần (bài video+ảnh, hoặc bài chữ dài+ảnh). Video phải chờ xử lý
    // xong mới thả được. Thả ảnh lỗi thì chỉ cảnh báo, KHÔNG đánh hỏng cả bài. Ghi phản hồi thô để soi.
    let warn: string | undefined;
    let commentDebug: any = null;
    if (commentImage && imageUrl) {
      const targetId = json.id || postId; // video: id video; feed: id bài
      const ready = waitVideo ? await waitFacebookVideoReady(json.id, VERSION, TOKEN) : true;
      if (!ready) {
        warn = 'Video chưa xử lý kịp nên chưa thả được ảnh vào bình luận.';
        commentDebug = { step: 'wait_video', ready: false };
        console.error('[facebook] ' + warn);
      } else {
        try {
          const cRes = await fetch(`https://graph.facebook.com/${VERSION}/${targetId}/comments`, {
            method: 'POST',
            body: new URLSearchParams({ attachment_url: imageUrl, access_token: TOKEN })
          });
          const cJson: any = await cRes.json();
          commentDebug = { step: 'comment', httpStatus: cRes.status, response: cJson };
          if (!cRes.ok || cJson.error) throw new Error(cJson.error?.message || `HTTP ${cRes.status}`);
        } catch (ce: any) {
          warn = `Chưa thả được ảnh vào bình luận: ${String(ce?.message || ce)}`;
          console.error('[facebook] ' + warn);
        }
      }
    }

    await client.from('mkt_posts').insert({
      content_id: contentId,
      channel: 'facebook',
      status: 'published',
      external_url: externalUrl,
      published_at: new Date().toISOString()
    });
    await client.from('mkt_content').update({ status: 'published' }).eq('id', contentId);
    // Nhật ký để soi vì sao ảnh không vào bình luận (đọc qua /api/fb-diag). Không để lỗi ghi log làm hỏng đăng.
    try {
      await client.from('run_log').insert({
        task: 'mkt.publish_facebook_ui',
        actor: 'decideForm',
        status: warn ? 'error' : 'ok',
        detail: {
          contentId,
          videoId: videoUrl ? json.id : null,
          externalUrl,
          hasImage: !!imageUrl,
          hasVideo: !!videoUrl,
          imageUrl: imageUrl || null,
          warn: warn || null,
          commentDebug
        }
      });
    } catch {
      /* bỏ qua lỗi ghi log */
    }
    return { ok: true, url: externalUrl, warn };
  } catch (e: any) {
    await client.from('mkt_posts').insert({ content_id: contentId, channel: 'facebook', status: 'failed' });
    return { ok: false, error: String(e?.message || e) };
  }
}

// Đăng một bài đã duyệt lên TikTok (Direct Post). Cần có video. Máy soạn, người bấm Duyệt —
// hàm này chạy SAU khi người đã bấm Duyệt. Chưa kết nối TikTok thì báo lỗi, không chặn việc duyệt.
// TikTok là nền video, caption ngắn — bài dài để nguyên sẽ bị cắt cụt. Rút gọn: lấy đoạn đầu
// (tối đa ~200 ký tự, cắt ở ranh giới từ) rồi giữ khối hashtag ở cuối (nếu có).
function shortCaptionForTikTok(draft: string, maxLen = 200): string {
  const lines = String(draft || '').trim().split('\n');
  const tagParts: string[] = [];
  while (lines.length && /^\s*#/.test(lines[lines.length - 1])) {
    tagParts.unshift((lines.pop() as string).trim());
  }
  let bodyText = lines.join('\n').trim();
  if (bodyText.length > maxLen) {
    bodyText = bodyText.slice(0, maxLen).replace(/\s+\S*$/, '').trim() + '...';
  }
  const tags = tagParts.join(' ').trim();
  return [bodyText, tags].filter(Boolean).join('\n\n');
}

async function publishContentToTikTok(
  client: ReturnType<typeof getServerClient>,
  contentId: string
): Promise<{ ok: boolean; error?: string; publishId?: string }> {
  // Không đăng lại bài đã đăng thành công.
  const { data: posted } = await client
    .from('mkt_posts')
    .select('id')
    .eq('channel', 'tiktok')
    .eq('content_id', contentId)
    .eq('status', 'published')
    .limit(1);
  if (posted && posted.length) return { ok: true };

  const { data: c } = await client
    .from('mkt_content')
    .select('id, title, draft, brief')
    .eq('id', contentId)
    .single();
  if (!c) return { ok: false, error: 'không tìm thấy nội dung' };
  // TikTok ưu tiên bản DỌC 9:16 (video_v) nếu có, không thì dùng video chung.
  const ttAssets = (c as any).brief?.assets || {};
  const videoId = (ttAssets.video_v || ttAssets.video) as string | undefined;
  if (!videoId) {
    // TikTok bắt buộc có video.
    await client.from('mkt_posts').insert({ content_id: contentId, channel: 'tiktok', status: 'failed' });
    return { ok: false, error: 'bài không có video nên TikTok bỏ qua' };
  }
  const { data: a } = await client.from('brand_assets').select('storage_path').eq('id', videoId).single();
  const sp = (a as { storage_path?: string } | null)?.storage_path;
  if (!sp) {
    await client.from('mkt_posts').insert({ content_id: contentId, channel: 'tiktok', status: 'failed' });
    return { ok: false, error: 'không thấy file video trong kho' };
  }
  const videoUrl = client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
  // Rút gọn cho TikTok để bài dài không bị cắt cụt (giữ hashtag).
  const caption = shortCaptionForTikTok(String((c as any).draft || (c as any).title || ''));

  const result = await postVideoToTikTok(client, { videoUrl, caption });
  try {
    await client.from('run_log').insert({
      task: 'mkt.publish_tiktok',
      actor: 'decideForm',
      status: result.ok ? 'ok' : 'error',
      detail: {
        contentId,
        publishId: result.publishId || null,
        status: result.status || null,
        privacy: result.privacy || null,
        error: result.error || null,
        steps: result.steps
      }
    });
  } catch {
    /* bỏ qua lỗi ghi log */
  }
  if (result.ok) {
    await client.from('mkt_posts').insert({
      content_id: contentId,
      channel: 'tiktok',
      status: 'published',
      external_url: result.publishId ? `tiktok:${result.publishId}` : null,
      published_at: new Date().toISOString()
    });
    await client.from('mkt_content').update({ status: 'published' }).eq('id', contentId);
    return { ok: true, publishId: result.publishId };
  }
  await client.from('mkt_posts').insert({ content_id: contentId, channel: 'tiktok', status: 'failed' });
  return { ok: false, error: result.error };
}

// Người quyết. Đọc từ form, cập nhật trạng thái, chỉ đổi mục còn pending.
// Duyệt bài marketing thì đăng NGAY lên các kênh đã chọn (Facebook, TikTok — nếu đã cấu hình).
export async function decideForm(formData: FormData) {
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  const note = String(formData.get('note') || '');

  const decision = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!id || !decision) return;

  const client = getServerClient();
  // Lấy loại + payload để biết có phải bài marketing không.
  const { data: row } = await client.from('approval_queue').select('kind, payload').eq('id', id).single();
  const { data: updated, error } = await client
    .from('approval_queue')
    .update({ status: decision, decided_at: new Date().toISOString(), note: note || null })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw new Error(error.message);

  // Chỉ đăng khi vừa chuyển pending -> approved lần đầu, và đúng là bài marketing.
  // Chạy publish trong after(): response về UI NGAY (người dùng không phải chờ 20-40s cho FB
  // xử lý video). Việc đăng thật lên FB/TikTok tiếp tục ở nền cùng invocation.
  const justApproved = decision === 'approved' && (updated?.length || 0) > 0;
  if (justApproved && (row as any)?.kind === 'mkt_publish_content') {
    const payload = (row as any)?.payload || {};
    const contentId = payload.content_id as string | undefined;
    // Kênh đăng lấy từ payload.channels; bài cũ không có thì mặc định Facebook (giữ nguyên hành vi).
    const channels: string[] = Array.isArray(payload.channels) && payload.channels.length ? payload.channels : ['facebook'];
    if (contentId) {
      const bgClient = getServerClient();
      const bgJob = (async () => {
        const LIMIT = Number(process.env.MKT_MAX_POSTS_PER_DAY) || 3;
        if (await isEmergencyStopped(bgClient)) {
          await bgClient.from('run_log').insert({
            task: 'mkt.publish_blocked',
            actor: 'decideForm',
            status: 'skipped',
            detail: { contentId, reason: 'emergency_stop', channels }
          });
          return;
        }
        const quotaOff = await isQuotaDisabled(bgClient);
        const jobs: Promise<unknown>[] = [];
        for (const ch of ['facebook', 'tiktok']) {
          if (!channels.includes(ch)) continue;
          if (!quotaOff) {
            const q = await reservePostQuota(bgClient, ch, LIMIT);
            if (!q.allowed) {
              await bgClient.from('run_log').insert({
                task: 'mkt.publish_blocked',
                actor: 'decideForm',
                status: 'skipped',
                detail: { contentId, channel: ch, reason: 'quota', count: q.count, limit: LIMIT }
              });
              continue;
            }
          }
          if (ch === 'facebook') jobs.push(publishContentToFacebook(bgClient, contentId));
          if (ch === 'tiktok') jobs.push(publishContentToTikTok(bgClient, contentId));
        }
        await Promise.allSettled(jobs);
        // Bài vừa đăng thật xong, cập nhật lại trang cho lần render kế tiếp.
        revalidatePath('/');
        revalidatePath('/noi-dung');
      })();
      // Vercel giữ function chạy tới khi bgJob xong, dù response về UI đã trả.
      waitUntil(bgJob);
    }
  }

  revalidatePath('/');
  revalidatePath('/noi-dung');
}

// Người vận hành bật/tắt công tắc dừng khẩn. Bật thì mọi thao tác đăng bị chặn (kiểm trước khi đăng).
export async function toggleEmergencyStop(formData: FormData) {
  const on = String(formData.get('on') || '') === '1';
  const client = getServerClient();
  await setEmergencyStop(client, on);
  await client.from('run_log').insert({
    task: 'ops.emergency_stop',
    actor: 'ui',
    status: 'ok',
    detail: { stopped: on }
  });
  revalidatePath('/van-hanh');
  revalidatePath('/');
}

// Bật/tắt "bỏ hạn mức" — khi bật thì đăng không kiểm trần ngày (dùng để test).
export async function toggleQuotaDisabled(formData: FormData) {
  const off = String(formData.get('off') || '') === '1';
  const client = getServerClient();
  await setQuotaDisabled(client, off);
  await client.from('run_log').insert({ task: 'ops.quota_disabled', actor: 'ui', status: 'ok', detail: { disabled: off } });
  revalidatePath('/van-hanh');
}

// Ghi tay số đơn/lead cho một bài (conversion). Lưu vào mkt_content.brief.conversions.
export async function setConversions(formData: FormData) {
  const contentId = String(formData.get('content_id') || '');
  const n = Math.max(0, Math.floor(Number(formData.get('conversions')) || 0));
  if (!contentId) return;
  const client = getServerClient();
  const { data: c } = await client.from('mkt_content').select('brief').eq('id', contentId).single();
  const brief = (((c as any)?.brief as Record<string, unknown>) || {}) as Record<string, unknown>;
  brief.conversions = n;
  await client.from('mkt_content').update({ brief }).eq('id', contentId);
  revalidatePath('/do-luong');
}

// Cập nhật số liệu Facebook thủ công (nút trên trang Đo lường).
export async function refreshFacebookMetrics() {
  const client = getServerClient();
  await pullFacebookMetrics(client);
  revalidatePath('/do-luong');
}

// Thêm một từ khóa vào kho.
export async function addKeyword(formData: FormData) {
  const keyword = String(formData.get('keyword') || '').trim();
  const intent = String(formData.get('intent') || '').trim();
  const landing_url = String(formData.get('landing_url') || '').trim() || null;
  const source = String(formData.get('source') || '').trim() || null;
  if (!keyword) return;

  const client = getServerClient();
  const { error } = await client.from('mkt_keywords').insert({ keyword, intent: intent || null, landing_url, source });
  if (error) throw new Error(error.message);
  revalidatePath('/tu-khoa');
}

// Xóa một từ khóa.
export async function deleteKeyword(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client.from('mkt_keywords').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/tu-khoa');
}

// Thêm một dòng dữ kiện sản phẩm (Phòng Kinh doanh nhập số thật).
export async function addFact(formData: FormData) {
  const attribute = String(formData.get('attribute') || '').trim();
  const value = String(formData.get('value') || '').trim();
  if (!attribute || !value) return;
  const row = {
    category: String(formData.get('category') || '').trim() || null,
    brand: String(formData.get('brand') || '').trim() || null,
    model: String(formData.get('model') || '').trim() || null,
    attribute,
    value,
    source: String(formData.get('source') || '').trim() || null,
    confirmed_by: String(formData.get('confirmed_by') || '').trim() || null,
    verified: formData.get('verified') === 'on'
  };
  const client = getServerClient();
  const { error } = await client.from('product_facts').insert(row);
  if (error) throw new Error(error.message);
  revalidatePath('/du-kien');
}

// Xóa một dòng dữ kiện.
export async function deleteFact(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client.from('product_facts').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/du-kien');
}

// Tải tư liệu thật lên kho brand_assets (ảnh, clip, logo do công ty sở hữu hoặc có giấy phép).
// Giới hạn kích thước qua server action khoảng 4,5MB. File lớn thì tải qua Supabase Storage.
export async function uploadAsset(formData: FormData) {
  const file = formData.get('file') as File | null;
  const kind = String(formData.get('kind') || 'image');
  if (!file || file.size === 0) return;

  const client = getServerClient();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${Date.now()}-${safe}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await client.storage
    .from('brand-assets')
    .upload(path, buf, { contentType: file.type || 'application/octet-stream' });
  if (upErr) throw new Error('Tải lên lỗi: ' + upErr.message);

  const license = String(formData.get('license') || 'owned') === 'licensed' ? 'licensed' : 'owned';
  const { error } = await client.from('brand_assets').insert({
    kind,
    title: String(formData.get('title') || '').trim() || file.name,
    storage_path: path,
    license,
    license_note: String(formData.get('license_note') || '').trim() || null,
    source: String(formData.get('source') || '').trim() || null
  });
  if (error) throw new Error(error.message);
  revalidatePath('/tu-lieu');
}

// Tạo URL tải lên ký sẵn để TRÌNH DUYỆT tải thẳng file lên Supabase Storage.
// Dùng cho video và ảnh lớn: đi thẳng browser -> Supabase, không qua server action,
// nên không dính giới hạn body 4,5MB của hàm serverless trên Vercel.
export async function createAssetUploadUrl(fileName: string, kind: string) {
  const client = getServerClient();
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${Date.now()}-${safe}`;
  const { data, error } = await client.storage.from('brand-assets').createSignedUploadUrl(path);
  if (error || !data) throw new Error('Không tạo được URL tải lên: ' + (error?.message || 'không rõ'));
  // Supabase trả sẵn signedUrl đầy đủ; nếu thiếu thì tự dựng để trình duyệt PUT thẳng file lên.
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const uploadUrl =
    data.signedUrl || `${base}/storage/v1/object/upload/sign/brand-assets/${data.path}?token=${data.token}`;
  return { path: data.path, uploadUrl };
}

// Ghi nhận tư liệu vào brand_assets sau khi trình duyệt đã tải file lên Storage xong.
// Chỉ nhận đường dẫn, không nhận nội dung file, nên nhẹ và không dính giới hạn dung lượng.
export async function registerAsset(input: {
  path: string;
  kind: string;
  title?: string;
  license?: string;
  source?: string;
}) {
  const path = String(input?.path || '').trim();
  if (!path) throw new Error('Thiếu đường dẫn file đã tải lên.');
  const KINDS = ['image', 'video', 'audio', 'logo', 'clip'];
  const kind = KINDS.includes(input.kind) ? input.kind : 'image';
  const license = input.license === 'licensed' ? 'licensed' : 'owned';
  const client = getServerClient();
  const { error } = await client.from('brand_assets').insert({
    kind,
    title: String(input.title || '').trim() || path,
    storage_path: path,
    license,
    source: String(input.source || '').trim() || null
  });
  if (error) throw new Error(error.message);
  revalidatePath('/tu-lieu');
  revalidatePath('/san-xuat');
}

// Báo lượt tải về cho Unsplash theo hướng dẫn API (chạy ngầm, không chặn).
function triggerUnsplashDownload(loc?: string) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!loc || !key) return;
  fetch(`${loc}${loc.includes('?') ? '&' : '?'}client_id=${key}`).catch(() => {});
}

// Tải một buffer ảnh lên brand-assets và ghi bản ghi, trả { id, url }.
async function uploadImageBuffer(
  client: ReturnType<typeof getServerClient>,
  buf: Buffer,
  title: string,
  contentType: string,
  licenseNote: string | null
) {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const safe = (title || 'anh').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
  const path = `${Date.now()}-${safe}.${ext}`;
  const { error: upErr } = await client.storage.from('brand-assets').upload(path, buf, { contentType });
  if (upErr) throw new Error('Tải lên Storage lỗi: ' + upErr.message);
  const { data, error } = await client
    .from('brand_assets')
    .insert({
      kind: 'image',
      title: title || path,
      storage_path: path,
      license: licenseNote ? 'licensed' : 'owned',
      license_note: licenseNote
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const url = client.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;
  return { id: (data as { id: string }).id, url };
}

// Tìm ảnh trên Unsplash theo từ khóa. Trả danh sách ảnh kèm thông tin tác giả.
export async function searchUnsplash(query: string) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error('Chưa cấu hình UNSPLASH_ACCESS_KEY trên máy chủ.');
  const q = (query || '').trim() || 'fishing boat sea';
  const r = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=12&orientation=landscape&content_filter=high&client_id=${key}`
  );
  if (!r.ok) throw new Error('Lỗi Unsplash: ' + r.status);
  const j = await r.json();
  return ((j.results as any[]) || []).map((x) => ({
    id: x.id as string,
    thumb: x.urls?.small as string,
    regular: x.urls?.regular as string,
    downloadLocation: x.links?.download_location as string | undefined,
    author: x.user?.name as string | undefined,
    authorUrl: x.user?.links?.html as string | undefined
  }));
}

// Lưu thẳng một ảnh Unsplash vào kho tư liệu để dùng làm ảnh minh họa.
export async function saveUnsplashAsAsset(input: {
  regular: string;
  downloadLocation?: string;
  author?: string;
  title?: string;
}) {
  if (!input?.regular) throw new Error('Thiếu ảnh Unsplash.');
  const client = getServerClient();
  const r = await fetch(input.regular);
  if (!r.ok) throw new Error('Không tải được ảnh Unsplash.');
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || 'image/jpeg';
  const res = await uploadImageBuffer(
    client,
    buf,
    input.title || 'anh-unsplash',
    ct,
    input.author ? `Unsplash: ${input.author}` : 'Unsplash'
  );
  triggerUnsplashDownload(input.downloadLocation);
  revalidatePath('/san-xuat');
  return res;
}

// Cắt nền ảnh sản phẩm bằng remove.bg, trả PNG trong suốt (Buffer). Free tier độ phân giải preview.
async function removeBgCutout(imageUrl: string): Promise<Buffer> {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) throw new Error('Chưa cấu hình REMOVE_BG_API_KEY trên máy chủ.');
  const form = new FormData();
  form.append('image_url', imageUrl);
  form.append('size', 'preview');
  form.append('type', 'product');
  form.append('format', 'png');
  const r = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': key },
    body: form
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`remove.bg lỗi ${r.status}: ${t.slice(0, 160)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

// Ghép: cắt nền ảnh sản phẩm (remove.bg) rồi đặt lên nền Unsplash (hoặc nền thương hiệu) có bóng đổ,
// thêm tiêu đề và hotline. Sản phẩm giữ nguyên, chỉ tách khỏi nền cũ (điều cấm 5).
export async function createCompositeFromBackground(input: {
  productAssetId: string;
  background?: string;
  downloadLocation?: string;
  title?: string;
  author?: string;
}) {
  if (!input?.productAssetId) throw new Error('Chọn ảnh sản phẩm trước khi ghép.');
  const client = getServerClient();
  const { data } = await client
    .from('brand_assets')
    .select('storage_path, title')
    .eq('id', input.productAssetId)
    .single();
  const sp = (data as { storage_path?: string } | null)?.storage_path;
  if (!sp) throw new Error('Không tìm thấy ảnh sản phẩm.');
  // Tên mô tả lấy từ tên ảnh sản phẩm (đã đặt rõ), làm tiêu đề banner và tên ảnh ghép.
  const prodName = String((data as { title?: string } | null)?.title || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d{10,}[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const bannerTitle = String(input.title || '').trim() || prodName;
  const productUrl = client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
  const cutoutBuffer = await removeBgCutout(productUrl);
  let backgroundBuffer: Buffer | null = null;
  if (input.background) {
    const r = await fetch(input.background);
    if (r.ok) backgroundBuffer = Buffer.from(await r.arrayBuffer());
  }
  // @ts-ignore — module JS thuần, không có .d.ts
  const { buildBanner } = await import('../lib/gen/banner.mjs');
  const png = (await buildBanner({
    cutoutBuffer,
    backgroundBuffer,
    title: bannerTitle
  } as any)) as Buffer;
  const res = await uploadImageBuffer(
    client,
    png,
    (bannerTitle || 'anh ghép sdvico') + ' (ghép)',
    'image/png',
    input.author ? `Nền Unsplash: ${input.author}` : null
  );
  triggerUnsplashDownload(input.downloadLocation);
  revalidatePath('/san-xuat');
  return res;
}

// Đổi tên (title) một tư liệu. Tên này cũng là gợi ý cho AI khi sinh text theo hình.
export async function renameAsset(formData: FormData) {
  const id = String(formData.get('id') || '');
  const title = String(formData.get('title') || '').trim();
  if (!id || !title) return;
  const client = getServerClient();
  const { error } = await client.from('brand_assets').update({ title }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/tu-lieu');
  revalidatePath('/san-xuat');
}

// Gán tư liệu vào folder sản phẩm (product_group) cho vòng xoay đăng bài hằng ngày.
// Rỗng = bỏ gán (vòng xoay sẽ không chọn tư liệu chưa gán).
export async function setAssetProductGroup(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const group = String(formData.get('product_group') || '').trim();
  const client = getServerClient();
  const { error } = await client
    .from('brand_assets')
    .update({ product_group: group || null })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/tu-lieu');
}

// Xóa một tư liệu, gỡ cả file trên Storage.
export async function deleteAsset(formData: FormData) {
  const id = String(formData.get('id') || '');
  const storagePath = String(formData.get('storage_path') || '');
  if (!id) return;
  const client = getServerClient();
  if (storagePath) await client.storage.from('brand-assets').remove([storagePath]);
  await client.from('brand_assets').delete().eq('id', id);
  revalidatePath('/tu-lieu');
}

// Ghép logo SDVICO vào một ảnh trong kho (góc dưới phải, cỡ vừa). Nút THỦ CÔNG: người chủ động
// bấm nên đóng logo luôn, không cần kiểm tra ảnh đã có logo chưa. Chỉ áp cho kind='image'.
// Lõi xử lý dùng chung với auto-logo lúc sinh bài (stampLogoInPlace ở ensure-logo.mjs).
export async function applyLogoToAsset(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'thiếu id ảnh' };
  try {
    const client = getServerClient();
    const { data: a } = await client
      .from('brand_assets')
      .select('id, kind, storage_path')
      .eq('id', id)
      .single();
    const asset = a as { id: string; kind: string; storage_path: string } | null;
    if (!asset || asset.kind !== 'image') return { ok: false, error: 'Chỉ ghép logo cho ảnh.' };

    // @ts-ignore — module JS thuần
    const { stampLogoInPlace } = await import('../lib/gen/ensure-logo.mjs');
    await stampLogoInPlace(client, asset);
    revalidatePath('/tu-lieu');
    return { ok: true };
  } catch (e: any) {
    // Không ném lỗi ra ngoài (kẻo sập trang). Trả lỗi cho nút hiển thị.
    console.error('[applyLogoToAsset]', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

// Xóa một BÀI (nội dung) khỏi hệ thống: gỡ bản ghi mkt_content + mục hàng đợi + bài đăng + số liệu.
// LƯU Ý: chỉ xóa dữ liệu trong hệ thống, KHÔNG gỡ bài đã đăng thật trên Facebook/TikTok.
export async function deleteContent(formData: FormData) {
  const id = String(formData.get('content_id') || '');
  if (!id) return;
  const client = getServerClient();
  await client.from('approval_queue').delete().eq('payload->>content_id', id);
  await client.from('mkt_posts').delete().eq('content_id', id);
  await client.from('mkt_metrics').delete().eq('entity_ref', id);
  await client.from('mkt_content').delete().eq('id', id);
  revalidatePath('/do-luong');
  revalidatePath('/noi-dung');
  revalidatePath('/');
}

// Sinh text cho khung sản xuất: nhập từ khóa (kèm intent/landing_url tùy chọn), trả bản nháp
// qua bản mẫu (hoặc Gemini nếu có khóa). Trả string, gọi từ client component qua await.
// Không đụng DB, không tạo hàng đợi.
export async function generateTextForTitle(
  keyword: string,
  intent: string = 'giao_dich',
  landing_url: string | null = null,
  assetHint: string = '',
  format: string = 'social',
  contentType: string = 'tips'
): Promise<string> {
  const clean = (keyword || '').trim();
  if (!clean) return '';
  // @ts-ignore — module JS thuần, không có .d.ts
  const { generateContentAsync } = await import('../lib/gen/content.mjs');
  try {
    const r = await generateContentAsync(
      { keyword: clean, intent, landing_url },
      { assetHint: (assetHint || '').trim(), format, contentType }
    );
    return (r?.draft as string) || '';
  } catch (e: any) {
    return `Không sinh được bằng AI: ${e?.message || e}. Bấm Xong để tự soạn tay và đẩy vào hàng đợi.`;
  }
}

// Xong khung sản xuất: tạo bản ghi mkt_content + đẩy vào approval_queue.
// KHÔNG tự đăng — người duyệt bấm 'Duyệt' ở Hàng đợi duyệt mới thực sự lên trang (Điều cấm 1).
export async function createContent(formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  const draft = String(formData.get('draft') || '').trim();
  const kind = (String(formData.get('kind') || 'social') as 'article' | 'social' | 'video');
  const imageAssetId = String(formData.get('image_asset_id') || '') || null;
  const videoAssetId = String(formData.get('video_asset_id') || '') || null;
  const keywordId = String(formData.get('keyword_id') || '') || null;
  const keyword = String(formData.get('keyword') || '').trim() || title;
  const intent = String(formData.get('intent') || 'giao_dich').trim() || 'giao_dich';
  const landingUrl = String(formData.get('landing_url') || '').trim() || null;
  // Kênh đăng do người soạn chọn (facebook, tiktok). Trống thì mặc định Facebook.
  let channels = String(formData.get('channels') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!channels.length) channels = ['facebook'];
  const contentType = String(formData.get('content_type') || 'other').trim() || 'other';
  if (!title || !draft) return;

  const client = getServerClient();
  const brief = {
    keyword,
    intent,
    landing_url: landingUrl,
    keyword_id: keywordId,
    generator: 'xuong-san-xuat',
    channels,
    content_type: contentType,
    assets: { image: imageAssetId, video: videoAssetId }
  };
  const { data: inserted, error } = await client
    .from('mkt_content')
    .insert({ kind, title, brief, draft, status: 'review' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const contentId = (inserted as { id: string })?.id;
  const { error: qErr } = await client.from('approval_queue').insert({
    kind: 'mkt_publish_content',
    title: `[${kind === 'video' ? 'Video' : kind === 'article' ? 'Bài website' : 'Bài Facebook'}] ${title}`,
    payload: {
      content_id: contentId,
      format: kind,
      keyword,
      intent,
      landing_url: landingUrl,
      risk: 'amber',
      channels,
      authored: 'human', // người tự soạn -> cờ đỏ, phân biệt với AI tự sinh
      assets: { image: imageAssetId, video: videoAssetId }
    },
    status: 'pending'
  });
  if (qErr) throw new Error(qErr.message);

  revalidatePath('/');
  revalidatePath('/noi-dung');
  revalidatePath('/san-xuat');
}

// Chỉnh sửa bản nháp trước khi duyệt. Người sửa là người kiểm soát (điều cấm 1).
export async function editDraft(formData: FormData) {
  const contentId = String(formData.get('content_id') || '');
  const draft = String(formData.get('draft') || '');
  if (!contentId) return;
  const client = getServerClient();
  const { error } = await client.from('mkt_content').update({ draft }).eq('id', contentId);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/noi-dung');
}

// Tạo kế hoạch ngay (nút trên trang Kế hoạch). Đọc số liệu Đo lường rồi sinh 1 bản 'manual'.
// Bot ĐỀ XUẤT, người quyết (điều cấm 1 và 2). Bản mới applied = false, chưa tác động vòng xoay.
export async function generatePlanNow() {
  const client = getServerClient();
  await generateAndStorePlan(client, 'manual');
  revalidatePath('/ke-hoach');
}

// Áp dụng trọng số của một bản kế hoạch: đánh dấu bản đó applied, gỡ áp các bản còn lại.
// SAU khi áp, /api/rotate mới ưu tiên folder theo trọng số. Người bấm mới áp (điều cấm 2).
export async function applyPlanWeights(formData: FormData) {
  const planId = String(formData.get('plan_id') || '');
  if (!planId) return;
  const client = getServerClient();
  // Chỉ một bản được áp tại một thời điểm: gỡ hết rồi áp bản được chọn.
  await client.from('mkt_plans').update({ applied: false, applied_at: null }).eq('applied', true);
  const { error } = await client
    .from('mkt_plans')
    .update({ applied: true, applied_at: new Date().toISOString() })
    .eq('id', planId);
  if (error) throw new Error(error.message);
  revalidatePath('/ke-hoach');
}

// Gỡ áp dụng: vòng xoay quay lại chọn ngẫu nhiên đều như trước.
export async function clearPlanWeights() {
  const client = getServerClient();
  const { error } = await client.from('mkt_plans').update({ applied: false, applied_at: null }).eq('applied', true);
  if (error) throw new Error(error.message);
  revalidatePath('/ke-hoach');
}

// Xóa một bản kế hoạch khỏi lịch sử.
export async function deletePlan(formData: FormData) {
  const planId = String(formData.get('plan_id') || '');
  if (!planId) return;
  const client = getServerClient();
  const { error } = await client.from('mkt_plans').delete().eq('id', planId);
  if (error) throw new Error(error.message);
  revalidatePath('/ke-hoach');
}

