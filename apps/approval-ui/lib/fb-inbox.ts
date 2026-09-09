// lib/fb-inbox.ts — kéo tin nhắn Messenger từ Meta Business Suite Inbox qua Graph API.
//
// User 27/8: token đã có scope pages_messaging (confirmed qua probe /conversations). Trước
// đây webhook nhận real-time nhưng chỉ với tin của Tester (App Dev Mode restrict). Route này
// pull ĐỊNH KỲ toàn bộ conversations gần đây — KHÔNG bị Dev Mode restrict vì gọi Graph API
// từ server với Page Token, không phải qua webhook Facebook push.
//
// KHÔNG SCRAPE UI Meta Business Suite (vi phạm ToS Facebook). Dùng Graph API chính chủ.
//
// Dedup theo message.id (Facebook trả unique id per message). Chỉ insert message của USER
// gửi cho Page (from.id !== PAGE_ID), bỏ echo message của Page gửi cho user.
//
// MỐC LỌC (Thanh 9/9/2026: "chỉ lấy tin nhắn từ tháng 7 trở lên vì trước đó tôi không có can thiệp vào"):
// bỏ mọi tin khách có created_time TRƯỚC 1/7/2026 giờ VN (env FB_INBOX_SINCE đổi mốc). Hội thoại có
// updated_time trước mốc bỏ luôn. Cùng luật với packages/marketing/src/fb-inbox-time.mjs (đường Chrome).

import type { getServerClient } from './supabase-server';
import { fbPageTokens } from './fb-metrics';

type Client = ReturnType<typeof getServerClient>;

const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const SINCE_MS = Date.parse(process.env.FB_INBOX_SINCE || '2026-07-01T00:00:00+07:00');
export const FB_INBOX_SINCE_LABEL = '1/7/2026';

// old = số tin khách bị bỏ vì gửi trước mốc lọc (không tính vào skipped).
type Result = { pulled: number; skipped: number; old: number; errors: string[] };

async function graphJson(url: string, token: string, ms = 10000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    const j = await r.json();
    return j;
  } finally {
    clearTimeout(t);
  }
}

async function pullOnePage(client: Client, pageId: string, token: string, label: string): Promise<Result> {
  const errors: string[] = [];
  let pulled = 0;
  let skipped = 0;
  let old = 0;

  // 1. Lấy conversations gần đây — Meta trả participants + list messages nested.
  //    fields=participants{id,name},messages.limit(20){id,message,from,created_time}
  //    Chỉ pull 30 conversation gần nhất (nếu inbox chưa nhiều thì đủ).
  let conversations: any[] = [];
  try {
    const url = `https://graph.facebook.com/${VERSION}/${pageId}/conversations?limit=30&fields=id,updated_time,participants{id,name},messages.limit(20){id,message,from,created_time}`;
    const j = await graphJson(url, token, 15000);
    if (j?.error) {
      errors.push(`${label} conversations: ${j.error.message || 'unknown'}`);
      return { pulled, skipped, old, errors };
    }
    conversations = Array.isArray(j?.data) ? j.data : [];
  } catch (e: any) {
    errors.push(`${label} fetch: ${String(e?.message || e).slice(0, 200)}`);
    return { pulled, skipped, old, errors };
  }

  if (!conversations.length) return { pulled, skipped, old, errors };

  // 2. Gom tất cả message id của khách gửi Page (from.id !== pageId + có text).
  type Msg = {
    id: string;
    text: string;
    fromId: string;
    fromName: string;
    createdAt: string;
    conversationId: string;
  };
  const allMsgs: Msg[] = [];
  for (const c of conversations) {
    // Hội thoại không có gì mới từ mốc lọc -> bỏ cả cụm (tin cũ trước 1/7/2026 không phải lead).
    const upd = c?.updated_time ? Date.parse(String(c.updated_time)) : NaN;
    if (!Number.isNaN(upd) && upd < SINCE_MS) continue;
    const msgs = Array.isArray(c?.messages?.data) ? c.messages.data : [];
    for (const m of msgs) {
      const from = m?.from || {};
      if (!from.id || from.id === pageId) continue; // bỏ echo page->user
      const text = String(m?.message || '').trim();
      if (!text) continue; // bỏ sticker/attachment không text
      const at = m?.created_time ? Date.parse(String(m.created_time)) : NaN;
      if (!Number.isNaN(at) && at < SINCE_MS) { old++; continue; } // tin khách gửi trước mốc lọc
      allMsgs.push({
        id: String(m.id),
        text,
        fromId: String(from.id),
        fromName: String(from.name || ''),
        createdAt: String(m.created_time || ''),
        conversationId: String(c.id || ''),
      });
    }
  }

  if (!allMsgs.length) return { pulled, skipped, old, errors };

  // 3. Dedup 2 tầng:
  //    (a) Theo message.id (mid) — tránh insert lại tin đã pull lần trước.
  //    (b) Theo (fromId + text) trong 24 giờ — khách gửi trùng câu trong ngày (bấm Send 3 lần
  //        "cho hỏi máy lọc dầu bao nhiêu" 15:21/15:51/15:58 ngày 25/8) chỉ đếm là 1 lead.
  //        Trước là 5 phút nên 25/8 ra 3 thẻ Thanh Huynh giống nhau. Playbook: 3 tin cùng câu = 1 khách sốt ruột.
  //    Tập lead đã có lấy MỌI thời điểm (không chỉ 30 ngày): lead cũ hơn 30 ngày mà hội thoại còn
  //    trong 30 cuộc gần nhất sẽ bị pull lại nếu chỉ so 30 ngày. Bảng nhỏ, 5.000 dòng đủ.
  const { data: existing } = await client
    .from('mkt_leads')
    .select('raw_payload, message, fb_user_id, created_at')
    .eq('source', 'facebook_message')
    .order('created_at', { ascending: false })
    .limit(5000);
  const seenMids = new Set<string>();
  // Map (fromId + '||' + textLower) -> array of created_at ISO (để check window 5 phút).
  const seenContentTimes = new Map<string, number[]>();
  const contentKey = (fromId: string, text: string) => `${fromId}||${text.toLowerCase().trim()}`;
  for (const r of existing || []) {
    const p = (r as any).raw_payload;
    const mid = p?.mid || p?.id;
    if (mid) seenMids.add(String(mid));
    const from = String((r as any).fb_user_id || '');
    const txt = String((r as any).message || '');
    const at = String((r as any).created_at || '');
    if (from && txt && at) {
      const k = contentKey(from, txt);
      const arr = seenContentTimes.get(k) || [];
      arr.push(new Date(at).getTime());
      seenContentTimes.set(k, arr);
    }
  }

  // 4. Insert message mới. Batch insert 1 lần cho nhanh, nhưng phải build rows trước.
  const DEDUP_WINDOW_MS = 24 * 3600 * 1000;
  const rows: any[] = [];
  for (const m of allMsgs) {
    if (seenMids.has(m.id)) { skipped++; continue; }
    // Dedup nội dung: nếu cùng khách + cùng câu trong ±5 phút -> skip (coi là 1 lead).
    const k = contentKey(m.fromId, m.text);
    const msgTime = m.createdAt ? new Date(m.createdAt).getTime() : Date.now();
    const times = seenContentTimes.get(k) || [];
    if (times.some((t) => Math.abs(t - msgTime) < DEDUP_WINDOW_MS)) {
      skipped++;
      seenMids.add(m.id); // mid vẫn add để lần sau không thử lại
      continue;
    }
    rows.push({
      source: 'facebook_message',
      fb_user_id: m.fromId,
      fb_user_name: m.fromName || null,
      fb_profile_url: `https://business.facebook.com/latest/inbox/messenger?asset_id=${pageId}`,
      message: m.text.slice(0, 2000),
      status: 'new',
      raw_payload: { mid: m.id, from: { id: m.fromId, name: m.fromName }, created_time: m.createdAt, conversation_id: m.conversationId, page_label: label, source: 'inbox_pull' },
    });
    seenMids.add(m.id);
    times.push(msgTime);
    seenContentTimes.set(k, times);
  }
  if (!rows.length) return { pulled, skipped, old, errors };

  // Insert batch — mỗi lỗi ghi 1 dòng errors, tiếp tục các row còn lại.
  const { error } = await client.from('mkt_leads').insert(rows);
  if (error) errors.push(`${label} insert: ${error.message.slice(0, 200)}`);
  else pulled = rows.length;

  return { pulled, skipped, old, errors };
}

export async function pullFacebookInbox(client: Client): Promise<Result> {
  const tokens = fbPageTokens().filter((t) => t.pageId) as Array<{ pageId: string; token: string; label: string }>;
  if (!tokens.length) return { pulled: 0, skipped: 0, old: 0, errors: ['thieu FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN'] };

  const results = await Promise.all(tokens.map((t) => pullOnePage(client, t.pageId, t.token, t.label)));
  const total: Result = { pulled: 0, skipped: 0, old: 0, errors: [] };
  for (const r of results) {
    total.pulled += r.pulled;
    total.skipped += r.skipped;
    total.old += r.old;
    total.errors.push(...r.errors);
  }
  return total;
}
