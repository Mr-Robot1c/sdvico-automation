import { getServerClient } from '../../lib/supabase-server';
import { addFact, deleteFact } from '../actions';

export const dynamic = 'force-dynamic';

type Fact = {
  id: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  attribute: string;
  value: string;
  source: string | null;
  confirmed_by: string | null;
  verified: boolean;
};

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('product_facts')
    .select('id, category, brand, model, attribute, value, source, confirmed_by, verified')
    .order('verified', { ascending: false })
    .order('created_at', { ascending: false });

  const rows = (data || []) as Fact[];
  const verified = rows.filter((r) => r.verified).length;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Nguồn dữ kiện sản phẩm</h1>
          <p className="sub">Phòng Kinh doanh nhập thông số thật ở đây. Nội dung chỉ được nêu số có trong bảng này.</p>
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <p className="err" role="status">
        Có {verified} dòng đã xác nhận, {rows.length - verified} dòng test. Dòng test chưa xác nhận sẽ khiến bài bị gắn cảnh báo, không được coi là sạch.
      </p>

      <form className="factform" action={addFact}>
        <input name="brand" placeholder="Hãng" aria-label="Hãng" />
        <input name="model" placeholder="Model" aria-label="Model" />
        <input name="attribute" placeholder="Thông số (vd khang_nuoc)" aria-label="Thông số" required />
        <input name="value" placeholder="Giá trị (vd IP67)" aria-label="Giá trị" required />
        <input name="source" placeholder="Nguồn tài liệu" aria-label="Nguồn" />
        <input name="confirmed_by" placeholder="Người xác nhận" aria-label="Người xác nhận" />
        <label className="chk"><input type="checkbox" name="verified" /> Đã xác nhận thật</label>
        <button className="btn ok" type="submit">Thêm</button>
      </form>

      <ul className="list">
        {rows.map((r) => (
          <li key={r.id} className={`card kwrow ${r.verified ? 'tone-ok' : 'tone-demo'}`}>
            <div>
              <div className="title">{[r.brand, r.model].filter(Boolean).join(' ') || '(chưa rõ model)'}</div>
              <div className="stages">
                <span className={`stage ${r.verified ? 'tone-ok' : 'tone-demo'}`}>{r.verified ? 'Đã xác nhận' : 'Test, chưa xác nhận'}</span>
                <span className="src">{r.attribute}: {r.value}</span>
                {r.source ? <span className="src">nguồn: {r.source}</span> : null}
                {r.confirmed_by ? <span className="src">bởi: {r.confirmed_by}</span> : null}
              </div>
            </div>
            <form action={deleteFact}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn no" type="submit" aria-label="Xóa dữ kiện">Xóa</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
