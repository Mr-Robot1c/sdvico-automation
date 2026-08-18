import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import CandidateList, { type CandView } from '../candidate-list';
import { axisLabel, formatDate } from '../labels';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
export const dynamic = 'force-dynamic';

const BUCKET = process.env.CV_BUCKET || 'cv';

type ScoreJson = { diem_tong?: number; diem_tung_truc?: Record<string, number> } | null;
type App = {
  id: string;
  stage: string;
  created_at: string;
  score_json: ScoreJson;
  summary: string | null;
  strengths: string[] | null;
  clarifications: string[] | null;
  job_id: string | null;
};
type CvJson = {
  raw_text?: string;
  attachments?: { filename?: string }[];
  source_message?: { subject?: string } | null;
};
type Cand = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  cv_storage_path: string | null;
  cv_json: CvJson | null;
  dedup_key: string | null;
  consent_at: string | null;
  retention_until: string | null;
  created_at: string;
  hr_applications: App[];
};
type InterviewPayload = {
  cau_hoi_ky_thuat?: string;
  cau_hoi_hanh_vi?: string;
  bai_ve_nha?: string;
  khung_gio?: string[];
} | null;

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('hr_candidates')
    .select(
      'id, full_name, email, phone, source, cv_storage_path, cv_json, dedup_key, consent_at, retention_until, created_at, hr_applications(id, stage, created_at, score_json, summary, strengths, clarifications, job_id)'
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data || []) as Cand[];

  // Bản đồ id → tên vị trí (gồm cả vị trí đã đóng) để cột "Vị trí" trong bảng hồ sơ luôn
  // đọc được tên, thay vì mã UUID hoặc trống khi vị trí đã kết thúc tuyển.
  const jobTitleMap = new Map<string, string>();
  const { data: allJobsRes } = await client.from('hr_jobs').select('id, title');
  for (const j of ((allJobsRes || []) as Array<{ id: string; title: string }>)) {
    jobTitleMap.set(j.id, j.title);
  }

  // Thư mời phỏng vấn đã soạn, gắn theo mã hồ sơ (ref_id), để hiện tab Câu hỏi phỏng vấn.
  const interviews = new Map<string, InterviewPayload>();
  const { data: iv } = await client
    .from('approval_queue')
    .select('ref_id, payload')
    .eq('kind', 'hr_interview');
  for (const r of iv || []) if (r.ref_id) interviews.set(r.ref_id as string, r.payload as InterviewPayload);

  // Ghi chú theo hồ sơ. Lấy riêng và bỏ qua nếu chưa chạy migration (cột note chưa có).
  const notes = new Map<string, string>();
  const { data: nrows } = await client.from('hr_applications').select('id, note');
  for (const r of nrows || []) if (r.note) notes.set(r.id as string, r.note as string);

  // Khung giờ phỏng vấn mong muốn (gợi ý cho người duyệt chọn).
  const { data: winCfg } = await client.from('app_config').select('value').eq('key', 'interview_windows').maybeSingle();
  const windows: string[] = Array.isArray(winCfg?.value) && winCfg!.value.length ? (winCfg!.value as string[]) : ['09:00', '10:30', '14:00', '15:30'];

  // Mốc đã phỏng vấn (cột có thể chưa migrate — đọc an toàn).
  const interviewedAt = new Map<string, string>();
  const { data: irows } = await client.from('hr_applications').select('id, interviewed_at');
  for (const r of (irows || []) as Array<{ id: string; interviewed_at: string | null }>) {
    if (r.interviewed_at) interviewedAt.set(r.id, r.interviewed_at);
  }

  // Mốc đã nhận việc thật (khác offer = chỉ mới mời). Cột có thể chưa migrate — đọc an toàn.
  const hiredAt = new Map<string, string>();
  const { data: hrows } = await client.from('hr_applications').select('id, hired_at');
  for (const r of (hrows || []) as Array<{ id: string; hired_at: string | null }>) {
    if (r.hired_at) hiredAt.set(r.id, r.hired_at);
  }

  // Vị trí đang tuyển, để mời lại ứng viên đã từ chối cho một việc khác phù hợp.
  const { data: jobRows } = await client.from('hr_jobs').select('id, title').eq('status', 'open').order('created_at', { ascending: false });
  const openJobs = ((jobRows || []) as Array<{ id: string; title: string }>).map((j) => ({ id: j.id, title: j.title }));

  // Đường tải CV có ký, hết hạn sau một giờ. Bucket riêng tư nên phải ký mới tải được.
  const signed = new Map<string, string>();
  await Promise.all(
    rows
      .filter((c) => c.cv_storage_path)
      .map(async (c) => {
        const path = c.cv_storage_path!.replace(new RegExp('^' + BUCKET + '/'), '');
        const { data: s } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (s?.signedUrl) signed.set(c.id, s.signedUrl);
      })
  );

  // Chuẩn hóa thành dữ liệu phẳng để đưa xuống component lọc phía trình duyệt.
  const candidates: CandView[] = rows.map((c) => {
    const raw = (c.cv_json?.raw_text || '').trim();
    const app = (c.hr_applications || [])[0] || null;
    const axes = app?.score_json?.diem_tung_truc || {};
    const scoreAxes = Object.entries(axes).map(([k, v]) => ({ label: axisLabel(k), diem: Number(v) || 0 }));
    const ivp = app?.id ? interviews.get(app.id) || null : null;

    return {
      id: c.id,
      name: c.full_name || 'Chưa rõ tên',
      email: c.email || '',
      phone: c.phone || '',
      source: c.source,
      dedupKey: c.dedup_key || '',
      subject: c.cv_json?.source_message?.subject || '',
      viTri: (app?.job_id && jobTitleMap.get(app.job_id)) || '',
      attachments: (c.cv_json?.attachments || []).map((a) => a.filename).filter(Boolean).join(', '),
      consent:
        (c.consent_at ? formatDate(c.consent_at) : 'Chưa có') +
        ' · lưu tới ' +
        (c.retention_until ? formatDate(c.retention_until) : 'chưa đặt'),
      createdAt: c.created_at,
      stages: (c.hr_applications || []).map((a) => a.stage),
      appId: app?.id || null,
      appStage: app?.stage || null,
      interviewedAt: (app?.id && interviewedAt.get(app.id)) || null,
      hiredAt: (app?.id && hiredAt.get(app.id)) || null,
      sourced: (c.source || '').startsWith('sourced'),
      note: (app?.id && notes.get(app.id)) || '',
      score: typeof app?.score_json?.diem_tong === 'number' ? app.score_json!.diem_tong! : null,
      scoreAxes,
      summary: app?.summary || '',
      strengths: app?.strengths || [],
      clarifications: app?.clarifications || [],
      interview: ivp
        ? {
            kyThuat: ivp.cau_hoi_ky_thuat || '',
            hanhVi: ivp.cau_hoi_hanh_vi || '',
            baiVeNha: ivp.bai_ve_nha || '',
            khungGio: ivp.khung_gio || []
          }
        : null,
      rawLen: raw.length,
      raw: raw.slice(0, 4000),
      cvUrl: signed.get(c.id) || null
    };
  });

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Hồ sơ ứng viên</h1>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {!error && candidates.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📭</div>
          <p>Chưa có hồ sơ nào.</p>
          <p className="sub">Khi có CV mới trong hộp thư, hồ sơ sẽ hiện ở đây sau lượt nạp gần nhất.</p>
        </div>
      ) : null}

      {!error && candidates.length > 0 ? <CandidateList candidates={candidates} windows={windows} openJobs={openJobs} /> : null}
    </main>
  );
}
