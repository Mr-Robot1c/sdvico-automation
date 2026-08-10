import { getServerClient } from '../lib/supabase-server';
import { decideForm } from './actions';
import AutoRefresh from './auto-refresh';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
export const dynamic = 'force-dynamic';

type Item = {
  id: string;
  kind: string;
  title: string;
  payload: unknown;
  created_at: string;
};

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('approval_queue')
    .select('id, kind, title, payload, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const items = (data || []) as Item[];

  return (
    <main>
      <div className="head-row">
        <h1>Hàng đợi duyệt</h1>
        <AutoRefresh seconds={30} />
      </div>
      <p className="sub">Máy soạn, người bấm. Duyệt hoặc từ chối từng mục. Đang chờ: {items.length} mục.</p>

      {error ? <p className="err">Lỗi tải dữ liệu: {error.message}</p> : null}
      {!error && items.length === 0 ? <p>Không có mục nào chờ duyệt.</p> : null}

      <ul className="list">
        {items.map((item) => (
          <li key={item.id} className="card">
            <div className="head">
              <span className="kind">{item.kind}</span>
              <span className="time">{new Date(item.created_at).toLocaleString('vi-VN')}</span>
            </div>
            <div className="title">{item.title}</div>
            <pre className="payload">{JSON.stringify(item.payload, null, 2)}</pre>
            <form className="row" action={decideForm}>
              <input type="hidden" name="id" value={item.id} />
              <input className="note" name="note" placeholder="Ghi chú" />
              <button className="ok" name="action" value="approve">Duyệt</button>
              <button className="no" name="action" value="reject">Từ chối</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
