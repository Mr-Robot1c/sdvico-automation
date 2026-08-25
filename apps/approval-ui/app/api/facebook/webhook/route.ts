import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';

// Webhook Facebook — bắt lead từ comment/inbox hỏi mua (user 24/8: "khối theo dõi người mua").
//
// TRẠNG THÁI (24/8): token Facebook hiện tại CHƯA có quyền pages_messaging (đọc inbox) —
// đang xin Facebook App Review, mất vài ngày tới vài tuần. Route này SẴN SÀNG chờ — verify
// challenge chạy được ngay (không cần quyền đặc biệt), nhưng event tin nhắn thật chỉ tới khi:
//   1. Facebook duyệt xong pages_messaging
//   2. Đăng ký Webhook URL này trên Facebook Developer Console (App → Webhooks → Page →
//      Subscribe field 'messages' + 'feed'), verify token = biến FACEBOOK_WEBHOOK_VERIFY_TOKEN.
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

// Từ khóa lọc bớt spam/comment khen ngợi thông thường — chỉ giữ comment CÓ Ý HỎI MUA làm
// lead. Heuristic đơn giản (không gọi AI phân loại để khỏi tốn thêm token — user "sếp bảo
// đốt quá nhiều token"). Bỏ sót một số lead ngoài rìa còn hơn rác đầy danh sách.
const INTENT_KEYWORDS = [
  'giá', 'gia', 'bao nhiêu', 'bn', 'mua', 'lắp', 'lap', 'đặt', 'dat', 'tư vấn', 'tu van',
  'liên hệ', 'lien he', 'ib', 'inbox', 'sđt', 'sdt', 'số đt', 'alo', 'gọi', 'goi', 'cần', 'can',
  'muốn', 'muon', 'ở đâu', 'o dau', 'chỗ nào', 'cho nao',
];
function looksLikeIntent(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (/0\d{8,9}/.test(t)) return true; // có số điện thoại
  return INTENT_KEYWORDS.some((k) => t.includes(k));
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

export async function POST(req: Request) {
  const client = getServerClient();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'body khong phai JSON' }, { status: 400 });
  }
  if (body?.object !== 'page') return NextResponse.json({ ok: true, skipped: 'not page object' });

  const entries: any[] = Array.isArray(body.entry) ? body.entry : [];
  let captured = 0;
  const errors: string[] = [];

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
      if (!text || !looksLikeIntent(text)) continue; // lọc spam/khen ngợi thông thường
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
      detail: { captured, errors: errors.slice(0, 5) },
    });
  } catch { /* bỏ qua lỗi ghi log */ }

  // Facebook yêu cầu trả 200 nhanh, không thì retry dồn dập.
  return NextResponse.json({ ok: true, captured });
}
