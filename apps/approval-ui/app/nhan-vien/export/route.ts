// Xuất danh sách nhân viên ra tệp CSV mở được bằng Excel. Dùng service role qua listEmployees,
// nhưng tự kiểm quyền admin trước (dữ liệu nhạy cảm: BHXH, CCCD). Trả về CSV UTF-8 có BOM để
// Excel đọc đúng tiếng Việt.

import { requireEmployeeAdmin, listEmployees } from '../../../lib/employees';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  active: 'Đang làm',
  probation: 'Thử việc',
  left: 'Đã nghỉ',
};

// Bọc một ô CSV: nhân đôi dấu nháy kép, luôn đặt trong nháy để an toàn với dấu phẩy/xuống dòng.
function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

function fmtDate(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN');
}

export async function GET() {
  const guard = await requireEmployeeAdmin();
  if ('error' in guard) return new Response(guard.error, { status: 403 });

  const employees = await listEmployees(guard);

  const headers = [
    'Họ tên', 'Chức danh', 'Phòng ban', 'Email', 'Điện thoại',
    'Lương (đồng)', 'Chú thích lương', 'Trạng thái', 'Ngày bắt đầu',
    'Số BHXH', 'Số CCCD', 'Nguồn', 'Tạo lúc',
  ];
  const lines = [headers.map(cell).join(',')];
  for (const e of employees) {
    lines.push([
      cell(e.full_name),
      cell(e.chuc_danh),
      cell(e.phong_ban),
      cell(e.email),
      cell(e.phone),
      // Xuất lương ra số thô để Excel tính toán được; định dạng để mắt người đọc trong app.
      cell(e.luong != null ? e.luong : ''),
      cell(e.luong_ghi_chu),
      cell(STATUS_LABEL[e.trang_thai] || e.trang_thai),
      cell(fmtDate(e.ngay_bat_dau)),
      cell(e.so_bhxh),
      cell(e.so_cccd),
      cell(e.application_id ? 'Từ tuyển dụng' : 'Nhập tay'),
      cell(fmtDate(e.created_at)),
    ].join(','));
  }

  // BOM để Excel nhận UTF-8. CRLF để xuống dòng đúng trên Windows.
  const csv = '﻿' + lines.join('\r\n');
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nhan-vien-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
