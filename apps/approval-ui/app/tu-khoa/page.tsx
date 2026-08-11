import { getServerClient } from '../../lib/supabase-server';
import { addKeyword, deleteKeyword } from '../actions';

export const dynamic = 'force-dynamic';

const INTENT_LABEL: Record<string, string> = {
  thong_tin: 'thông tin',
  thuong_mai: 'so sánh',
  giao_dich: 'giao dịch',
  dieu_huong: 'điều hướng'
};

type Kw = { id: string; keyword: string; intent: string | null; landing_url: string | null; source: string | null; priority: number | null };

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('mkt_keywords')
    .select('id, keyword, intent, landing_url, source, priority, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (data || []) as Kw[];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.intent || 'khác', (counts.get(r.intent || 'khác') || 0) + 1);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kho từ khóa</h1>
          <p className="sub">Từ khóa định hướng SEO. Thêm hoặc bớt để cỗ máy nội dung chọn viết.</p>
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <nav className="filters" aria-label="Theo ý định">
        <span className="chip on">Tất cả <span className="n">{rows.length}</span></span>
        {[...counts.entries()].map(([k, n]) => (
          <span className="chip" key={k}>{INTENT_LABEL[k] || k} <span className="n">{n}</span></span>
        ))}
      </nav>

      <form className="factform" action={addKeyword}>
        <input name="keyword" placeholder="Từ khóa mới" aria-label="Từ khóa" required />
        <select name="intent" aria-label="Ý định" defaultValue="giao_dich">
          <option value="thong_tin">thông tin</option>
          <option value="thuong_mai">so sánh</option>
          <option value="giao_dich">giao dịch</option>
          <option value="dieu_huong">điều hướng</option>
        </select>
        <input name="landing_url" placeholder="Trang đích (ví dụ /dich-vu)" aria-label="Trang đích" />
        <input name="source" placeholder="Nguồn (tổng đài, đối thủ...)" aria-label="Nguồn" />
        <button className="btn ok" type="submit">Thêm</button>
      </form>

      <ul className="list">
        {rows.map((r) => (
          <li key={r.id} className="card tone-mkt kwrow">
            <div>
              <div className="title">{r.keyword}</div>
              <div className="stages">
                <span className="src">{INTENT_LABEL[r.intent || ''] || r.intent || 'khác'}</span>
                {r.landing_url ? <span className="src">{r.landing_url}</span> : null}
                {r.source ? <span className="src">nguồn: {r.source}</span> : null}
              </div>
            </div>
            <form action={deleteKeyword}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn no" type="submit" aria-label="Xóa từ khóa">Xóa</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
