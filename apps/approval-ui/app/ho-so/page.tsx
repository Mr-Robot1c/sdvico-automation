import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import CandidateList, { type CandView } from '../candidate-list';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
export const dynamic = 'force-dynamic';

const BUCKET = process.env.CV_BUCKET || 'cv';

type App = { id: string; stage: string; created_at: string };
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

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('hr_candidates')
    .select(
      'id, full_name, email, phone, source, cv_storage_path, cv_json, dedup_key, consent_at, retention_until, created_at, hr_applications(id, stage, created_at)'
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data || []) as Cand[];

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
    return {
      id: c.id,
      name: c.full_name || 'Chưa rõ tên',
      email: c.email || '',
      phone: c.phone || '',
      source: c.source,
      dedupKey: c.dedup_key || '',
      subject: c.cv_json?.source_message?.subject || '',
      attachments: (c.cv_json?.attachments || []).map((a) => a.filename).filter(Boolean).join(', '),
      consent:
        (c.consent_at ? new Date(c.consent_at).toLocaleDateString('vi-VN') : '—') + ' · ' + (c.retention_until || '—'),
      createdAt: c.created_at,
      stages: (c.hr_applications || []).map((a) => a.stage),
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
          <p className="sub">CV nạp tự động từ hộp thư. Máy xếp, người quyết, không tự loại ai.</p>
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

      {!error && candidates.length > 0 ? <CandidateList candidates={candidates} /> : null}
    </main>
  );
}
