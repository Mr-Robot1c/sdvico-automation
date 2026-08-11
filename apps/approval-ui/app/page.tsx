import { getServerClient } from '../lib/supabase-server';
import AutoRefresh from './auto-refresh';
import DecideActions from './decide-actions';
import { kindMeta, formatRelative, payloadRows } from './labels';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
export const dynamic = 'force-dynamic';

type Item = {
  id: string;
  kind: string;
  title: string;
  payload: unknown;
  created_at: string;
};

export default async function Page({ searchParams }: { searchParams: { kind?: string } }) {
  const client = getServerClient();
  const { data, error } = await client
    .from('approval_queue')
    .select('id, kind, title, payload, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const all = (data || []) as Item[];

  // Đếm theo loại để dựng thanh lọc.
  const counts = new Map<string, number>();
  for (const it of all) counts.set(it.kind, (counts.get(it.kind) || 0) + 1);

  const selected = searchParams?.kind || null;
  const items = selected ? all.filter((it) => it.kind === selected) : all;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Duyệt &amp; gửi</h1>
          <p className="sub">Nội dung máy đã soạn chờ bạn gửi: thư mời phỏng vấn, bài marketing. Xem rồi Duyệt hoặc Từ chối (điều cấm 1).</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {error ? (
        <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p>
      ) : null}

      {!error && all.length > 0 ? (
        <nav className="filters" aria-label="Lọc theo loại">
          <a className={`chip ${selected ? '' : 'on'}`} href="/">
            Tất cả <span className="n">{all.length}</span>
          </a>
          {[...counts.entries()].map(([kind, n]) => {
            const meta = kindMeta(kind);
            return (
              <a
                key={kind}
                className={`chip ${selected === kind ? 'on' : ''}`}
                href={`/?kind=${encodeURIComponent(kind)}`}
              >
                <span aria-hidden="true">{meta.icon}</span> {meta.label} <span className="n">{n}</span>
              </a>
            );
          })}
        </nav>
      ) : null}

      {!error && all.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">✓</div>
          <p>Không có mục nào chờ duyệt.</p>
          <p className="sub">Khi máy soạn nội dung mới, mục sẽ hiện ở đây.</p>
        </div>
      ) : null}

      <ul className="list">
        {items.map((item) => {
          const meta = kindMeta(item.kind);
          const rows = payloadRows(item.payload);
          return (
            <li key={item.id} className={`card tone-${meta.tone}`}>
              <div className="head">
                <span className="kind">
                  <span aria-hidden="true">{meta.icon}</span> {meta.label}
                </span>
                <time className="time" dateTime={item.created_at}>{formatRelative(item.created_at)}</time>
              </div>

              <div className="title">{item.title}</div>

              {rows.length > 0 ? (
                <dl className="fields">
                  {rows.map((r) => (
                    <div className={`field ${r.long ? 'field-long' : ''}`} key={r.key}>
                      <dt>{r.label}</dt>
                      <dd>{r.long ? <pre>{r.value}</pre> : r.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <DecideActions id={item.id} title={item.title} />
            </li>
          );
        })}
      </ul>
    </main>
  );
}
