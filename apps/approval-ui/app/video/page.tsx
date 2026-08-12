import { getServerClient } from '../../lib/supabase-server';
import { editDraft } from '../actions';
import { formatRelative } from '../labels';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'demo' },
  review: { label: 'Chờ duyệt cấp quản lý', tone: 'no' },
  approved: { label: 'Đã duyệt', tone: 'ok' },
  published: { label: 'Đã đăng', tone: 'web' }
};

type Vid = { id: string; title: string; brief: any; draft: string | null; status: string; created_at: string };

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('mkt_content')
    .select('id, title, brief, draft, status, created_at')
    .eq('kind', 'video')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data || []) as Vid[];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kịch bản video</h1>
          <p className="sub">Máy sinh kịch bản. Đội video quay bằng tư liệu thật rồi dựng ra video.</p>
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <div className="pipeline">
        <span className="pipe-step">1. Máy sinh kịch bản (đã có)</span>
        <span className="pipe-step">2. Người duyệt kịch bản</span>
        <span className="pipe-step">3. Quay bằng tư liệu thật trong brand_assets</span>
        <span className="pipe-step">4. Whisper phụ đề + FFmpeg dựng video</span>
        <span className="pipe-step">5. Duyệt video rồi đăng</span>
      </div>

      {!error && rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🎬</div>
          <p>Chưa có kịch bản video nào.</p>
          <p className="sub">Bấm Sinh nội dung ở Hàng đợi duyệt để máy soạn thêm.</p>
        </div>
      ) : null}

      <ul className="list">
        {rows.map((c) => {
          const st = STATUS[c.status] || { label: c.status, tone: 'default' };
          const kw = c.brief?.keyword as string | undefined;
          return (
            <li key={c.id} className="card tone-mkt">
              <div className="head">
                <span className="kind"><span aria-hidden="true">🎬</span> Kịch bản 60 giây</span>
                <time className="time" dateTime={c.created_at}>{formatRelative(c.created_at)}</time>
              </div>
              <div className="title">{c.title}</div>
              <div className="badges">
                <span className={`badge tone-${st.tone}`}>{st.label}</span>
                {kw ? <span className="src">từ khóa: {kw}</span> : null}
              </div>
              {c.draft ? <div className="draftbox">{c.draft}</div> : null}
              <details className="raw editbox">
                <summary>Chỉnh sửa kịch bản</summary>
                <form action={editDraft} className="editform">
                  <input type="hidden" name="content_id" value={c.id} />
                  <textarea name="draft" defaultValue={c.draft || ''} rows={10} aria-label="Kịch bản" />
                  <button className="btn ok" type="submit">Lưu chỉnh sửa</button>
                </form>
              </details>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
