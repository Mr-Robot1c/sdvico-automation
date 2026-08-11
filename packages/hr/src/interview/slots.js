// Đề xuất khung giờ phỏng vấn. Tính cục bộ, không nhờ mô hình.
// Lấy các ngày làm việc kế tiếp lúc 9 giờ sáng. Người duyệt chỉnh lại nếu cần.

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function format(d) {
  const wd = WEEKDAYS[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${wd}, ${dd}/${mm}/${d.getFullYear()}, ${hh}:${mi}`;
}

// n khung giờ, mỗi khung một ngày làm việc, bắt đầu từ ngày mai lúc 9 giờ.
export function proposeSlots(n = 3, { startFrom = new Date() } = {}) {
  const slots = [];
  const d = new Date(startFrom);
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  let guard = 0;
  while (slots.length < n && guard < 30) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) slots.push(format(new Date(d)));
    d.setDate(d.getDate() + 1);
    guard += 1;
  }
  return slots;
}
