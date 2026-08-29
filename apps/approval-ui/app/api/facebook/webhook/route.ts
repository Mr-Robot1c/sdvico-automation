import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServerClient } from '../../../../lib/supabase-server';

// Webhook Facebook — bắt lead từ comment/inbox hỏi mua (user 24/8: "khối theo dõi người mua").
//
// TRẠNG THÁI (24/8): token Facebook hiện tại CHƯA có quyền pages_messaging (đọc inbox) —
// đang xin Facebook App Review, mất vài ngày tới vài tuần. Route này SẴN SÀNG chờ — verify
// challenge chạy được ngay (không cần quyền đặc biệt), nhưng event tin nhắn thật chỉ tới khi:
//   1. Facebook duyệt xong pages_messaging
//   2. Đăng ký Webhook URL này trên Facebook Developer Console (App → Webhooks → Page →
//      Subscribe field 'messages' + 'feed'), verify token = biến FACEBOOK_WEBHOOK_VERIFY_TOKEN.
//   3. Đặt FACEBOOK_APP_SECRET trên Vercel (29/8) — có biến này thì POST chỉ nhận gói có
//      chữ ký hợp lệ. User hiện KHÔNG truy cập được app Facebook để lấy App Secret nên tạm
//      cho phép thiếu: webhook vẫn nhận nhưng run_log cảnh báo mỗi lần. Xin App Secret từ
//      người quản trị app (developers.facebook.com → Settings → Basic) rồi đặt lên Vercel
//      là tự siết lại, không cần sửa code.
//
// Comment (field 'feed') KHÔNG cần quyền đặc biệt ngoài pages_read_engagement (đã có) — có
// thể test bắt lead từ comment NGAY, không cần chờ duyệt pages_messaging.
//
// KHÔNG tự động nhắn lại khách (điều cấm 1: máy soạn, người bấm gửi) — route này CHỈ ĐỌC và
// LƯU, không gọi Send API. Nhân viên kinh doanh tự liên hệ qua thông tin đã bắt được.
export const dynamic = 'force-dynamic';

// GET: Facebook xác minh URL webhook (hub.challenge). Chạy được ngay, không cần quyền gì.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected) {
    return new NextResponse(challenge || '', { status: 200 });
  }
  return NextResponse.json({ error: 'verify_token khong khop' }, { status: 403 });
}

// Playbook 26/8 (item 1 đo Zalo/inbox thay view): "Thước đo của SDVICO là số Zalo từ đúng
// chủ tàu" — thà rác lọt vào danh sách còn hơn miss lead. Trước đây lọc bằng INTENT_KEYWORDS
// (giá/mua/bn) — comment "hay quá, cảnh này chắc đi Long Hải" bị vứt oan dù là chủ tàu thật.
// Nới rộng: chấp nhận MỌI comment >=4 ký tự có ít nhất 1 chữ cái, chỉ loại emoji đơn thuần
// hoặc comment ngắn kiểu "ok/hay/wow". Admin thấy rác thì bấm status='spam' để loại khỏi
// đếm (bảng mkt_leads có sẵn cột status check).
const SHORT_STOPWORDS = new Set(['ok', 'oke', 'hay', 'wow', 'good', 'good.', 'chuẩn', 'chuan', 'đúng', 'dung', 'like', 'yes', 'no']);
function looksLikeIntent(text: string): boolean {
  const raw = String(text || '').trim();
  if (raw.length < 4) return false;                    // "A", "hi" → bỏ
  const t = raw.toLowerCase();
  if (SHORT_STOPWORDS.has(t)) return false;            // "ok", "hay" → bỏ
  if (!/[a-zàáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t)) return false; // chỉ số/emoji → bỏ
  return true;                                          // còn lại: nhận, để admin lọc spam sau
}

// 25/8 (user "khong hien ten, khong bam vao xem cuoc tro chuyen"): Facebook Messenger
// webhook chi gui PSID (Page-Scoped ID), khong kem ten. Fetch ten qua Graph API — token
// page co pages_messaging (da xac nhan) goi duoc.
async function fetchMessengerUserName(psid: string): Promise<string | null> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!token || !psid) return null;
  try {
    const r = await fetch(`https://graph.facebook.com/${version}/${psid}?fields=name`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j: any = await r.json();
    if (j.error) return null;
    return String(j.name || '').trim() || null;
  } catch {
    return null;
  }
}

// Link mo Meta Business Suite Inbox cua Page — Facebook KHONG cho link truc tiep toi 1
// conversation cu the qua URL public, nen dua admin toi inbox chung, tu tim conversation.
function messengerInboxUrl(): string | null {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!pageId) return null;
  return `https://business.facebook.com/latest/inbox/messenger?asset_id=${pageId}`;
}

// 29/8 (audit bảo mật): Facebook ký MỌI gói POST bằng HMAC-SHA256(app secret, raw body),
// gửi trong header X-Hub-Signature-256 dạng "sha256=<hex>". Trước đây route nhận thẳng
// req.json() không kiểm — ai biết URL là bơm được lead giả vào mkt_leads, làm hỏng thước đo.
// Có FACEBOOK_APP_SECRET: chữ ký sai là từ chối 403. Chưa có (user không truy cập được app
// Facebook): vẫn nhận để lead không đứt, nhưng run_log gắn cảnh báo mỗi lần chạy.
function verifyFacebookSignature(rawBody: string, header: string | null): 'ok' | 'thieu-secret' | 'sai-chu-ky' {
  const secret = (process.env.FACEBOOK_APP_SECRET || '').trim();
  if (!secret) return 'thieu-secret';
  if (!header || !header.startsWith('sha256=')) return 'sai-chu-ky';
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const got = header.slice('sha256='.length).trim().toLowerCase();
  if (got.length !== expected.length) return 'sai-chu-ky';
  return timingSafeEqual(Buffer.from(got, 'utf8'), Buffer.from(expected, 'utf8')) ? 'ok' : 'sai-chu-ky';
}

export async function POST(req: Request) {
  const client = getServerClient();

  // Đọc RAW body trước — chữ ký tính trên đúng chuỗi byte Facebook gửi, parse JSON sau.
  const rawBody = await req.text();
  const sig = verifyFacebookSignature(rawBody, req.headers.get('x-hub-signature-256'));
  if (sig === 'sai-chu-ky') {
    try {
      await client.from('run_log').insert({
        task: 'mkt.facebook_webhook', actor: 'facebook', status: 'error',
        detail: { error: 'X-Hub-Signature-256 không khớp — gói tin không phải do Facebook ký, đã bỏ' },
      });
    } catch { /* bỏ qua lỗi ghi log */ }
    return NextResponse.json({ ok: false, error: 'chu ky khong hop le' }, { status: 403 });
  }
  // Chưa có secret thì nhận tạm nhưng phải kêu to trong run_log, không để quên vĩnh viễn.
  const unsignedWarning = sig === 'thieu-secret'
    ? 'FACEBOOK_APP_SECRET chưa đặt — webhook đang chạy KHÔNG kiểm chữ ký. Xin App Secret từ người quản trị app Facebook rồi đặt lên Vercel.'
    : null;

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'body khong phai JSON' }, { status: 400 });
  }
  if (body?.object !== 'page') return NextResponse.json({ ok: true, skipped: 'not page object' });

  const entries: any[] = Array.isArray(body.entry) ? body.entry : [];
  let captured = 0;
  let filtered = 0;                    // đếm số comment bị filter loại (debug — xem trong run_log detail)
  const errors: string[] = [];
  const filteredSamples: string[] = []; // vài mẫu comment bị loại, giúp tinh chỉnh filter khi cần

  for (const entry of entries) {
    // 1) Tin nhắn Messenger (field 'messages' — cần pages_messaging, chưa duyệt tại 24/8).
    const messagingEvents: any[] = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const ev of messagingEvents) {
      const text = String(ev?.message?.text || '').trim();
      const senderId = String(ev?.sender?.id || '');
      if (!text || !senderId) continue;
      // 25/8 (user "captured=1 nhung totalLeadsInDb=0"): Supabase client insert KHONG throw
      // khi loi DB (bang khong ton tai, RLS chan...) — no tra { error } object. Phai check
      // field error thay vi try/catch, khong thi captured++ nham.
      // 25/8 (user "khong hien ten, khong bam xem cuoc tro chuyen"): fetch ten Messenger qua
      // Graph API bang PSID, luu link Meta Business Suite Inbox lam profile_url.
      const senderName = await fetchMessengerUserName(senderId);
      try {
        const { error } = await client.from('mkt_leads').insert({
          source: 'facebook_message',
          fb_user_id: senderId,
          fb_user_name: senderName,
          fb_profile_url: messengerInboxUrl(),
          message: text.slice(0, 2000),
          status: 'new',
          raw_payload: ev,
        });
        if (error) errors.push('message insert: ' + error.message.slice(0, 150));
        else captured++;
      } catch (e: any) {
        errors.push('message insert exception: ' + String(e?.message || e).slice(0, 150));
      }
    }

    // 2) Comment dưới bài (field 'feed') — chỉ cần pages_read_engagement (đã có).
    const changes: any[] = Array.isArray(entry.changes) ? entry.changes : [];
    for (const ch of changes) {
      if (ch?.field !== 'feed') continue;
      const v = ch.value || {};
      if (v.item !== 'comment' || v.verb !== 'add') continue;
      const text = String(v.message || '').trim();
      if (!text) continue;
      if (!looksLikeIntent(text)) {
        filtered++;
        if (filteredSamples.length < 5) filteredSamples.push(text.slice(0, 60));
        continue;
      }
      const postId = String(v.post_id || '');
      let contentId: string | null = null;
      if (postId) {
        try {
          const { data: post } = await client
            .from('mkt_posts')
            .select('content_id')
            .eq('channel', 'facebook')
            .ilike('external_url', `%${postId}%`)
            .limit(1)
            .maybeSingle();
          contentId = (post as any)?.content_id || null;
        } catch { /* không match được thì bỏ qua, vẫn lưu lead */ }
      }
      try {
        const { error } = await client.from('mkt_leads').insert({
          source: 'facebook_comment',
          fb_user_id: String(v.sender_id || ''),
          fb_user_name: String(v.sender_name || '') || null,
          message: text.slice(0, 2000),
          content_id: contentId,
          status: 'new',
          raw_payload: v,
        });
        if (error) errors.push('comment insert: ' + error.message.slice(0, 150));
        else captured++;
      } catch (e: any) {
        errors.push('comment insert exception: ' + String(e?.message || e).slice(0, 150));
      }
    }
  }

  try {
    await client.from('run_log').insert({
      task: 'mkt.facebook_webhook', actor: 'facebook', status: errors.length ? 'error' : 'ok',
      detail: {
        captured, filtered, filteredSamples, errors: errors.slice(0, 5),
        ...(unsignedWarning ? { warning: unsignedWarning } : {}),
      },
    });
  } catch { /* bỏ qua lỗi ghi log */ }

  // Facebook yêu cầu trả 200 nhanh, không thì retry dồn dập.
  return NextResponse.json({ ok: true, captured });
}
