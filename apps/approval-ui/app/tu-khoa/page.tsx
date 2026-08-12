import { getServerClient } from '../../lib/supabase-server';
import { addKeyword, deleteKeyword } from '../actions';

export const dynamic = 'force-dynamic';

const INTENT_LABEL: Record<string, string> = {
  thong_tin: 'Thông tin',
  thuong_mai: 'So sánh',
  giao_dich: 'Giao dịch',
  dieu_huong: 'Điều hướng'
};
// Màu badge theo nhóm ý định, để nhìn là phân biệt được ngay.
const INTENT_TONE: Record<string, string> = {
  thong_tin: 'web',
  thuong_mai: 'mkt',
  giao_dich: 'ok',
  dieu_huong: 'default'
};

type Kw = { id: string; keyword: string; intent: string | null; landing_url: string | null; source: string | null };

export default async function Page({ searchParams }: { searchParams: { intent?: string } }) {
  const client = getServerClient();
  const { data, error } = await client
    .from('mkt_keywords')
    .select('id, keyword, intent, landing_url, source, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const all = (data || []) as Kw[];
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.intent || 'khac', (counts.get(r.intent || 'khac') || 0) + 1);

  const selected = searchParams?.intent || null;
  const rows = selected ? all.filter((r) => (r.intent || 'khac') === selected) : all;
  const order = ['thong_tin', 'thuong_mai', 'giao_dich', 'dieu_huong'];
  const chipKeys = [...counts.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kho từ khóa</h1>
          <p className="sub">Từ khóa định hướng SEO, phân theo ý định tìm kiếm. Bấm nhóm để lọc.</p>
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <nav className="filters" aria-label="Theo ý định">
        <a className={`chip ${selected ? '' : 'on'}`} href="/tu-khoa">Tất cả <span className="n">{all.length}</span></a>
        {chipKeys.map((k) => (
          <a key={k} className={`chip tone-${INTENT_TONE[k] || 'default'} ${selected === k ? 'on' : ''}`} href={`/tu-khoa?intent=${encodeURIComponent(k)}`}>
            {INTENT_LABEL[k] || 'Khác'} <span className="n">{counts.get(k)}</span>
          </a>
        ))}
      </nav>

      <form className="factform" action={addKeyword}>
        <input name="keyword" placeholder="Từ khóa mới" aria-label="Từ khóa" required />
        <select name="intent" aria-label="Ý định" defaultValue="giao_dich">
          <option value="thong_tin">Thông tin</option>
          <option value="thuong_mai">So sánh</option>
          <option value="giao_dich">Giao dịch</option>
          <option value="dieu_huong">Điều hướng</option>
        </select>
        <input name="landing_url" placeholder="Trang đích (ví dụ /dich-vu)" aria-label="Trang đích" />
        <input name="source" placeholder="Nguồn (tổng đài, đối thủ...)" aria-label="Nguồn" />
        <button className="btn ok" type="submit">Thêm</button>
      </form>

      <ul className="list">
        {rows.map((r) => {
          const it = r.intent || 'khac';
          return (
            <li key={r.id} className="card kwrow">
              <div>
                <div className="title">{r.keyword}</div>
                <div className="badges">
                  <span className={`badge tone-${INTENT_TONE[it] || 'default'}`}>{INTENT_LABEL[it] || 'Khác'}</span>
                  {r.landing_url ? <span className="src">{r.landing_url}</span> : null}
                  {r.source ? <span className="src">nguồn: {r.source}</span> : null}
                </div>
              </div>
              <form action={deleteKeyword}>
                <input type="hidden" name="id" value={r.id} />
                <button className="btn no" type="submit" aria-label="Xóa từ khóa">Xóa</button>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
