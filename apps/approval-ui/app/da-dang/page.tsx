import { getServerClient } from '../../lib/supabase-server';
import { formatRelative } from '../labels';

export const dynamic = 'force-dynamic';

const CHANNEL_LABEL: Record<string, string> = {
  website: 'Website', facebook: 'Facebook', youtube: 'YouTube'
};
const STATUS: Record<string, { label: string; tone: string }> = {
  scheduled: { label: 'Đã lên lịch', tone: 'demo' },
  published: { label: 'Đã đăng', tone: 'ok' },
  failed: { label: 'Lỗi', tone: 'no' },
  held: { label: 'Tạm giữ', tone: 'web' }
};

type Post = {
  id: string;
  channel: string;
  status: string;
  external_url: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  mkt_content: { title: string | null } | null;
};

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('mkt_posts')
    .select('id, channel, status, external_url, published_at, scheduled_at, mkt_content(title)')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data || []) as unknown as Post[];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Lịch sử xuất bản</h1>
          <p className="sub">Bài đã đăng qua hệ thống, để truy xuất khi cần.</p>
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {!error && rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🌐</div>
          <p>Chưa có bài nào được đăng.</p>
          <p className="sub">Bài duyệt xong và worker xuất bản sẽ hiện ở đây.</p>
        </div>
      ) : null}

      <ul className="list">
        {rows.map((p) => {
          const st = STATUS[p.status] || { label: p.status, tone: 'default' };
          const when = p.published_at || p.scheduled_at;
          return (
            <li key={p.id} className={`card tone-${st.tone}`}>
              <div className="head">
                <span className="kind">{CHANNEL_LABEL[p.channel] || p.channel}</span>
                {when ? <time className="time" dateTime={when}>{formatRelative(when)}</time> : null}
              </div>
              <div className="title">{p.mkt_content?.title || '(không rõ tiêu đề)'}</div>
              <div className="stages">
                <span className={`stage tone-${st.tone}`}>{st.label}</span>
                {p.external_url ? <a className="src" href={p.external_url} target="_blank" rel="noreferrer">Xem bài</a> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
