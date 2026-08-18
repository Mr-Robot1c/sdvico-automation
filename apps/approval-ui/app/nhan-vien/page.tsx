import Link from 'next/link';
import { requireEmployeeAdmin, listEmployees } from '../../lib/employees';
import { addEmployeeManual } from '../actions';
import { SubmitButton } from '../submit-button';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: 'Đang làm', tone: 'ok' },
  probation: { label: 'Thử việc', tone: 'mkt' },
  left: { label: 'Đã nghỉ', tone: 'no' },
};

function AddEmployeeForm() {
  return (
    <form action={addEmployeeManual} className="settings-box" style={{ marginTop: 16 }}>
      <b>Thêm nhân viên đã có</b>
      <p className="muted" style={{ margin: '4px 0 10px', fontSize: '0.85em' }}>
        Dành cho nhân viên hiện hữu, không đến từ luồng tuyển dụng trong hệ thống. Thêm xong có thể
        mở hồ sơ để nhập tiếp BHXH, CCCD, tài liệu và việc onboarding.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input className="note" name="full_name" required placeholder="Họ tên" style={{ flex: '2 1 200px' }} />
        <input className="note" name="chuc_danh" placeholder="Chức danh" style={{ flex: '1 1 160px' }} />
        <input className="note" name="phong_ban" placeholder="Phòng ban" style={{ flex: '1 1 160px' }} />
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <input className="note" name="email" type="email" placeholder="Email (tùy chọn)" style={{ flex: '2 1 200px' }} />
        <input className="note" name="phone" placeholder="Điện thoại (tùy chọn)" style={{ flex: '1 1 150px' }} />
        <input className="note" type="date" name="ngay_bat_dau" aria-label="Ngày bắt đầu" style={{ flex: '1 1 150px' }} />
        <select name="trang_thai" className="note" defaultValue="active" style={{ flex: '1 1 130px' }}>
          <option value="active">Đang làm</option>
          <option value="probation">Thử việc</option>
          <option value="left">Đã nghỉ</option>
        </select>
        <SubmitButton label="Thêm nhân viên" pendingLabel="Đang thêm..." />
      </div>
    </form>
  );
}

export default async function Page() {
  const guard = await requireEmployeeAdmin();

  if ('error' in guard) {
    return (
      <main>
        <header className="head-row"><div><h1>Nhân viên</h1></div></header>
        <div className="err" role="alert">{guard.error}</div>
      </main>
    );
  }

  const employees = await listEmployees(guard);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Nhân viên</h1>
          <p className="sub">
            Nhân viên đến từ hai nguồn: bấm &quot;Xác nhận đã nhận việc&quot; ở trang Hồ sơ ứng viên,
            hoặc thêm tay bên dưới cho người đã có sẵn. Tổng: {employees.length} người.
          </p>
        </div>
        {employees.length > 0 ? (
          <a className="btn ghost" href="/nhan-vien/export" style={{ whiteSpace: 'nowrap' }}>Xuất Excel</a>
        ) : null}
      </header>

      {employees.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🧑‍💼</div>
          <p>Chưa có nhân viên nào.</p>
          <p className="sub">Thêm nhân viên đã có bằng biểu mẫu bên dưới, hoặc xác nhận từ hồ sơ ứng viên đã được mời nhận việc.</p>
        </div>
      ) : (
        <table className="run-log" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Chức danh</th>
              <th>Phòng ban</th>
              <th>Trạng thái</th>
              <th>Nguồn</th>
              <th>Ngày bắt đầu</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const st = STATUS_LABEL[e.trang_thai] || STATUS_LABEL.active;
              return (
                <tr key={e.id}>
                  <td><Link href={`/nhan-vien/${e.id}`}><b>{e.full_name || 'Chưa rõ tên'}</b></Link></td>
                  <td>{e.chuc_danh || <span className="muted">—</span>}</td>
                  <td>{e.phong_ban || <span className="muted">—</span>}</td>
                  <td><span className={`stage tone-${st.tone}`}>{st.label}</span></td>
                  <td className="muted">{e.application_id ? 'Từ tuyển dụng' : 'Nhập tay'}</td>
                  <td className="muted">{e.ngay_bat_dau ? new Date(e.ngay_bat_dau).toLocaleDateString('vi-VN') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <AddEmployeeForm />
    </main>
  );
}
