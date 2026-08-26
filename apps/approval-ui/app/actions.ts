'use server';

// Bật đăng Facebook khi Duyệt: đã cấu hình FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN (2026-08-12).
// Cron xoay vòng: CRON_SECRET đã đặt (2026-08-12).
import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';
import { getServerClient } from '../lib/supabase-server';
import { postVideoToTikTok } from '../lib/tiktok';
import { isEmergencyStopped, reservePostQuota, setEmergencyStop, isQuotaDisabled, setQuotaDisabled } from '../lib/safety';
import { fetchWithRetry } from '../lib/retry';
import { pullFacebookMetrics, fbPageTokens } from '../lib/fb-metrics';
import { generateAndStorePlan } from '../lib/plan';

// Chờ Facebook xử lý xong video mới thả được ảnh vào bình luận (comment ngay lúc video còn
// đang xử lý sẽ lỗi → ảnh bị bỏ). Hỏi trạng thái qua /{videoId}?fields=status. Trả true khi sẵn sàng.
async function waitFacebookVideoReady(
  videoId: string,
  version: string,
  token: string,
  maxWaitMs = 60000, // Truoc 24s, khong du cho video 40-70s co intro/outro. Tang len 60s.
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

// Đăng REEL lên Facebook Page (Reels Publishing API, 3 bước: start -> upload theo URL -> finish).
// Dùng bản DỌC 9:16 (video_v). Chạy SAU khi Post đã đăng; lỗi Reel KHÔNG làm hỏng Post (chỉ warn).
// Trả về url Reel hoặc lỗi. Ghi mkt_posts channel='facebook' external_url .../reel/<id> để phân biệt.
async function publishReelToFacebook(
  client: ReturnType<typeof getServerClient>,
  contentId: string,
  videoUrl: string,
  description: string,
  commentImageUrls: string[] = []
): Promise<{ ok: boolean; url?: string; error?: string; warn?: string }> {
  const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
  const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!PAGE_ID || !TOKEN) return { ok: false, error: 'chưa cấu hình Facebook token' };
  // Không đăng lại Reel đã đăng.
  const { data: posted } = await client
    .from('mkt_posts').select('id, external_url').eq('channel', 'facebook').eq('content_id', contentId).eq('status', 'published');
  if ((posted || []).some((p: any) => String(p.external_url || '').includes('/reel/'))) return { ok: true };
  try {
    // 1) start
    const s = await fetchWithRetry(`https://graph.facebook.com/${VERSION}/${PAGE_ID}/video_reels`, {
      method: 'POST', body: new URLSearchParams({ upload_phase: 'start', access_token: TOKEN })
    });
    const sj: any = await s.json();
    if (!s.ok || sj.error || !sj.video_id) throw new Error(sj.error?.message || `start HTTP ${s.status}`);
    const videoId = String(sj.video_id);
    // 2) upload theo URL công khai (rupload). Header file_url, không body.
    const u = await fetch(`https://rupload.facebook.com/video-upload/${VERSION}/${videoId}`, {
      method: 'POST', headers: { Authorization: `OAuth ${TOKEN}`, file_url: videoUrl }
    });
    const uj: any = await u.json().catch(() => ({}));
    if (!u.ok || uj.error || uj.success === false) throw new Error(uj.error?.message || uj?.debug_info?.message || `upload HTTP ${u.status}`);
    // 3) finish + publish (mô tả = caption ngắn: dòng đầu bài + hashtag; Reel không hợp chữ dài).
    const shortDesc = description.length > 900 ? description.slice(0, 880).replace(/\s+\S*$/, '') + '…' : description;
    const f = await fetchWithRetry(`https://graph.facebook.com/${VERSION}/${PAGE_ID}/video_reels`, {
      method: 'POST',
      body: new URLSearchParams({ upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED', description: shortDesc, access_token: TOKEN })
    });
    const fj: any = await f.json();
    if (!f.ok || fj.error || fj.success === false) throw new Error(fj.error?.message || `finish HTTP ${f.status}`);
    const url = `https://www.facebook.com/reel/${videoId}`;
    await client.from('mkt_posts').insert({ content_id: contentId, channel: 'facebook', status: 'published', external_url: url, published_at: new Date().toISOString() });

    // Thả ẢNH sản phẩm xuống BÌNH LUẬN Reel giống Post (user 19/8: "1 bài dọc khi đăng reel phải
    // có ảnh sản phẩm ở dưới cmt"). Video Reel cần vài giây xử lý xong mới nhận comment; wait rồi
    // thả từng ảnh. Lỗi comment chỉ ghi warn, KHÔNG đánh hỏng Reel (bài Reel đã lên).
    let warn: string | undefined;
    const commentDebug: any[] = [];
    if (commentImageUrls.length) {
      const ready = await waitFacebookVideoReady(videoId, VERSION, TOKEN);
      if (!ready) {
        warn = 'Reel chưa xử lý kịp nên chưa thả được ảnh vào bình luận.';
      } else {
        for (let i = 0; i < commentImageUrls.length; i++) {
          const cu = commentImageUrls[i];
          try {
            const cRes = await fetch(`https://graph.facebook.com/${VERSION}/${videoId}/comments`, {
              method: 'POST',
              body: new URLSearchParams({ attachment_url: cu, access_token: TOKEN })
            });
            const cJson: any = await cRes.json();
            commentDebug.push({ step: 'reel_comment', idx: i, httpStatus: cRes.status, response: cJson });
            if (!cRes.ok || cJson.error) throw new Error(cJson.error?.message || `HTTP ${cRes.status}`);
          } catch (ce: any) {
            const m = `Reel ảnh #${i + 1} chưa thả được vào bình luận: ${String(ce?.message || ce)}`;
            warn = warn ? warn + '; ' + m : m;
          }
        }
      }
    }
    try { await client.from('run_log').insert({ task: 'mkt.publish_facebook_reel', actor: 'decideForm', status: warn ? 'error' : 'ok', detail: { contentId, videoId, url, warn: warn || null, commentDebug } }); } catch { /* bỏ qua */ }
    return { ok: true, url, warn };
  } catch (e: any) {
    const errMsg = String(e?.message || e);
    try { await client.from('run_log').insert({ task: 'mkt.publish_facebook_reel', actor: 'decideForm', status: 'error', detail: { contentId, error: errMsg } }); } catch { /* bỏ qua */ }
    return { ok: false, error: errMsg };
  }
}

// Đăng một bài marketing đã duyệt lên Facebook Page qua Graph API. CHỈ đăng nội dung SDVICO
// lên Page của SDVICO (API chính thức). Máy soạn, người bấm Duyệt (điều cấm 1) — hàm này chạy
// SAU khi người đã bấm Duyệt. Chưa cấu hình token thì bỏ qua, không lỗi.
// v3.2 (18/8): bài có brief.post_reel=true (bài bán hàng có video AI gộp) -> sau khi đăng POST
// (video ngang + chữ + ảnh thả bình luận) đăng thêm REEL (video dọc). "Đăng trên Post + Reel".
async function publishContentToFacebook(
  client: ReturnType<typeof getServerClient>,
  contentId: string,
  scheduledAt?: string | null
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
  // Danh sách ẢNH DƯ (Xưởng sản xuất chọn nhiều ảnh): sẽ thả TỪNG cái vào bình luận sau khi đăng.
  // Bỏ id đã dùng làm bài chính (assets.image) để không thả lại.
  const extraImageIds = (Array.isArray(assets.images) ? assets.images : [])
    .filter((id: string) => id && id !== assets.image);
  const extraImageUrls: string[] = [];
  for (const id of extraImageIds) {
    const u = await assetUrlOf(id);
    if (u) extraImageUrls.push(u);
  }

  try {
    // Facebook không cho gộp video và ảnh vào CHUNG một post. Cách chọn:
    //  - Có video: đăng video (/videos); kèm ảnh thì thả ảnh vào BÌNH LUẬN đầu (chờ video xử lý xong).
    //  - Có ảnh: LUÔN đăng ảnh (/photos) kèm caption. Chữ dài thì FB tự gấp "See more" (bà con quen
    //    bấm) - đánh đổi này TỐT hơn mất ảnh khỏi post chính (post FB nào cũng nên có ảnh nổi bật).
    //  - Không ảnh không video: đăng chữ (/feed).
    let endpoint: string;
    let body: URLSearchParams;
    let commentImage = false; // có thả ảnh vào bình luận đầu sau khi đăng không
    let waitVideo = false;    // có phải chờ video xử lý xong trước khi thả ảnh không
    if (videoUrl) {
      endpoint = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/videos`;
      body = new URLSearchParams({ file_url: videoUrl, description: message, access_token: TOKEN });
      if (imageUrl) { commentImage = true; waitVideo = true; }
    } else if (imageUrl) {
      endpoint = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/photos`;
      body = new URLSearchParams({ url: imageUrl, caption: message, access_token: TOKEN });
    } else {
      endpoint = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/feed`;
      body = new URLSearchParams({ message, access_token: TOKEN });
    }
    // Hẹn giờ đăng: FB nhận unix timestamp (giây). published=false + scheduled_publish_time
    // -> FB tự đăng đúng giờ (min 10 phút, max 6 tháng - đã kiểm ở decide-actions.tsx).
    // Áp cho cả /videos, /photos, /feed. Bài hẹn giờ KHÔNG thả ảnh comment ngay (không có post_id
    // để comment vì bài chưa đăng); ảnh dư/comment sẽ bỏ qua với warn.
    // MÚI GIỜ (bug 21/8): chuỗi datetime-local "YYYY-MM-DDTHH:mm" KHÔNG kèm múi giờ; server Vercel
    // chạy UTC nên new Date() từng hiểu 15:26 thành 15:26 UTC = 22:26 VN -> bài lên trễ 7 tiếng.
    // Người duyệt luôn nhập giờ VN -> ép +07:00 khi đổi sang unix.
    const schedMatch = String(scheduledAt || '').match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?/);
    const scheduledUnix = schedMatch
      ? Math.floor(new Date(`${schedMatch[1]}:${schedMatch[2] || '00'}+07:00`).getTime() / 1000)
      : 0;
    if (scheduledUnix) {
      body.set('published', 'false');
      body.set('scheduled_publish_time', String(scheduledUnix));
      commentImage = false; // bài chưa lên, không comment ảnh ngay
    }
    const res = await fetchWithRetry(endpoint, { method: 'POST', body });
    const json: any = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
    // /videos trả {id: videoId}; /feed và /photos trả {id} hoặc {post_id}.
    // /photos nhiều lúc CHỈ trả {id} = id ẢNH (18/8: 2 bài lưu id ảnh -> kéo số liệu hỏi `shares`
    // + /insights bị FB từ chối). Bài đăng ngay thì hỏi thêm `page_story_id` để lấy id BÀI chứa
    // ảnh; bài hẹn giờ chưa có bài -> giữ id ảnh, lệnh kéo số liệu sẽ tự phân giải sau khi lên.
    let postId: string = json.post_id || json.id;
    if (!videoUrl && imageUrl && !json.post_id && !scheduledUnix && json.id) {
      try {
        const pr = await fetch(`https://graph.facebook.com/${VERSION}/${json.id}?fields=page_story_id&access_token=${encodeURIComponent(TOKEN)}`);
        const pj: any = await pr.json();
        if (pj?.page_story_id) postId = String(pj.page_story_id);
      } catch { /* giữ id ảnh */ }
    }
    const externalUrl = videoUrl
      ? `https://www.facebook.com/${PAGE_ID}/videos/${json.id}`
      : `https://www.facebook.com/${postId}`;

    // Thả ẢNH vào BÌNH LUẬN. Có 2 nguồn:
    //  - ảnh CHÍNH (imageUrl) khi bài chính là video hoặc chữ dài (không nhét vào caption được).
    //  - ẢNH DƯ (extraImageUrls): Xưởng sản xuất chọn nhiều ảnh -> ngoài ảnh chính, các ảnh khác
    //    THẢ TỪNG cái xuống bình luận theo thứ tự.
    // Bài chính là video -> phải chờ xử lý xong mới thả được. Thả ảnh lỗi -> chỉ cảnh báo.
    const commentImageUrls: string[] = [];
    if (commentImage && imageUrl) commentImageUrls.push(imageUrl);
    commentImageUrls.push(...extraImageUrls);
    let warn: string | undefined;
    const commentDebug: any[] = [];
    if (commentImageUrls.length) {
      const targetId = json.id || postId;
      const ready = waitVideo ? await waitFacebookVideoReady(json.id, VERSION, TOKEN) : true;
      if (!ready) {
        warn = 'Video chưa xử lý kịp nên chưa thả được ảnh vào bình luận.';
        commentDebug.push({ step: 'wait_video', ready: false });
        console.error('[facebook] ' + warn);
      } else {
        for (let i = 0; i < commentImageUrls.length; i++) {
          const u = commentImageUrls[i];
          try {
            const cRes = await fetch(`https://graph.facebook.com/${VERSION}/${targetId}/comments`, {
              method: 'POST',
              body: new URLSearchParams({ attachment_url: u, access_token: TOKEN })
            });
            const cJson: any = await cRes.json();
            commentDebug.push({ step: 'comment', idx: i, httpStatus: cRes.status, response: cJson });
            if (!cRes.ok || cJson.error) throw new Error(cJson.error?.message || `HTTP ${cRes.status}`);
          } catch (ce: any) {
            const m = `Ảnh #${i + 1} chưa thả được vào bình luận: ${String(ce?.message || ce)}`;
            warn = warn ? warn + '; ' + m : m;
            console.error('[facebook] ' + m);
          }
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

    // REEL: bài bán hàng có video AI gộp (brief.post_reel) -> đăng thêm bản DỌC lên Reel.
    // MẶC ĐỊNH TẮT từ 21/8 (user: "đăng FB cả 16:9 lẫn bản dọc là lỗi" — trùng lặp trên cùng
    // Page; bản dọc dành cho TikTok + YouTube Shorts). Muốn bật lại: env FACEBOOK_ALSO_REEL=1.
    // Không áp cho bài hẹn giờ (Reels API không hỗ trợ scheduled_publish_time như /videos).
    // Lỗi Reel chỉ cảnh báo, Post đã lên vẫn tính thành công.
    const alsoReel = process.env.FACEBOOK_ALSO_REEL === '1';
    const brief = (c as any).brief || {};
    if (alsoReel && brief.post_reel && assets.video_v && !scheduledUnix) {
      const reelUrl = await assetUrlOf(assets.video_v);
      if (reelUrl) {
        // Ảnh comment cho Reel = giống Post: ảnh chính + ảnh phụ (Xưởng sản xuất chọn nhiều).
        // Dùng lại imageUrl + extraImageUrls đã resolve ở trên, khỏi tra lại brand_assets.
        const reelComment: string[] = [];
        if (imageUrl) reelComment.push(imageUrl);
        reelComment.push(...extraImageUrls);
        const r = await publishReelToFacebook(client, contentId, reelUrl, message, reelComment);
        if (!r.ok) {
          const m = 'Reel chưa đăng được: ' + (r.error || 'lỗi không rõ');
          warn = warn ? warn + '; ' + m : m;
          console.error('[facebook] ' + m);
        } else if (r.warn) {
          warn = warn ? warn + '; ' + r.warn : r.warn;
        }
      }
    } else if (brief.post_reel && scheduledUnix) {
      const m = 'Bài hẹn giờ: Post đã hẹn, Reel không hỗ trợ hẹn giờ nên bỏ qua (đăng tay Reel sau nếu cần).';
      warn = warn ? warn + '; ' + m : m;
    }
    // Nhật ký để soi vì sao ảnh không vào bình luận (đọc qua /api/fb-diag). Không để lỗi ghi log làm hỏng đăng.
    try {
      await client.from('run_log').insert({
        task: 'mkt.publish_facebook_ui',
        actor: 'decideForm',
        status: warn ? 'error' : 'ok',
        detail: {
          contentId,
          videoId: videoUrl ? json.id : null,
          graphId: json.id || null,
          postId,
          scheduledAt: scheduledAt || null,
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
    const errMsg = String(e?.message || e);
    await client.from('mkt_posts').insert({ content_id: contentId, channel: 'facebook', status: 'failed' });
    // Ghi log de xem xet: TRUOC day catch nuot loi, khong biet vi sao fail (token het han, quota FB,
    // videoUrl 404, ...). Log nay doc qua /api/fb-diag.
    try {
      await client.from('run_log').insert({
        task: 'mkt.publish_facebook_ui',
        actor: 'decideForm',
        status: 'error',
        detail: { contentId, error: errMsg, hasImage: !!imageUrl, hasVideo: !!videoUrl }
      });
    } catch { /* bo qua loi ghi log */ }
    return { ok: false, error: errMsg };
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
  contentId: string,
  privacy?: string | null
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

  const result = await postVideoToTikTok(client, { videoUrl, caption, privacy: privacy || null });
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

// Đăng video bài (bản dọc 9:16) lên YouTube Shorts. Cần 3 env vars YOUTUBE_CLIENT_ID +
// YOUTUBE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN (xem docs/runbook-youtube-setup.md).
// Bài không có video -> bỏ qua. Bài có video ngang (không có bản dọc) -> vẫn upload nhưng
// YouTube sẽ hiển thị dạng video thường thay vì Shorts.
async function publishContentToYoutube(
  client: ReturnType<typeof getServerClient>,
  contentId: string
): Promise<{ ok: boolean; error?: string; videoId?: string }> {
  const { data: posted } = await client
    .from('mkt_posts')
    .select('id')
    .eq('channel', 'youtube')
    .eq('content_id', contentId)
    .eq('status', 'published')
    .limit(1);
  if (posted && posted.length) return { ok: true };

  const { data: c } = await client
    .from('mkt_content')
    .select('id, title, draft, brief')
    .eq('id', contentId)
    .single();
  if (!c) return { ok: false, error: 'khong tim thay noi dung' };
  const ytAssets = (c as any).brief?.assets || {};
  const videoId = (ytAssets.video_v || ytAssets.video) as string | undefined;
  if (!videoId) {
    await client.from('mkt_posts').insert({ content_id: contentId, channel: 'youtube', status: 'failed' });
    return { ok: false, error: 'bai khong co video nen YouTube bo qua' };
  }
  const { data: a } = await client.from('brand_assets').select('storage_path').eq('id', videoId).single();
  const sp = (a as { storage_path?: string } | null)?.storage_path;
  if (!sp) {
    await client.from('mkt_posts').insert({ content_id: contentId, channel: 'youtube', status: 'failed' });
    return { ok: false, error: 'khong thay file video trong kho' };
  }
  const videoUrl = client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
  const title = String((c as any).title || 'Video SDVICO');
  const caption = String((c as any).draft || (c as any).title || '');
  const productGroup = ((c as any).brief?.rotation_group || '').replace(/^\s*\d+\.\s*/, '').trim();
  const tags = ['SDVICO', 'tauca', 'thietbitauca', 'nguoi_di_bien'];
  if (productGroup) tags.push(productGroup.replace(/\s+/g, ''));

  const { postVideoToYouTube } = await import('../lib/youtube-publish');
  const result = await postVideoToYouTube({ videoUrl, title, caption, tags });
  try {
    await client.from('run_log').insert({
      task: 'mkt.publish_youtube',
      actor: 'decideForm',
      status: result.ok ? 'ok' : 'error',
      detail: {
        contentId,
        videoId: result.videoId || null,
        url: result.url || null,
        error: result.error || null,
        steps: result.steps
      }
    });
  } catch { /* bo qua loi ghi log */ }
  if (result.ok && result.videoId) {
    await client.from('mkt_posts').insert({
      content_id: contentId,
      channel: 'youtube',
      status: 'published',
      external_url: result.url || `https://youtube.com/shorts/${result.videoId}`,
      published_at: new Date().toISOString()
    });
    await client.from('mkt_content').update({ status: 'published' }).eq('id', contentId);
    return { ok: true, videoId: result.videoId };
  }
  await client.from('mkt_posts').insert({ content_id: contentId, channel: 'youtube', status: 'failed' });
  return { ok: false, error: result.error };
}

// Người quyết. Đọc từ form, cập nhật trạng thái, chỉ đổi mục còn pending.
// Duyệt bài marketing thì đăng NGAY lên các kênh đã chọn (Facebook, TikTok, YouTube — nếu đã cấu hình).
export async function decideForm(formData: FormData) {
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  const note = String(formData.get('note') || '');
  // Hẹn giờ đăng (không bắt buộc). Định dạng datetime-local: "YYYY-MM-DDTHH:mm" (giờ theo máy người dùng).
  // Có -> Facebook nhận scheduled_publish_time, tự đăng đúng giờ. Trống -> đăng ngay như cũ.
  // TikTok API không hỗ trợ hẹn giờ public -> bỏ qua khi có hẹn (chỉ Facebook được hẹn).
  const scheduledAt = String(formData.get('scheduled_at') || '').trim() || null;
  // Mức riêng tư TikTok người duyệt chọn ở màn composer (rỗng nếu bài không có TikTok / chưa nối).
  const tiktokPrivacy = String(formData.get('tiktok_privacy') || '').trim() || null;

  const decision = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!id || !decision) return;

  const client = getServerClient();
  // Lấy loại + payload để biết có phải bài marketing không.
  const { data: row } = await client.from('approval_queue').select('kind, payload').eq('id', id).single();
  // Lưu giờ hẹn vào payload để trang Quản lý bài viết hiện "Đã duyệt, đợi hẹn giờ HH:mm dd/mm"
  // (user 18/8). Chỉ khi duyệt + có hẹn; từ chối hoặc đăng ngay thì không ghi.
  const basePayload = ((row as any)?.payload || {}) as Record<string, unknown>;
  const newPayload = decision === 'approved' && scheduledAt
    ? { ...basePayload, scheduled_at: scheduledAt }
    : basePayload;
  const { data: updated, error } = await client
    .from('approval_queue')
    .update({ status: decision, decided_at: new Date().toISOString(), note: note || null, payload: newPayload })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw new Error(error.message);

  // TỪ CHỐI bài thử A/B = LOẠI HƯỚNG ĐI đó luôn (user 21/8: từ chối bài "Lắp đặt máy lọc dầu"
  // Thử A vì trùng chủ đề). Đánh dấu suggestion used_at + rejected trong bản kế hoạch để vòng
  // xoay KHÔNG sinh tiếp bản B của hướng bị chê, và carry-over cũng không mang nó sang bản mới.
  const justRejected = decision === 'rejected' && (updated?.length || 0) > 0;
  if (justRejected && (row as any)?.kind === 'mkt_publish_content') {
    const p = (row as any)?.payload || {};
    if (p.ab_pair_id && p.from_plan_direction) {
      try {
        const contentId2 = p.content_id as string | undefined;
        let sugIdx: number | null = null;
        let planId: string | null = null;
        if (contentId2) {
          const { data: c2 } = await client.from('mkt_content').select('brief').eq('id', contentId2).maybeSingle();
          const b2 = (c2 as any)?.brief || {};
          if (typeof b2.suggestion_index === 'number') sugIdx = b2.suggestion_index;
          if (b2.plan_id) planId = String(b2.plan_id);
        }
        if (planId && sugIdx !== null) {
          const { data: planRow } = await client.from('mkt_plans').select('id, data').eq('id', planId).maybeSingle();
          const sugs = Array.isArray((planRow as any)?.data?.content_suggestions) ? (planRow as any).data.content_suggestions : null;
          if (sugs && sugs[sugIdx]) {
            const nowIso = new Date().toISOString();
            const upd = sugs.map((s: any, i: number) => i === sugIdx
              ? { ...s, used_at: nowIso, rejected: true, pending_variant: undefined }
              : s);
            await client.from('mkt_plans').update({ data: { ...(planRow as any).data, content_suggestions: upd } }).eq('id', planId);
            await client.from('run_log').insert({ task: 'mkt.direction_rejected', actor: 'decideForm', status: 'ok', detail: { planId, sugIdx, title: sugs[sugIdx]?.title } });
          }
        }
      } catch (e: any) {
        console.error('[reject] loai huong di loi (bo qua):', e?.message || e);
      }
    }
  }

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
        // 21/8: vòng lặp từng thiếu 'youtube' -> nhánh youtube phía dưới KHÔNG BAO GIỜ chạy,
        // bài duyệt xong chỉ lên FB + TikTok dù channels có youtube (user báo).
        for (const ch of ['facebook', 'tiktok', 'youtube']) {
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
          if (ch === 'facebook') jobs.push(publishContentToFacebook(bgClient, contentId, scheduledAt));
          // TikTok API bỏ (user 26/8): app SDVICO không được TikTok audit ("internal company
          // use" — Google/TikTok reject) → chỉ post được vào tài khoản PRIVATE, nhưng account
          // SDVICO là PUBLIC nên mọi lần API đều trả `unaudited_client_can_only_post_to_private_accounts`.
          // Thay bằng flow XUẤT tay: cột "Đã đăng" có nút "📥 Xuất TikTok" tải video vertical
          // + copy caption + mở tiktok.com/upload để NV cầm điện thoại upload tay. Giữ hàm
          // publishContentToTikTok cho tương lai nếu bằng cách nào đó audit đậu.
          if (ch === 'tiktok') {
            try { await bgClient.from('run_log').insert({ task: 'mkt.publish_tiktok', actor: 'decideForm', status: 'skipped', detail: { contentId, reason: 'tiktok-api-disabled: dung nut Xuat TikTok o /noi-dung' } }); } catch { /* bỏ qua */ }
          }
          if (ch === 'youtube') jobs.push(publishContentToYoutube(bgClient, contentId));
        }
        await Promise.allSettled(jobs);
        // Bài vừa đăng thật xong, cập nhật lại trang cho lần render kế tiếp.
        revalidatePath('/hang-doi');
        revalidatePath('/noi-dung');
      })();
      // Vercel giữ function chạy tới khi bgJob xong, dù response về UI đã trả.
      waitUntil(bgJob);
    }
  }

  revalidatePath('/hang-doi');
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
  revalidatePath('/hang-doi');
  revalidatePath('/noi-dung');
}

// Bật/tắt "bỏ hạn mức" — khi bật thì đăng không kiểm trần ngày (dùng để test).
export async function toggleQuotaDisabled(formData: FormData) {
  const off = String(formData.get('off') || '') === '1';
  const client = getServerClient();
  await setQuotaDisabled(client, off);
  await client.from('run_log').insert({ task: 'ops.quota_disabled', actor: 'ui', status: 'ok', detail: { disabled: off } });
  revalidatePath('/van-hanh');
  revalidatePath('/noi-dung');
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

// Cập nhật trạng thái / ghi chú 1 lead (khối "theo dõi người mua" — user 24/8). Nhân viên
// kinh doanh tự đánh dấu đã liên hệ chưa, không phải máy tự động (điều cấm 1: máy soạn,
// người bấm gửi — máy chỉ BẮT lead từ comment, KHÔNG tự nhắn lại khách).
export async function updateLeadStatus(formData: FormData) {
  const id = String(formData.get('lead_id') || '');
  const status = String(formData.get('status') || '');
  const note = String(formData.get('note') || '').slice(0, 1000);
  if (!id || !['new', 'contacted', 'closed', 'spam'].includes(status)) return;
  const client = getServerClient();
  await client.from('mkt_leads').update({ status, note, updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/khach-hang');
  revalidatePath('/noi-dung');
}

// Cấu hình nhân viên kinh doanh nhận Zalo forward (user 25/8: "chuyển lead qua Zalo NV").
// Lưu app_config key 'mkt_sales_zalo' = { people: [{name, phone}] }. Zalo OA chưa xác thực
// nên KHÔNG tự động gửi được tin nhắn — cách thay thế: /khach-hang có nút "Chuyển NV" tự
// copy nội dung lead vào clipboard + mở tab zalo.me/{phone}, NV paste vào chat.
export async function saveSalesZalo(formData: FormData) {
  const raw = String(formData.get('people') || '').trim();
  // Format nhập: mỗi dòng "Tên NV | SĐT". Ví dụ: "Anh Bình | 0939123456"
  const people = raw
    .split(/\n+/)
    .map((line) => {
      const [name, phone] = line.split('|').map((s) => s.trim());
      const cleanPhone = String(phone || '').replace(/\D/g, '');
      return name && cleanPhone ? { name, phone: cleanPhone } : null;
    })
    .filter(Boolean)
    .slice(0, 10);
  const client = getServerClient();
  await client.from('app_config').upsert({
    key: 'mkt_sales_zalo',
    value: { people, updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  revalidatePath('/khach-hang');
}

// Nhập tay 1 lead (khi nhân viên thấy khách hỏi mua qua kênh chưa tự động bắt được —
// gọi điện trực tiếp, nhắn Zalo cá nhân, gặp mặt...). Nguồn 'manual' phân biệt với lead
// máy tự bắt từ webhook Facebook.
// Playbook 26/8 (item 1 đo Zalo/inbox thay view): thêm content_id + channel để link lead
// vào bài cụ thể. BOSS dùng lead count per bài để xếp hạng sản phẩm (thay vì chỉ view/like).
// channel: 'zalo' | 'inbox' | 'call' | 'meet' — prefix vào message để phân loại (không cần
// migration DB thêm cột, tận dụng bảng cũ).
export async function addLeadManual(formData: FormData) {
  const name = String(formData.get('name') || '').trim().slice(0, 200);
  const message = String(formData.get('message') || '').trim().slice(0, 2000);
  const contact = String(formData.get('contact') || '').trim().slice(0, 200);
  const contentId = String(formData.get('content_id') || '').trim();
  const channel = String(formData.get('channel') || '').trim().toLowerCase();
  if (!name && !message) return;
  const CHANNEL_LABEL: Record<string, string> = { zalo: '[Zalo]', inbox: '[Inbox]', call: '[Gọi]', meet: '[Gặp]' };
  const prefix = CHANNEL_LABEL[channel] || '';
  const finalMessage = prefix ? `${prefix} ${message || contact}`.trim() : (message || contact);
  const client = getServerClient();
  await client.from('mkt_leads').insert({
    source: 'manual',
    fb_user_name: name || null,
    message: finalMessage,
    fb_profile_url: contact || null,
    content_id: contentId || null,
    status: 'new',
  });
  revalidatePath('/khach-hang');
  revalidatePath('/noi-dung');
  revalidatePath('/do-luong');
  revalidatePath('/do-luong/tuan');
}

// Cập nhật số liệu thủ công (nút trên trang Đo lường): Facebook + YouTube Shorts.
export async function refreshFacebookMetrics() {
  const client = getServerClient();
  await pullFacebookMetrics(client);
  try {
    const { pullYouTubeMetrics } = await import('../lib/youtube-metrics');
    await pullYouTubeMetrics(client);
  } catch { /* YouTube loi khong chan phan Facebook */ }
  try {
    const { pullTikTokMetrics } = await import('../lib/tiktok-metrics');
    await pullTikTokMetrics(client);
  } catch { /* TikTok loi khong chan phan tren */ }
  revalidatePath('/do-luong');
}

// Bóc id đối tượng Graph từ mọi dạng link Facebook người dùng dán vào (bài đăng TAY trên Page).
// Hỗ trợ: .../posts/<id|pfbid>, .../photos/a.x/<id>, .../videos/<id>, .../reel/<id>,
// permalink.php?story_fbid=<id>&id=<page>, ?story_fbid=..., story.php, và link đã chuẩn
// facebook.com/<pageid>_<postid> hoặc facebook.com/<id>. Trả null nếu không nhận ra.
function facebookObjectIdFromLink(raw: string): { id: string; kind: 'video' | 'reel' | 'post' } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (!/facebook\.com$|fb\.com$|fb\.watch$/i.test(u.hostname)) return null;
  const q = u.searchParams;
  const sf = q.get('story_fbid'); const pid = q.get('id');
  if (sf) return { id: /^\d+$/.test(sf) && pid && /^\d+$/.test(pid) ? `${pid}_${sf}` : sf, kind: 'post' };
  const v = q.get('v'); if (v && /^\d+$/.test(v)) return { id: v, kind: 'video' };
  // URL /photo/?fbid=<id> hoac /photo.php?fbid=<id> (dang moi FB 2024+): fbid = id anh, coi nhu post
  // vi FB Graph khi hoi <id>?fields=... thuong tra ca meta bai (page_story_id se resolve o buoc do so lieu).
  const fbid = q.get('fbid'); if (fbid && /^\d+$/.test(fbid)) return { id: fbid, kind: 'post' };
  const seg = u.pathname.split('/').filter(Boolean);
  const idx = (k: string) => seg.findIndex((s) => s === k);
  const iV = idx('videos'); if (iV >= 0 && seg[iV + 1]) return { id: seg[iV + 1], kind: 'video' };
  const iR = idx('reel'); if (iR >= 0 && seg[iR + 1]) return { id: seg[iR + 1], kind: 'reel' };
  const iP = idx('posts'); if (iP >= 0 && seg[iP + 1]) return { id: seg[iP + 1], kind: 'post' };
  const iPh = idx('photos'); if (iPh >= 0) { const last = seg[seg.length - 1]; if (/^\d+$/.test(last)) return { id: last, kind: 'post' }; }
  const last = seg[seg.length - 1];
  if (last && /^\d+(_\d+)?$/.test(last)) return { id: last, kind: 'post' };
  if (last && /^pfbid/i.test(last)) return { id: last, kind: 'post' };
  return null;
}

// Nhập bài ĐĂNG TAY trên Page vào hệ thống để kéo số liệu như bài máy đăng (user 18/8: "nếu
// tôi đăng tay bên page chính thức thì có thể lấy số liệu được không"). Điều kiện: bài nằm trên
// đúng Page mà FACEBOOK_PAGE_ACCESS_TOKEN đang giữ. Bước làm: bóc id -> gọi Graph kiểm bài có
// thật + lấy nội dung -> tạo mkt_content (generator='manual-import') + mkt_posts published với
// external_url dạng chuẩn https://www.facebook.com/<id> (pullFacebookMetrics đọc được) -> kéo số
// liệu ngay lần đầu. Không đăng gì, không đụng bài trên FB (chỉ đọc). Trả về thông báo cho UI.
export async function importManualFacebookPost(formData: FormData): Promise<void> {
  const link = String(formData.get('fb_link') || '').trim();
  const titleIn = String(formData.get('title') || '').trim();
  const client = getServerClient();
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const say = async (status: 'ok' | 'error', msg: string, extra: any = {}) => {
    try { await client.from('run_log').insert({ task: 'mkt.import_manual_post', actor: 'do-luong', status, detail: { link, msg, ...extra } }); } catch { /* bỏ qua */ }
  };
  if (!link) { await say('error', 'thiếu link'); revalidatePath('/do-luong'); return; }
  // Ưu tiên token page CHÍNH THỨC (bài đăng tay thường ở page chính thức), rồi tới page test.
  const tokens = [...fbPageTokens()].sort((a, b) => (a.label === 'real' ? -1 : 1) - (b.label === 'real' ? -1 : 1));
  if (!tokens.length) { await say('error', 'chưa cấu hình Facebook token'); revalidatePath('/do-luong'); return; }
  const parsed = facebookObjectIdFromLink(link);
  if (!parsed) { await say('error', 'không nhận ra dạng link Facebook'); revalidatePath('/do-luong'); return; }

  // Kiểm bài có thật + tìm token của page SỞ HỮU bài (thử lần lượt; Graph trả lỗi nếu token không
  // có quyền đọc bài đó). Token nào đọc được là token đúng page -> dùng luôn pageId của token đó.
  const fields = parsed.kind === 'video' || parsed.kind === 'reel' ? 'id,description,title,created_time' : 'id,message,story,created_time,permalink_url';
  let j: any = null; let usedToken: (typeof tokens)[number] | null = null; let lastErr = '';
  for (const t of tokens) {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${encodeURIComponent(parsed.id)}?fields=${fields}&access_token=${t.token}`);
    const body: any = await r.json().catch(() => ({}));
    if (r.ok && !body?.error && body?.id) { j = body; usedToken = t; break; }
    lastErr = body?.error?.message || `HTTP ${r.status}`;
  }
  if (!j || !usedToken) {
    await say('error', 'Facebook không trả bài này. Nếu là bài trên page chính thức, cần cấu hình FACEBOOK_REAL_PAGE_ACCESS_TOKEN (token page đó, có quyền read_insights). Lỗi cuối: ' + lastErr);
    revalidatePath('/do-luong');
    return;
  }
  const pageId = usedToken.pageId || process.env.FACEBOOK_PAGE_ID || '';
  const graphId = String(j.id || parsed.id);
  const text = String(j.message || j.description || j.story || j.title || '').trim();
  const title = titleIn || (text ? text.split('\n')[0].slice(0, 90) : `Bài đăng tay ${graphId}`);
  const externalUrl = parsed.kind === 'video' ? `https://www.facebook.com/${pageId}/videos/${graphId}` : `https://www.facebook.com/${graphId}`;

  // Đã nhập rồi thì thôi (khử trùng theo external_url).
  const { data: dup } = await client.from('mkt_posts').select('content_id').eq('channel', 'facebook').eq('external_url', externalUrl).limit(1);
  if (dup && dup.length) { await say('ok', 'bài đã có trong hệ thống', { content_id: dup[0].content_id }); await pullFacebookMetrics(client); revalidatePath('/do-luong'); return; }

  const { data: ins, error: ce } = await client.from('mkt_content').insert({
    kind: parsed.kind === 'post' ? 'social' : 'video',
    title,
    brief: { keyword: title, intent: 'giao_dich', channels: ['facebook'], generator: 'manual-import', imported_link: link, fb_object_id: graphId, fb_created_time: j.created_time || null, authored: 'human', page: usedToken.label },
    draft: text || null,
    status: 'published',
    needs_gov_review: false,
  }).select('id').single();
  if (ce || !ins) { await say('error', 'không lưu được bài: ' + (ce?.message || '')); revalidatePath('/do-luong'); return; }
  await client.from('mkt_posts').insert({
    content_id: (ins as any).id, channel: 'facebook', status: 'published', external_url: externalUrl,
    published_at: j.created_time ? new Date(j.created_time).toISOString() : new Date().toISOString(),
  });
  // Kéo số liệu ngay để người dùng thấy liền.
  await pullFacebookMetrics(client);
  await say('ok', `đã nhập + kéo số liệu (page ${usedToken.label === 'real' ? 'chính thức' : 'test'})`, { content_id: (ins as any).id, graphId, page: usedToken.label });
  revalidatePath('/do-luong');
}

// ĐĂNG LẠI FACEBOOK cho bài đã duyệt mà lượt đăng FB thất bại (23/8: token Page bị Facebook vô
// hiệu -> FB lỗi, YouTube + TikTok vẫn lên; trước đây không có đường nào đẩy lại, bài kẹt mãi).
// Người bấm nút mới chạy (điều cấm 1 vẫn giữ: bài đã qua duyệt, máy chỉ thực hiện lại lượt đăng).
// Điều kiện: có mục approval_queue status 'approved' cho bài; chưa có mkt_posts facebook published.
export async function retryFacebookPublish(formData: FormData): Promise<void> {
  const contentId = String(formData.get('content_id') || '').trim();
  if (!contentId) return;
  const client = getServerClient();
  const log = async (status: 'ok' | 'error', msg: string, extra: any = {}) => {
    try { await client.from('run_log').insert({ task: 'mkt.publish_facebook_retry', actor: 'nguoi-bam', status, detail: { contentId, msg, ...extra } }); } catch { /* bỏ qua */ }
  };
  if (await isEmergencyStopped(client)) { await log('error', 'dang dung khan, khong dang'); return; }
  const { data: q } = await client.from('approval_queue').select('id').eq('kind', 'mkt_publish_content').eq('payload->>content_id', contentId).eq('status', 'approved').limit(1);
  if (!q || !q.length) { await log('error', 'bai chua duoc duyet, khong dang lai'); return; }
  // Chống bấm đúp: đang có lượt đăng lại chạy nền (3 phút qua) thì bỏ qua.
  const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { count: inflight } = await client.from('run_log').select('id', { count: 'exact', head: true })
    .eq('task', 'mkt.publish_facebook_retry').eq('detail->>phase', 'started').eq('detail->>contentId', contentId).gte('created_at', since);
  if (inflight && inflight > 0) { revalidatePath('/noi-dung'); return; }
  // CHẠY NỀN (23/8: user bấm -> web treo ~70s vì chờ FB xử lý video rồi mới trả trang). Giống
  // decideForm: waitUntil giữ hàm sống sau khi đã trả response; thẻ tự cập nhật khi xong.
  await log('ok', 'bat dau dang lai (chay nen)', { phase: 'started' });
  const bgClient = getServerClient();
  const bgJob = (async () => {
    try {
      const res = await publishContentToFacebook(bgClient, contentId, null);
      if (res.ok) {
        // Dọn các dòng 'failed' cũ của kênh facebook để thẻ hết cảnh báo; dòng published do
        // publishContentToFacebook vừa ghi.
        await bgClient.from('mkt_posts').delete().eq('content_id', contentId).eq('channel', 'facebook').eq('status', 'failed');
        try { await bgClient.from('run_log').insert({ task: 'mkt.publish_facebook_retry', actor: 'nguoi-bam', status: 'ok', detail: { contentId, phase: 'done', msg: res.url ? 'da dang lai' : 'bai da co tren facebook tu truoc', url: res.url || null, warn: res.warn || null } }); } catch { /* bỏ qua */ }
      } else {
        try { await bgClient.from('run_log').insert({ task: 'mkt.publish_facebook_retry', actor: 'nguoi-bam', status: 'error', detail: { contentId, phase: 'done', msg: 'dang lai van loi: ' + String(res.error || '') } }); } catch { /* bỏ qua */ }
      }
    } catch (e: any) {
      try { await bgClient.from('run_log').insert({ task: 'mkt.publish_facebook_retry', actor: 'nguoi-bam', status: 'error', detail: { contentId, phase: 'done', msg: String(e?.message || e) } }); } catch { /* bỏ qua */ }
    }
  })();
  waitUntil(bgJob);
  revalidatePath('/noi-dung');
  revalidatePath('/do-luong');
}

// Đăng LẠI TikTok cho bài đã có lượt post fail (VD 26/8: fix privacy SELF_ONLY sau bug
// unaudited_client_can_only_post_to_private_accounts). Copy pattern retryFacebookPublish.
// KHÔNG đăng lại nếu đã có bản published — chống trùng.
export async function retryTiktokPublish(formData: FormData): Promise<void> {
  const contentId = String(formData.get('content_id') || '').trim();
  if (!contentId) return;
  const client = getServerClient();
  const log = async (status: 'ok' | 'error', msg: string, extra: any = {}) => {
    try { await client.from('run_log').insert({ task: 'mkt.publish_tiktok_retry', actor: 'nguoi-bam', status, detail: { contentId, msg, ...extra } }); } catch { /* bỏ qua */ }
  };
  if (await isEmergencyStopped(client)) { await log('error', 'dang dung khan, khong dang'); return; }
  const { data: q } = await client.from('approval_queue').select('id').eq('kind', 'mkt_publish_content').eq('payload->>content_id', contentId).eq('status', 'approved').limit(1);
  if (!q || !q.length) { await log('error', 'bai chua duoc duyet, khong dang lai'); return; }
  // Chống bấm đúp: đang có lượt đăng lại chạy nền (3 phút qua) thì bỏ qua.
  const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { count: inflight } = await client.from('run_log').select('id', { count: 'exact', head: true })
    .eq('task', 'mkt.publish_tiktok_retry').eq('detail->>phase', 'started').eq('detail->>contentId', contentId).gte('created_at', since);
  if (inflight && inflight > 0) { revalidatePath('/noi-dung'); return; }
  await log('ok', 'bat dau dang lai (chay nen)', { phase: 'started' });
  const bgClient = getServerClient();
  const bgJob = (async () => {
    try {
      // Dọn record 'failed' TRƯỚC khi thử lại để publishContentToTikTok không thấy record cũ
      // (guard chỉ check status='published' nên vẫn retry được, nhưng dọn cho gọn).
      await bgClient.from('mkt_posts').delete().eq('content_id', contentId).eq('channel', 'tiktok').eq('status', 'failed');
      const res = await publishContentToTikTok(bgClient, contentId, null);
      try {
        await bgClient.from('run_log').insert({
          task: 'mkt.publish_tiktok_retry',
          actor: 'nguoi-bam',
          status: res.ok ? 'ok' : 'error',
          detail: { contentId, phase: 'done', msg: res.ok ? 'da dang lai' : ('van loi: ' + String(res.error || '')) }
        });
      } catch { /* bỏ qua */ }
    } catch (e: any) {
      try { await bgClient.from('run_log').insert({ task: 'mkt.publish_tiktok_retry', actor: 'nguoi-bam', status: 'error', detail: { contentId, phase: 'done', msg: String(e?.message || e) } }); } catch { /* bỏ qua */ }
    }
  })();
  waitUntil(bgJob);
  revalidatePath('/noi-dung');
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

// Tạo folder sản phẩm MỚI (user 26/8: "thêm folder để tạo thêm sản phẩm"). Lưu app_config
// key 'mkt_custom_product_groups' = array string. Folder mới hiện ngay ở sidebar /tu-lieu
// (kể cả khi rỗng), user upload tư liệu gán vào folder này. Rotate tự nhận vì query
// brand_assets by product_group thực tế, không đọc PRODUCTS hardcode.
export async function createProductFolder(formData: FormData) {
  let name = String(formData.get('name') || '').trim().slice(0, 120);
  if (!name) return;
  // Auto-prefix STT nếu user chưa gõ (VD "Máy dò cá" -> "9. Máy dò cá") để khớp format
  // 8 folder cứng "1. ..., 2. ..." — sidebar sort đẹp hơn. Nếu user đã gõ "N." rồi giữ nguyên.
  if (!/^\s*\d+\.\s*/.test(name)) {
    // Đếm folder hiện có (cứng + custom) để đưa STT tiếp theo.
    // @ts-ignore — module JS thuần
    const { PRODUCTS, CONTENT_GROUP } = await import('../lib/gen/products.mjs');
    const client = getServerClient();
    const { data: cfgRow } = await client.from('app_config').select('value').eq('key', 'mkt_custom_product_groups').maybeSingle();
    const existing: string[] = Array.isArray((cfgRow as any)?.value?.groups) ? (cfgRow as any).value.groups : [];
    const totalHardCoded = (PRODUCTS as { group: string }[]).length; // 8 folder cứng, không đếm Content
    const nextIdx = totalHardCoded + existing.length + 1;
    name = `${nextIdx}. ${name}`;
    const groups = [...existing, name];
    await client.from('app_config').upsert({
      key: 'mkt_custom_product_groups',
      value: { groups, updated_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    });
  } else {
    // User đã gõ STT rồi — chỉ append thẳng.
    const client = getServerClient();
    const { data: cfgRow } = await client.from('app_config').select('value').eq('key', 'mkt_custom_product_groups').maybeSingle();
    const existing: string[] = Array.isArray((cfgRow as any)?.value?.groups) ? (cfgRow as any).value.groups : [];
    if (existing.includes(name)) { revalidatePath('/tu-lieu'); return; }
    const groups = [...existing, name];
    await client.from('app_config').upsert({
      key: 'mkt_custom_product_groups',
      value: { groups, updated_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    });
  }
  revalidatePath('/tu-lieu');
}

// Xoá 1 folder custom (không đụng brand_assets — tư liệu đã gán vào folder này vẫn giữ
// product_group cũ, hiện dưới nhóm "custom" ở sidebar cho tới khi user chuyển đi hoặc xoá).
export async function deleteProductFolder(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  const client = getServerClient();
  const { data: cfgRow } = await client.from('app_config').select('value').eq('key', 'mkt_custom_product_groups').maybeSingle();
  const existing: string[] = Array.isArray((cfgRow as any)?.value?.groups) ? (cfgRow as any).value.groups : [];
  const groups = existing.filter((g) => g !== name);
  await client.from('app_config').upsert({
    key: 'mkt_custom_product_groups',
    value: { groups, updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
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

// Đánh dấu một BÀI cần dựng video (cờ brief.video_requested). Video dựng NẶNG (ffmpeg/Whisper/TTS)
// nên KHÔNG chạy trên web được: nút này chỉ ĐẶT YÊU CẦU; máy nội bộ chạy build-video-all.mjs
// --requested sẽ dựng rồi đẩy vào Hàng đợi duyệt. Dùng cờ trong brief, không thêm cột DB.
export async function requestVideoForContent(formData: FormData) {
  const id = String(formData.get('content_id') || '');
  if (!id) return;
  const client = getServerClient();
  const { data: c } = await client.from('mkt_content').select('brief').eq('id', id).single();
  const brief = (((c as any)?.brief) || {}) as Record<string, unknown>;
  await client
    .from('mkt_content')
    .update({ brief: { ...brief, video_requested: true, video_requested_at: new Date().toISOString() } })
    .eq('id', id);
  revalidatePath('/noi-dung');
  // Kích hoạt GitHub Actions dựng ngay (khỏi chờ cron 10 phút).
  const url = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/trigger-video-build`
    : 'http://localhost:3000/api/trigger-video-build';
  fetch(url, { method: 'POST' }).catch((e) => console.warn('trigger-video-build lỗi:', e?.message));
}

// Xóa một BÀI (nội dung) khỏi hệ thống: gỡ bản ghi mkt_content + mục hàng đợi + bài đăng + số liệu.
// LƯU Ý: chỉ xóa dữ liệu trong hệ thống, KHÔNG gỡ bài đã đăng thật trên Facebook/TikTok.
// SOFT-DELETE (user 26/8 chot cach C): chi mark mkt_content.deleted_at, KHONG cham
// mkt_posts / mkt_metrics / approval_queue -> lich su Like/View/Comment con nguyen o Do luong.
// UI filter deleted_at null nen bai bien mat khoi Bang bai viet + Bai viet day du. Undo qua
// restoreContent tu thung rac. Chi hardDeleteContent moi xoa han (co warning tren UI).
export async function deleteContent(formData: FormData) {
  const id = String(formData.get('content_id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client.from('mkt_content').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('Soft-delete lỗi: ' + error.message);
  try {
    await client.from('run_log').insert({
      task: 'mkt.content_soft_deleted', actor: 'user', status: 'ok', detail: { contentId: id }
    });
  } catch { /* bỏ qua */ }
  revalidatePath('/noi-dung');
  revalidatePath('/do-luong');
}

// Khoi phuc bai da soft-delete: clear mkt_content.deleted_at. Goi tu trang thung rac.
export async function restoreContent(formData: FormData) {
  const id = String(formData.get('content_id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client.from('mkt_content').update({ deleted_at: null }).eq('id', id);
  if (error) throw new Error('Khôi phục lỗi: ' + error.message);
  revalidatePath('/noi-dung');
}

// XOA HAN (khong khoi phuc duoc): xoa 4 bang nhu logic cu. Chi goi tu trang thung rac voi
// warning ro rang. User 26/8 hoi han vi phien ban cu deleteContent la hard-delete silent.
export async function hardDeleteContent(formData: FormData) {
  const id = String(formData.get('content_id') || '');
  if (!id) return;
  const client = getServerClient();
  await Promise.all([
    client.from('approval_queue').delete().eq('payload->>content_id', id),
    client.from('mkt_posts').delete().eq('content_id', id),
    client.from('mkt_metrics').delete().eq('entity_ref', id)
  ]);
  await client.from('mkt_content').delete().eq('id', id);
  try {
    await client.from('run_log').insert({
      task: 'mkt.content_hard_deleted', actor: 'user', status: 'ok', detail: { contentId: id }
    });
  } catch { /* bỏ qua */ }
  revalidatePath('/noi-dung');
  revalidatePath('/do-luong');
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
  const client = getServerClient();
  // @ts-ignore — module JS thuần, không có .d.ts
  const { generateContentAsync } = await import('../lib/gen/content.mjs');
  try {
    const r = await generateContentAsync(
      { keyword: clean, intent, landing_url },
      { assetHint: (assetHint || '').trim(), format, contentType, client: client as any }
    );
    return (r?.draft as string) || '';
  } catch (e: any) {
    return `Không sinh được bằng AI: ${e?.message || e}. Bấm Xong để tự soạn tay và đẩy vào hàng đợi.`;
  }
}

// Xong khung sản xuất: tạo bản ghi mkt_content + đẩy vào approval_queue.
// KHÔNG tự đăng — người duyệt bấm 'Duyệt' ở Hàng đợi duyệt mới thực sự lên trang (Điều cấm 1).
// Nếu form đặt request_video=1 -> gắn cờ brief.video_requested để máy nội bộ (watcher --requested)
// tự dựng video từ bài này. Trả về contentId để client polling xem video đã dựng xong chưa.
export async function createContent(formData: FormData): Promise<{ contentId: string; videoRequested: boolean }> {
  const title = String(formData.get('title') || '').trim();
  const draft = String(formData.get('draft') || '').trim();
  const kind = (String(formData.get('kind') || 'social') as 'article' | 'social' | 'video');
  const imageAssetId = String(formData.get('image_asset_id') || '') || null;
  const videoAssetId = String(formData.get('video_asset_id') || '') || null;
  // Multi-select ở Xưởng sản xuất: nhiều ảnh + nhiều video (CSV). Video đầu = bài chính, ảnh dư
  // thả bình luận sau khi đăng.
  const parseIds = (name: string) => String(formData.get(name) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const imageAssetIds = parseIds('image_asset_ids');
  const videoAssetIds = parseIds('video_asset_ids');
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
  const requestVideo = String(formData.get('request_video') || '') === '1';
  if (!title || !draft) return { contentId: '', videoRequested: false };

  const client = getServerClient();
  const brief: Record<string, unknown> = {
    keyword,
    intent,
    landing_url: landingUrl,
    keyword_id: keywordId,
    generator: 'xuong-san-xuat',
    channels,
    content_type: contentType,
    assets: { image: imageAssetId, video: videoAssetId, images: imageAssetIds, videos: videoAssetIds }
  };
  if (requestVideo) {
    brief.video_requested = true;
    brief.video_requested_at = new Date().toISOString();
  }
  const { data: inserted, error } = await client
    .from('mkt_content')
    .insert({ kind, title, brief, draft, status: 'review' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const contentId = (inserted as { id: string })?.id;
  // Khi user chọn "Xong + Làm video": bài gốc CHỈ là NGUỒN cho pipeline, KHÔNG đưa vào hàng đợi
  // duyệt (nếu đưa thì user dễ nhầm bấm Duyệt bài gốc -> đăng clip gốc lên FB thay vì video AI).
  // Pipeline sẽ tạo bài MỚI (kind='social', generator='video-pipeline', source_content=contentId)
  // và đẩy bài đó vào hàng đợi.
  const { error: qErr } = requestVideo ? { error: null } : await client.from('approval_queue').insert({
    kind: 'mkt_publish_content',
    // Tiêu đề queue = tiêu đề bài, không tag ngoặc (kênh/loại đã có badge trên card).
    title,
    payload: {
      content_id: contentId,
      format: kind,
      keyword,
      intent,
      landing_url: landingUrl,
      risk: 'amber',
      channels,
      authored: 'human', // người tự soạn -> cờ đỏ, phân biệt với AI tự sinh
      assets: { image: imageAssetId, video: videoAssetId, images: imageAssetIds, videos: videoAssetIds }
    },
    status: 'pending'
  });
  if (qErr) throw new Error(qErr.message);

  // Chỉ revalidate 2 trang HIỂN THỊ bài vừa tạo. KHÔNG revalidate /san-xuat: trang đó chỉ đọc
  // brand_assets (không đổi ở đây), revalidate làm serverless phải render lại nặng -> nút "Xong"
  // treo lâu ở client.
  revalidatePath('/hang-doi');
  revalidatePath('/noi-dung');

  // Đã yêu cầu video: kích hoạt GitHub Actions dựng ngay (thay vì chờ cron 10 phút). Không chờ
  // response - "fire and forget" (workflow chạy ~8 phút, client sẽ tự polling checkVideoDone).
  if (requestVideo && contentId) {
    const url = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/trigger-video-build`
      : 'http://localhost:3000/api/trigger-video-build';
    fetch(url, { method: 'POST' }).catch((e) => console.warn('trigger-video-build lỗi:', e?.message));
  }
  return { contentId, videoRequested: requestVideo };
}

// Kiểm tra máy nội bộ đã dựng xong video CHO bài <sourceContentId> chưa. Video pipeline sinh 1
// bài mới kind='social' post_kind='video' brief.source_content=<gốc> + upload video vào Storage.
// Trả về {done, videoContentId, url, title, videoUrl} khi thấy; ngược lại {done:false, elapsedMinutes}.
export async function checkVideoDone(sourceContentId: string): Promise<{
  done: boolean; videoContentId?: string; url?: string; title?: string; videoUrl?: string; elapsedMinutes?: number;
}> {
  if (!sourceContentId) return { done: false };
  const client = getServerClient();
  // Bài video kết quả: brief.source_content = sourceContentId, do video-pipeline sinh.
  const { data: videos } = await client
    .from('mkt_content')
    .select('id, title, brief, created_at')
    .eq('brief->>generator', 'video-pipeline')
    .eq('brief->>source_content', sourceContentId)
    .order('created_at', { ascending: false })
    .limit(1);
  const v = (videos || [])[0] as { id: string; title: string; brief: any; created_at: string } | undefined;
  if (v) {
    // Lấy URL công khai của video (bản dọc mặc định).
    const videoId = (v.brief?.assets?.video_v || v.brief?.assets?.video || v.brief?.assets?.video_h) as string | undefined;
    let videoUrl: string | undefined;
    if (videoId) {
      const { data: a } = await client.from('brand_assets').select('storage_path').eq('id', videoId).single();
      const sp = (a as { storage_path?: string } | null)?.storage_path;
      if (sp) videoUrl = client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
    }
    return { done: true, videoContentId: v.id, url: '/noi-dung?loai=video', title: v.title, videoUrl };
  }
  // Chưa xong. Trả về số phút đã đợi để client cảnh báo nếu quá lâu (máy tắt?).
  const { data: src } = await client.from('mkt_content').select('brief').eq('id', sourceContentId).single();
  const at = (src as any)?.brief?.video_requested_at as string | undefined;
  const elapsedMinutes = at ? Math.round((Date.now() - new Date(at).getTime()) / 60000) : undefined;
  return { done: false, elapsedMinutes };
}

// Chỉnh sửa bản nháp trước khi duyệt. Người sửa là người kiểm soát (điều cấm 1).
export async function editDraft(formData: FormData) {
  const contentId = String(formData.get('content_id') || '');
  const draft = String(formData.get('draft') || '');
  if (!contentId) return;
  const client = getServerClient();
  const { error } = await client.from('mkt_content').update({ draft }).eq('id', contentId);
  if (error) throw new Error(error.message);
  revalidatePath('/hang-doi');
  revalidatePath('/noi-dung');
}

// Tạo kế hoạch ngay (nút trên trang Kế hoạch). Đọc số liệu Đo lường rồi sinh 1 bản 'manual'.
// Bot ĐỀ XUẤT, người quyết (điều cấm 1 và 2). Bản mới applied = false, chưa tác động vòng xoay.
export async function generatePlanNow() {
  const client = getServerClient();
  // Sinh + ÁP DỤNG NGAY (21/8, user hỏi "bấm tạo thì các con AI có áp dụng không?" — trước
  // đây chỉ sinh, phải bấm thêm "Áp dụng trọng số" mà nút đó nằm khuất; người đã bấm Tạo tức
  // là đã quyết -> áp luôn, giống saveWeeklyGoal). Vòng xoay lần chạy kế tiếp đọc bản này.
  const { id } = await generateAndStorePlan(client, 'manual');
  if (id) {
    await client.from('mkt_plans').update({ applied: false, applied_at: null }).eq('applied', true);
    await client.from('mkt_plans').update({ applied: true, applied_at: new Date().toISOString() }).eq('id', id);
    // Làm mới đề xuất sống để lịch 7 ngày + hướng đi dự kiến bám ngay bản mới.
    try {
      const { refreshLiveProposal } = await import('../lib/plan-live');
      await refreshLiveProposal(client);
    } catch (e: any) {
      console.error('[plan-now] refresh live loi (bo qua):', e?.message || e);
    }
  }
  revalidatePath('/ke-hoach');
}

// Áp dụng trọng số của một bản kế hoạch: đánh dấu bản đó applied, gỡ áp các bản còn lại.
// SAU khi áp, /api/rotate mới ưu tiên folder theo trọng số. Người bấm mới áp (điều cấm 2).
export async function applyPlanWeights(formData: FormData) {
  const planId = String(formData.get('plan_id') || '');
  if (!planId) return;
  const client = getServerClient();
  // 24/8 (bug user: "bam de xuat ke hoach mat tieu huong di"): ban learn-weekly chi co
  // weights + products, KHONG co content_suggestions -> ap thang -> mat het huong di.
  // FIX: neu ban duoc chon la learn-weekly, MERGE weights + products + narrative vao ban
  // dang ap (giu content_suggestions cua ban tuan/cap nhat). Giong applyLiveEvening.
  const { data: incoming } = await client.from('mkt_plans').select('id, data').eq('id', planId).maybeSingle();
  const inData = ((incoming as any)?.data || {}) as any;
  const isLearn = inData.origin === 'learn-weekly';
  if (isLearn) {
    const { data: base } = await client.from('mkt_plans').select('id, data').eq('applied', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const baseData = ((base as any)?.data || {}) as any;
    if ((base as any)?.id && Array.isArray(baseData.content_suggestions) && baseData.content_suggestions.length) {
      // Merge INTO bản đang áp, giữ hướng đi. Bản learn-weekly chỉ đóng vai "đề xuất trọng số".
      const merged = {
        ...baseData,
        weights: inData.weights || baseData.weights,
        products: inData.products || baseData.products,
        summary: { ...(baseData.summary || {}), ...(inData.summary || {}) },
        narrative: [
          `Đã áp đề xuất cuối tuần: ${(inData.narrative || [])[0] || ''}`,
          ...(baseData.narrative || []),
        ].slice(0, 6),
        appliedLearnPlanId: planId,
        appliedLearnAt: new Date().toISOString(),
      };
      const { error: e1 } = await client.from('mkt_plans').update({ data: merged, applied_at: new Date().toISOString() }).eq('id', (base as any).id);
      if (e1) throw new Error(e1.message);
      // Đánh dấu bản learn-weekly đã áp (để nút không hiện lại), nhưng KHÔNG set applied cho nó.
      await client.from('mkt_plans').update({ applied_at: new Date().toISOString() }).eq('id', planId);
      try { await client.from('run_log').insert({ task: 'mkt.apply_learn', actor: 'nguoi-bam', status: 'ok', detail: { planId, mergedInto: (base as any).id } }); } catch { /* bo qua */ }
      revalidatePath('/ke-hoach');
      return;
    }
  }
  // Bản có content_suggestions (kế hoạch tuần / cập nhật): áp thay như cũ.
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

// Kéo số liệu 3 nền tảng ngay (Facebook + YouTube + TikTok) — user bấm nút thay vì chờ
// cron 1h (user 26/8: "sếp muốn thấy số liệu ngay không phải chờ"). Song song 3 nguồn, 1
// nguồn lỗi không đánh hỏng nguồn khác. Sau khi xong revalidate các trang có số liệu.
export async function pullMetricsNow(): Promise<{ ok: boolean; fb: number; yt: number; tt: number; msg: string }> {
  const client = getServerClient();
  const [fbRes, ytRes, ttRes] = await Promise.all([
    pullFacebookMetrics(client).catch((e) => ({ pulled: 0, results: [{ error: String(e?.message || e) }] })),
    (async () => {
      try {
        const { pullYouTubeMetrics } = await import('../lib/youtube-metrics');
        return await pullYouTubeMetrics(client);
      } catch (e: any) { return { pulled: 0, errors: [String(e?.message || e)] }; }
    })(),
    (async () => {
      try {
        const { pullTikTokMetrics } = await import('../lib/tiktok-metrics');
        return await pullTikTokMetrics(client);
      } catch (e: any) { return { pulled: 0, matched: 0, errors: [String(e?.message || e)] }; }
    })(),
  ]);
  const fb = (fbRes as any).pulled || 0;
  const yt = (ytRes as any).pulled || 0;
  const tt = (ttRes as any).pulled || 0;
  try {
    await client.from('run_log').insert({
      task: 'mkt.metrics_pull_manual',
      actor: 'user',
      status: 'ok',
      detail: { fb, yt, tt }
    });
  } catch { /* bỏ qua */ }
  revalidatePath('/noi-dung');
  revalidatePath('/do-luong');
  revalidatePath('/do-luong/tuan');
  const parts: string[] = [];
  if (fb) parts.push(`Facebook ${fb}`);
  if (yt) parts.push(`YouTube ${yt}`);
  if (tt) parts.push(`TikTok ${tt}`);
  const msg = parts.length ? `Đã kéo: ${parts.join(', ')} bài` : 'Không có số liệu mới (API im hoặc không có bài).';
  return { ok: true, fb, yt, tt, msg };
}

