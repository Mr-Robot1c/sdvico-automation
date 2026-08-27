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

import type { getServerClient } from './supabase-server';
import { fbPageTokens } from './fb-metrics';

type Client = ReturnType<typeof getServerClient>;

const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

type Result = { pulled: number; skipped: number; errors: string[] };

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

  // 1. Lấy conversations gần đây — Meta trả participants + list messages nested.
  //    fields=participants{id,name},messages.limit(20){id,message,from,created_time}
  //    Chỉ pull 30 conversation gần nhất (nếu inbox chưa nhiều thì đủ).
  let conversations: any[] = [];
  try {
    const url = `https://graph.facebook.com/${VERSION}/${pageId}/conversations?limit=30&fields=id,updated_time,participants{id,name},messages.limit(20){id,message,from,created_time}`;
    const j = await graphJson(url, token, 15000);
    if (j?.error) {
      errors.push(`${label} conversations: ${j.error.message || 'unknown'}`);
      return { pulled, skipped, errors };
    }
    conversations = Array.isArray(j?.data) ? j.data : [];
  } catch (e: any) {
    errors.push(`${label} fetch: ${String(e?.message || e).slice(0, 200)}`);
    return { pulled, skipped, errors };
  }

  if (!conversations.length) return { pulled, skipped, errors };

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
    const msgs = Array.isArray(c?.messages?.data) ? c.messages.data : [];
    for (const m of msgs) {
      const from = m?.from || {};
      if (!from.id || from.id === pageId) continue; // bỏ echo page->user
      const text = String(m?.message || '').trim();
      if (!text) continue; // bỏ sticker/attachment không text
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

  if (!allMsgs.length) return { pulled, skipped, errors };

  // 3. Dedup: check message_id nào đã có trong mkt_leads.raw_payload.mid.
  //    Query những row có source='facebook_message' + raw_payload.mid IN (danh sách id vừa lấy).
  //    Supabase JSONB filter: dùng .in không được với JSONB field. Dùng .contains?
  //    Trick: lấy hết mkt_leads recent facebook_message + build Set các mid đã có.
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: existing } = await client
    .from('mkt_leads')
    .select('raw_payload')
    .eq('source', 'facebook_message')
    .gte('created_at', since)
    .limit(1000);
  const seenMids = new Set<string>();
  for (const r of existing || []) {
    const p = (r as any).raw_payload;
    const mid = p?.mid || p?.id;
    if (mid) seenMids.add(String(mid));
  }

  // 4. Insert message mới. Batch insert 1 lần cho nhanh, nhưng phải build rows trước.
  const rows: any[] = [];
  for (const m of allMsgs) {
    if (seenMids.has(m.id)) { skipped++; continue; }
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
  }
  if (!rows.length) return { pulled, skipped, errors };

  // Insert batch — mỗi lỗi ghi 1 dòng errors, tiếp tục các row còn lại.
  const { error } = await client.from('mkt_leads').insert(rows);
  if (error) errors.push(`${label} insert: ${error.message.slice(0, 200)}`);
  else pulled = rows.length;

  return { pulled, skipped, errors };
}

export async function pullFacebookInbox(client: Client): Promise<Result> {
  const tokens = fbPageTokens().filter((t) => t.pageId) as Array<{ pageId: string; token: string; label: string }>;
  if (!tokens.length) return { pulled: 0, skipped: 0, errors: ['thieu FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN'] };

  const results = await Promise.all(tokens.map((t) => pullOnePage(client, t.pageId, t.token, t.label)));
  const total: Result = { pulled: 0, skipped: 0, errors: [] };
  for (const r of results) {
    total.pulled += r.pulled;
    total.skipped += r.skipped;
    total.errors.push(...r.errors);
  }
  return total;
}
