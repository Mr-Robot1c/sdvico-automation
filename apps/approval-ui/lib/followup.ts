// lib/followup.ts — máy SOẠN NHÁP nhắc lại khách đã liên hệ mà im re (24/9, sếp Long: "toàn khách hỏi
// xong im re"). Chỉ insert approval_queue status 'pending'; người đọc, tự gửi trong Messenger rồi bấm
// Đã gửi tay (điều cấm 1). Không đổi mkt_leads.status, không đụng updated_at của lead: máy không
// quyết gì về khách. Luật 3 chạm + nội dung ở lib/gen/followup-rules.mjs (tất định, không LLM).
//
// Lưu ý: updated_at của lead bị updateLeadStatus chạm mỗi lần người lưu ghi chú, nghĩa là đồng hồ
// follow-up reset khi người sửa note. Chấp nhận trong bản này: người vừa chạm lead tức là khách đang
// được quan tâm, chưa cần nhắc.

// @ts-ignore — module JS thuần
import { TOUCHES, nextTouch, buildFollowupBody, followupNote } from './gen/followup-rules.mjs';

type AnyClient = { from: (t: string) => any };

const MAX_DRAFTS_PER_RUN = 10;

export async function draftFollowups(client: AnyClient, now: Date = new Date()): Promise<{ drafted: number; candidates: number; errors: string[] }> {
  const out = { drafted: 0, candidates: 0, errors: [] as string[] };
  const minAfter = Math.min(...(TOUCHES as Array<{ afterHours: number }>).map((t) => t.afterHours));
  const cutoff = new Date(now.getTime() - minAfter * 3600 * 1000).toISOString();

  const { data: leads, error } = await client
    .from('mkt_leads')
    .select('id, fb_user_name, product_guess, status, updated_at')
    .eq('status', 'contacted')
    .lte('updated_at', cutoff)
    .limit(100);
  if (error) { out.errors.push(String(error.message || error).slice(0, 160)); return out; }
  const cands = (leads || []) as Array<{ id: string; fb_user_name: string | null; product_guess: string | null; status: string; updated_at: string }>;
  out.candidates = cands.length;
  if (!cands.length) return out;

  const { data: rows, error: qErr } = await client
    .from('approval_queue')
    .select('status, payload')
    .eq('kind', 'mkt_send_message')
    .in('payload->>lead_id', cands.map((l) => l.id))
    .limit(1000);
  if (qErr) { out.errors.push(String(qErr.message || qErr).slice(0, 160)); return out; }

  const done = new Map<string, number[]>();
  const pending = new Set<string>();
  for (const r of (rows || []) as any[]) {
    const p = r.payload || {};
    const lid = String(p.lead_id || '');
    if (!lid) continue;
    if (r.status === 'pending') pending.add(lid);
    const t = Number(p.touch);
    if (Number.isFinite(t) && t >= 1) done.set(lid, [...(done.get(lid) || []), t]);
  }

  for (const l of cands) {
    if (out.drafted >= MAX_DRAFTS_PER_RUN) break;
    const touch = nextTouch({ status: l.status, updatedAt: l.updated_at, doneTouches: done.get(l.id) || [], hasPending: pending.has(l.id), now });
    if (!touch) continue;
    const body = buildFollowupBody({ touch, customerName: l.fb_user_name, group: l.product_guess });
    const { error: insErr } = await client.from('approval_queue').insert({
      kind: 'mkt_send_message',
      status: 'pending',
      title: `Chạm ${touch}: ${l.fb_user_name || 'khách'}`,
      payload: { channel: 'facebook_inbox', lead_id: l.id, touch, body, note: followupNote(touch, l.product_guess), product_guess: l.product_guess },
    });
    if (insErr) { out.errors.push(String(insErr.message || insErr).slice(0, 160)); continue; }
    out.drafted++;
  }

  if (out.drafted > 0 || out.errors.length) {
    try {
      await client.from('run_log').insert({
        task: 'mkt.followup_draft', actor: 'cron', status: out.errors.length ? 'warn' : 'ok',
        detail: { drafted: out.drafted, candidates: out.candidates, errors: out.errors.slice(0, 3) },
      });
    } catch { /* log lỗi không chặn */ }
  }
  return out;
}
