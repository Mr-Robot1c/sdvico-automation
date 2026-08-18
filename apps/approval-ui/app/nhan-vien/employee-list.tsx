'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export type EmpRow = {
  id: string;
  fullName: string;
  chucDanh: string;
  phongBan: string;
  email: string;
  phone: string;
  luong: number | null;
  luongGhiChu: string;
  trangThai: 'active' | 'probation' | 'left';
  baoHiem: 'dang_dong' | 'chua_dong' | 'da_ngung';
  fromRecruitment: boolean;
  ngayBatDau: string | null;
};

const BAO_HIEM_LABEL: Record<string, { label: string; tone: string }> = {
  dang_dong: { label: 'Đang đóng', tone: 'ok' },
  chua_dong: { label: 'Chưa đóng', tone: 'default' },
  da_ngung: { label: 'Đã ngừng', tone: 'no' },
};

// Lương dạng số đồng thành "8.000.000 đồng". Null thì để trống.
function fmtLuong(n: number | null): string {
  if (n == null) return '';
  return n.toLocaleString('vi-VN') + ' đồng';
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: 'Đang làm', tone: 'ok' },
  probation: { label: 'Thử việc', tone: 'mkt' },
  left: { label: 'Đã nghỉ', tone: 'no' },
};

const NO_DEPT = '__khac__';

// Bảng nhân viên có tìm kiếm (tên, chức danh, email, điện thoại) và lọc theo phòng ban.
// Lọc phía trình duyệt để nhanh, dữ liệu đã tải sẵn từ server.
export default function EmployeeList({ employees }: { employees: EmpRow[] }) {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState<string | null>(null);

  // Danh sách phòng ban kèm số lượng, để làm nút lọc.
  const depts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of employees) {
      const key = e.phongBan.trim() || NO_DEPT;
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => (a[0] === NO_DEPT ? 1 : b[0] === NO_DEPT ? -1 : a[0].localeCompare(b[0], 'vi')));
  }, [employees]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return employees.filter((e) => {
      const key = e.phongBan.trim() || NO_DEPT;
      const okDept = !dept || key === dept;
      const okText = !t || [e.fullName, e.chucDanh, e.email, e.phone].some((v) => (v || '').toLowerCase().includes(t));
      return okDept && okText;
    });
  }, [employees, q, dept]);

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Tìm theo tên, chức danh, email, số điện thoại..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Tìm nhân viên"
        />
      </div>

      {depts.length > 1 ? (
        <nav className="filters" aria-label="Lọc theo phòng ban">
          <button className={`chip ${!dept ? 'on' : ''}`} onClick={() => setDept(null)}>
            Tất cả <span className="n">{employees.length}</span>
          </button>
          {depts.map(([key, n]) => (
            <button key={key} className={`chip ${dept === key ? 'on' : ''}`} onClick={() => setDept(key)}>
              {key === NO_DEPT ? 'Chưa có phòng ban' : key} <span className="n">{n}</span>
            </button>
          ))}
        </nav>
      ) : null}

      <p className="sub" style={{ margin: '10px 0' }}>Hiện {filtered.length} trên {employees.length} nhân viên.</p>

      {filtered.length === 0 ? (
        <p className="muted">Không có nhân viên khớp bộ lọc.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="run-log">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Chức danh</th>
                <th>Phòng ban</th>
                <th>Điện thoại</th>
                <th>Lương</th>
                <th>Trạng thái</th>
                <th>Bảo hiểm</th>
                <th>Nguồn</th>
                <th>Ngày bắt đầu</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const st = STATUS_LABEL[e.trangThai] || STATUS_LABEL.active;
                return (
                  <tr key={e.id}>
                    <td><Link href={`/nhan-vien/${e.id}`}><b>{e.fullName || 'Chưa rõ tên'}</b></Link></td>
                    <td>{e.chucDanh || <span className="muted">Chưa có</span>}</td>
                    <td>{e.phongBan || <span className="muted">Chưa có</span>}</td>
                    <td>{e.phone || <span className="muted">Chưa có</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {e.luong != null ? fmtLuong(e.luong) : <span className="muted">Chưa có</span>}
                      {e.luongGhiChu ? <span className="muted" style={{ display: 'block', fontSize: '0.85em' }}>{e.luongGhiChu}</span> : null}
                    </td>
                    <td><span className={`stage tone-${st.tone}`}>{st.label}</span></td>
                    <td>{(() => { const bh = BAO_HIEM_LABEL[e.baoHiem] || BAO_HIEM_LABEL.chua_dong; return <span className={`stage tone-${bh.tone}`}>{bh.label}</span>; })()}</td>
                    <td className="muted">{e.fromRecruitment ? 'Từ tuyển dụng' : 'Nhập tay'}</td>
                    <td className="muted">{e.ngayBatDau ? new Date(e.ngayBatDau).toLocaleDateString('vi-VN') : 'Chưa có'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
