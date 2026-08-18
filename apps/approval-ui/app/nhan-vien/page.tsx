import { requireEmployeeAdmin, listEmployees } from '../../lib/employees';
import { addEmployeeManual } from '../actions';
import { SubmitButton } from '../submit-button';
import EmployeeList, { type EmpRow } from './employee-list';

export const dynamic = 'force-dynamic';

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
        <select name="bao_hiem" className="note" defaultValue="chua_dong" style={{ flex: '1 1 140px' }} aria-label="Bảo hiểm">
          <option value="chua_dong">BH: Chưa đóng</option>
          <option value="dang_dong">BH: Đang đóng</option>
          <option value="da_ngung">BH: Đã ngừng</option>
        </select>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <input className="note" name="luong" inputMode="numeric" placeholder="Lương (đồng), vd: 8000000" style={{ flex: '1 1 180px' }} />
        <input className="note" name="luong_ghi_chu" placeholder="Chú thích lương (tùy chọn)" style={{ flex: '2 1 220px' }} />
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
  const rows: EmpRow[] = employees.map((e) => ({
    id: e.id,
    fullName: e.full_name || '',
    chucDanh: e.chuc_danh || '',
    phongBan: e.phong_ban || '',
    email: e.email || '',
    phone: e.phone || '',
    trangThai: e.trang_thai,
    baoHiem: e.bao_hiem,
    luong: e.luong,
    luongGhiChu: e.luong_ghi_chu || '',
    fromRecruitment: Boolean(e.application_id),
    ngayBatDau: e.ngay_bat_dau,
  }));

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
        <div style={{ marginTop: 16 }}>
          <EmployeeList employees={rows} />
        </div>
      )}

      <AddEmployeeForm />
    </main>
  );
}
