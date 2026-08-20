import { getSessionUser } from '../../../lib/auth';
import { getServerClient } from '../../../lib/supabase-server';
import { addCvSource, confirmCvSourceLegal, toggleCvSource } from '../../actions';
import { SubmitButton } from '../../submit-button';

export const dynamic = 'force-dynamic';

type Source = {
  id: string;
  platform_id: string;
  ten: string;
  gioi_han_ngay: number | null;
  xac_nhan_phap_ly_boi: string | null;
  xac_nhan_luc: string | null;
  bat: boolean;
};

export default async function Page() {
  const me = await getSessionUser();

  if (!me) {
    return (
      <main>
        <header className="head-row"><div><h1>Nguồn CV chủ động</h1></div></header>
        <div className="err" role="alert">
          <b>Trang này chỉ dùng được khi đã bật đăng nhập theo từng người.</b> Hệ thống đang chạy
          chế độ mật khẩu chung (<code>AUTH_MODE=basic</code>). Xem hướng dẫn ở{' '}
          <code>docs/dang-nhap-supabase-auth.md</code>.
        </div>
      </main>
    );
  }

  if (me.role !== 'admin') {
    return (
      <main>
        <header className="head-row"><div><h1>Nguồn CV chủ động</h1></div></header>
        <div className="err" role="alert">
          <b>Không đủ quyền.</b> Chỉ tài khoản quản trị mới xem và cấu hình mục này.
        </div>
      </main>
    );
  }

  const client = getServerClient();
  // hr_platforms đã có sẵn từ trước (loai='cv_source' chỉ là một giá trị lọc), nên không dùng
  // được để biết migration mới đã chạy chưa — phải kiểm lỗi của chính truy vấn hr_cv_sources.
  const { data: platforms } = await client.from('hr_platforms').select('id, ten').eq('loai', 'cv_source');
  const { data: cfgs, error } = await client
    .from('hr_cv_sources')
    .select('id, platform_id, gioi_han_ngay, xac_nhan_phap_ly_boi, xac_nhan_luc, bat');
  const missing = error?.code === 'PGRST205' || error?.code === '42P01';

  let sources: Source[] = [];
  if (!missing) {
    const tenById = new Map((platforms || []).map((p: { id: string; ten: string }) => [p.id, p.ten]));
    sources = ((cfgs || []) as Omit<Source, 'ten'>[]).map((c) => ({ ...c, ten: tenById.get(c.platform_id) || 'Chưa gán' }));
  }

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Nguồn CV chủ động</h1>
          <p className="sub">Tìm CV trên TopCV và tương tự, qua tài khoản trả phí của công ty. Tắt mặc định.</p>
        </div>
      </header>

      <div className="err" role="alert" style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <b>Đọc trước khi bật:</b> chưa xác định các trang này có official API cho nhà tuyển dụng
        hay không — tính năng chỉ tự động hóa thao tác trong phạm vi tài khoản trả phí đã có, qua
        UI chính thức, gặp CAPTCHA/giới hạn thì dừng, không phá rào. CV tìm được là dữ liệu của
        người chưa chủ động nộp cho SDVICO — cần đối chiếu Nghị định 13/2023 trước khi liên hệ.
        Vi phạm điều khoản sử dụng của trang có thể khiến tài khoản trả phí bị khóa. Chỉ bật sau
        khi Phòng Nhân sự/pháp lý đã xác nhận công ty có quyền dùng theo cách này.
      </div>

      {missing ? (
        <div className="err" role="alert">
          Chưa bật đủ tính năng. Chạy migration <code>20260818030000_hr_cv_sources.sql</code> trong Supabase rồi tải lại.
        </div>
      ) : (
        <>
          {sources.length === 0 ? (
            <div className="empty"><p>Chưa có nguồn nào.</p></div>
          ) : (
            <table className="run-log" style={{ marginTop: 16 }}>
              <thead>
                <tr><th>Nguồn</th><th>Giới hạn/ngày</th><th>Xác nhận pháp lý</th><th>Trạng thái</th><th></th></tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const confirmed = Boolean(s.xac_nhan_phap_ly_boi && s.xac_nhan_luc);
                  return (
                    <tr key={s.id}>
                      <td><b>{s.ten}</b></td>
                      <td>{s.gioi_han_ngay ?? <span className="muted">Không giới hạn</span>}</td>
                      <td>
                        {confirmed ? (
                          <span className="muted">{s.xac_nhan_phap_ly_boi} · {new Date(s.xac_nhan_luc!).toLocaleDateString('vi-VN')}</span>
                        ) : (
                          <span className="stage tone-no">Chưa xác nhận</span>
                        )}
                      </td>
                      <td>
                        <span className={`stage tone-${s.bat ? 'ok' : 'default'}`}>{s.bat ? 'Đang bật' : 'Đang tắt'}</span>
                      </td>
                      <td>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          {!confirmed ? (
                            <form action={confirmCvSourceLegal}>
                              <input type="hidden" name="id" value={s.id} />
                              <button className="btn ghost" style={{ fontSize: '0.82em' }} type="submit">Xác nhận đã rà pháp lý</button>
                            </form>
                          ) : (
                            <form action={toggleCvSource}>
                              <input type="hidden" name="id" value={s.id} />
                              <button className={`btn ${s.bat ? 'no' : 'ok'}`} style={{ fontSize: '0.82em' }} type="submit">
                                {s.bat ? 'Tắt' : 'Bật'}
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <form action={addCvSource} className="settings-box" style={{ marginTop: 16 }}>
            <b>Thêm nguồn mới</b>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <input className="note" name="ten" placeholder="Tên nguồn, vd: TopCV" required style={{ flex: '1 1 200px' }} />
              <input className="note" name="gioi_han_ngay" type="number" min={1} placeholder="Giới hạn CV/ngày" style={{ flex: '1 1 160px' }} />
              <SubmitButton label="Thêm" pendingLabel="Đang thêm..." />
            </div>
          </form>
        </>
      )}
    </main>
  );
}
