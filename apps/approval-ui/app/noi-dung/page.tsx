import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative } from '../labels';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'demo' },
  review: { label: 'Chờ duyệt cấp quản lý', tone: 'no' },
  approved: { label: 'Đã duyệt', tone: 'ok' },
  published: { label: 'Đã đăng', tone: 'web' }
};

// Cờ tuân thủ. Đỏ khi chạm quy định, amber khi cần rà, xanh khi sạch.
function riskMeta(risk: string | undefined) {
  if (risk === 'red') return { label: 'Cờ đỏ, cấp quản lý duyệt', tone: 'no' };
  if (risk === 'amber') return { label: 'Cần rà, có cảnh báo', tone: 'demo' };
  return { label: 'Sạch', tone: 'ok' };
}

const INTENT_LABEL: Record<string, string> = {
  thong_tin: 'thông tin',
  thuong_mai: 'so sánh',
  giao_dich: 'giao dịch',
  dieu_huong: 'điều hướng'
};

type Flags = { regulation?: string[]; partner?: string[]; unverifiedSpecs?: string[]; testSpecs?: string[] };
type Brief = { keyword?: string; intent?: string; risk?: string; compliance?: Flags } | null;
type Content = {
  id: string;
  kind: string;
  title: string;
  brief: Brief;
  draft: string | null;
  status: string;
  needs_gov_review: boolean;
  created_at: string;
};

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('mkt_content')
    .select('id, kind, title, brief, draft, status, needs_gov_review, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const items = (data || []) as Content[];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Nội dung marketing</h1>
          <p className="sub">Bài sinh từ kho từ khóa, đã quét tuân thủ. Máy soạn, người bấm Duyệt.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {!error && items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📝</div>
          <p>Chưa có bài nào.</p>
          <p className="sub">Chạy <code>npm run content:run</code> để sinh bài từ kho từ khóa.</p>
        </div>
      ) : null}

      <ul className="list">
        {items.map((c) => {
          const st = STATUS[c.status] || { label: c.status, tone: 'default' };
          const risk = riskMeta(c.brief?.risk);
          const intent = c.brief?.intent ? INTENT_LABEL[c.brief.intent] || c.brief.intent : null;
          const f = c.brief?.compliance || {};
          const words = c.draft ? c.draft.trim().split(/\s+/).length : 0;
          return (
            <li key={c.id} className={`card tone-${risk.tone}`}>
              <div className="head">
                <span className="cand-name">{c.title}</span>
                <time className="time" dateTime={c.created_at}>{formatRelative(c.created_at)}</time>
              </div>
              <div className="stages">
                <span className={`stage tone-${risk.tone}`}>{risk.label}</span>
                <span className={`stage tone-${st.tone}`}>{st.label}</span>
                {intent ? <span className="src">ý định: {intent}</span> : null}
                {c.brief?.keyword ? <span className="src">từ khóa: {c.brief.keyword}</span> : null}
              </div>

              {(f.regulation?.length || f.partner?.length || f.unverifiedSpecs?.length || f.testSpecs?.length) ? (
                <dl className="fields">
                  {f.regulation?.length ? (
                    <div className="field"><dt>Chạm quy định</dt><dd>{f.regulation.join(', ')}</dd></div>
                  ) : null}
                  {f.partner?.length ? (
                    <div className="field"><dt>Nhắc đối tác</dt><dd>{f.partner.join(', ')}</dd></div>
                  ) : null}
                  {f.unverifiedSpecs?.length ? (
                    <div className="field"><dt>Thông số chưa xác nhận</dt><dd>{f.unverifiedSpecs.join(', ')}</dd></div>
                  ) : null}
                  {f.testSpecs?.length ? (
                    <div className="field"><dt>Thông số TEST (chưa xác nhận)</dt><dd>{f.testSpecs.join(', ')}</dd></div>
                  ) : null}
                </dl>
              ) : null}

              {c.draft ? (
                <details className="raw">
                  <summary>Xem bản nháp ({words} từ)</summary>
                  <pre>{c.draft}</pre>
                </details>
              ) : (
                <p className="muted">Chưa có bản nháp.</p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
