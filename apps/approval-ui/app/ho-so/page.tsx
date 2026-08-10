import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative, stageMeta, sourceLabel } from '../labels';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
export const dynamic = 'force-dynamic';

const BUCKET = process.env.CV_BUCKET || 'cv';

type App = { id: string; stage: string; created_at: string };
type CvJson = {
  raw_text?: string;
  attachments?: { filename?: string; kind?: string; chars?: number; needsOcr?: boolean; error?: string | null }[];
  source_message?: { from?: string; subject?: string } | null;
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

  const cands = (data || []) as Cand[];

  // Tạo đường tải CV có ký, hết hạn sau một giờ. Bucket riêng tư nên phải ký mới tải được.
  const signed = new Map<string, string>();
  await Promise.all(
    cands
      .filter((c) => c.cv_storage_path)
      .map(async (c) => {
        const path = c.cv_storage_path!.replace(new RegExp('^' + BUCKET + '/'), '');
        const { data: s } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (s?.signedUrl) signed.set(c.id, s.signedUrl);
      })
  );

  // Thống kê theo trạng thái hồ sơ.
  const stageCount = new Map<string, number>();
  for (const c of cands) for (const a of c.hr_applications || []) stageCount.set(a.stage, (stageCount.get(a.stage) || 0) + 1);

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

      {!error && cands.length > 0 ? (
        <div className="stats">
          <div className="stat">
            <div className="stat-n">{cands.length}</div>
            <div className="stat-l">Tổng hồ sơ</div>
          </div>
          {[...stageCount.entries()].map(([stage, n]) => (
            <div className="stat" key={stage}>
              <div className="stat-n">{n}</div>
              <div className="stat-l">{stageMeta(stage).label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {!error && cands.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📭</div>
          <p>Chưa có hồ sơ nào.</p>
          <p className="sub">Khi có CV mới trong hộp thư, hồ sơ sẽ hiện ở đây sau lượt nạp gần nhất.</p>
        </div>
      ) : null}

      <ul className="list">
        {cands.map((c) => {
          const atts = c.cv_json?.attachments || [];
          const msg = c.cv_json?.source_message || null;
          const raw = (c.cv_json?.raw_text || '').trim();
          const url = signed.get(c.id) || null;
          return (
            <li key={c.id} className="card tone-hr">
              <div className="head">
                <span className="cand-name">{c.full_name || 'Chưa rõ tên'}</span>
                <time className="time" dateTime={c.created_at}>{formatRelative(c.created_at)}</time>
              </div>

              <div className="stages">
                {(c.hr_applications || []).length === 0 ? (
                  <span className="stage tone-default">Chưa có hồ sơ ứng tuyển</span>
                ) : (
                  (c.hr_applications || []).map((a) => {
                    const m = stageMeta(a.stage);
                    return <span key={a.id} className={`stage tone-${m.tone}`}>{m.label}</span>;
                  })
                )}
                <span className="src">Nguồn: {sourceLabel(c.source)}</span>
              </div>

              <dl className="fields">
                <div className="field"><dt>Email</dt><dd>{c.email || '—'}</dd></div>
                <div className="field"><dt>Điện thoại</dt><dd>{c.phone || '—'}</dd></div>
                <div className="field"><dt>Khóa khử trùng</dt><dd>{c.dedup_key || '—'}</dd></div>
                {msg?.subject ? <div className="field"><dt>Thư nguồn</dt><dd>{msg.subject}</dd></div> : null}
                <div className="field"><dt>Đính kèm</dt><dd>{atts.length ? atts.map((a) => a.filename).join(', ') : '—'}</dd></div>
                <div className="field"><dt>Đồng ý / lưu tới</dt><dd>{c.consent_at ? new Date(c.consent_at).toLocaleDateString('vi-VN') : '—'} · {c.retention_until || '—'}</dd></div>
              </dl>

              {raw ? (
                <details className="raw">
                  <summary>Xem nội dung CV đã trích ({raw.length} ký tự)</summary>
                  <pre>{raw.slice(0, 4000)}</pre>
                </details>
              ) : null}

              <div className="row">
                {url ? (
                  <a className="btn ghost" href={url} target="_blank" rel="noopener noreferrer">Tải CV gốc</a>
                ) : (
                  <span className="muted">Không có tệp CV</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
