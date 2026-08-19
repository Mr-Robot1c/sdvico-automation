// Vercel Cron: quét ứng viên đã từ chối, tự đưa về stage 'review' nếu khớp vị trí đang mở.
// Ý: giữ điều cấm 1 — máy CHUYỂN STAGE (nội bộ, không thư đi), người vận hành vẫn phải
// bấm "Soạn thư mời" hoặc "Soạn & gửi ngay" như luồng thường.
//
// Chiến lược match: dùng cùng guessJobId của intake (substring title trong CV, chuẩn hoá bỏ dấu).
// - Chỉ xét ứng viên stage='rejected' còn consent
// - Chỉ mời lại nếu vị trí match KHÁC vị trí đã từ chối trước (tránh spin)
// - Idempotent theo run_log: kiểm trước (candidate_id, matched_job_id) đã reinvite chưa,
//   không mời lại cùng combo 2 lần
// - Cap MAX_PER_RUN = 20 để không "chuyển stage hàng loạt" nếu match logic sai
//
// Gọi bởi cron-job.org 1 lần/ngày hoặc mỗi 6h. Bảo vệ bằng CRON_SECRET.

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { verifyCronAuth } from '../../../../lib/cron-auth';
import { assertNotStopped } from '../../../../lib/emergency-stop';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PER_RUN = 20;

// Chuẩn hoá text để so sánh: bỏ dấu, viết thường, gộp khoảng trắng.
function normalize(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Mirror của packages/hr/src/intake/guess-job.js — giữ ở đây để không import chéo package.
function guessJobId(jobs: Array<{ id: string; title: string }>, cvText: string): string | null {
  if (!Array.isArray(jobs) || jobs.length === 0) return null;
  const cvN = normalize(cvText).slice(0, 5000);
  if (!cvN) return null;
  const MIN_TITLE_LEN = 5;
  const candidates: Array<{ id: string; score: number }> = [];
  for (const job of jobs) {
    const titleN = normalize(job.title);
    if (!titleN || titleN.length < MIN_TITLE_LEN) continue;
    if (cvN.includes(titleN)) {
      candidates.push({ id: job.id, score: titleN.length });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].id;
}

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const client = getServerClient();
  const reinvited: Array<{ candidate_id: string; from_job: string | null; to_job: string; name: string | null }> = [];

  try {
    await assertNotStopped(client);

    // Lấy các vị trí đang mở/nháp — pool để match.
    const { data: openJobs, error: e1 } = await client
      .from('hr_jobs')
      .select('id, title')
      .in('status', ['open', 'draft']);
    if (e1) throw new Error('Đọc hr_jobs: ' + e1.message);
    if (!openJobs || openJobs.length === 0) {
      try { await client.from('run_log').insert({ task: 'hr.reinvite_scan', status: 'ok', detail: { reinvited: 0, reason: 'no_open_jobs' } }); } catch {}
      return NextResponse.json({ reinvited: 0, reason: 'no_open_jobs' });
    }

    // Lấy application stage='rejected' + candidate có consent + có CV text.
    // Bó ở 200 dòng gần nhất theo created_at DESC (đủ dùng cho quét thường xuyên).
    const { data: rejected, error: e2 } = await client
      .from('hr_applications')
      .select('id, candidate_id, job_id, hr_candidates ( id, full_name, consent_at, cv_json )')
      .eq('stage', 'rejected')
      .order('created_at', { ascending: false })
      .limit(200);
    if (e2) throw new Error('Đọc hr_applications: ' + e2.message);
    // Supabase trả FK join dưới dạng array kể cả 1-to-1. Chuẩn hoá về object đầu tiên.
    type HrCand = { id: string; full_name: string | null; consent_at: string | null; cv_json: { raw_text?: string } | null };
    type Row = { id: string; candidate_id: string; job_id: string | null; hr_candidates: HrCand[] | HrCand | null };
    const rawRows = (rejected || []) as unknown as Row[];
    const rows = rawRows.map((r) => ({
      ...r,
      hr_candidates: Array.isArray(r.hr_candidates) ? (r.hr_candidates[0] || null) : r.hr_candidates,
    }));

    // Lấy lịch sử reinvite từ run_log để dedup — không mời lại (candidate, job) đã thử.
    const { data: reinviteHistory } = await client
      .from('run_log')
      .select('detail')
      .eq('task', 'hr.reinvite_scan')
      .eq('status', 'ok')
      .order('created_at', { ascending: false })
      .limit(50);
    const seenPairs = new Set<string>();
    for (const r of (reinviteHistory || []) as Array<{ detail: { items?: Array<{ candidate_id: string; to_job: string }> } }>) {
      for (const it of r.detail?.items || []) {
        seenPairs.add(`${it.candidate_id}|${it.to_job}`);
      }
    }

    for (const app of rows) {
      if (reinvited.length >= MAX_PER_RUN) break;
      const cand = app.hr_candidates;
      if (!cand?.consent_at) continue; // Điều cấm 6.
      const cvText = cand.cv_json?.raw_text || '';
      if (!cvText.trim()) continue;

      const matchedJobId = guessJobId(openJobs, cvText);
      if (!matchedJobId) continue;
      if (matchedJobId === app.job_id) continue; // Cùng vị trí cũ, đã bị từ chối rồi.
      if (seenPairs.has(`${app.candidate_id}|${matchedJobId}`)) continue; // Đã reinvite trước.

      // Đưa hồ sơ về review + đổi job_id. Reset các mốc phỏng vấn / quyết định cũ.
      const { error: updErr } = await client
        .from('hr_applications')
        .update({
          job_id: matchedJobId,
          stage: 'review',
          interviewed_at: null,
          hired_at: null,
          decided_by: null,
          advanced_by: null,
          interviewed_by: null,
          chosen_slot: null,
          slot_chosen_at: null,
          proposed_slot: null,
          proposed_note: null,
          proposed_at: null,
        })
        .eq('id', app.id)
        .eq('stage', 'rejected'); // guard race với người bấm reinvite tay
      if (updErr) continue;

      // Dọn thư cũ còn treo (mời phỏng vấn cũ, thư từ chối cũ hết nghĩa).
      try {
        await client.from('approval_queue')
          .update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: 'auto-reinvite', note: 'Tự dọn: hồ sơ tự động mời lại cho vị trí khác.' })
          .in('kind', ['hr_interview', 'hr_offer', 'hr_reject']).eq('ref_id', app.id).eq('status', 'pending');
      } catch {}

      reinvited.push({
        candidate_id: app.candidate_id,
        from_job: app.job_id,
        to_job: matchedJobId,
        name: cand.full_name,
      });
    }

    // Ghi run_log — detail.items dùng cho dedup lần sau.
    try { await client.from('run_log').insert({ task: 'hr.reinvite_scan', status: 'ok', detail: { reinvited: reinvited.length, items: reinvited } }); } catch {}

    // Nếu có reinvite thì đẩy 1 alert vào approval_queue để người vận hành thấy trong /.
    if (reinvited.length > 0) {
      try {
        await client.from('approval_queue').insert({
          kind: 'alert',
          title: `Đã tự mời lại ${reinvited.length} ứng viên cho vị trí phù hợp`,
          payload: {
            task: 'hr.reinvite_scan',
            reinvited_count: reinvited.length,
            items: reinvited,
            hint: 'Ứng viên được đưa về stage review. Mở /ho-so để xét và bấm "Soạn thư mời" như luồng thường.',
          },
          status: 'pending',
        });
      } catch {}
    }

    return NextResponse.json({ reinvited: reinvited.length, items: reinvited });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client.from('run_log').insert({ task: 'hr.reinvite_scan', status: 'error', detail: { error: msg } }); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
