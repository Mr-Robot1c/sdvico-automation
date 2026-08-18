import { notFound } from 'next/navigation';
import { requireEmployeeAdmin, getEmployee } from '../../../lib/employees';
import { updateEmployeeInfo, toggleOnboardingItem, addOnboardingItem, uploadEmployeeDocument } from '../../actions';
import { SubmitButton } from '../../submit-button';
import DeleteEmployeeButton from './delete-employee-button';

export const dynamic = 'force-dynamic';

const DOC_LABEL: Record<string, string> = {
  hop_dong: 'Hợp đồng lao động',
  bang_cap: 'Bằng cấp',
  bhxh: 'Bảo hiểm xã hội',
  cccd: 'CCCD',
  khac: 'Khác',
};

export default async function Page({ params }: { params: { id: string } }) {
  const guard = await requireEmployeeAdmin();

  if ('error' in guard) {
    return (
      <main>
        <header className="head-row"><div><h1>Nhân viên</h1></div></header>
        <div className="err" role="alert">{guard.error}</div>
      </main>
    );
  }

  const result = await getEmployee(guard, params.id);
  if (!result) notFound();
  const { employee, documents } = result;
  const checklist = employee.onboarding_checklist || [];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>{employee.full_name || 'Chưa rõ tên'}</h1>
          <p className="sub">{employee.email || '—'} · {employee.phone || '—'}</p>
        </div>
      </header>

      <div className="card">
        <b>Thông tin</b>
        <form action={updateEmployeeInfo} className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <input type="hidden" name="id" value={employee.id} />
          <input className="note" name="chuc_danh" defaultValue={employee.chuc_danh || ''} placeholder="Chức danh" style={{ flex: '1 1 160px' }} />
          <input className="note" name="phong_ban" defaultValue={employee.phong_ban || ''} placeholder="Phòng ban" style={{ flex: '1 1 160px' }} />
          <input className="note" type="date" name="ngay_bat_dau" defaultValue={employee.ngay_bat_dau || ''} style={{ flex: '1 1 160px' }} />
          <select name="trang_thai" className="note" defaultValue={employee.trang_thai} style={{ flex: '1 1 140px' }}>
            <option value="probation">Thử việc</option>
            <option value="active">Đang làm</option>
            <option value="left">Đã nghỉ</option>
          </select>
          <input className="note" name="luong" inputMode="numeric" defaultValue={employee.luong != null ? String(employee.luong) : ''} placeholder="Lương (đồng)" style={{ flex: '1 1 160px' }} />
          <input className="note" name="luong_ghi_chu" defaultValue={employee.luong_ghi_chu || ''} placeholder="Chú thích lương" style={{ flex: '2 1 200px' }} />
          <input className="note" name="so_bhxh" defaultValue={employee.so_bhxh || ''} placeholder="Số BHXH" style={{ flex: '1 1 160px' }} />
          <input className="note" name="so_cccd" defaultValue={employee.so_cccd || ''} placeholder="Số CCCD" style={{ flex: '1 1 160px' }} />
          <SubmitButton label="Lưu" pendingLabel="Đang lưu..." />
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <b>Onboarding</b>
        {checklist.length === 0 ? (
          <p className="sub" style={{ marginTop: 8 }}>Chưa có việc nào trong danh sách.</p>
        ) : (
          <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: 'none' }}>
            {checklist.map((item, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <form action={toggleOnboardingItem}>
                  <input type="hidden" name="id" value={employee.id} />
                  <input type="hidden" name="index" value={i} />
                  <button type="submit" className={`stage tone-${item.done ? 'ok' : 'default'}`} style={{ border: 0, cursor: 'pointer' }}>
                    {item.done ? '✓ Xong' : 'Chưa xong'}
                  </button>
                </form>
                <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--ink-2)' : 'inherit' }}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form action={addOnboardingItem} className="row" style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={employee.id} />
          <input className="note" name="label" placeholder="Thêm việc cần làm, vd: Ký hợp đồng" required style={{ flex: '1 1 240px' }} />
          <SubmitButton label="Thêm" pendingLabel="Đang thêm..." />
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <b>Tài liệu</b>
        {documents.length === 0 ? (
          <p className="sub" style={{ marginTop: 8 }}>Chưa có tài liệu nào.</p>
        ) : (
          <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: 'none' }}>
            {documents.map((d) => (
              <li key={d.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="stage tone-default">{DOC_LABEL[d.loai] || d.loai}</span>{' '}
                {d.signedUrl ? (
                  <a href={d.signedUrl} target="_blank" rel="noreferrer">Xem tệp</a>
                ) : (
                  <span className="muted">Không tạo được đường tải</span>
                )}
                {d.ghi_chu ? <span className="muted"> · {d.ghi_chu}</span> : null}
                <span className="muted" style={{ float: 'right' }}>{new Date(d.created_at).toLocaleDateString('vi-VN')}</span>
              </li>
            ))}
          </ul>
        )}
        <form action={uploadEmployeeDocument} className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }} encType="multipart/form-data">
          <input type="hidden" name="employee_id" value={employee.id} />
          <select name="loai" className="note" defaultValue="hop_dong" style={{ flex: '1 1 150px' }}>
            <option value="hop_dong">Hợp đồng lao động</option>
            <option value="bang_cap">Bằng cấp</option>
            <option value="bhxh">Bảo hiểm xã hội</option>
            <option value="cccd">CCCD</option>
            <option value="khac">Khác</option>
          </select>
          <input className="note" name="ghi_chu" placeholder="Ghi chú (tùy chọn)" style={{ flex: '1 1 180px' }} />
          <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png" />
          <SubmitButton label="Tải lên" pendingLabel="Đang tải..." />
        </form>
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <DeleteEmployeeButton id={employee.id} name={employee.full_name || 'Chưa rõ tên'} />
      </div>
    </main>
  );
}
