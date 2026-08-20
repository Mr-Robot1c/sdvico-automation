'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerClient } from '../lib/supabase-server';
import { composeJdVersions } from '../lib/jd-compose';
import { groqChat } from '../lib/groq';
import { randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import { fetchUnsplashPhoto } from '../lib/unsplash';
import { fbIntroSystem, assembleFacebookPost, fallbackIntro } from '../lib/fb-compose';
import { buildRecruitmentPoster, toBullets } from '../lib/poster';
import { sendEmail } from '../lib/mailer';
import { composeOfferLetter, composeRejectLetter } from '../lib/hr-letters';
import { allocateInterviewSlots, composeInterviewLetter, generateInterviewQuestions, formatSlot } from '../lib/interview';
import { linkedinConfigured, postToLinkedIn } from '../lib/linkedin';
import { getSessionUser, authMode } from '../lib/auth';
import { requireAdmin } from '../lib/hr-users';
import { requireEmployeeAdmin, EMPLOYEE_DOCS_BUCKET } from '../lib/employees';
import { getChannel, isManual, isFeed, channelLabel, resolveChannel } from '../lib/channels';

// Trả email người đang đăng nhập, hoặc null nếu chế độ basic. Bọc try để không rơi luồng cũ.
async function currentEmail(): Promise<string | null> {
  try {
    const u = await getSessionUser();
    return u?.email ?? null;
  } catch {
    return null;
  }
}

// Ghi audit vào hr_applications theo cách best-effort: nếu cột chưa migrate (chế độ chưa
// chạy 20260815010000_audit_columns.sql), lỗi được nuốt và luồng chính không bị ảnh hưởng.
// Cam kết "chức năng như cũ": app phải chạy được kể cả khi migration mới chưa áp.
async function auditApp(
  client: ReturnType<typeof getServerClient>,
  appId: string,
  fields: { advanced_by?: string | null; interviewed_by?: string | null; decided_by?: string | null }
): Promise<void> {
  try {
    await client.from('hr_applications').update(fields).eq('id', appId);
  } catch {
    // eo
  }
}

// Đọc lương từ ô nhập: người dùng có thể gõ "8.000.000", "8000000", "8 000 000".
// Bỏ mọi ký tự không phải chữ số rồi đổi sang số nguyên đồng. Rỗng hoặc không có số thì trả null.
function parseLuong(v: FormDataEntryValue | null): number | null {
  const digits = String(v ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Chuẩn hóa trạng thái bảo hiểm về đúng một trong ba giá trị hợp lệ, mặc định chưa đóng.
function parseBaoHiem(v: FormDataEntryValue | null): 'dang_dong' | 'chua_dong' | 'da_ngung' {
  const s = String(v ?? '');
  return s === 'dang_dong' || s === 'da_ngung' ? s : 'chua_dong';
}

// datetime-local trả về chuỗi không có timezone (vd "2026-08-13T14:47").
// Server Vercel chạy UTC nên phải gắn +07:00 để parse đúng giờ Việt Nam.
function parseVNTime(s: string): string {
  if (!s) return new Date().toISOString();
  // Nếu đã có timezone (Z hoặc +xx:xx) thì parse thẳng.
  if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).toISOString();
  return new Date(s + '+07:00').toISOString();
}

// Người quyết. Đọc từ form, cập nhật trạng thái, chỉ đổi mục còn pending.
// URL gốc của app (để chèn link tự chọn giờ vào thư mời).
function appBaseUrl(): string {
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || '';
  return host ? `${h.get('x-forwarded-proto') || 'https'}://${host}` : '';
}

type QueueItem = { id: string; kind: string; ref_id: string | null; payload: Record<string, unknown> | null };

// Gửi thư cho ứng viên khi người dùng bấm Duyệt (người bấm = người gửi, điều cấm 1).
// Chỉ áp dụng cho các loại thư gửi ứng viên. Lỗi gửi được ghi note + run_log, không chặn duyệt.
// Gửi thư cho ứng viên. Trả về null nếu gửi được, trả về câu lỗi nếu hỏng.
// Người gọi phải xử lý câu lỗi đó, không được bỏ qua: bấm Duyệt mà thư không đi thì
// người bấm buộc phải biết ngay (điều cấm 1, máy soạn người bấm gửi).
async function sendCandidateEmail(client: ReturnType<typeof getServerClient>, item: QueueItem): Promise<string | null> {
  if (!['hr_interview', 'hr_offer', 'hr_reject'].includes(item.kind)) return null;
  const p = (item.payload || {}) as { email?: string; thu_moi?: string; thu?: string; vi_tri?: string };
  const to = p.email || '';

  // Tránh "vị trí vị trí đã ứng tuyển" khi vi_tri fallback đã có sẵn từ "vị trí".
  const viTriRaw = (p.vi_tri || '').trim();
  const viTriSubj = viTriRaw
    ? (viTriRaw.toLowerCase().startsWith('vị trí') ? viTriRaw : `vị trí ${viTriRaw}`)
    : '';
  let subject = 'Thông báo tuyển dụng - SDVICO';
  let body = p.thu_moi || p.thu || '';
  if (item.kind === 'hr_interview') {
    subject = `Thư mời phỏng vấn${viTriSubj ? ` ${viTriSubj}` : ''} - SDVICO`;
    if (item.ref_id) {
      const { data: app } = await client.from('hr_applications').select('schedule_token').eq('id', item.ref_id).maybeSingle();
      const token = (app as { schedule_token?: string } | null)?.schedule_token;
      if (token) {
        const base = appBaseUrl();
        if (base) body += `\n\nLink xác nhận khung giờ phỏng vấn:\n${base}/phong-van/${token}`;
      }
    }
  } else if (item.kind === 'hr_offer') {
    subject = 'Thư mời nhận việc - SDVICO';
  } else if (item.kind === 'hr_reject') {
    subject = `Kết quả ứng tuyển${viTriSubj ? ` ${viTriSubj}` : ''} - SDVICO`;
  }

  try {
    await sendEmail({ to, subject, text: body });
    await client.from('run_log').insert({ task: 'hr.send_email', status: 'ok', detail: { kind: item.kind, to } });
    await client.from('approval_queue').update({ note: `Đã gửi email tới ${to}` }).eq('id', item.id);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await client.from('run_log').insert({ task: 'hr.send_email', status: 'error', detail: { kind: item.kind, to, error: msg } });
    // Không tự ghi note ở đây. Người gọi lo phần đó cùng lúc với việc trả mục về hàng đợi,
    // để hai thao tác không giẫm lên nhau.
    return msg;
  }
}

export async function decideForm(formData: FormData) {
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  const note = String(formData.get('note') || '');

  const decision = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!id || !decision) return;

  const client = getServerClient();
  const who = await currentEmail();
  // Lấy mục trước khi đổi trạng thái để biết loại + payload (gửi mail nếu là thư ứng viên).
  const { data: item } = await client
    .from('approval_queue')
    .select('id, kind, ref_id, payload')
    .eq('id', id).eq('status', 'pending').maybeSingle();

  const { error } = await client
    .from('approval_queue')
    .update({ status: decision, decided_at: new Date().toISOString(), note: note || null, decided_by: who })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);

  // Người bấm Duyệt = người bấm gửi (điều cấm 1): gửi thư cho ứng viên.
  // Gửi hỏng thì TRẢ MỤC VỀ HÀNG ĐỢI. Trước đây lỗi bị nuốt: mục đã chuyển sang approved
  // nên biến mất khỏi trang Duyệt như thể xong việc, trong khi ứng viên không nhận được gì
  // và trên màn hình không có dấu hiệu nào. Nay mục nằm lại kèm ghi chú đỏ, sửa email xong
  // bấm Duyệt lại là gửi tiếp được.
  if (decision === 'approved' && item) {
    const sendError = await sendCandidateEmail(client, item as QueueItem);
    if (sendError) {
      await client
        .from('approval_queue')
        .update({ status: 'pending', decided_at: null, note: `GỬI MAIL LỖI: ${sendError}` })
        .eq('id', id);
    }
  }

  revalidatePath('/');
  revalidatePath('/lich');
  revalidatePath('/ho-so');
}

// Quyết định cuối sau phỏng vấn: Nhận (offer) hoặc Không nhận (reject).
// Đổi stage và soạn thư kết quả vào hàng đợi. Người bấm Duyệt mới gửi (điều cấm 1).
export async function decideCandidate(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  const decision = String(formData.get('decision') || '');
  if (!appId || !['offer', 'reject'].includes(decision)) return;

  const client = getServerClient();
  const who = await currentEmail();
  const { data: app } = await client
    .from('hr_applications')
    .select('id, stage, candidate_id, job_id')
    .eq('id', appId).maybeSingle();
  if (!app || app.stage !== 'interview') return;

  // Chỉ cho quyết định sau khi đã đánh dấu "đã phỏng vấn xong" (nếu cột đã migrate).
  const { data: iv2 } = await client.from('hr_applications').select('interviewed_at').eq('id', appId).maybeSingle();
  if (iv2 && (iv2 as { interviewed_at: string | null }).interviewed_at == null) return;

  const { data: cand } = await client.from('hr_candidates').select('full_name, email').eq('id', app.candidate_id).maybeSingle();
  let position = 'đã ứng tuyển';
  if (app.job_id) {
    const { data: job } = await client.from('hr_jobs').select('title').eq('id', app.job_id).maybeSingle();
    if (job?.title) position = job.title;
  }

  const name = (cand?.full_name as string) || null;
  const email = (cand?.email as string) || '';
  const newStage = decision === 'offer' ? 'offer' : 'rejected';
  const kind = decision === 'offer' ? 'hr_offer' : 'hr_reject';
  const thu = decision === 'offer'
    ? composeOfferLetter({ name, position })
    : composeRejectLetter({ name, position });

  await client.from('hr_applications').update({ stage: newStage }).eq('id', appId).eq('stage', 'interview');
  await auditApp(client, appId, { decided_by: who });

  // Dọn thư mời phỏng vấn còn treo của chính hồ sơ này. Đã quyết nhận hay không nhận thì
  // thư mời hết nghĩa. Để nguyên là có ngày ai đó dọn hàng đợi, bấm Duyệt, và người vừa bị
  // từ chối nhận được thư mời phỏng vấn. Dùng 'dismissed' chứ không xóa, để còn lưu vết.
  await client.from('approval_queue')
    .update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: who, note: 'Tự dọn: hồ sơ đã có quyết định cuối.' })
    .eq('kind', 'hr_interview').eq('ref_id', appId).eq('status', 'pending');

  await client.from('approval_queue').insert({
    kind,
    title: `Thư ${decision === 'offer' ? 'mời nhận việc' : 'từ chối'}: ${name || email || appId}`,
    payload: { ung_vien: name, vi_tri: position, email, thu },
    ref_table: 'hr_applications',
    ref_id: appId,
    status: 'pending',
  });

  // 1-click gộp: người bấm ở /ho-so đồng thời là người bấm gửi (điều cấm 1).
  const sendNow = String(formData.get('send_now') || '') === '1';
  if (sendNow) {
    const { data: iv } = await client
      .from('approval_queue')
      .select('id, kind, ref_id, payload, status')
      .eq('kind', kind).eq('ref_id', appId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (iv && iv.status === 'pending') {
      const { error: approveErr } = await client
        .from('approval_queue')
        .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: who })
        .eq('id', iv.id).eq('status', 'pending');
      if (!approveErr) {
        const sendError = await sendCandidateEmail(client, iv as QueueItem);
        if (sendError) {
          await client
            .from('approval_queue')
            .update({ status: 'pending', decided_at: null, note: `GỬI MAIL LỖI: ${sendError}` })
            .eq('id', iv.id);
          throw new Error(`Đã soạn thư ${decision === 'offer' ? 'mời nhận việc' : 'từ chối'} nhưng gửi mail lỗi: ${sendError}. Mở trang Duyệt & gửi để thử lại.`);
        }
      }
    }
  }

  revalidatePath('/ho-so');
  revalidatePath('/');
}

// ===== BOSS REVIEW LINK (Hướng A) =====================================================
// HR tạo link công khai per candidate → copy gửi sếp qua chat. Sếp mở link không cần login,
// xem CV + điểm chấm + câu hỏi phỏng vấn (nếu có), rồi chọn 1 trong 3: hẹn phỏng vấn (+ chọn
// khung giờ), không phù hợp, hoặc chờ thêm. Kết quả tạo pending trong / → HR bấm gửi thật.
// Điều cấm 1 vẫn giữ: sếp bấm quyết + chọn slots (máy soạn), HR bấm gửi (người bấm cuối).

const BOSS_LINK_TTL_DAYS = 7;

export async function createBossReviewLink(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  if (!appId) return;
  const client = getServerClient();
  const token = randomBytes(24).toString('hex'); // 48 chars
  const expires = new Date(Date.now() + BOSS_LINK_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { error } = await client
    .from('hr_applications')
    .update({
      review_token: token,
      review_token_expires_at: expires,
      boss_reviewed_at: null,
      boss_decision: null,
    })
    .eq('id', appId);
  if (error) throw new Error('Tạo link cho sếp lỗi: ' + error.message);
  revalidatePath('/ho-so');
}

export async function revokeBossReviewLink(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  if (!appId) return;
  const client = getServerClient();
  const { error } = await client
    .from('hr_applications')
    .update({ review_token: null, review_token_expires_at: null })
    .eq('id', appId);
  if (error) throw new Error('Thu hồi link lỗi: ' + error.message);
  revalidatePath('/ho-so');
}

// Sếp bấm quyết từ /xem-ho-so/[token]. Xác thực bằng token (không cần đăng nhập).
// decision:
//   'interview' → cần slots (chuỗi "YYYY-MM-DD|HH:MM" cách nhau bằng dòng); tạo hr_interview pending
//   'reject'    → chuyển stage='rejected', không tạo mail (HR mới bấm để gửi nếu muốn)
//   'hold'      → chỉ ghi note, không đổi stage
export async function bossSubmitDecision(formData: FormData) {
  const token = String(formData.get('token') || '').trim();
  const decision = String(formData.get('decision') || '').trim();
  const note = String(formData.get('note') || '').trim().slice(0, 1000);
  if (!token || !['interview', 'reject', 'hold'].includes(decision)) return;

  const client = getServerClient();

  // Load application + validate token còn hạn.
  const { data: app } = await client
    .from('hr_applications')
    .select('id, stage, candidate_id, job_id, review_token, review_token_expires_at, boss_reviewed_at')
    .eq('review_token', token)
    .maybeSingle();
  if (!app) return; // token sai/không tồn tại
  if (!app.review_token_expires_at || new Date(app.review_token_expires_at) < new Date()) return; // hết hạn
  if (app.boss_reviewed_at) return; // đã dùng

  // Đánh dấu đã review + revoke token (1-time use).
  const now = new Date().toISOString();

  if (decision === 'hold') {
    await client.from('hr_applications')
      .update({
        boss_reviewed_at: now,
        boss_decision: 'hold',
        note: note || null,
        review_token: null,
        review_token_expires_at: null,
      })
      .eq('id', app.id);
    revalidatePath('/ho-so');
    return;
  }

  if (decision === 'reject') {
    await client.from('hr_applications')
      .update({
        stage: 'rejected',
        boss_reviewed_at: now,
        boss_decision: 'reject',
        note: note || null,
        review_token: null,
        review_token_expires_at: null,
      })
      .eq('id', app.id);
    // Không soạn thư từ chối tự động — HR bấm nút "Không nhận & gửi" ở /ho-so nếu muốn.
    revalidatePath('/ho-so');
    return;
  }

  // decision === 'interview'
  // Parse slots từ form (mỗi dòng "YYYY-MM-DD|HH:MM").
  const rawSlots = String(formData.get('slots') || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const chosen = rawSlots
    .map((rs) => { const [d, t] = rs.split('|'); return formatSlot(d, t); })
    .filter(Boolean);
  const slots = chosen.length ? chosen : await allocateInterviewSlots(client, 3);

  // P0-6: kiểm consent.
  const { data: cand } = await client
    .from('hr_candidates')
    .select('full_name, email, phone, cv_json, consent_at')
    .eq('id', app.candidate_id)
    .maybeSingle();
  if (!cand?.consent_at) throw new Error('Ứng viên chưa có consent_at.');

  let position = 'vị trí đã ứng tuyển';
  if (app.job_id) {
    const { data: job } = await client.from('hr_jobs').select('title').eq('id', app.job_id).maybeSingle();
    if (job?.title) position = job.title;
  }

  const name = (cand.full_name as string) || null;
  const email = (cand.email as string) || '';
  const cvText = ((cand.cv_json as { raw_text?: string } | null)?.raw_text) || '';

  const scheduleToken = randomBytes(18).toString('hex');
  await client.from('hr_applications')
    .update({
      stage: 'interview',
      schedule_token: scheduleToken,
      boss_reviewed_at: now,
      boss_decision: 'interview',
      note: note || null,
      review_token: null,
      review_token_expires_at: null,
    })
    .eq('id', app.id);

  // Địa điểm phỏng vấn: sếp có thể nhập ở form. Fallback theo brand config, cuối cùng CLAUDE default.
  const locFromBoss = String(formData.get('interview_location') || '').trim();
  const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand = (brandRow?.value || {}) as { address?: string; default_interview_location?: string };
  const dia_diem = locFromBoss || brand.default_interview_location || brand.address || '';

  const q = await generateInterviewQuestions(cvText, position, {
    full_name: name,
    email,
    phone: (cand.phone as string) || null,
    address: ((cand.cv_json as { address?: string } | null)?.address) || null,
  });
  const thu_moi = composeInterviewLetter({ name, position, slots, cvText, location: dia_diem });

  await client.from('approval_queue').insert({
    kind: 'hr_interview',
    title: `[Sếp duyệt] Thư mời phỏng vấn: ${name || email || app.id}`,
    payload: {
      ung_vien: name, vi_tri: position, email,
      khung_gio: slots, thu_moi, dia_diem,
      cau_hoi_ky_thuat: q.cau_hoi_ky_thuat, cau_hoi_hanh_vi: q.cau_hoi_hanh_vi, bai_ve_nha: q.bai_ve_nha,
      luu_y: `Sếp đã duyệt qua link công khai${note ? ` · Ghi chú: ${note}` : ''}${dia_diem ? ` · Địa điểm: ${dia_diem}` : ''}. HR bấm Duyệt để gửi mail.`,
      da_qua_sep_duyet: true,
    },
    ref_table: 'hr_applications', ref_id: app.id, status: 'pending',
  });

  revalidatePath('/ho-so');
  revalidatePath('/');
}

// Gán / đổi / bỏ vị trí ứng tuyển cho một hồ sơ. CV gửi vào hộp thư chung có thể không kèm
// vị trí cụ thể; người vận hành gán tay ở /ho-so. jobId rỗng = bỏ gán (đưa lại NULL).
// Validate jobId phải nằm trong hr_jobs (không cho gán id bậy).
export async function assignJobToApplication(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  const jobId = String(formData.get('jobId') || '').trim();
  if (!appId) return;

  const client = getServerClient();

  let newJobId: string | null = null;
  if (jobId) {
    const { data: job } = await client.from('hr_jobs').select('id').eq('id', jobId).maybeSingle();
    if (!job) throw new Error('Vị trí không tồn tại. Chọn lại từ danh sách.');
    newJobId = jobId;
  }

  const { error } = await client
    .from('hr_applications')
    .update({ job_id: newJobId })
    .eq('id', appId);
  if (error) throw new Error('Gán vị trí lỗi: ' + error.message);

  revalidatePath('/ho-so');
  revalidatePath('/');
  revalidatePath('/lich');
}

// Mời lại một ứng viên đã kết thúc (từ chối / đã mời / lưu nguồn) cho một vị trí khác.
// Điều cấm 2 tinh thần: từ chối không xoá dữ liệu, ứng viên vẫn nằm trong nguồn để dùng lại.
// Đưa hồ sơ về stage 'review' cho vị trí mới, giữ điểm chấm và tóm tắt để tham khảo,
// reset các mốc phỏng vấn/quyết định cũ. KHÔNG gửi gì cho ứng viên (điều cấm 1) — chỉ đưa
// lại vào luồng để người xét, muốn mời phỏng vấn thì bấm ở bước sau như thường.
export async function reinviteForJob(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  const jobId = String(formData.get('jobId') || '');
  if (!appId || !jobId) return;

  const client = getServerClient();
  const who = await currentEmail();

  const { data: app } = await client.from('hr_applications').select('id, stage').eq('id', appId).maybeSingle();
  if (!app || !['rejected', 'offer', 'pool'].includes(app.stage)) return;

  await client.from('hr_applications').update({
    job_id: jobId,
    stage: 'review',
    interviewed_at: null,
    hired_at: null,
    decided_by: null,
    advanced_by: null,
    interviewed_by: null,
    chosen_slot: null,
    slot_chosen_at: null,
    reinvited_at: new Date().toISOString(),
  }).eq('id', appId);

  // Dọn các thư còn treo của hồ sơ này (thư mời/nhận/từ chối cũ hết nghĩa khi mời lại vị trí mới).
  await client.from('approval_queue')
    .update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: who, note: 'Tự dọn: hồ sơ được mời lại cho vị trí khác.' })
    .in('kind', ['hr_interview', 'hr_offer', 'hr_reject']).eq('ref_id', appId).eq('status', 'pending');

  revalidatePath('/ho-so');
  revalidatePath('/');
}

// Đánh dấu ứng viên đã phỏng vấn xong. Chỉ khi có mốc này mới hiện nút Nhận/Không nhận.
export async function markInterviewed(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  if (!appId) return;
  const client = getServerClient();
  const who = await currentEmail();
  await client.from('hr_applications')
    .update({ interviewed_at: new Date().toISOString() })
    .eq('id', appId).eq('stage', 'interview');
  await auditApp(client, appId, { interviewed_by: who });
  revalidatePath('/ho-so');
}

// Xóa mục khỏi hàng đợi và XÓA HẲN bản nháp đính kèm (nếu có).
// Dùng khi muốn bỏ một mục mà không duyệt — bản nháp biến mất khỏi cả trang Đăng tin,
// không để lại rác phải xóa tay. Chỉ xóa bản nháp (draft), không đụng bài đã đăng.
// Worker vẫn được phép soạn bài mới cho vị trí này vòng sau.
export async function dismissQueueItem(formData: FormData) {
  const id = String(formData.get('id') || '');
  const postId = String(formData.get('post_id') || '');
  if (!id) return;

  const client = getServerClient();
  const who = await currentEmail();
  await client
    .from('approval_queue')
    .update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: who })
    .eq('id', id)
    .eq('status', 'pending');

  if (postId) {
    await client
      .from('hr_job_posts')
      .delete()
      .eq('id', postId)
      .eq('trang_thai', 'draft');
  }

  revalidatePath('/');
  revalidatePath('/dang-tin');
  revalidatePath('/tao-jd');
}

// Viết lại bài nháp với giọng văn theo yêu cầu. Máy viết lại, người vẫn phải duyệt (điều cấm 1).
export async function recomposeDraft(formData: FormData) {
  const postId = String(formData.get('post_id') || '');
  const style = String(formData.get('style') || 'default');
  if (!postId) return;

  const client = getServerClient();
  const { data: post } = await client
    .from('hr_job_posts')
    .select('id, job_id, kenh, trang_thai')
    .eq('id', postId).single();
  if (!post || post.trang_thai === 'posted' || post.trang_thai === 'cancelled') return;

  const { data: job } = await client
    .from('hr_jobs')
    .select('title, department, location, short_desc, requirements, jd_versions')
    .eq('id', post.job_id).single();
  if (!job) return;

  const styleMap: Record<string, string> = {
    professional: 'Giọng chuyên nghiệp, súc tích, phù hợp doanh nghiệp. Không dùng emoji. Câu ngắn gọn, trọng tâm.',
    friendly: 'Giọng thân thiện, gần gũi, dùng 2-3 emoji phù hợp ngành biển. Đọc tự nhiên như người viết cho bạn bè.',
    concise: 'Tối đa 5 câu. Vị trí, một điểm hấp dẫn nhất, nơi làm việc, cách ứng tuyển. Không thêm gì khác.',
    formal: 'Giọng trang trọng, đúng văn phong thông báo tuyển dụng doanh nghiệp. Xưng "Quý ứng viên".',
    default: 'Viết lại với bố cục rõ ràng hơn và điểm hấp dẫn được đưa lên đầu.',
  };

  const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand = (brandRow?.value || {}) as { hotline?: string; email?: string; address?: string };
  // Email/hotline liên hệ: ưu tiên Cài đặt (brand_config), rồi biến môi trường, cuối cùng mặc định.
  const contactEmail = brand.email || process.env.HR_CONTACT_EMAIL || 'sdvicotuyendung@gmail.com';
  const hotline = brand.hotline || '1900 23 23 49';
  const companyAddress = brand.address || '283 Nguyễn Hữu Cảnh, Phường Rạch Dừa, TP. HCM';

  // Chỉ viết lại PHẦN MỞ ĐẦU theo giọng đã chọn. Chi tiết + liên hệ do hệ thống ghép, giữ bố cục.
  const sourceInfo = [
    `Vị trí: ${job.title}.`,
    job.department ? `Phòng ban: ${job.department}.` : '',
    job.location ? `Nơi làm: ${job.location}.` : '',
    job.short_desc ? `Mô tả: ${job.short_desc}.` : '',
    job.requirements ? `Yêu cầu: ${job.requirements}.` : '',
  ].filter(Boolean).join('\n');

  const composed = await groqChat(
    fbIntroSystem({ styleNote: styleMap[style] || styleMap.default }),
    sourceInfo,
    { json: true, maxTokens: 1200, temperature: 0.75 }
  );
  if (!composed) return;

  // Quyền lợi lưu ở cột benefits (có thể chưa migrate — đọc an toàn).
  let benefits: string | null = null;
  {
    const { data: benRow } = await client.from('hr_jobs').select('benefits').eq('id', post.job_id).maybeSingle();
    benefits = (benRow?.benefits as string | undefined) || null;
  }

  let intro = fallbackIntro(job.title, job.location as string | null);
  let hashtags = '';
  try {
    const obj = JSON.parse(composed) as { mo_dau?: string; hashtags?: string };
    if ((obj.mo_dau || '').trim()) intro = (obj.mo_dau as string).trim();
    hashtags = (obj.hashtags || '').trim();
  } catch {
    if (composed.trim()) intro = composed.trim();
  }

  const noi_dung = assembleFacebookPost({
    intro,
    short_desc: job.short_desc,
    requirements: job.requirements,
    benefits,
    contactEmail,
    hotline,
    address: companyAddress,
    hashtags,
  });

  await client.from('hr_job_posts').update({ noi_dung }).eq('id', postId);
  revalidatePath('/dang-tin');
}

// Người quyết đưa một hồ sơ vào phỏng vấn. Điều cấm 2: máy chấm và xếp, người chọn ai đi tiếp.
// Chỉ chuyển được hồ sơ đang ở bước 'review' (đã chấm xong), tránh nhảy bước.
// Sau đó tác vụ hr-interview sẽ soạn câu hỏi và thư mời cho hồ sơ này.
export async function advanceToInterview(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  if (!appId) return;

  const client = getServerClient();
  const who = await currentEmail();
  const { data: app } = await client
    .from('hr_applications')
    .select('id, stage, candidate_id, job_id, reinvited_at')
    .eq('id', appId).maybeSingle();
  if (!app || app.stage !== 'review') { revalidatePath('/ho-so'); return; }
  const isReinvite = Boolean(app.reinvited_at);
  // P0-6: chặn sinh câu hỏi + thư mời khi ứng viên chưa có consent (nguồn ngoài).
  // Phòng Nhân sự phải xác nhận consent thủ công ở trang Hồ sơ trước khi máy soạn thư.
  {
    const { data: pre } = await client.from('hr_candidates').select('consent_at').eq('id', app.candidate_id).maybeSingle();
    if (!pre?.consent_at) {
      throw new Error('Ứng viên chưa có consent_at. Cập nhật đồng ý xử lý dữ liệu ở trang Hồ sơ trước khi soạn thư mời.');
    }
  }

  // Đổi stage + cấp token (nếu cột schedule_token chưa migrate thì đổi stage không kèm token).
  const token = randomBytes(18).toString('hex');
  const { error } = await client
    .from('hr_applications')
    .update({ stage: 'interview', schedule_token: token })
    .eq('id', appId).eq('stage', 'review');
  if (error) {
    await client.from('hr_applications').update({ stage: 'interview' }).eq('id', appId).eq('stage', 'review');
  }
  await auditApp(client, appId, { advanced_by: who });

  // Soạn thư mời NGAY trong app (không chờ worker hr-interview), nếu chưa có.
  const { data: existingIv } = await client.from('approval_queue').select('id').eq('kind', 'hr_interview').eq('ref_id', appId).maybeSingle();
  if (!existingIv) {
    const { data: cand } = await client.from('hr_candidates').select('full_name, email, phone, cv_json').eq('id', app.candidate_id).maybeSingle();
    let position = 'vị trí đã ứng tuyển';
    if (app.job_id) {
      const { data: job } = await client.from('hr_jobs').select('title').eq('id', app.job_id).maybeSingle();
      if (job?.title) position = job.title;
    }
    const name = (cand?.full_name as string) || null;
    const email = (cand?.email as string) || '';
    const cvText = ((cand?.cv_json as { raw_text?: string } | null)?.raw_text) || '';

    // Khung giờ do người duyệt chọn (dạng "YYYY-MM-DD|HH:MM"); trống thì hệ thống tự chọn.
    const chosen = formData.getAll('slot').map(String).filter(Boolean)
      .map((rs) => { const [d, t] = rs.split('|'); return formatSlot(d, t); })
      .filter(Boolean);
    const slots = chosen.length ? chosen : await allocateInterviewSlots(client, 3);

    // Địa điểm phỏng vấn: ưu tiên form input, fallback về default_interview_location, rồi address công ty.
    const locFromForm = String(formData.get('interview_location') || '').trim();
    const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
    const brand = (brandRow?.value || {}) as { address?: string; default_interview_location?: string };
    const dia_diem = locFromForm || brand.default_interview_location || brand.address || '';

    const q = await generateInterviewQuestions(cvText, position, {
      full_name: (cand?.full_name as string) || null,
      email: (cand?.email as string) || null,
      phone: (cand?.phone as string) || null,
      address: ((cand?.cv_json as { address?: string } | null)?.address) || null,
    });
    const thu_moi = composeInterviewLetter({ name, position, slots, cvText, isReinvite, location: dia_diem });

    await client.from('approval_queue').insert({
      kind: 'hr_interview',
      title: `Thư mời phỏng vấn: ${name || email || appId}`,
      payload: {
        ung_vien: name, vi_tri: position, email,
        khung_gio: slots, thu_moi, dia_diem,
        cau_hoi_ky_thuat: q.cau_hoi_ky_thuat, cau_hoi_hanh_vi: q.cau_hoi_hanh_vi, bai_ve_nha: q.bai_ve_nha,
        luu_y: 'Máy soạn. Người bấm = gửi cho ứng viên (điều cấm 1).',
      },
      ref_table: 'hr_applications', ref_id: appId, status: 'pending',
    });
  }

  // 1-click gộp: "Soạn & gửi ngay". Người bấm ở /ho-so đồng thời là người bấm gửi
  // (điều cấm 1 vẫn được tôn trọng — 1 người, 1 quyết định, 1 click). Bỏ được bước
  // phải mở /Duyệt & gửi để bấm lần 2.
  const sendNow = String(formData.get('send_now') || '') === '1';
  if (sendNow) {
    const { data: iv } = await client
      .from('approval_queue')
      .select('id, kind, ref_id, payload, status')
      .eq('kind', 'hr_interview')
      .eq('ref_id', appId)
      .maybeSingle();
    if (iv && iv.status === 'pending') {
      const { error: approveErr } = await client
        .from('approval_queue')
        .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: who })
        .eq('id', iv.id).eq('status', 'pending');
      if (!approveErr) {
        const sendError = await sendCandidateEmail(client, iv as QueueItem);
        if (sendError) {
          // Gửi hỏng: trả về pending kèm note đỏ để người vận hành thấy ngay ở /
          await client
            .from('approval_queue')
            .update({ status: 'pending', decided_at: null, note: `GỬI MAIL LỖI: ${sendError}` })
            .eq('id', iv.id);
          throw new Error(`Đã soạn thư mời nhưng gửi mail lỗi: ${sendError}. Mở trang Duyệt & gửi để thử lại.`);
        }
      }
    }
  }

  revalidatePath('/ho-so');
  revalidatePath('/lich');
  revalidatePath('/');
}

// Xóa vĩnh viễn một hồ sơ ứng viên (và các hồ sơ ứng tuyển + mục trong hàng đợi liên quan).
// Dùng để dọn hồ sơ test hoặc hồ sơ đã xong. Không đụng ứng viên khác.
export async function deleteCandidate(formData: FormData) {
  const candidateId = String(formData.get('candidateId') || '');
  if (!candidateId) return;
  const client = getServerClient();

  const { data: apps } = await client.from('hr_applications').select('id').eq('candidate_id', candidateId);
  const appIds = ((apps || []) as Array<{ id: string }>).map((a) => a.id);
  if (appIds.length) {
    await client.from('approval_queue').delete().in('ref_id', appIds);
    await client.from('hr_applications').delete().eq('candidate_id', candidateId);
  }
  await client.from('hr_candidates').delete().eq('id', candidateId);

  revalidatePath('/ho-so');
  revalidatePath('/');
}

// Ứng viên tự chọn khung giờ phỏng vấn qua link công khai (không cần đăng nhập, xác thực bằng token).
// Chỉ lưu giờ đã chọn, không đụng dữ liệu khác. Không tự gửi mail.
export async function chooseInterviewSlot(formData: FormData) {
  const token = String(formData.get('token') || '').trim();
  const slot = String(formData.get('slot') || '').trim();
  if (!token || !slot) return;

  const client = getServerClient();
  const { data: app } = await client
    .from('hr_applications')
    .select('id, chosen_slot')
    .eq('schedule_token', token)
    .maybeSingle();
  if (!app) return;

  // Chỉ chấp nhận khung giờ nằm trong danh sách đề xuất (đọc từ thư mời trong hàng đợi).
  const { data: iv } = await client
    .from('approval_queue')
    .select('payload')
    .eq('kind', 'hr_interview')
    .eq('ref_id', app.id)
    .maybeSingle();
  const slots = ((iv?.payload as { khung_gio?: string[] } | null)?.khung_gio) || [];
  if (!slots.includes(slot)) return;

  await client.from('hr_applications')
    .update({ chosen_slot: slot, slot_chosen_at: new Date().toISOString() })
    .eq('id', app.id);

  revalidatePath(`/phong-van/${token}`);
  revalidatePath('/lich');
}

// Ứng viên đề xuất giờ khác khi 3 khung đề xuất không phù hợp. Không tự lên lịch —
// chỉ lưu đề xuất; Phòng Nhân sự thấy trong /lich rồi liên hệ lại chốt.
// Xác thực bằng token (không cần đăng nhập). Không đụng dữ liệu khác.
export async function proposeInterviewSlot(formData: FormData) {
  const token = String(formData.get('token') || '').trim();
  const proposal = String(formData.get('proposal') || '').trim().slice(0, 500);
  const note = String(formData.get('note') || '').trim().slice(0, 1000);
  if (!token || !proposal) return;

  const client = getServerClient();
  const { data: app } = await client
    .from('hr_applications')
    .select('id, chosen_slot')
    .eq('schedule_token', token)
    .maybeSingle();
  if (!app) return;
  // Đã chọn 1 trong 3 khung rồi thì không cho đề xuất thêm.
  if (app.chosen_slot) return;

  await client.from('hr_applications')
    .update({
      proposed_slot: proposal,
      proposed_note: note || null,
      proposed_at: new Date().toISOString(),
    })
    .eq('id', app.id);

  revalidatePath(`/phong-van/${token}`);
  revalidatePath('/lich');
}

// Từ chối một ứng viên nguồn ngoài và XOÁ khỏi cơ sở dữ liệu.
// Nghị định 13: dữ liệu nguồn ngoài chưa có consent thì tối thiểu hóa, từ chối là xoá luôn.
// Chốt an toàn: chỉ xoá ứng viên nguồn ngoài chưa có consent, KHÔNG đụng ứng viên đã tự nộp.
export async function rejectSourced(formData: FormData) {
  const candidateId = String(formData.get('candidateId') || '');
  if (!candidateId) return;

  const client = getServerClient();
  const { data: cand, error: e1 } = await client
    .from('hr_candidates')
    .select('id, source, consent_at')
    .eq('id', candidateId)
    .single();
  if (e1) throw new Error(e1.message);

  const sourced = String(cand.source || '').startsWith('sourced');
  if (!sourced || cand.consent_at) {
    // Ứng viên đã tự nộp hoặc có consent thì không xoá cứng, tránh mất dữ liệu có nghĩa vụ lưu.
    throw new Error('Chỉ xoá được ứng viên nguồn ngoài chưa có consent.');
  }

  // Xoá ứng viên. Hồ sơ ứng tuyển liên kết tự xoá theo (on delete cascade).
  const { error: e2 } = await client.from('hr_candidates').delete().eq('id', candidateId);
  if (e2) throw new Error(e2.message);
  revalidatePath('/ho-so');
}

// Lưu ghi chú của người duyệt cho một hồ sơ.
export async function saveNote(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  const note = String(formData.get('note') || '').slice(0, 4000);
  if (!appId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_applications').update({ note: note || null }).eq('id', appId);
  if (error) throw new Error(error.message);
  revalidatePath('/ho-so');
}

// Lưu khung giờ phỏng vấn mong muốn. Nhận chuỗi giờ cách nhau bằng dấu phẩy, ví dụ 09:00, 14:00.
export async function saveWindows(formData: FormData) {
  const raw = String(formData.get('windows') || '');
  const times = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s));
  if (!times.length) return;
  const client = getServerClient();
  const { error } = await client
    .from('app_config')
    .upsert({ key: 'interview_windows', value: times, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  revalidatePath('/lich');
}

// Sức chứa mỗi khung phỏng vấn. 1 là một kèm một, đặt cao hơn để cho phỏng vấn nhóm
// hoặc chạy song song nhiều phòng. Giới hạn trên 20 để phòng gõ nhầm.
export async function saveCapacity(formData: FormData) {
  const n = Number(formData.get('capacity'));
  if (!Number.isFinite(n) || n < 1 || n > 20) return;
  const client = getServerClient();
  const { error } = await client
    .from('app_config')
    .upsert({ key: 'interview_capacity', value: Math.round(n), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  revalidatePath('/lich');
}

// Thêm một nền tảng đăng tuyển hoặc tìm ứng viên.
export async function addPlatform(formData: FormData) {
  const ten = String(formData.get('ten') || '').trim();
  const loai = String(formData.get('loai') || 'job_board');
  const ghi_chu = String(formData.get('ghi_chu') || '').trim() || null;
  if (!ten) return;
  const client = getServerClient();
  const { error } = await client.from('hr_platforms').insert({ ten, loai, ghi_chu });
  if (error) throw new Error(error.message);
  revalidatePath('/dang-tin');
}

// Xoá một nền tảng.
export async function removePlatform(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client.from('hr_platforms').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dang-tin');
}

// Bật/tắt một kênh đăng tuyển theo khóa kenh. Upsert dòng hr_platforms nếu chưa có (lấy tên/loại từ registry).
// Kênh tắt sẽ không hiện nút "Soạn bài" ở trang Vị trí và không có trong form ghi nhận đăng tay.
export async function toggleChannel(formData: FormData) {
  const kenh = String(formData.get('kenh') || '');
  const bat = String(formData.get('bat') || '') === 'true';
  if (!kenh) return;
  const ch = getChannel(kenh);
  const client = getServerClient();
  const { data: existing } = await client.from('hr_platforms').select('id').eq('kenh', kenh).maybeSingle();
  if (existing?.id) {
    await client.from('hr_platforms').update({ bat }).eq('id', existing.id);
  } else {
    await client.from('hr_platforms').insert({ kenh, bat, ten: ch?.ten || kenh, loai: ch?.loai || 'job_board' });
  }
  revalidatePath('/kenh');
  revalidatePath('/dang-tin');
  revalidatePath('/tao-jd');
}

// Sinh khóa kenh từ tên: bỏ dấu tiếng Việt, chỉ giữ chữ thường và số. Ví dụ "Việc Làm Tốt" -> "vieclamtot".
function slugKenh(ten: string): string {
  return ten
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
}

// Thêm một sàn tuyển dụng MỚI do người dùng nhập (chỉ nằm trong hr_platforms).
// Luôn là kênh đăng thủ công: soạn có hỗ trợ + ghi nhận đã đăng (track-only). Nối API cần code + credentials.
export async function addChannel(formData: FormData) {
  const ten = String(formData.get('ten') || '').trim();
  const post_url = String(formData.get('post_url') || '').trim() || null;
  if (!ten) return;
  const kenh = slugKenh(ten);
  if (!kenh) return; // tên không sinh được khóa hợp lệ

  const client = getServerClient();
  // Không đè kênh built-in (facebook/linkedin/topcv...) hay kênh đã thêm trước đó.
  if (getChannel(kenh)) { revalidatePath('/kenh'); return; }
  const { data: existing } = await client.from('hr_platforms').select('id').eq('kenh', kenh).maybeSingle();
  if (existing?.id) { revalidatePath('/kenh'); return; }

  const { error } = await client.from('hr_platforms').insert({ ten, kenh, loai: 'job_board', bat: true, post_url });
  if (error) throw new Error(error.message);
  revalidatePath('/kenh');
  revalidatePath('/dang-tin');
  revalidatePath('/tao-jd');
}

// Đổi link "Mở trang đăng" của một kênh (post_url). Áp dụng cho cả built-in lẫn kênh tự thêm:
// built-in mặc định lấy từ code (channels.ts), nhưng ai có row hr_platforms sẽ override lên code.
// Cho phép nhập rỗng để xoá link (getAllChannels giữ null vì đã có row DB, không fallback code).
export async function setChannelPostUrl(formData: FormData) {
  const kenh = String(formData.get('kenh') || '');
  const rawUrl = String(formData.get('post_url') || '').trim();
  if (!kenh) return;
  const post_url = rawUrl || null;

  const client = getServerClient();
  const ch = getChannel(kenh);
  const { data: existing } = await client.from('hr_platforms').select('id').eq('kenh', kenh).maybeSingle();
  if (existing?.id) {
    await client.from('hr_platforms').update({ post_url }).eq('id', existing.id);
  } else {
    // Kênh built-in chưa có row: insert với bat=false (không tự bật lên) + tên/loai từ code.
    await client.from('hr_platforms').insert({
      kenh,
      bat: false,
      ten: ch?.ten || kenh,
      loai: ch?.loai || 'job_board',
      post_url,
    });
  }
  revalidatePath('/kenh');
  revalidatePath('/dang-tin');
  revalidatePath('/tao-jd');
}

// Xóa một sàn do người dùng thêm. KHÔNG xóa kênh built-in (giữ adapter API/nhãn) — chỉ tắt được.
// Tin đăng cũ vẫn còn, chỉ mất cấu hình kênh (nhãn lùi về khóa kenh).
export async function removeChannel(formData: FormData) {
  const kenh = String(formData.get('kenh') || '');
  if (!kenh) return;
  if (getChannel(kenh)) return; // kênh built-in: không xóa
  const client = getServerClient();
  const { error } = await client.from('hr_platforms').delete().eq('kenh', kenh);
  if (error) throw new Error(error.message);
  revalidatePath('/kenh');
  revalidatePath('/dang-tin');
  revalidatePath('/tao-jd');
}

// Đổi trạng thái tin đăng: đánh dấu đã đăng, huỷ, hoặc xoá.
export async function updateJobPost(formData: FormData) {
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  if (!id) return;
  const client = getServerClient();
  if (action === 'delete') {
    // Gỡ bài khỏi Facebook trước (nếu đã đăng và có fb_post_id).
    // Lỗi Facebook thì ghi log và vẫn xoá cứng khỏi DB.
    const { data: existing } = await client
      .from('hr_job_posts').select('fb_post_id, trang_thai').eq('id', id).maybeSingle();
    if (existing?.fb_post_id && existing.trang_thai === 'posted') {
      try {
        await callFacebookDeleteApi(existing.fb_post_id);
        await client.from('run_log').insert({ task: 'hr.delete_facebook_post', status: 'ok', detail: { postId: id, fbPostId: existing.fb_post_id } });
      } catch (err) {
        await client.from('run_log').insert({ task: 'hr.delete_facebook_post', status: 'error', detail: { postId: id, error: String(err) } });
      }
    }
    // Xoá cứng — không còn thùng rác.
    const { error } = await client.from('hr_job_posts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  } else if (action === 'posted') {
    const { error } = await client.from('hr_job_posts').update({ trang_thai: 'posted', posted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  } else if (action === 'cancel') {
    const { error } = await client.from('hr_job_posts').update({ trang_thai: 'cancelled' }).eq('id', id);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/dang-tin');
}


// Đưa một vị trí vào hàng đợi đăng Facebook: soạn nháp từ bản JD sẵn có rồi đẩy vào hàng đợi duyệt.
// Máy soạn, người bấm Duyệt (điều cấm 1). KHÔNG đăng gì ở đây. Worker publish-facebook mới đăng.
export async function queueFacebookPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;

  const client = getServerClient();
  const { data: job, error: e0 } = await client
    .from('hr_jobs')
    .select('id, title, location, short_desc, requirements, jd_versions, image_hint')
    .eq('id', jobId)
    .single();
  if (e0) throw new Error(e0.message);

  // Quyền lợi lưu ở cột benefits (có thể chưa migrate trên DB cũ — đọc an toàn, thiếu thì bỏ qua).
  let benefits: string | null = null;
  {
    const { data: benRow } = await client.from('hr_jobs').select('benefits').eq('id', jobId).maybeSingle();
    benefits = (benRow?.benefits as string | undefined) || null;
  }

  // Chỉ chặn khi vị trí đang có bài CHỜ DUYỆT hoặc ĐÃ ĐẶT LỊCH (tránh trùng bản nháp).
  // Nếu vị trí chỉ có bài đã đăng (posted) thì vẫn cho soạn thêm bài mới ("Soạn thêm bài").
  const { data: existing } = await client
    .from('hr_job_posts')
    .select('id')
    .eq('job_id', jobId)
    .eq('kenh', 'facebook')
    .in('trang_thai', ['draft', 'scheduled']);
  if (existing && existing.length) {
    revalidatePath('/dang-tin');
    return;
  }

  // Đọc cài đặt thương hiệu để gắn footer liên hệ và dùng logo khi không có ảnh.
  const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand = (brandRow?.value || {}) as { logo_url?: string; hotline?: string; email?: string; website?: string; address?: string; company_desc?: string; company_name?: string; tagline?: string; poster?: { navy?: string; red?: string; accent?: string } };

  // Email liên hệ: ưu tiên Cài đặt (brand_config.email), rồi biến môi trường, cuối cùng mặc định.
  const contactEmail = brand.email || process.env.HR_CONTACT_EMAIL || 'sdvicotuyendung@gmail.com';
  const hotline = brand.hotline || '1900 23 23 49';
  const companyAddress = brand.address || '283 Nguyễn Hữu Cảnh, Phường Rạch Dừa, TP. HCM';
  const reqText = (job as Record<string, unknown>).requirements as string | null;

  // Thông tin gốc để AI viết đúng, không bịa. AI CHỈ viết phần mở đầu; chi tiết ghép nguyên văn.
  const sourceInfo = [
    `Vị trí: ${job.title}`,
    job.location ? `Địa điểm: ${job.location}` : '',
    job.short_desc ? `Mô tả công việc: ${job.short_desc}` : '',
    reqText ? `Yêu cầu: ${reqText}` : '',
    benefits ? `Quyền lợi: ${benefits}` : '',
  ].filter(Boolean).join('\n');

  const [composed, unsplash_url] = await Promise.all([
    groqChat(fbIntroSystem(), sourceInfo, { json: true, temperature: 0.7, maxTokens: 1200 }).catch(() => null),
    fetchUnsplashPhoto(job.title, job.location || undefined, (job as Record<string, unknown>).image_hint as string | null),
  ]);

  // AI chỉ trả phần mở đầu + hashtag + lương/giờ (lương/giờ để dựng poster). Chi tiết mô tả,
  // yêu cầu, quyền lợi ghép NGUYÊN VĂN bên dưới, rồi tới liên hệ (bố cục người dùng chốt).
  let intro = fallbackIntro(job.title, job.location as string | null);
  let hashtags = '';
  let salary = '';
  let workingHours = '';
  if (composed) {
    try {
      const obj = JSON.parse(composed) as { mo_dau?: string; hashtags?: string; luong?: string; gio_lam?: string };
      if ((obj.mo_dau || '').trim()) intro = (obj.mo_dau as string).trim();
      hashtags = (obj.hashtags || '').trim();
      salary = (obj.luong || '').trim();
      workingHours = (obj.gio_lam || '').trim();
    } catch {
      if (composed.trim()) intro = composed.trim();
    }
  }

  const noi_dung = assembleFacebookPost({
    intro,
    short_desc: job.short_desc,
    requirements: reqText,
    benefits,
    contactEmail,
    hotline,
    address: companyAddress,
    hashtags,
  });

  // Ảnh = poster tuyển dụng (satori). Lỗi thì lùi về ảnh Unsplash/logo.
  let image_url: string | null = null;
  const posterBuf = await buildRecruitmentPoster({
    title: job.title,
    location: job.location || null,
    requirements: toBullets(reqText),
    benefits: toBullets(benefits),
    salary,
    workingHours,
    brandName: brand.company_name || 'SDVICO',
    tagline: brand.tagline,
    website: brand.website,
    hotline: brand.hotline || hotline,
    address: companyAddress,
    photoUrl: unsplash_url,
    logoUrl: brand.logo_url,
    theme: brand.poster,
  });
  if (posterBuf) {
    const imgPath = `posts/${jobId}/poster-${Date.now()}.jpg`;
    const { error: upErr } = await client.storage
      .from('post-images')
      .upload(imgPath, posterBuf, { contentType: 'image/jpeg', upsert: true });
    image_url = upErr ? (unsplash_url || null) : client.storage.from('post-images').getPublicUrl(imgPath).data.publicUrl;
  } else {
    image_url = unsplash_url || brand.logo_url || null;
  }

  const tieu_de = `Tuyển ${job.title}${job.location ? ' - ' + job.location : ''}`;

  const { data: post, error: e1 } = await client
    .from('hr_job_posts')
    .insert({ job_id: jobId, kenh: 'facebook', tieu_de, noi_dung, image_url, trang_thai: 'draft' })
    .select('id')
    .single();
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await client.from('approval_queue').insert({
    kind: 'hr_job_post',
    title: tieu_de,
    payload: { post_id: post.id, job_id: jobId, kenh: 'facebook', dia_diem: job.location || null, body: noi_dung },
    ref_table: 'hr_job_posts',
    ref_id: post.id,
    status: 'pending'
  });
  if (e2) throw new Error(e2.message);

  revalidatePath('/dang-tin');
  revalidatePath('/');
}

// Soạn bài LinkedIn cho một vị trí (giọng chuyên nghiệp, hashtag EN+VN) và đưa vào hàng đợi Duyệt.
// Máy soạn, người bấm Duyệt (điều cấm 1). Đăng thật: qua API khi có token, hoặc Copy đăng tay.
export async function queueLinkedInPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;

  const client = getServerClient();
  const { data: job, error: e0 } = await client
    .from('hr_jobs')
    .select('id, title, location, short_desc, requirements, jd_versions, image_hint')
    .eq('id', jobId).single();
  if (e0) throw new Error(e0.message);

  // Đã có bài LinkedIn đang chờ/đặt lịch thì thôi, tránh trùng.
  const { data: existing } = await client
    .from('hr_job_posts').select('id')
    .eq('job_id', jobId).eq('kenh', 'linkedin')
    .in('trang_thai', ['draft', 'scheduled']);
  if (existing && existing.length) { revalidatePath('/dang-tin'); return; }

  let benefits: string | null = null;
  {
    const { data: benRow } = await client.from('hr_jobs').select('benefits').eq('id', jobId).maybeSingle();
    benefits = (benRow?.benefits as string | undefined) || null;
  }

  const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand = (brandRow?.value || {}) as { hotline?: string; email?: string; website?: string; company_name?: string; company_desc?: string };
  const contactEmail = brand.email || process.env.HR_CONTACT_EMAIL || 'sdvicotuyendung@gmail.com';
  const hotline = brand.hotline || '1900 23 23 49';
  const reqText = (job as Record<string, unknown>).requirements as string | null;
  const companyDesc = brand.company_desc || 'SDVICO cung cấp thiết bị và giải pháp công nghệ cho ngành biển và thủy sản, trụ sở tại Vũng Tàu.';

  const sourceInfo = [
    `Giới thiệu công ty: ${companyDesc}`,
    `Vị trí: ${job.title}`,
    job.location ? `Địa điểm: ${job.location}` : '',
    job.short_desc ? `Mô tả công việc: ${job.short_desc}` : '',
    reqText ? `Yêu cầu: ${reqText}` : '',
    benefits ? `Quyền lợi: ${benefits}` : '',
    `Liên hệ: ${contactEmail} | Hotline ${hotline}`,
  ].filter(Boolean).join('\n');

  const fallback = `SDVICO đang tuyển: ${job.title}${job.location ? ` (${job.location})` : ''}\n\nỨng tuyển: ${contactEmail} | ${hotline}\n#Hiring #Jobs #VungTau`;

  const aiText = await groqChat(
    [
      'Bạn viết bài tuyển dụng CHUYÊN NGHIỆP cho LinkedIn của SDVICO (công ty công nghệ ngành biển và thủy sản Việt Nam).',
      'Viết bằng tiếng Việt, giọng chuyên nghiệp, có cấu trúc rõ ràng theo tiêu đề mục (như bài tuyển dụng của công ty lớn trên LinkedIn).',
      '',
      'Cấu trúc, giữ đúng các tiêu đề mục (mỗi tiêu đề một dòng riêng):',
      '1. Một câu hook mở đầu hấp dẫn về cơ hội (không dùng emoji rực rỡ, giữ chuyên nghiệp).',
      '2. "Về công ty": 2-3 câu giới thiệu SDVICO, dựa trên phần Giới thiệu công ty được cung cấp.',
      '3. "Vị trí: ' + job.title + '": 1-2 câu mô tả vai trò.',
      '4. "Trách nhiệm chính:" — mỗi ý một dòng bắt đầu bằng "• ", lấy từ Mô tả công việc.',
      '5. "Yêu cầu:" — mỗi ý một dòng bắt đầu bằng "• ", lấy từ phần Yêu cầu.',
      '6. "Địa điểm & hình thức:" — nêu địa điểm làm việc (nếu có).',
      '7. "Quyền lợi:" — mỗi ý một dòng bắt đầu bằng "• ", lấy từ phần Quyền lợi.',
      '8. "Ứng tuyển:" — cách liên hệ (email/hotline được cung cấp).',
      '9. 4-6 hashtag phù hợp (trộn tiếng Anh + Việt, vd #Hiring #VungTau #MarineTech).',
      '',
      'Quy tắc: các mục bullet MỖI Ý MỘT DÒNG bắt đầu bằng "• ", không gộp câu dài nhiều dấu phẩy. CHỈ dùng thông tin được cung cấp, KHÔNG bịa lương/số liệu (điều cấm 5). Không mô tả phần mềm đối tác như năng lực SDVICO (điều cấm 4).',
      'Chỉ trả về nội dung bài đăng, không kèm giải thích.',
    ].join('\n'),
    sourceInfo,
    { temperature: 0.7, maxTokens: 900 }
  ).then((r) => r?.trim() || fallback).catch(() => fallback);

  // LinkedIn: text-only, KHÔNG kèm poster (theo yêu cầu — bài LinkedIn không cần poster).
  const image_url: string | null = null;

  const tieu_de = `[LinkedIn] Tuyển ${job.title}${job.location ? ' - ' + job.location : ''}`;
  const { data: post, error: e1 } = await client.from('hr_job_posts')
    .insert({ job_id: jobId, kenh: 'linkedin', tieu_de, noi_dung: aiText, image_url, trang_thai: 'draft' })
    .select('id').single();
  if (e1 || !post) {
    // Không ném lỗi (tránh crash trang). Ghi run_log để biết nguyên nhân (vd chưa migrate kenh='linkedin').
    try { await client.from('run_log').insert({ task: 'hr.queue_linkedin', status: 'error', detail: { jobId, error: e1?.message || 'no post' } }); } catch {}
    revalidatePath('/dang-tin'); revalidatePath('/');
    return;
  }

  const { error: e2 } = await client.from('approval_queue').insert({
    kind: 'hr_job_post',
    title: tieu_de,
    payload: { post_id: post.id, job_id: jobId, kenh: 'linkedin', dia_diem: job.location || null, body: aiText },
    ref_table: 'hr_job_posts', ref_id: post.id, status: 'pending',
  });
  if (e2) { try { await client.from('run_log').insert({ task: 'hr.queue_linkedin', status: 'error', detail: { jobId, error: e2.message } }); } catch {} }

  revalidatePath('/dang-tin');
  revalidatePath('/');
}

// Soạn bài cho MỘT kênh bất kỳ trong registry (TopCV, VietnamWorks, CareerBuilder, ...).
// Máy soạn nháp (đăng có hỗ trợ), người bấm Duyệt (điều cấm 1). KHÔNG đăng gì ở đây.
// Nội dung lấy từ bản JD đúng độ dài theo kênh (jd_versions[jd_variant]); thiếu thì ghép từ mô tả/yêu cầu/quyền lợi.
export async function queueChannelPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  const kenh = String(formData.get('kenh') || '');
  if (!jobId || !kenh) return;

  const client = getServerClient();
  // Giải kênh: registry code hoặc kênh người dùng tự thêm (hr_platforms).
  const ch = await resolveChannel(client, kenh);
  if (!ch) return;
  const { data: job, error: e0 } = await client
    .from('hr_jobs')
    .select('id, title, location, short_desc, requirements, jd_versions, image_hint')
    .eq('id', jobId).single();
  if (e0) throw new Error(e0.message);

  // Tránh trùng nháp cùng kênh (đã có bài chờ/đặt lịch thì thôi).
  const { data: existing } = await client
    .from('hr_job_posts').select('id')
    .eq('job_id', jobId).eq('kenh', kenh)
    .in('trang_thai', ['draft', 'scheduled']);
  if (existing && existing.length) { revalidatePath('/dang-tin'); revalidatePath('/vi-tri'); return; }

  let benefits: string | null = null;
  {
    const { data: benRow } = await client.from('hr_jobs').select('benefits').eq('id', jobId).maybeSingle();
    benefits = (benRow?.benefits as string | undefined) || null;
  }

  const { email: contactEmail, hotline } = await resolveBrandContact(client);
  const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand = (brandRow?.value || {}) as { logo_url?: string; website?: string; address?: string; company_name?: string; tagline?: string; poster?: { navy?: string; red?: string; accent?: string } };
  const companyAddress = brand.address || '283 Nguyễn Hữu Cảnh, Phường Rạch Dừa, TP. HCM';
  const reqText = (job as Record<string, unknown>).requirements as string | null;

  // Ưu tiên bản JD đúng độ dài theo kênh; thiếu thì ghép nguyên văn từ thông tin vị trí.
  const jdVersions = (job.jd_versions || {}) as Record<string, string>;
  const jdBody = String(jdVersions[ch.jd_variant] || '').trim();
  const assembled = jdBody || [
    job.short_desc ? `Mô tả công việc:\n${job.short_desc}` : '',
    reqText ? `Yêu cầu:\n${reqText}` : '',
    benefits ? `Quyền lợi:\n${benefits}` : '',
  ].filter(Boolean).join('\n\n');
  const noi_dung = [
    assembled,
    '',
    `Cách ứng tuyển: gửi CV về ${contactEmail}${hotline ? ` hoặc gọi hotline ${hotline}` : ''}.`,
  ].join('\n').trim();

  // Ảnh poster (tùy chọn) — sàn tuyển dụng cho đính ảnh. Lỗi thì bỏ ảnh, không chặn luồng.
  let image_url: string | null = null;
  try {
    const unsplash_url = await fetchUnsplashPhoto(job.title, job.location || undefined, (job as Record<string, unknown>).image_hint as string | null);
    const posterBuf = await buildRecruitmentPoster({
      title: job.title,
      location: job.location || null,
      requirements: toBullets(reqText),
      benefits: toBullets(benefits),
      salary: '',
      workingHours: '',
      brandName: brand.company_name || 'SDVICO',
      tagline: brand.tagline,
      website: brand.website,
      hotline,
      address: companyAddress,
      photoUrl: unsplash_url,
      logoUrl: brand.logo_url,
      theme: brand.poster,
    });
    if (posterBuf) {
      const imgPath = `posts/${jobId}/poster-${kenh}-${Date.now()}.jpg`;
      const { error: upErr } = await client.storage.from('post-images').upload(imgPath, posterBuf, { contentType: 'image/jpeg', upsert: true });
      if (!upErr) {
        const { data: { publicUrl } } = client.storage.from('post-images').getPublicUrl(imgPath);
        image_url = publicUrl;
      }
    }
  } catch {
    // ảnh là tùy chọn
  }

  const tieu_de = `[${ch.ten}] Tuyển ${job.title}${job.location ? ' - ' + job.location : ''}`;
  const { data: post, error: e1 } = await client.from('hr_job_posts')
    .insert({ job_id: jobId, kenh, tieu_de, noi_dung, image_url, trang_thai: 'draft' })
    .select('id').single();
  if (e1 || !post) {
    // Không ném lỗi (tránh crash trang). Ghi run_log để biết nguyên nhân (vd chưa migrate kenh mới).
    try { await client.from('run_log').insert({ task: 'hr.queue_channel', status: 'error', detail: { jobId, kenh, error: e1?.message || 'no post' } }); } catch {}
    revalidatePath('/dang-tin'); revalidatePath('/vi-tri'); return;
  }

  const { error: e2 } = await client.from('approval_queue').insert({
    kind: 'hr_job_post',
    title: tieu_de,
    payload: { post_id: post.id, job_id: jobId, kenh, dia_diem: job.location || null, body: noi_dung, image_url },
    ref_table: 'hr_job_posts', ref_id: post.id, status: 'pending',
  });
  if (e2) { try { await client.from('run_log').insert({ task: 'hr.queue_channel', status: 'error', detail: { jobId, kenh, error: e2.message } }); } catch {} }

  revalidatePath('/dang-tin');
  revalidatePath('/vi-tri');
  revalidatePath('/');
}

// Mở vị trí (draft -> open) và soạn bài cho một kênh, đưa vào Duyệt. Dùng từ trang Tạo JD / Vị trí.
export async function openAndQueueChannelPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;
  const client = getServerClient();
  await client.from('hr_jobs').update({ status: 'open' }).eq('id', jobId).eq('status', 'draft');
  await queueChannelPost(formData);
  redirect('/');
}

// Tải ảnh bằng chứng bài đã đăng lên Storage (bucket post-images, prefix proof/). Trả public URL hoặc null.
// Best-effort: lỗi upload chỉ ghi run_log, không chặn việc đánh dấu đã đăng.
async function uploadProof(
  client: ReturnType<typeof getServerClient>,
  postId: string,
  file: File | null
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  try {
    const bytes = await file.arrayBuffer();
    const rawExt = file.name.split('.').pop() || 'jpg';
    const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const path = `proof/${postId}/${Date.now()}.${ext}`;
    const { error } = await client.storage.from('post-images').upload(path, bytes, { contentType: file.type, upsert: true });
    if (error) {
      try { await client.from('run_log').insert({ task: 'upload_proof', status: 'error', detail: { postId, error: error.message } }); } catch {}
      return null;
    }
    const { data: { publicUrl } } = client.storage.from('post-images').getPublicUrl(path);
    return publicUrl;
  } catch (err: unknown) {
    try { await client.from('run_log').insert({ task: 'upload_proof', status: 'error', detail: { postId, error: String(err) } }); } catch {}
    return null;
  }
}

// Đánh dấu ĐÃ ĐĂNG cho kênh thủ công (đăng có hỗ trợ): người vận hành đã đăng ngoài xong,
// dán link + ảnh bằng chứng. Cổng an toàn y hệt publishJobPost: phải có mục approved (điều cấm 1).
export async function markPostedManually(formData: FormData) {
  const postId = String(formData.get('post_id') || '');
  const url = String(formData.get('url') || '').trim() || null;
  const proofFile = formData.get('proof_file') as File | null;
  if (!postId) return;

  const client = getServerClient();

  const { data: approved } = await client
    .from('approval_queue').select('id')
    .eq('ref_id', postId).eq('kind', 'hr_job_post').eq('status', 'approved').limit(1);
  if (!approved || approved.length === 0) {
    await client.from('hr_job_posts')
      .update({ ghi_chu: 'Bài chưa được duyệt trong hàng đợi — không thể đánh dấu đã đăng.' })
      .eq('id', postId);
    revalidatePath('/dang-tin');
    return;
  }

  const proof_path = await uploadProof(client, postId, proofFile);
  const email = await currentEmail();
  const { error } = await client.from('hr_job_posts').update({
    trang_thai: 'posted',
    posted_at: new Date().toISOString(),
    url,
    posted_by: email,
    ...(proof_path ? { proof_path } : {}),
    ghi_chu: null,
  }).eq('id', postId);
  if (error) throw new Error(error.message);
  try { await client.from('run_log').insert({ task: 'hr.mark_posted_manual', status: 'ok', detail: { postId, url, by: email } }); } catch {}

  revalidatePath('/dang-tin');
  revalidatePath('/vi-tri');
  revalidatePath('/');
}

// Ghi nhận ĐÃ ĐĂNG kiểu track-only: người tự đăng trực tiếp trên nền tảng (sàn có form riêng),
// hệ thống KHÔNG soạn, KHÔNG qua Duyệt — chỉ tạo bản ghi 'posted' + link + ảnh để theo dõi/kiểm soát.
// Không có nội dung máy sinh để gửi nên không cần cổng duyệt; vẫn lưu posted_by để truy vết.
export async function trackPostedPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '') || null;
  const kenh = String(formData.get('kenh') || '');
  const url = String(formData.get('url') || '').trim() || null;
  const proofFile = formData.get('proof_file') as File | null;
  if (!kenh || !isManual(kenh)) return; // chỉ dùng cho kênh thủ công

  const client = getServerClient();

  let title = 'Tin tuyển dụng';
  if (jobId) {
    const { data: job } = await client.from('hr_jobs').select('title, location').eq('id', jobId).maybeSingle();
    if (job?.title) title = `${job.title}${job.location ? ' - ' + job.location : ''}`;
  }

  const email = await currentEmail();
  const { data: inserted, error } = await client.from('hr_job_posts').insert({
    job_id: jobId,
    kenh,
    tieu_de: `[${channelLabel(kenh)}] ${title}`,
    trang_thai: 'posted',
    posted_at: new Date().toISOString(),
    url,
    posted_by: email,
    ghi_chu: 'Đăng trực tiếp trên nền tảng (ghi nhận, không qua soạn/duyệt).',
  }).select('id').single();
  if (error) throw new Error(error.message);

  const proof_path = await uploadProof(client, inserted.id, proofFile);
  if (proof_path) await client.from('hr_job_posts').update({ proof_path }).eq('id', inserted.id);

  try { await client.from('run_log').insert({ task: 'hr.track_posted', status: 'ok', detail: { postId: inserted.id, jobId, kenh, url, by: email } }); } catch {}

  revalidatePath('/dang-tin');
  revalidatePath('/kenh');
  revalidatePath('/vi-tri');
  revalidatePath('/');
}

// Sửa nội dung, hình ảnh, giờ đặt đăng trước khi duyệt. Người sửa là người kiểm soát (điều cấm 1).
// Đồng bộ cả bản xem trong hàng đợi để trang Duyệt không lệch với nội dung sẽ đăng.
// Ảnh: file từ máy ưu tiên hơn URL nhập tay. Cả hai đều tuỳ chọn.
export async function editJobPostDraft(formData: FormData) {
  const postId = String(formData.get('post_id') || '');
  const noi_dung = String(formData.get('noi_dung') || '');
  const imageUrlInput = String(formData.get('image_url') || '').trim() || null;
  const imageFile = formData.get('image_file') as File | null;
  const videoUrlInput = String(formData.get('video_url') || '').trim() || null;
  const videoFile = formData.get('video_file') as File | null;
  const scheduledRaw = String(formData.get('scheduled_at') || '').trim();
  const fbPostLink = String(formData.get('fb_post_link') || '').trim();
  const parsedFbPostId = parseFbPostId(fbPostLink);
  if (!postId) return;

  const scheduled_at = scheduledRaw ? parseVNTime(scheduledRaw) : null;
  const trang_thai = scheduled_at ? 'scheduled' : 'draft';

  const client = getServerClient();

  // Upload ảnh từ máy lên Supabase Storage nếu người dùng chọn file.
  // File ưu tiên hơn URL nhập tay để tránh xung đột. Thất bại thì giữ nguyên URL cũ.
  let image_url = imageUrlInput;
  if (imageFile && imageFile.size > 0) {
    try {
      const bytes = await imageFile.arrayBuffer();
      const rawExt = imageFile.name.split('.').pop() || 'jpg';
      const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
      const path = `posts/${postId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await client.storage
        .from('post-images')
        .upload(path, bytes, { contentType: imageFile.type, upsert: true });
      if (!uploadErr) {
        const { data: { publicUrl } } = client.storage.from('post-images').getPublicUrl(path);
        image_url = publicUrl;
      } else {
        try { await client.from('run_log').insert({ task: 'upload_post_image', status: 'error', detail: { postId, error: uploadErr.message } }); } catch {}
      }
    } catch (err: unknown) {
      try { await client.from('run_log').insert({ task: 'upload_post_image', status: 'error', detail: { postId, error: String(err) } }); } catch {}
    }
  }
  // Upload video từ máy nếu người dùng chọn file. Cùng bucket 'post-images', khác thư mục.
  // Facebook /videos giới hạn ~1 GB / 20 phút; UI cảnh báo trước; ở đây chỉ ghi và không chặn size.
  let video_url = videoUrlInput;
  if (videoFile && videoFile.size > 0) {
    try {
      const bytes = await videoFile.arrayBuffer();
      const rawExt = videoFile.name.split('.').pop() || 'mp4';
      const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4';
      const path = `posts/${postId}/video-${Date.now()}.${ext}`;
      const { error: uploadErr } = await client.storage
        .from('post-images')
        .upload(path, bytes, { contentType: videoFile.type || 'video/mp4', upsert: true });
      if (!uploadErr) {
        const { data: { publicUrl } } = client.storage.from('post-images').getPublicUrl(path);
        video_url = publicUrl;
      } else {
        try { await client.from('run_log').insert({ task: 'upload_post_video', status: 'error', detail: { postId, error: uploadErr.message } }); } catch {}
      }
    } catch (err: unknown) {
      try { await client.from('run_log').insert({ task: 'upload_post_video', status: 'error', detail: { postId, error: String(err) } }); } catch {}
    }
  }

  // Lấy trạng thái và fb_post_id hiện tại để xử lý bài đã đăng khác với nháp.
  const { data: cur } = await client.from('hr_job_posts')
    .select('trang_thai, fb_post_id').eq('id', postId).maybeSingle();

  let updateData: Record<string, unknown>;
  if (cur?.trang_thai === 'posted') {
    // Bài đã đăng: chỉ cập nhật nội dung, ảnh, video. Giữ nguyên trạng thái và lịch.
    updateData = { noi_dung, image_url, video_url };
    if (parsedFbPostId) updateData.fb_post_id = parsedFbPostId;
  } else {
    updateData = { noi_dung, image_url, video_url, scheduled_at, trang_thai };
  }

  const { error } = await client.from('hr_job_posts').update(updateData).eq('id', postId);
  if (error) throw new Error(error.message);

  // Đồng bộ lên Facebook nếu bài đã đăng và có fb_post_id (mới nhập hoặc đã có từ trước).
  // Lỗi thì ghi log nhưng không throw — DB đã cập nhật rồi.
  const activeFbPostId = parsedFbPostId || cur?.fb_post_id;
  if (cur?.trang_thai === 'posted' && activeFbPostId) {
    try {
      await callFacebookEditApi(activeFbPostId, noi_dung);
      await client.from('run_log').insert({ task: 'hr.edit_facebook_post', status: 'ok', detail: { postId, fbPostId: activeFbPostId } });
    } catch (err) {
      await client.from('run_log').insert({ task: 'hr.edit_facebook_post', status: 'error', detail: { postId, error: String(err) } });
    }
  }

  // Đồng bộ bản xem trong hàng đợi duyệt — chỉ khi bài chưa đăng (bài đã đăng không cần duyệt lại).
  if (!cur || cur.trang_thai !== 'posted') {
    const { data: rows } = await client
      .from('approval_queue')
      .select('id, payload')
      .eq('ref_id', postId)
      .eq('kind', 'hr_job_post')
      .eq('status', 'pending');
    for (const row of rows || []) {
      const payload = { ...((row.payload || {}) as Record<string, unknown>), body: noi_dung, image_url, video_url };
      await client.from('approval_queue').update({ payload }).eq('id', row.id);
    }
  }

  revalidatePath('/dang-tin');
  revalidatePath('/tuong-tac');
  revalidatePath('/');
}

// Helper nội bộ: gỡ một bài đã đăng khỏi Facebook qua Graph API.
// Ném lỗi nếu thất bại — người gọi tự quyết có tiếp tục không.
async function callFacebookDeleteApi(fbPostId: string): Promise<void> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!token) throw new Error('Thiếu FACEBOOK_PAGE_ACCESS_TOKEN trong biến môi trường.');
  const url = `https://graph.facebook.com/${version}/${fbPostId}?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'DELETE', cache: 'no-store' });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
}

// Helper nội bộ: cập nhật nội dung (message) bài đã đăng trên Facebook.
// Chỉ sửa được text — ảnh đã đăng không thay được qua API. Ném lỗi nếu thất bại.
async function callFacebookEditApi(fbPostId: string, message: string): Promise<void> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!token) throw new Error('Thiếu FACEBOOK_PAGE_ACCESS_TOKEN trong biến môi trường.');
  const res = await fetch(`https://graph.facebook.com/${version}/${fbPostId}`, {
    method: 'POST',
    body: new URLSearchParams({ message, access_token: token }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
}

// Parse URL bài Facebook hoặc ID thô. Hỗ trợ các định dạng link phổ biến.
// Trả về ID dạng {page_id}_{post_id}, post_id, hoặc photo_id — tuỳ link.
function parseFbPostId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+_\d+$/.test(s)) return s;   // page_id_post_id — dùng nguyên
  if (/^\d+$/.test(s)) return s;        // chỉ số — dùng nguyên
  try {
    const url = new URL(s);
    const story = url.searchParams.get('story_fbid');
    const page  = url.searchParams.get('id');
    if (story && page) return `${page}_${story}`;
    if (story) return story;
    const fbid = url.searchParams.get('fbid');
    if (fbid) return fbid;
    const m = url.pathname.match(/\/(?:posts|permalink)\/(\d+)/);
    if (m) return m[1];
  } catch {}
  return null;
}

// Helper nội bộ: gọi Facebook Graph API để đăng bài. Ném lỗi nếu thất bại.
// Trả về fbPostId (string). Không ghi DB, không revalidate — người gọi chịu.
async function callFacebookApi(post: { tieu_de: string; noi_dung: string; image_url: string | null }): Promise<string> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!pageId || !token) throw new Error('Thiếu FACEBOOK_PAGE_ID hoặc FACEBOOK_PAGE_ACCESS_TOKEN trong biến môi trường Vercel.');
  if (!post.noi_dung) throw new Error('Bài chưa có nội dung.');

  const message = [post.tieu_de, '', post.noi_dung].join('\n').trim();

  if (post.image_url) {
    const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/photos`, {
      method: 'POST', body: new URLSearchParams({ url: post.image_url, caption: message, access_token: token }), cache: 'no-store'
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      throw new Error(msg + (json.error?.code ? ` (mã ${json.error.code})` : ''));
    }
    return json.post_id || json.id;
  } else {
    const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/feed`, {
      method: 'POST', body: new URLSearchParams({ message, access_token: token }), cache: 'no-store'
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      throw new Error(msg + (json.error?.code ? ` (mã ${json.error.code})` : ''));
    }
    return json.id;
  }
}

// Đăng ngay lên Facebook sau khi đã được duyệt (điều cấm 1: cổng duyệt đã qua).
// Gọi thẳng Graph API từ server, không chờ worker cron. Chỉ hoạt động khi bài đã approved.
// Lỗi Facebook API được bắt và ghi vào run_log + ghi_chu để người dùng biết nguyên nhân.
export async function publishJobPost(formData: FormData) {
  const postId = String(formData.get('post_id') || '');
  if (!postId) return;

  const client = getServerClient();

  // Cổng an toàn: phải có mục approved trong hàng đợi cho bài này.
  const { data: approved } = await client
    .from('approval_queue')
    .select('id')
    .eq('ref_id', postId)
    .eq('kind', 'hr_job_post')
    .eq('status', 'approved')
    .limit(1);
  if (!approved || approved.length === 0) {
    await client.from('hr_job_posts')
      .update({ trang_thai: 'failed', ghi_chu: 'Bài chưa được duyệt trong hàng đợi.' })
      .eq('id', postId);
    revalidatePath('/dang-tin');
    return;
  }

  const { data: post, error: e1 } = await client
    .from('hr_job_posts')
    .select('id, tieu_de, noi_dung, trang_thai, image_url, kenh')
    .eq('id', postId)
    .single();
  if (e1 || !post) { revalidatePath('/dang-tin'); return; }
  if (post.trang_thai === 'posted') { revalidatePath('/dang-tin'); return; }

  // Kênh feed (Jooble): tin đã open + expire_at còn hạn sẽ tự lộ ra XML feed /api/jobs/feed.xml.
  // Không có khái niệm đăng per-post, và không nên chạy publish path vì sẽ gọi nhầm API khác.
  if (isFeed(post.kenh)) {
    await client.from('hr_job_posts')
      .update({ ghi_chu: 'Kênh XML feed — tin tự lộ ra /api/jobs/feed.xml khi status=open và còn hạn. Không có luồng đăng per-post.' })
      .eq('id', postId);
    revalidatePath('/dang-tin');
    return;
  }

  // Kênh đăng thủ công (TopCV, VietnamWorks, ...): KHÔNG có API đăng — không gọi Facebook API.
  // Hướng người dùng sang panel "Đăng thủ công": mở kênh -> đăng -> bấm "Đánh dấu đã đăng".
  if (isManual(post.kenh)) {
    await client.from('hr_job_posts')
      .update({ ghi_chu: 'Kênh đăng thủ công — mở kênh để đăng, rồi bấm "Đánh dấu đã đăng" (dán link + ảnh).' })
      .eq('id', postId);
    revalidatePath('/dang-tin');
    return;
  }

  // Bài LinkedIn: đăng qua LinkedIn API nếu đã cấu hình, chưa thì báo dùng Copy đăng tay.
  if (post.kenh === 'linkedin') {
    if (!linkedinConfigured()) {
      await client.from('hr_job_posts')
        .update({ ghi_chu: 'Chưa nối API LinkedIn. Dùng nút "Copy nội dung" để đăng tay lên Company Page.' })
        .eq('id', postId);
      revalidatePath('/dang-tin');
      return;
    }
    try {
      const urn = await postToLinkedIn(post.noi_dung);
      await client.from('hr_job_posts')
        .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), fb_post_id: urn, ghi_chu: null })
        .eq('id', postId);
      await client.from('run_log').insert({ task: 'hr.publish_linkedin_ui', status: 'ok', detail: { postId, urn } });
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      await client.from('hr_job_posts').update({ trang_thai: 'failed', ghi_chu: errStr }).eq('id', postId);
      await client.from('run_log').insert({ task: 'hr.publish_linkedin_ui', status: 'error', detail: { postId, error: errStr } });
    }
    revalidatePath('/dang-tin');
    revalidatePath('/');
    return;
  }

  try {
    const fbPostId = await callFacebookApi(post);
    const externalUrl = `https://www.facebook.com/${fbPostId}`;
    const { data: saved, error: updateErr } = await client.from('hr_job_posts')
      .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), url: externalUrl, fb_post_id: fbPostId, ghi_chu: null })
      .eq('id', postId)
      .select('id, trang_thai, fb_post_id')
      .single();
    if (updateErr) throw new Error(`Lưu DB thất bại: ${updateErr.message}`);
    if (!saved?.fb_post_id) throw new Error(`Cột fb_post_id không được ghi — FB trả: ${fbPostId}. Cần chạy migration 20260813010000_hr_job_posts_fb_post_id.sql trong Supabase.`);
    await client.from('run_log').insert({ task: 'hr.publish_facebook_ui', status: 'ok', detail: { postId, fbPostId, externalUrl } });
  } catch (err: unknown) {
    const errStr = err instanceof Error ? err.message : String(err);
    await client.from('hr_job_posts')
      .update({ trang_thai: 'failed', ghi_chu: errStr })
      .eq('id', postId);
    await client.from('run_log').insert({ task: 'hr.publish_facebook_ui', status: 'error', detail: { postId, error: errStr } });
  }

  revalidatePath('/dang-tin');
  revalidatePath('/');
}

// Đọc email/hotline liên hệ từ Cài đặt (brand_config), lùi về biến môi trường rồi mặc định.
// Dùng để chèn cách ứng tuyển đúng cấu hình công ty vào các bản JD do AI/bản ghép sinh ra.
async function resolveBrandContact(client: ReturnType<typeof getServerClient>): Promise<{ email: string; hotline: string }> {
  const { data } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand = (data?.value || {}) as { email?: string; hotline?: string };
  return {
    email: brand.email || process.env.HR_CONTACT_EMAIL || 'sdvicotuyendung@gmail.com',
    hotline: brand.hotline || '1900 23 23 49',
  };
}

// Tạo bản nháp JD từ thông tin người dùng nhập. AI viết bốn phiên bản, lưu nháp.
// Người xem, sửa rồi bấm "Soạn bài và đưa vào Duyệt" — không tự đăng (điều cấm 1).
export async function createJdDraft(formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  if (!title) return;
  const headcount = Math.max(1, parseInt(String(formData.get('headcount') || '1'), 10) || 1);
  const job = {
    title,
    department: String(formData.get('department') || '').trim() || undefined,
    location: String(formData.get('location') || '').trim() || undefined,
    short_desc: String(formData.get('short_desc') || '').trim() || undefined,
    requirements: String(formData.get('requirements') || '').trim() || undefined,
    benefits: String(formData.get('benefits') || '').trim() || undefined,
    nhom: String(formData.get('nhom') || '').trim() || undefined
  };
  const image_hint = String(formData.get('image_hint') || '').trim() || null;
  const client = getServerClient();
  const { versions } = await composeJdVersions(job, await resolveBrandContact(client));

  const { error } = await client.from('hr_jobs').insert({
    title: job.title,
    department: job.department || null,
    location: job.location || null,
    short_desc: job.short_desc || null,
    requirements: job.requirements || null,
    benefits: job.benefits || null,
    jd_versions: versions,
    nhom: job.nhom || null,
    image_hint,
    headcount,
    status: 'draft',
  }).select('id').single();
  if (error) throw new Error(error.message);

  // Không đẩy vào approval_queue ở đây — chỉ lưu nháp để người xem/sửa JD.
  // Bước tiếp: người bấm "Soạn bài và đưa vào Duyệt" để AI soạn bài Facebook rồi mới đưa duyệt.
  redirect('/tao-jd');
}

// Mở vị trí (draft → open) và soạn bài Facebook ngay — dùng từ trang Tạo JD khi người dùng
// đã xem xong 4 phiên bản JD và muốn đưa bài vào hàng đợi duyệt.
// Điều cấm 1: soạn xong đẩy vào hàng đợi, người duyệt mới quyết đăng hay không.
export async function openAndQueueFbPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;

  const client = getServerClient();
  await client.from('hr_jobs')
    .update({ status: 'open' })
    .eq('id', jobId)
    .eq('status', 'draft');

  await queueFacebookPost(formData);
  redirect('/');
}

// Mở vị trí và soạn bài LinkedIn ngay, đưa vào Duyệt. Dùng từ trang Tạo JD.
export async function openAndQueueLinkedInPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;

  const client = getServerClient();
  await client.from('hr_jobs')
    .update({ status: 'open' })
    .eq('id', jobId)
    .eq('status', 'draft');

  await queueLinkedInPost(formData);
  redirect('/');
}

// Lưu cài đặt thương hiệu công ty: logo, hotline, email, website, mô tả ngắn.
// Dùng để gắn footer liên hệ vào bài đăng Facebook và làm ảnh mặc định khi không có ảnh khác.
// Logo: file từ máy ưu tiên hơn URL nhập tay (upload vào post-images/brand/).
export async function saveBrandConfig(formData: FormData) {
  const logoFile = formData.get('logo_file') as File | null;
  let logo_url = String(formData.get('logo_url') || '').trim() || null;

  const client = getServerClient();

  if (logoFile && logoFile.size > 0) {
    try {
      const bytes = await logoFile.arrayBuffer();
      const rawExt = logoFile.name.split('.').pop() || 'png';
      const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png';
      const { error: uploadErr } = await client.storage
        .from('post-images')
        .upload(`brand/logo.${ext}`, bytes, { contentType: logoFile.type, upsert: true });
      if (!uploadErr) {
        const { data: { publicUrl } } = client.storage.from('post-images').getPublicUrl(`brand/logo.${ext}`);
        logo_url = publicUrl;
      }
    } catch {}
  }

  // Gộp với cấu hình cũ để không xoá mất các field khác (ví dụ cấu hình poster).
  const { data: prevRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const prev = (prevRow?.value || {}) as Record<string, unknown>;
  const config = {
    ...prev,
    logo_url,
    hotline: String(formData.get('hotline') || '').trim() || null,
    email: String(formData.get('email') || '').trim() || null,
    website: String(formData.get('website') || '').trim() || null,
    address: String(formData.get('address') || '').trim() || null,
    default_interview_location: String(formData.get('default_interview_location') || '').trim() || null,
    company_desc: String(formData.get('company_desc') || '').trim() || null,
  };
  const { error } = await client.from('app_config').upsert(
    { key: 'brand_config', value: config, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
  revalidatePath('/cai-dat');
}

// Lưu cấu hình poster (tên hiển thị, tagline, màu). Gộp vào brand_config.
export async function savePosterConfig(formData: FormData) {
  const client = getServerClient();
  const { data: prevRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const prev = (prevRow?.value || {}) as Record<string, unknown>;
  const clean = (k: string) => String(formData.get(k) || '').trim() || null;
  const config = {
    ...prev,
    company_name: clean('company_name'),
    tagline: clean('tagline'),
    poster: {
      navy: clean('poster_navy'),
      red: clean('poster_red'),
      accent: clean('poster_accent'),
    },
  };
  const { error } = await client.from('app_config').upsert(
    { key: 'brand_config', value: config, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
  revalidatePath('/cai-dat');
}

// Sửa một phiên bản JD của một vị trí. Người sửa là người kiểm soát (điều cấm 1).
export async function editJdVersion(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  const key = String(formData.get('key') || '');
  const value = String(formData.get('value') || '');
  if (!jobId || !key) return;
  const client = getServerClient();
  const { data: job, error: e1 } = await client.from('hr_jobs').select('jd_versions').eq('id', jobId).single();
  if (e1) throw new Error(e1.message);
  const versions = { ...((job.jd_versions || {}) as Record<string, string>), [key]: value };
  const { error: e2 } = await client.from('hr_jobs').update({ jd_versions: versions }).eq('id', jobId);
  if (e2) throw new Error(e2.message);
  revalidatePath('/tao-jd');
  revalidatePath('/dang-tin');
}

// Viết lại bốn phiên bản bằng AI từ thông tin đã lưu của vị trí.
export async function regenerateJd(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;
  const client = getServerClient();
  const { data: job, error: e1 } = await client
    .from('hr_jobs')
    .select('title, department, location, short_desc, requirements, nhom')
    .eq('id', jobId)
    .single();
  if (e1) throw new Error(e1.message);
  const { versions } = await composeJdVersions({
    title: job.title,
    department: job.department || undefined,
    location: job.location || undefined,
    short_desc: job.short_desc || undefined,
    requirements: job.requirements || undefined,
    nhom: job.nhom || undefined
  }, await resolveBrandContact(client));
  const { error: e2 } = await client.from('hr_jobs').update({ jd_versions: versions }).eq('id', jobId);
  if (e2) throw new Error(e2.message);
  revalidatePath('/tao-jd');
  revalidatePath('/dang-tin');
}

// Hoàn thành: đưa vị trí sang trạng thái đang tuyển, sẵn sàng đăng tin. Chỉ đổi bản còn nháp.
export async function finalizeJd(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_jobs').update({ status: 'open' }).eq('id', jobId).eq('status', 'draft');
  if (error) throw new Error(error.message);
  revalidatePath('/tao-jd');
  revalidatePath('/dang-tin');
}

// Xóa một bản nháp JD. Chỉ xóa được bản còn nháp, tránh mất vị trí đang tuyển.
export async function deleteJd(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_jobs').delete().eq('id', jobId).eq('status', 'draft');
  if (error) throw new Error(error.message);
  revalidatePath('/tao-jd');
}

// Xóa vị trí ở bất kỳ trạng thái nào (kể cả open). Dùng để loại bỏ vị trí test hoặc không còn cần.
export async function removeJob(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_jobs').delete().eq('id', jobId);
  if (error) throw new Error(error.message);
  revalidatePath('/tao-jd');
}

// Xoá một mục lịch phỏng vấn khỏi trang /lich. Chỉ xoá bản ghi approval_queue tương ứng
// (kind='hr_interview'); giữ nguyên hồ sơ ứng viên và các cột lịch trong hr_applications
// (chosen_slot, schedule_token, interviewed_at) để không mất dấu vết. Dùng khi buổi phỏng
// vấn đã xong hoặc bị huỷ và người quản lý muốn dọn khỏi cột hiển thị.
export async function dismissInterviewSchedule(formData: FormData) {
  const queueId = String(formData.get('queueId') || '');
  if (!queueId) return;
  const client = getServerClient();
  const { error } = await client
    .from('approval_queue')
    .delete()
    .eq('id', queueId)
    .eq('kind', 'hr_interview');
  if (error) throw new Error(error.message);
  revalidatePath('/lich');
}

// Thêm vị trí vào hàng đợi tự động: draft → open + auto_post=true.
// Cron sẽ tự soạn bài khi tìm thấy vị trí này. Người vẫn phải duyệt trước khi đăng (điều cấm 1).
export async function addToAutoQueue(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_jobs')
    .update({ status: 'open', auto_post: true })
    .eq('id', jobId);
  if (error) throw new Error(error.message);
  revalidatePath('/tao-jd');
  redirect('/tao-jd');
}

// Bật/tắt chế độ tự động đăng bài định kỳ cho một vị trí. Người bật, worker thực hiện (điều cấm 1).
// Đổi chu kỳ refresh bài đăng cho 1 vị trí. Sau X ngày kể từ bài đã đăng gần nhất,
// cron compose sẽ soạn bài mới. Preset: 7/14/30/60/90 hoặc tuỳ chỉnh 1-365.
export async function setJobRefreshInterval(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  const days = Math.max(1, Math.min(365, parseInt(String(formData.get('days') || '30'), 10) || 30));
  if (!jobId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_jobs')
    .update({ refresh_after_days: days })
    .eq('id', jobId);
  if (error) throw new Error('Đổi chu kỳ refresh lỗi: ' + error.message);
  revalidatePath('/tao-jd');
}

export async function toggleAutoPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  const current = formData.get('current') === 'true';
  if (!jobId) return;
  const client = getServerClient();
  const next = !current;
  // Bật tự động thì đặt luôn status='open' để cron soạn được (cron chỉ soạn vị trí open + auto_post).
  const { error } = await client.from('hr_jobs')
    .update(next ? { auto_post: true, status: 'open' } : { auto_post: false })
    .eq('id', jobId);
  if (error) {
    // Lỗi 42703 = cột auto_post chưa tồn tại, migration chưa chạy.
    throw new Error(
      error.code === '42703'
        ? 'Cột auto_post chưa có trong database. Chạy file supabase/migrations/20260813040000_hr_jobs_auto_post.sql trong Supabase SQL editor rồi thử lại.'
        : error.message
    );
  }
  revalidatePath('/tao-jd');
}

// Tạo bản nháp JD từ panel slide-in. Trả về dữ liệu thay vì redirect để panel hiển thị xem trước.
// Ký hiệu _prev, formData dùng với useFormState trong AddJobPanel (điều cấm 1: người xem trước khi đưa duyệt).
export async function createJdDraftForPanel(
  _prev: { jobId: string; title: string; versions: Record<string, string> } | null,
  formData: FormData
): Promise<{ jobId: string; title: string; versions: Record<string, string> } | null> {
  const title = String(formData.get('title') || '').trim();
  if (!title) return _prev;
  const headcount = Math.max(1, parseInt(String(formData.get('headcount') || '1'), 10) || 1);
  const job = {
    title,
    department: String(formData.get('department') || '').trim() || undefined,
    location: String(formData.get('location') || '').trim() || undefined,
    short_desc: String(formData.get('short_desc') || '').trim() || undefined,
    requirements: String(formData.get('requirements') || '').trim() || undefined,
    benefits: String(formData.get('benefits') || '').trim() || undefined,
    nhom: String(formData.get('nhom') || '').trim() || undefined,
  };
  const image_hint = String(formData.get('image_hint') || '').trim() || null;
  const client = getServerClient();
  const { versions } = await composeJdVersions(job, await resolveBrandContact(client));

  const { data, error } = await client.from('hr_jobs').insert({
    title: job.title,
    department: job.department || null,
    location: job.location || null,
    short_desc: job.short_desc || null,
    requirements: job.requirements || null,
    benefits: job.benefits || null,
    jd_versions: versions,
    nhom: job.nhom || null,
    image_hint,
    headcount,
    status: 'draft',
  }).select('id').single();
  if (error) throw new Error(error.message);

  revalidatePath('/tao-jd');
  return { jobId: String(data.id), title: job.title, versions };
}

// Duyệt và đăng ngay lên Facebook trong một bước, không cần chờ worker cron.
// Điều cấm 1: người bấm Duyệt là cổng kiểm soát. Action này chỉ chạy khi người dùng bấm.
// Hỗ trợ gỡ bài cũ cùng lúc nếu người dùng tick "Gỡ bài cũ khi đăng bài này".
export async function approveAndPublish(formData: FormData) {
  const queueId = String(formData.get('queue_id') || '');
  const postId = String(formData.get('post_id') || '');
  if (!queueId || !postId) return;

  const deleteOld = formData.get('delete_old_post') === 'yes';
  const deleteOldPostId = String(formData.get('delete_old_post_id') || '');
  const deleteOldFbPostId = String(formData.get('delete_old_fb_post_id') || '');

  const client = getServerClient();
  const who = await currentEmail();

  // Duyệt trong hàng đợi.
  const { error: approveErr } = await client.from('approval_queue')
    .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: who })
    .eq('id', queueId).eq('status', 'pending');
  if (approveErr) throw new Error(approveErr.message);

  // Đọc bài đăng.
  const { data: post, error: e1 } = await client.from('hr_job_posts')
    .select('id, tieu_de, noi_dung, trang_thai, image_url, kenh, needs_gov_review, gov_reviewed_by')
    .eq('id', postId).single();
  if (e1 || !post || post.trang_thai === 'posted') {
    revalidatePath('/'); revalidatePath('/dang-tin'); return;
  }
  // P2-17: điều cấm 3. Bài chạm quy định nhà nước phải có cấp quản lý bấm duyệt trước.
  if (post.needs_gov_review && !post.gov_reviewed_by) {
    throw new Error('Bài này chạm quy định nhà nước / IUU / Cục Thủy sản / Kiểm ngư. Cần cấp quản lý bấm "Đánh dấu đã duyệt" (điều cấm 3) trước khi đăng.');
  }

  // Bài LinkedIn: đăng qua LinkedIn API; chưa nối/hết hạn thì báo rõ, KHÔNG đăng lên Facebook.
  if (post.kenh === 'linkedin') {
    if (!linkedinConfigured()) {
      await client.from('hr_job_posts')
        .update({ trang_thai: 'failed', ghi_chu: 'Thiếu API LinkedIn (chưa nối hoặc hết hạn) — không thể đăng lên LinkedIn. Dùng nút "Copy nội dung" để đăng tay lên Company Page.' })
        .eq('id', postId);
      await client.from('run_log').insert({ task: 'hr.approve_and_publish', status: 'error', detail: { postId, error: 'linkedin_not_configured' } });
    } else {
      try {
        const urn = await postToLinkedIn(post.noi_dung);
        await client.from('hr_job_posts')
          .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), fb_post_id: urn, ghi_chu: null })
          .eq('id', postId);
        await client.from('run_log').insert({ task: 'hr.approve_and_publish', status: 'ok', detail: { postId, urn, kenh: 'linkedin' } });
      } catch (err: unknown) {
        const errStr = err instanceof Error ? err.message : String(err);
        await client.from('hr_job_posts').update({ trang_thai: 'failed', ghi_chu: errStr }).eq('id', postId);
        await client.from('run_log').insert({ task: 'hr.approve_and_publish', status: 'error', detail: { postId, error: errStr, kenh: 'linkedin' } });
      }
    }
    revalidatePath('/'); revalidatePath('/dang-tin');
    return;
  }

  // Đăng lên Facebook và cập nhật trạng thái.
  try {
    const fbPostId = await callFacebookApi(post);
    const externalUrl = `https://www.facebook.com/${fbPostId}`;
    const { error: updateErr } = await client.from('hr_job_posts')
      .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), url: externalUrl, fb_post_id: fbPostId, ghi_chu: null })
      .eq('id', postId);
    if (updateErr) throw new Error(`Lưu DB thất bại: ${updateErr.message}`);
    await client.from('run_log').insert({ task: 'hr.approve_and_publish', status: 'ok', detail: { postId, fbPostId, externalUrl } });

    // Gỡ bài cũ sau khi bài mới đăng thành công.
    if (deleteOld && deleteOldPostId && deleteOldFbPostId) {
      try {
        await callFacebookDeleteApi(deleteOldFbPostId);
        await client.from('hr_job_posts')
          .update({ trang_thai: 'cancelled', ghi_chu: 'Gỡ tự động khi đăng bài mới' })
          .eq('id', deleteOldPostId);
        await client.from('run_log').insert({ task: 'hr.delete_old_post', status: 'ok', detail: { oldPostId: deleteOldPostId, oldFbPostId: deleteOldFbPostId } });
      } catch (delErr) {
        await client.from('run_log').insert({ task: 'hr.delete_old_post', status: 'error', detail: { error: String(delErr) } });
      }
    }
  } catch (err: unknown) {
    const errStr = err instanceof Error ? err.message : String(err);
    await client.from('hr_job_posts').update({ trang_thai: 'failed', ghi_chu: errStr }).eq('id', postId);
    await client.from('run_log').insert({ task: 'hr.approve_and_publish', status: 'error', detail: { postId, error: errStr } });
  }

  revalidatePath('/');
  revalidatePath('/dang-tin');
}

// Duyệt và đặt lịch đăng. Worker cron sẽ đăng khi đến giờ (chạy mỗi 15 phút qua GitHub Actions).
// Nhận minutes (X phút sau) hoặc scheduled_at (giờ cụ thể dạng ISO hoặc datetime-local).
// Hỗ trợ gỡ bài cũ ngay lúc đặt lịch nếu người dùng tick checkbox.
export async function approveAndSchedule(formData: FormData) {
  const queueId = String(formData.get('queue_id') || '');
  const postId = String(formData.get('post_id') || '');
  const minutesStr = String(formData.get('minutes') || '');
  const scheduledRaw = String(formData.get('scheduled_at') || '').trim();
  if (!queueId || !postId) return;

  const deleteOld = formData.get('delete_old_post') === 'yes';
  const deleteOldPostId = String(formData.get('delete_old_post_id') || '');
  const deleteOldFbPostId = String(formData.get('delete_old_fb_post_id') || '');

  let scheduled_at: string;
  if (scheduledRaw) {
    scheduled_at = parseVNTime(scheduledRaw);
  } else {
    const minutes = Math.max(1, parseInt(minutesStr, 10) || 30);
    scheduled_at = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  }

  const client = getServerClient();
  const who = await currentEmail();

  await client.from('approval_queue')
    .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: who })
    .eq('id', queueId).eq('status', 'pending');

  // Đặt lịch: worker cron (chạy mỗi 5 phút qua cron-job.org) sẽ đăng khi đến giờ.
  // Không dùng Facebook native scheduling nữa — thực tế nó không đăng được, làm bài kẹt.
  // Worker là đường tin cậy: đăng bài scheduled khi scheduled_at đã tới.
  await client.from('hr_job_posts')
    .update({ scheduled_at, trang_thai: 'scheduled' })
    .eq('id', postId).neq('trang_thai', 'posted');

  // Gỡ bài cũ ngay khi đặt lịch (bài cũ đã xong vai trò, bài mới sẽ lên theo lịch).
  if (deleteOld && deleteOldPostId && deleteOldFbPostId) {
    try {
      await callFacebookDeleteApi(deleteOldFbPostId);
      await client.from('hr_job_posts')
        .update({ trang_thai: 'cancelled', ghi_chu: 'Gỡ tự động khi đặt lịch bài mới' })
        .eq('id', deleteOldPostId);
      await client.from('run_log').insert({ task: 'hr.delete_old_post', status: 'ok', detail: { oldPostId: deleteOldPostId, oldFbPostId: deleteOldFbPostId, when: 'schedule' } });
    } catch (delErr) {
      await client.from('run_log').insert({ task: 'hr.delete_old_post', status: 'error', detail: { error: String(delErr), when: 'schedule' } });
    }
  }

  revalidatePath('/');
  revalidatePath('/dang-tin');
}

// ============================================================================
// Quản lý người dùng nội bộ. Chỉ admin đăng nhập bằng magic link mới bấm được.
// Ở chế độ AUTH_MODE=basic không có khái niệm user, các action này báo lỗi rõ ràng.
// ============================================================================

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export async function addHrUser(formData: FormData) {
  const ok = await requireAdmin();
  if ('error' in ok) throw new Error(ok.error);

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const fullName = String(formData.get('full_name') || '').trim() || null;
  const roleRaw = String(formData.get('role') || 'staff');
  const role = roleRaw === 'admin' ? 'admin' : 'staff';

  if (!email || !EMAIL_RE.test(email)) throw new Error('Email không hợp lệ.');

  const client = getServerClient();
  const { error } = await client.from('hr_users')
    .insert({ email, full_name: fullName, role })
    .select('id')
    .single();
  if (error) {
    if (error.message?.includes('duplicate') || error.code === '23505') {
      throw new Error('Email này đã có trong danh sách.');
    }
    throw new Error('Không thêm được: ' + error.message);
  }
  revalidatePath('/cai-dat/nguoi-dung');
}

export async function toggleHrUserDisabled(formData: FormData) {
  const ok = await requireAdmin();
  if ('error' in ok) throw new Error(ok.error);

  const id = String(formData.get('id') || '');
  if (!id) return;

  const client = getServerClient();
  const { data: row, error: readErr } = await client.from('hr_users')
    .select('id, email, disabled_at').eq('id', id).maybeSingle();
  if (readErr || !row) throw new Error('Không tìm thấy người dùng.');

  // Chốt an toàn: không cho admin tự khóa chính mình. Khóa xong không vào lại được.
  if (row.email?.toLowerCase() === ok.email.toLowerCase()) {
    throw new Error('Không thể tự khóa tài khoản đang đăng nhập.');
  }

  const newVal = row.disabled_at ? null : new Date().toISOString();
  const { error } = await client.from('hr_users').update({ disabled_at: newVal }).eq('id', id);
  if (error) throw new Error('Không đổi được trạng thái: ' + error.message);
  revalidatePath('/cai-dat/nguoi-dung');
}

export async function changeHrUserRole(formData: FormData) {
  const ok = await requireAdmin();
  if ('error' in ok) throw new Error(ok.error);

  const id = String(formData.get('id') || '');
  const roleRaw = String(formData.get('role') || '');
  if (!id) return;
  const role = roleRaw === 'admin' ? 'admin' : 'staff';

  const client = getServerClient();
  const { data: row } = await client.from('hr_users').select('email, role').eq('id', id).maybeSingle();
  if (!row) throw new Error('Không tìm thấy người dùng.');

  // Chốt an toàn: không cho admin tự hạ role của chính mình. Nếu công ty chỉ có một admin,
  // hạ xong không còn admin nào bấm được nữa.
  if (row.email?.toLowerCase() === ok.email.toLowerCase() && row.role === 'admin' && role === 'staff') {
    throw new Error('Không thể tự hạ quyền admin của chính mình. Nhờ admin khác đổi giúp.');
  }

  const { error } = await client.from('hr_users').update({ role }).eq('id', id);
  if (error) throw new Error('Không đổi được vai trò: ' + error.message);
  revalidatePath('/cai-dat/nguoi-dung');
}

// --- Quản lý nhân viên (sau khi đã nhận việc thật) ---
// Toàn bộ hàm dưới đây kiểm requireEmployeeAdmin() trước, vì hr_employees/hr_employee_documents
// không cấp policy RLS cho authenticated (dữ liệu nhạy cảm hơn hồ sơ ứng viên, xem
// 20260818010000_hr_employees.sql). Không được gọi thẳng service role mà bỏ qua bước này.

// Xác nhận ứng viên đã thật sự nhận việc (khác offer = chỉ mới mời). Chỉ cho khi stage='offer'.
// Tạo một bản ghi hr_employees, copy tên/email/phone từ hr_candidates làm điểm khởi đầu.
export async function confirmHired(formData: FormData) {
  const guard = await requireEmployeeAdmin();
  if ('error' in guard) throw new Error(guard.error);

  const appId = String(formData.get('appId') || '');
  if (!appId) return;

  const client = getServerClient();
  const { data: app } = await client
    .from('hr_applications')
    .select('id, stage, hired_at, candidate_id')
    .eq('id', appId).maybeSingle();
  if (!app || app.stage !== 'offer' || app.hired_at) return;

  const { data: cand } = await client
    .from('hr_candidates')
    .select('full_name, email, phone')
    .eq('id', app.candidate_id).maybeSingle();

  const { error: insErr } = await client.from('hr_employees').insert({
    candidate_id: app.candidate_id,
    application_id: appId,
    full_name: cand?.full_name || null,
    email: cand?.email || null,
    phone: cand?.phone || null,
    created_by: guard.email,
  });
  if (insErr) throw new Error('Không tạo được hồ sơ nhân viên: ' + insErr.message);

  await client.from('hr_applications').update({ hired_at: new Date().toISOString() }).eq('id', appId);

  revalidatePath('/ho-so');
  revalidatePath('/nhan-vien');
}

// Thêm nhân viên đã có sẵn (công ty hoạt động lâu, phần lớn nhân viên không đến từ luồng tuyển
// dụng trong hệ thống). Tạo hr_employees không gắn candidate_id/application_id — hai cột này
// nullable, chỉ có giá trị khi nhân viên đến từ ứng viên qua confirmHired.
export async function addEmployeeManual(formData: FormData) {
  const guard = await requireEmployeeAdmin();
  if ('error' in guard) throw new Error(guard.error);

  const fullName = String(formData.get('full_name') || '').trim();
  if (!fullName) throw new Error('Cần nhập họ tên nhân viên.');

  const trangThaiRaw = String(formData.get('trang_thai') || 'active');
  const trangThai = (['active', 'probation', 'left'].includes(trangThaiRaw) ? trangThaiRaw : 'active') as
    'active' | 'probation' | 'left';

  const client = getServerClient();
  const { data, error } = await client.from('hr_employees').insert({
    full_name: fullName,
    email: String(formData.get('email') || '').trim() || null,
    phone: String(formData.get('phone') || '').trim() || null,
    chuc_danh: String(formData.get('chuc_danh') || '').trim() || null,
    phong_ban: String(formData.get('phong_ban') || '').trim() || null,
    ngay_bat_dau: String(formData.get('ngay_bat_dau') || '').trim() || null,
    trang_thai: trangThai,
    bao_hiem: parseBaoHiem(formData.get('bao_hiem')),
    luong: parseLuong(formData.get('luong')),
    luong_ghi_chu: String(formData.get('luong_ghi_chu') || '').trim() || null,
    created_by: guard.email,
  }).select('id').single();
  if (error) throw new Error('Không thêm được nhân viên: ' + error.message);

  revalidatePath('/nhan-vien');
  redirect(`/nhan-vien/${data.id}`);
}

export async function updateEmployeeInfo(formData: FormData) {
  const guard = await requireEmployeeAdmin();
  if ('error' in guard) throw new Error(guard.error);

  const id = String(formData.get('id') || '');
  if (!id) return;

  const fields = {
    chuc_danh: String(formData.get('chuc_danh') || '').trim() || null,
    phong_ban: String(formData.get('phong_ban') || '').trim() || null,
    ngay_bat_dau: String(formData.get('ngay_bat_dau') || '').trim() || null,
    bao_hiem: parseBaoHiem(formData.get('bao_hiem')),
    luong: parseLuong(formData.get('luong')),
    luong_ghi_chu: String(formData.get('luong_ghi_chu') || '').trim() || null,
    so_bhxh: String(formData.get('so_bhxh') || '').trim() || null,
    so_cccd: String(formData.get('so_cccd') || '').trim() || null,
    trang_thai: (['active', 'probation', 'left'].includes(String(formData.get('trang_thai')))
      ? String(formData.get('trang_thai'))
      : 'active') as 'active' | 'probation' | 'left',
  };

  const client = getServerClient();
  const { error } = await client.from('hr_employees').update(fields).eq('id', id);
  if (error) throw new Error('Không lưu được: ' + error.message);
  revalidatePath(`/nhan-vien/${id}`);
}

// Bật/tắt một mục trong checklist onboarding. checklist lưu dạng jsonb [{label, done}].
export async function toggleOnboardingItem(formData: FormData) {
  const guard = await requireEmployeeAdmin();
  if ('error' in guard) throw new Error(guard.error);

  const id = String(formData.get('id') || '');
  const index = Number(formData.get('index'));
  if (!id || Number.isNaN(index)) return;

  const client = getServerClient();
  const { data: emp } = await client.from('hr_employees').select('onboarding_checklist').eq('id', id).maybeSingle();
  if (!emp) return;
  const checklist = Array.isArray(emp.onboarding_checklist) ? [...emp.onboarding_checklist] : [];
  if (!checklist[index]) return;
  checklist[index] = { ...checklist[index], done: !checklist[index].done };

  const { error } = await client.from('hr_employees').update({ onboarding_checklist: checklist }).eq('id', id);
  if (error) throw new Error('Không lưu được: ' + error.message);
  revalidatePath(`/nhan-vien/${id}`);
}

export async function addOnboardingItem(formData: FormData) {
  const guard = await requireEmployeeAdmin();
  if ('error' in guard) throw new Error(guard.error);

  const id = String(formData.get('id') || '');
  const label = String(formData.get('label') || '').trim();
  if (!id || !label) return;

  const client = getServerClient();
  const { data: emp } = await client.from('hr_employees').select('onboarding_checklist').eq('id', id).maybeSingle();
  if (!emp) return;
  const checklist = Array.isArray(emp.onboarding_checklist) ? [...emp.onboarding_checklist] : [];
  checklist.push({ label, done: false });

  const { error } = await client.from('hr_employees').update({ onboarding_checklist: checklist }).eq('id', id);
  if (error) throw new Error('Không lưu được: ' + error.message);
  revalidatePath(`/nhan-vien/${id}`);
}

// Tải lên một tài liệu nhân viên (hợp đồng, bằng cấp, BHXH, CCCD). Lưu vào bucket riêng tư
// employee-documents, không public URL — trang chi tiết tự ký URL tạm khi hiển thị.
export async function uploadEmployeeDocument(formData: FormData) {
  const guard = await requireEmployeeAdmin();
  if ('error' in guard) throw new Error(guard.error);

  const employeeId = String(formData.get('employee_id') || '');
  const loaiRaw = String(formData.get('loai') || 'khac');
  const loai = (['hop_dong', 'bang_cap', 'bhxh', 'cccd', 'khac'].includes(loaiRaw) ? loaiRaw : 'khac') as
    'hop_dong' | 'bang_cap' | 'bhxh' | 'cccd' | 'khac';
  const ghiChu = String(formData.get('ghi_chu') || '').trim() || null;
  const file = formData.get('file');
  if (!employeeId || !(file instanceof File) || file.size === 0) return;

  const client = getServerClient();
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${employeeId}/${Date.now()}-${loai}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await client.storage
    .from(EMPLOYEE_DOCS_BUCKET)
    .upload(path, buf, { contentType: file.type || 'application/octet-stream' });
  if (upErr) throw new Error('Tải tệp lỗi: ' + upErr.message);

  const { error } = await client.from('hr_employee_documents').insert({
    employee_id: employeeId,
    loai,
    storage_path: path,
    ghi_chu: ghiChu,
    uploaded_by: guard.email,
  });
  if (error) throw new Error('Lưu bản ghi tài liệu lỗi: ' + error.message);

  revalidatePath(`/nhan-vien/${employeeId}`);
}

// Xoá hẳn một nhân viên: xoá tệp tài liệu trong Storage (bucket không tự dọn khi xoá dòng),
// rồi xoá dòng hr_employees (hr_employee_documents tự xoá theo on delete cascade).
// Không đụng tới hr_applications/hr_candidates — dữ liệu tuyển dụng của người này vẫn còn.
export async function deleteEmployee(formData: FormData) {
  const guard = await requireEmployeeAdmin();
  if ('error' in guard) throw new Error(guard.error);

  const id = String(formData.get('id') || '');
  if (!id) return;

  const client = getServerClient();

  // Xoá tệp trong Storage theo tiền tố "<employeeId>/". Lỗi liệt kê/xoá tệp không chặn việc
  // xoá bản ghi — nhưng ghi log để còn dọn tay nếu cần.
  try {
    const { data: files } = await client.storage.from(EMPLOYEE_DOCS_BUCKET).list(id);
    if (files && files.length) {
      await client.storage.from(EMPLOYEE_DOCS_BUCKET).remove(files.map((f) => `${id}/${f.name}`));
    }
  } catch {
    // eo
  }

  const { error } = await client.from('hr_employees').delete().eq('id', id);
  if (error) throw new Error('Không xoá được nhân viên: ' + error.message);

  revalidatePath('/nhan-vien');
  redirect('/nhan-vien');
}

// --- Trả lời bình luận Facebook ---
// Máy soạn (worker queue-comment-replies), người bấm Duyệt mới đăng (điều cấm 1). Duyệt xong
// KHÔNG đăng ngay ở đây — worker publish-comment-reply chạy theo lịch (~15 phút) mới gọi Graph
// API, giữ đúng một chỗ duy nhất gọi API đăng thật, tránh trùng logic với route cron.

export async function decideCommentReply(formData: FormData) {
  const queueId = String(formData.get('queue_id') || '');
  const commentId = String(formData.get('comment_id') || '');
  const replyText = String(formData.get('reply_text') || '').trim();
  if (!queueId || !commentId || !replyText) return;

  const client = getServerClient();
  const who = await currentEmail();

  // Đọc payload gốc trước (comment_id, fb_comment_id, message...) để ghép thêm reply_text
  // đã sửa, không ghi đè mất các khóa còn lại — publish-comment-reply cần fb_comment_id.
  const { data: item } = await client.from('approval_queue').select('payload').eq('id', queueId).eq('status', 'pending').maybeSingle();
  if (!item) return;

  const { error } = await client
    .from('approval_queue')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: who,
      payload: { ...(item.payload as object), reply_text: replyText },
    })
    .eq('id', queueId)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);

  await client.from('hr_fb_comments').update({ trang_thai: 'approved', reply_text: replyText }).eq('id', commentId);

  revalidatePath('/kenh/binh-luan');
  revalidatePath('/');
}

export async function ignoreCommentReply(formData: FormData) {
  const queueId = String(formData.get('queue_id') || '');
  const commentId = String(formData.get('comment_id') || '');
  if (!queueId || !commentId) return;

  const client = getServerClient();
  const who = await currentEmail();

  await client
    .from('approval_queue')
    .update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: who })
    .eq('id', queueId)
    .eq('status', 'pending');
  await client.from('hr_fb_comments').update({ trang_thai: 'ignored' }).eq('id', commentId);

  revalidatePath('/kenh/binh-luan');
  revalidatePath('/');
}

// --- Nguồn CV chủ động (TopCV và tương tự) ---
// Cổng tắt mặc định. Toàn bộ hàm dưới đây chỉ đổi cấu hình trong DB, KHÔNG tự chạy trình
// duyệt hay gọi trang ngoài — việc chạy thật nằm ở packages/hr/src/sourcing-cv/run.mjs, và
// script đó tự kiểm lại xac_nhan_phap_ly_boi/xac_nhan_luc trước khi làm gì (không tin riêng cờ bat).

export async function addCvSource(formData: FormData) {
  const ok = await requireAdmin();
  if ('error' in ok) throw new Error(ok.error);

  const ten = String(formData.get('ten') || '').trim();
  const gioiHan = Number(formData.get('gioi_han_ngay')) || null;
  if (!ten) return;

  const client = getServerClient();
  const { data: platform, error: e1 } = await client
    .from('hr_platforms')
    .insert({ ten, loai: 'cv_source', bat: false, ghi_chu: 'Nguồn tìm CV chủ động — xem docs, cần xác nhận pháp lý trước khi bật.' })
    .select('id').single();
  if (e1) throw new Error('Không tạo được nguồn: ' + e1.message);

  const { error: e2 } = await client.from('hr_cv_sources').insert({ platform_id: platform.id, gioi_han_ngay: gioiHan, bat: false });
  if (e2) throw new Error('Không tạo được cấu hình nguồn: ' + e2.message);

  revalidatePath('/cai-dat/nguon-cv');
}

// Người có thẩm quyền xác nhận đã rà pháp lý/hợp đồng dịch vụ. KHÔNG tự bật bat ở đây — chỉ
// mở khóa để nút Bật hiện ra, người vẫn phải bấm Bật riêng một bước nữa.
export async function confirmCvSourceLegal(formData: FormData) {
  const ok = await requireAdmin();
  if ('error' in ok) throw new Error(ok.error);

  const id = String(formData.get('id') || '');
  if (!id) return;

  const client = getServerClient();
  const { error } = await client
    .from('hr_cv_sources')
    .update({ xac_nhan_phap_ly_boi: ok.email, xac_nhan_luc: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error('Không lưu được xác nhận: ' + error.message);
  revalidatePath('/cai-dat/nguon-cv');
}

// P2-17: đánh dấu một bài đã được cấp quản lý duyệt về mặt quy định nhà nước / IUU /
// Cục Thủy sản / Kiểm ngư. Sau khi bấm, cron publish (hoặc nút "Duyệt và đăng") mới
// cho phép đăng. Trong chế độ AUTH_MODE=supabase yêu cầu role='admin'; chế độ basic
// ghi decided_by='basic-auth' để vẫn có dấu vết (audit đầy đủ khi bật supabase — P2-18).
export async function markGovReviewed(formData: FormData) {
  const postId = String(formData.get('post_id') || '');
  if (!postId) return;

  if (authMode() === 'supabase') {
    const ok = await requireAdmin();
    if ('error' in ok) throw new Error(ok.error);
  }

  const client = getServerClient();
  const who = (await currentEmail()) || 'basic-auth';
  const { error } = await client
    .from('hr_job_posts')
    .update({ gov_reviewed_by: who, gov_reviewed_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('needs_gov_review', true)
    .is('gov_reviewed_by', null);
  if (error) throw new Error('Đánh dấu duyệt cấp quản lý lỗi: ' + error.message);
  revalidatePath('/');
  revalidatePath('/dang-tin');
}

// P2-17: gỡ đánh dấu duyệt cấp quản lý — dùng khi cần rà lại nội dung.
export async function unmarkGovReviewed(formData: FormData) {
  const postId = String(formData.get('post_id') || '');
  if (!postId) return;

  if (authMode() === 'supabase') {
    const ok = await requireAdmin();
    if ('error' in ok) throw new Error(ok.error);
  }

  const client = getServerClient();
  const { error } = await client
    .from('hr_job_posts')
    .update({ gov_reviewed_by: null, gov_reviewed_at: null })
    .eq('id', postId);
  if (error) throw new Error('Gỡ duyệt cấp quản lý lỗi: ' + error.message);
  revalidatePath('/');
  revalidatePath('/dang-tin');
}

export async function toggleCvSource(formData: FormData) {
  const ok = await requireAdmin();
  if ('error' in ok) throw new Error(ok.error);

  const id = String(formData.get('id') || '');
  if (!id) return;

  const client = getServerClient();
  const { data: row } = await client.from('hr_cv_sources').select('id, bat, xac_nhan_phap_ly_boi, xac_nhan_luc').eq('id', id).maybeSingle();
  if (!row) throw new Error('Không tìm thấy nguồn.');

  // Chặn cứng: không cho bật nếu chưa xác nhận pháp lý, kể cả khi ai đó cố gọi thẳng action này.
  if (!row.bat && (!row.xac_nhan_phap_ly_boi || !row.xac_nhan_luc)) {
    throw new Error('Chưa có xác nhận pháp lý. Bấm "Xác nhận đã rà pháp lý" trước.');
  }

  const { error } = await client.from('hr_cv_sources').update({ bat: !row.bat }).eq('id', id);
  if (error) throw new Error('Không đổi được trạng thái: ' + error.message);
  revalidatePath('/cai-dat/nguon-cv');
}

// =====================================================================
// Thư viện media dùng cho bài tương tác: brand_assets + bucket post-images/library/
// =====================================================================

// Upload một file vào thư viện. Ảnh hoặc video, tự nhận diện kind theo mime.
// Tệp lưu ở bucket 'post-images' đường dẫn 'library/{uuid}.{ext}' (bucket đã public,
// URL trả về dán được vào bài đăng ngay). Bản ghi vào brand_assets với license='owned',
// license_note để trống — luôn phải là tư liệu công ty sở hữu (điều cấm 5 phần đối tác).
export async function uploadBrandAsset(formData: FormData) {
  const file = formData.get('file') as File | null;
  const titleInput = String(formData.get('title') || '').trim();
  if (!file || file.size === 0) return;

  const client = getServerClient();
  const mime = file.type || 'application/octet-stream';
  const kind = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : null;
  if (!kind) {
    try { await client.from('run_log').insert({ task: 'upload_brand_asset', status: 'error', detail: { name: file.name, mime, error: 'Chỉ nhận ảnh hoặc video' } }); } catch {}
    return;
  }

  try {
    const bytes = await file.arrayBuffer();
    const rawExt = file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg');
    const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || (kind === 'video' ? 'mp4' : 'jpg');
    const id = randomBytes(8).toString('hex');
    const path = `library/${id}.${ext}`;
    const { error: upErr } = await client.storage
      .from('post-images')
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) {
      try { await client.from('run_log').insert({ task: 'upload_brand_asset', status: 'error', detail: { name: file.name, error: upErr.message } }); } catch {}
      return;
    }
    const { data: { publicUrl } } = client.storage.from('post-images').getPublicUrl(path);
    const title = titleInput || file.name;
    const { error: insErr } = await client.from('brand_assets').insert({
      kind, title, storage_path: path,
      license: 'owned',
      mime, size_bytes: file.size, public_url: publicUrl,
    });
    if (insErr) {
      // Rollback storage nếu insert lỗi để không dồn file mồ côi.
      await client.storage.from('post-images').remove([path]);
      throw new Error(insErr.message);
    }
  } catch (err: unknown) {
    try { await client.from('run_log').insert({ task: 'upload_brand_asset', status: 'error', detail: { name: file.name, error: String(err) } }); } catch {}
  }

  revalidatePath('/tuong-tac');
}

// Xóa mềm một media trong thư viện. Giữ file trong storage để có thể phục hồi nếu cần;
// cleanup thật xóa qua công việc định kỳ, không xóa trực tiếp ở đây.
export async function deleteBrandAsset(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client
    .from('brand_assets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error('Không xóa được media: ' + error.message);
  revalidatePath('/tuong-tac');
}

// =====================================================================
// Soạn bài tương tác từ UI: gọi lại logic pickTopics + composeEngagementPost + pushApproval.
// Điều cấm 1: chỉ soạn nháp, đẩy approval_queue, người bấm Duyệt.
// =====================================================================
export async function queueEngagementNow(formData: FormData) {
  const count = Math.max(1, Math.min(5, Number(formData.get('count')) || 1));
  const themeRaw = String(formData.get('theme') || '').trim();
  const themes = themeRaw ? themeRaw.split(',').map((s) => s.trim()).filter(Boolean) : null;

  const client = getServerClient();

  // Import qua tên workspace package thay vì đường dẫn tương đối. Vercel monorepo webpack
  // không xử lý tốt dynamic import trỏ ra ngoài app root; qua package name thì stable.
  // Các module là JS thuần không có d.ts, cast qua unknown để TS không bám vào default-null narrowing.
  const [hrMod, coreMod] = await Promise.all([
    import('@sdvico/hr/post'),
    import('@sdvico/core'),
  ]);
  const pickTopics = (hrMod as unknown as { pickTopics: (arg: { count: number; themes: string[] | null; startAt: number }) => Array<{ id: string; chu_de: string; goc: string; tieu_de: string; noi_dung: string }> }).pickTopics;
  const composeEngagementPost = (hrMod as unknown as { composeEngagementPost: (t: unknown) => Promise<{ tieu_de: string; noi_dung: string; generator: string }> }).composeEngagementPost;
  const pushApproval = (coreMod as unknown as {
    pushApproval: (client: unknown, opts: { kind: string; title: string; payload: unknown; refTable?: string; refId?: string }) => Promise<unknown>;
    logRun: (client: unknown, opts: { task: string; status: string; detail?: unknown }) => Promise<unknown>;
  }).pushApproval;
  const logRun = (coreMod as unknown as {
    logRun: (client: unknown, opts: { task: string; status: string; detail?: unknown }) => Promise<unknown>;
  }).logRun;

  // Lấy Facebook platform_id (nếu có cấu hình) và số bài đã có để startAt xoay vòng.
  const { data: platforms } = await client.from('hr_platforms').select('id, ten, loai').eq('loai', 'social');
  const fb = (platforms || []).find((p: { ten: string }) => /face/i.test(p.ten));
  const platformId = fb ? (fb as { id: string }).id : null;
  const { count: existing } = await client
    .from('hr_job_posts')
    .select('id', { count: 'exact', head: true })
    .eq('loai', 'tuong_tac')
    .is('deleted_at', null);

  const topics = pickTopics({ count, themes, startAt: existing || 0 });
  const done: Array<{ topic: string; post_id: string; generator: string }> = [];

  for (const topic of topics) {
    // Bỏ qua góc bài đã có nháp chờ duyệt để tránh chất đống trùng.
    const { data: pending } = await client
      .from('hr_job_posts')
      .select('id')
      .eq('loai', 'tuong_tac')
      .eq('ghi_chu', `topic:${topic.id}`)
      .is('deleted_at', null)
      .in('trang_thai', ['draft', 'scheduled']);
    if ((pending || []).length > 0) continue;

    const { tieu_de, noi_dung, generator } = await composeEngagementPost(topic);

    const { data: post, error: e1 } = await client
      .from('hr_job_posts')
      .insert({
        job_id: null,
        platform_id: platformId,
        kenh: 'facebook',
        loai: 'tuong_tac',
        chu_de: topic.chu_de,
        tieu_de,
        noi_dung,
        ghi_chu: `topic:${topic.id}`,
        trang_thai: 'draft',
      })
      .select('id')
      .single();
    if (e1 || !post) continue;

    await pushApproval(client, {
      kind: 'hr_job_post',
      title: tieu_de,
      payload: { post_id: post.id, loai: 'tuong_tac', chu_de: topic.chu_de, kenh: 'facebook', body: noi_dung, nguon_soan: generator },
      refTable: 'hr_job_posts',
      refId: post.id,
    });

    done.push({ topic: topic.id, post_id: post.id, generator });
  }

  try {
    await logRun(client, { task: 'hr.queue_engagement', status: 'ok', detail: { queued: done.length, items: done, source: 'ui' } });
  } catch { /* logRun best-effort */ }

  revalidatePath('/tuong-tac');
  revalidatePath('/');
}
