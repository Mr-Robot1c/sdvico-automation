import { getServerClient } from '../lib/supabase-server';
import AutoRefresh from './auto-refresh';
import DecideActions from './decide-actions';
import { editDraft } from './actions';
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

// Cờ đỏ: chạm quy định nhà nước, cần cấp quản lý duyệt trước (Điều cấm 3).
function isRedFlag(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return p.risk === 'red' || p.needs_manager_approval === true;
}

// Lấy content_id từ payload (bài marketing) để nạp bản nháp cho nút Chỉnh sửa.
function contentIdOf(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  return typeof p.content_id === 'string' ? p.content_id : null;
}

export default async function Page({ searchParams }: { searchParams: { kind?: string } }) {
  const client = getServerClient();
  const { data, error } = await client
    .from('approval_queue')
    .select('id, kind, title, payload, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const raw = (data || []) as Item[];
  // Bản deploy marketing-only chỉ hiện mục marketing (kind bắt đầu bằng 'mkt'), ẩn HR và demo.
  const marketingOnly = process.env.MARKETING_ONLY === 'true' || process.env.MARKETING_ONLY === '1';
  const all = marketingOnly ? raw.filter((it) => it.kind.startsWith('mkt')) : raw;

  // Đếm theo loại để dựng thanh lọc.
  const counts = new Map<string, number>();
  for (const it of all) counts.set(it.kind, (counts.get(it.kind) || 0) + 1);

  const selected = searchParams?.kind || null;
  const filtered = selected ? all.filter((it) => it.kind === selected) : all;
  // Cờ đỏ (chạm quy định, cần cấp quản lý) xếp lên đầu. Sort ổn định nên phần còn lại giữ thứ tự cũ.
  const items = [...filtered].sort((a, b) => Number(isRedFlag(b.payload)) - Number(isRedFlag(a.payload)));
  const redCount = filtered.filter((it) => isRedFlag(it.payload)).length;

  // Nạp bản nháp cho các bài marketing, để nút Chỉnh sửa preload đúng nội dung.
  const contentIds = items.map((it) => contentIdOf(it.payload)).filter((x): x is string => !!x);
  const drafts = new Map<string, string>();
  if (contentIds.length) {
    const { data: cs } = await client.from('mkt_content').select('id, draft').in('id', contentIds);
    for (const c of cs || []) drafts.set(c.id as string, (c.draft as string) || '');
  }

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Hàng đợi duyệt</h1>
          <p className="sub">Máy soạn, người bấm. Xem từng mục rồi Duyệt hoặc Từ chối.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {error ? (
        <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p>
      ) : null}

      {!error && redCount > 0 ? (
        <p className="err" role="status">
          {redCount} mục cờ đỏ chạm quy định, cần cấp quản lý duyệt trước. Đã xếp lên đầu.
        </p>
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

              {isRedFlag(item.payload) ? (
                <div className="stages">
                  <span className="stage tone-no">Cờ đỏ, cấp quản lý duyệt</span>
                </div>
              ) : null}

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

              {(() => {
                const cid = contentIdOf(item.payload);
                const draft = cid ? drafts.get(cid) : undefined;
                return cid && draft !== undefined ? (
                  <details className="raw editbox">
                    <summary>Chỉnh sửa bản nháp</summary>
                    <form action={editDraft} className="editform">
                      <input type="hidden" name="content_id" value={cid} />
                      <textarea name="draft" defaultValue={draft} rows={10} aria-label="Bản nháp" />
                      <button className="btn ok" type="submit">Lưu chỉnh sửa</button>
                    </form>
                  </details>
                ) : null;
              })()}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
