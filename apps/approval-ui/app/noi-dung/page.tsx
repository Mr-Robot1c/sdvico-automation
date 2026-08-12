import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { editDraft } from '../actions';
import { formatRelative, formatLabel, intentLabel, riskMeta, COMPLIANCE_LABELS } from '../labels';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'demo' },
  review: { label: 'Chờ duyệt cấp quản lý', tone: 'no' },
  approved: { label: 'Đã duyệt', tone: 'ok' },
  published: { label: 'Đã đăng', tone: 'web' }
};

type Flags = Record<string, string[] | undefined>;
type Brief = { keyword?: string; intent?: string; risk?: string; compliance?: Flags } | null;
type Content = { id: string; kind: string; title: string; brief: Brief; draft: string | null; status: string; created_at: string };

export default async function Page({ searchParams }: { searchParams: { loai?: string } }) {
  const tab = searchParams?.loai === 'video' ? 'video' : 'baiviet';
  const kinds = tab === 'video' ? ['video'] : ['article', 'social'];

  const client = getServerClient();
  const { data, error } = await client
    .from('mkt_content')
    .select('id, kind, title, brief, draft, status, created_at')
    .in('kind', kinds)
    .order('created_at', { ascending: false })
    .limit(100);

  const items = (data || []) as Content[];

  const [{ count: cBai }, { count: cVid }] = await Promise.all([
    client.from('mkt_content').select('*', { count: 'exact', head: true }).in('kind', ['article', 'social']),
    client.from('mkt_content').select('*', { count: 'exact', head: true }).eq('kind', 'video')
  ]);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Nội dung marketing</h1>
          <p className="sub">Bài sinh từ kho từ khóa, đã quét tuân thủ. Máy soạn, người bấm Duyệt.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      <nav className="filters" aria-label="Loại nội dung">
        <a className={`chip ${tab === 'baiviet' ? 'on' : ''}`} href="/noi-dung">
          <span aria-hidden="true">📝</span> Bài viết <span className="n">{cBai ?? 0}</span>
        </a>
        <a className={`chip ${tab === 'video' ? 'on' : ''}`} href="/noi-dung?loai=video">
          <span aria-hidden="true">🎬</span> Video <span className="n">{cVid ?? 0}</span>
        </a>
      </nav>

      {tab === 'video' ? (
        <div className="pipeline">
          <span className="pipe-step">1. Máy sinh kịch bản</span>
          <span className="pipe-step">2. Người duyệt</span>
          <span className="pipe-step">3. Quay bằng tư liệu thật</span>
          <span className="pipe-step">4. Whisper + FFmpeg dựng</span>
          <span className="pipe-step">5. Duyệt và đăng</span>
        </div>
      ) : null}

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {!error && items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">{tab === 'video' ? '🎬' : '📝'}</div>
          <p>Chưa có {tab === 'video' ? 'kịch bản video' : 'bài viết'} nào.</p>
          <p className="sub">Bấm Sinh nội dung ở Hàng đợi duyệt để máy soạn thêm.</p>
        </div>
      ) : null}

      <ul className="list">
        {items.map((c) => {
          const st = STATUS[c.status] || { label: c.status, tone: 'default' };
          const risk = riskMeta(c.brief?.risk);
          const f: Flags = c.brief?.compliance || {};
          const flagRows = Object.entries(COMPLIANCE_LABELS)
            .map(([k, label]) => ({ label, items: Array.isArray(f[k]) ? (f[k] as string[]) : [] }))
            .filter((x) => x.items.length > 0);
          return (
            <li key={c.id} className="card tone-mkt">
              <div className="head">
                <span className="kind">{formatLabel(c.kind)}</span>
                <time className="time" dateTime={c.created_at}>{formatRelative(c.created_at)}</time>
              </div>
              <div className="title">{c.title}</div>
              <div className="badges">
                <span className={`badge tone-${risk.tone}`}>{risk.label}</span>
                <span className={`badge tone-${st.tone}`}>{st.label}</span>
                {c.brief?.intent ? <span className="badge">{intentLabel(c.brief.intent)}</span> : null}
                {c.brief?.keyword ? <span className="src">từ khóa: {c.brief.keyword}</span> : null}
              </div>

              {flagRows.length ? (
                <div className="flagline">
                  {flagRows.map((x) => (
                    <span className="flagchip" key={x.label}>{x.label}: {x.items.join(', ')}</span>
                  ))}
                </div>
              ) : null}

              {c.draft ? (
                <>
                  <div className="draftbox">{c.draft}</div>
                  <details className="raw editbox">
                    <summary>Chỉnh sửa</summary>
                    <form action={editDraft} className="editform">
                      <input type="hidden" name="content_id" value={c.id} />
                      <textarea name="draft" defaultValue={c.draft} rows={10} aria-label="Bản nháp" />
                      <button className="btn ok" type="submit">Lưu chỉnh sửa</button>
                    </form>
                  </details>
                </>
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
