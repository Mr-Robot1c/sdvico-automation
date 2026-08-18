import { getServerClient } from '../../lib/supabase-server';

export const dynamic = 'force-dynamic';

type InternalRow = {
  id: string;
  source_path: string;
  title: string | null;
  summary: string | null;
  needs_gov_review: boolean;
  created_at: string;
};

type PublicRow = {
  id: string;
  source_url: string;
  source_title: string | null;
  summary: string;
  needs_gov_review: boolean;
  created_at: string;
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export default async function Page() {
  const client = getServerClient();
  const [{ data: iData }, { data: pData }] = await Promise.all([
    client
      .from('mkt_knowledge_internal')
      .select('id, source_path, title, summary, needs_gov_review, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    client
      .from('mkt_knowledge_public')
      .select('id, source_url, source_title, summary, needs_gov_review, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
  ]);
  const internal = (iData || []) as InternalRow[];
  const publicRows = (pData || []) as PublicRow[];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Nguồn</h1>
          <p className="sub">
            Những gì các AI đã học được để làm nguyên liệu cho Kế hoạch. Bên trái là nguồn nội bộ (AI Data 1 đọc từ file Zalo thả vào bucket kho-tri-thuc-noi-bo, cộng kết luận A/B của AI Đánh giá).
            Bên phải là nguồn public (AI Data 2 tự lên mạng học mỗi ngày). Kho này không tự đăng bài, chỉ là nguyên liệu định hướng. Xem AI học tới đâu ở trang <a href="/du-lieu-ai">Dữ liệu</a>.
          </p>
        </div>
      </header>

      <div className="kt-grid">
        <section className="kt-col">
          <h2>Nguồn nội bộ <span className="sub">({internal.length})</span></h2>
          {internal.length === 0 ? (
            <div className="empty">
              <p>Chưa có bản ghi nội bộ nào.</p>
              <p className="sub">
                Thả file (.txt, .md, .html, .json, hoặc ảnh chụp) đã trích xuất từ Zalo vào bucket
                <b> kho-tri-thuc-noi-bo</b> trên Supabase. Cron Chủ nhật sẽ tự đọc và tóm tắt.
                Chạy tay: <code>/api/kho-tri-thuc?secret=...&do=internal</code>.
              </p>
            </div>
          ) : (
            <ul className="kt-list">
              {internal.map((r) => (
                <li key={r.id} className="kt-item">
                  <div className="kt-item-head">
                    <b>{r.title || '(không tiêu đề)'}</b>
                    {r.needs_gov_review ? <span className="badge tone-no">⚠️ Cần duyệt quản lý</span> : null}
                  </div>
                  <div className="sub">{fmtDateTime(r.created_at)}</div>
                  <div className="sub">Tệp: <code>{r.source_path}</code></div>
                  <p>{r.summary || '(chưa có tóm tắt)'}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="kt-col">
          <h2>Nguồn public <span className="sub">({publicRows.length})</span></h2>
          {publicRows.length === 0 ? (
            <div className="empty">
              <p>Chưa có bản ghi public nào.</p>
              <p className="sub">
                Bot Kế hoạch tự học vào Chủ nhật hàng tuần, gọi Gemini có bật Google Search.
                Chạy tay: <code>/api/kho-tri-thuc?secret=...&do=public</code>.
              </p>
            </div>
          ) : (
            <ul className="kt-list">
              {publicRows.map((r) => (
                <li key={r.id} className="kt-item">
                  <div className="kt-item-head">
                    <b>
                      <a href={r.source_url} target="_blank" rel="noopener noreferrer">
                        {r.source_title || r.source_url}
                      </a>
                    </b>
                    {r.needs_gov_review ? <span className="badge tone-no">⚠️ Cần duyệt quản lý</span> : null}
                  </div>
                  <div className="sub">{fmtDateTime(r.created_at)}</div>
                  <p>{r.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
