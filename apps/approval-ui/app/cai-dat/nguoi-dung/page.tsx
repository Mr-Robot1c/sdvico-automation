import { getSessionUser } from '../../../lib/auth';
import { listUsers } from '../../../lib/hr-users';
import { addHrUser, changeHrUserRole, toggleHrUserDisabled } from '../../actions';
import { SubmitButton } from '../../submit-button';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const me = await getSessionUser();

  if (!me) {
    return (
      <main>
        <header className="head-row"><div><h1>Người dùng nội bộ</h1></div></header>
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
        <header className="head-row"><div><h1>Người dùng nội bộ</h1></div></header>
        <div className="err" role="alert">
          <b>Không đủ quyền.</b> Chỉ tài khoản có vai trò quản trị mới xem và sửa danh sách này.
          Bạn đang đăng nhập với vai trò <code>{me.role}</code>.
        </div>
      </main>
    );
  }

  const users = await listUsers();

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Người dùng nội bộ</h1>
          <p className="sub">Danh sách nhân sự được phép vào giao diện duyệt. Tổng: {users.length} người.</p>
        </div>
      </header>

      <form action={addHrUser} className="settings-box">
        <b>Thêm người dùng</b>
        <p className="muted" style={{ margin: '4px 0 10px', fontSize: '0.85em' }}>
          Sau khi thêm, người mới vào trang <code>/dang-nhap</code>, nhập email trên, bấm link
          trong mail là vào được. Không cần đặt mật khẩu.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="note" name="email" type="email" required placeholder="email@sdvico.vn" style={{ flex: '2 1 220px' }} />
          <input className="note" name="full_name" placeholder="Họ tên (tùy chọn)" style={{ flex: '2 1 200px' }} />
          <select name="role" className="note" defaultValue="staff" style={{ flex: '1 1 120px' }}>
            <option value="staff">Nhân viên</option>
            <option value="admin">Quản trị</option>
          </select>
          <SubmitButton label="Thêm" pendingLabel="Đang thêm..." />
        </div>
      </form>

      {users.length === 0 ? (
        <div className="empty">
          <p>Chưa có ai trong danh sách.</p>
        </div>
      ) : (
        <table className="run-log" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Họ tên</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Thêm lúc</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.email.toLowerCase() === me.email.toLowerCase();
              const nextRole = u.role === 'admin' ? 'staff' : 'admin';
              return (
                <tr key={u.id}>
                  <td>
                    <b>{u.email}</b>
                    {isMe ? <span className="muted" style={{ marginLeft: 6, fontSize: '0.85em' }}>(chính bạn)</span> : null}
                  </td>
                  <td>{u.full_name || <span className="muted">—</span>}</td>
                  <td>
                    <span className={`stage tone-${u.role === 'admin' ? 'ok' : 'mkt'}`}>
                      {u.role === 'admin' ? 'Quản trị' : 'Nhân viên'}
                    </span>
                  </td>
                  <td>
                    {u.disabled_at ? (
                      <span className="stage tone-no">Đã khóa</span>
                    ) : (
                      <span className="stage tone-ok">Đang hoạt động</span>
                    )}
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(u.created_at).toLocaleDateString('vi-VN')}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      {/* Đổi vai trò. Không cho tự hạ chính mình từ admin → staff (server chặn). */}
                      <form action={changeHrUserRole}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="role" value={nextRole} />
                        <button
                          type="submit"
                          className="btn ghost"
                          style={{ fontSize: '0.82em' }}
                          disabled={isMe && u.role === 'admin'}
                          title={isMe && u.role === 'admin' ? 'Không thể tự hạ quyền admin của chính mình' : ''}
                        >
                          {u.role === 'admin' ? '→ Nhân viên' : '→ Quản trị'}
                        </button>
                      </form>
                      {/* Khóa / mở khóa. Không cho tự khóa chính mình (server chặn). */}
                      <form action={toggleHrUserDisabled}>
                        <input type="hidden" name="id" value={u.id} />
                        <button
                          type="submit"
                          className={`btn ${u.disabled_at ? 'ok' : 'no'}`}
                          style={{ fontSize: '0.82em' }}
                          disabled={isMe}
                          title={isMe ? 'Không thể tự khóa tài khoản đang đăng nhập' : ''}
                        >
                          {u.disabled_at ? 'Mở khóa' : 'Khóa'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
