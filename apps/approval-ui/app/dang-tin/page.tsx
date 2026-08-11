import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative } from '../labels';
import { addPlatform, removePlatform, addJobPost, updateJobPost } from '../actions';

// Quản lý nền tảng đăng tuyển và theo dõi tin đăng. Đăng thật lên sàn cần tài khoản công ty.
export const dynamic = 'force-dynamic';

type Platform = { id: string; ten: string; loai: string; bat: boolean; ghi_chu: string | null };
type Post = {
  id: string;
  tieu_de: string;
  trang_thai: string;
  scheduled_at: string | null;
  posted_at: string | null;
  platform_id: string | null;
  created_at: string;
};

const LOAI_LABEL: Record<string, string> = { job_board: 'Sàn tuyển dụng', social: 'Mạng xã hội', other: 'Khác' };
const TT_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'default' },
  scheduled: { label: 'Đặt lịch', tone: 'mkt' },
  posted: { label: 'Đã đăng', tone: 'ok' },
  cancelled: { label: 'Đã huỷ', tone: 'no' }
};

export default async function Page() {
  const client = getServerClient();
  const pRes = await client.from('hr_platforms').select('id, ten, loai, bat, ghi_chu').order('created_at', { ascending: true });
  const jRes = await client
    .from('hr_job_posts')
    .select('id, tieu_de, trang_thai, scheduled_at, posted_at, platform_id, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  // Chưa chạy migration thì hai bảng chưa có. Hiện hướng dẫn thay vì lỗi.
  const needMigration = pRes.error?.code === '42P01' || jRes.error?.code === '42P01';
  const platforms = (pRes.data || []) as Platform[];
  const posts = (jRes.data || []) as Post[];
  const platformName = new Map(platforms.map((p) => [p.id, p.ten]));

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Đăng tin</h1>
          <p className="sub">Quản lý nền tảng đăng tuyển và theo dõi tin đăng. Đăng thật lên sàn cần tài khoản công ty (điều cấm 5, Phần 6).</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {needMigration ? (
        <div className="err" role="alert">
          Chưa bật tính năng này. Hãy chạy đoạn SQL trong <code>supabase/migrations/20260811100000_management.sql</code> ở Supabase SQL editor, rồi tải lại trang.
        </div>
      ) : (
        <>
          <section>
            <h2 className="sec-title">Nền tảng</h2>
            <ul className="list">
              {platforms.map((p) => (
                <li key={p.id} className="card tone-web">
                  <div className="head">
                    <span className="cand-name">{p.ten}</span>
                    <form action={removePlatform}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn no" type="submit">Xoá</button>
                    </form>
                  </div>
                  <div className="stages">
                    <span className="stage tone-web">{LOAI_LABEL[p.loai] || p.loai}</span>
                    {p.ghi_chu ? <span className="src">{p.ghi_chu}</span> : null}
                  </div>
                </li>
              ))}
              {platforms.length === 0 ? <p className="muted">Chưa có nền tảng nào. Thêm bên dưới.</p> : null}
            </ul>

            <form action={addPlatform} className="settings-box">
              <b>Thêm nền tảng</b>
              <p className="muted" style={{ margin: '2px 0 8px' }}>Lưu ý: đây là danh mục quản lý. Đăng thật vẫn cần tài khoản chính danh của nền tảng đó.</p>
              <div className="row">
                <input className="note" name="ten" placeholder="Tên (TopCV, Facebook, Việc Làm 24h...)" />
                <select className="note" name="loai" defaultValue="job_board" aria-label="Loại nền tảng">
                  <option value="job_board">Sàn tuyển dụng</option>
                  <option value="social">Mạng xã hội</option>
                  <option value="other">Khác</option>
                </select>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input className="note" name="ghi_chu" placeholder="Ghi chú (không bắt buộc)" />
                <button className="btn ok" type="submit">Thêm nền tảng</button>
              </div>
            </form>
          </section>

          <section style={{ marginTop: 28 }}>
            <h2 className="sec-title">Tin đăng</h2>
            <ul className="list">
              {posts.map((j) => {
                const tt = TT_LABEL[j.trang_thai] || { label: j.trang_thai, tone: 'default' };
                return (
                  <li key={j.id} className="card tone-hr">
                    <div className="head">
                      <span className="cand-name">{j.tieu_de}</span>
                      <span className="row-right">
                        <span className={`stage tone-${tt.tone}`}>{tt.label}</span>
                        <time className="time" dateTime={j.created_at}>{formatRelative(j.created_at)}</time>
                      </span>
                    </div>
                    <dl className="fields">
                      <div className="field"><dt>Nền tảng</dt><dd>{(j.platform_id && platformName.get(j.platform_id)) || '—'}</dd></div>
                      <div className="field"><dt>Giờ đặt đăng</dt><dd>{j.scheduled_at ? new Date(j.scheduled_at).toLocaleString('vi-VN') : '—'}</dd></div>
                      {j.posted_at ? <div className="field"><dt>Đã đăng lúc</dt><dd>{new Date(j.posted_at).toLocaleString('vi-VN')}</dd></div> : null}
                    </dl>
                    <div className="row">
                      {j.trang_thai !== 'posted' && j.trang_thai !== 'cancelled' ? (
                        <>
                          <form action={updateJobPost}>
                            <input type="hidden" name="id" value={j.id} />
                            <input type="hidden" name="action" value="posted" />
                            <button className="btn ok" type="submit">Đánh dấu đã đăng</button>
                          </form>
                          <form action={updateJobPost}>
                            <input type="hidden" name="id" value={j.id} />
                            <input type="hidden" name="action" value="cancel" />
                            <button className="btn ghost" type="submit">Huỷ đăng</button>
                          </form>
                        </>
                      ) : null}
                      <form action={updateJobPost}>
                        <input type="hidden" name="id" value={j.id} />
                        <input type="hidden" name="action" value="delete" />
                        <button className="btn no" type="submit">Xoá</button>
                      </form>
                    </div>
                  </li>
                );
              })}
              {posts.length === 0 ? <p className="muted">Chưa có tin đăng nào.</p> : null}
            </ul>

            <form action={addJobPost} className="settings-box">
              <b>Thêm tin đăng</b>
              <div className="row" style={{ marginTop: 8 }}>
                <input className="note" name="tieu_de" placeholder="Tiêu đề tin" />
                <select className="note" name="platform_id" defaultValue="" aria-label="Nền tảng">
                  <option value="">Chọn nền tảng</option>
                  {platforms.map((p) => <option key={p.id} value={p.id}>{p.ten}</option>)}
                </select>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input className="note" type="datetime-local" name="scheduled_at" aria-label="Giờ đặt đăng" />
                <button className="btn ok" type="submit">Thêm</button>
              </div>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
