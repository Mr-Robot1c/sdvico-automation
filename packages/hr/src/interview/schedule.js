// Tự động sắp xếp lịch phỏng vấn không trùng nhau.
// Sinh lưới khung giờ làm việc, cấp cho mỗi ứng viên các khung còn trống,
// tránh trùng với khung đã đề xuất cho ứng viên khác.
// Không cần bảng mới: nguồn sự thật là các khung đã ghi trong approval_queue.

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

// Các ca phỏng vấn trong ngày làm việc. [CẦN XÁC NHẬN với Phòng Nhân sự: giờ làm việc thực tế.]
export const WORK_TIMES = ['09:00', '10:30', '14:00', '15:30'];

// Định dạng một khung giờ thành chuỗi hiển thị, cũng là khóa khử trùng.
function slotLabel(day, time) {
  const wd = WEEKDAYS[day.getDay()];
  const dd = String(day.getDate()).padStart(2, '0');
  const mm = String(day.getMonth() + 1).padStart(2, '0');
  return `${wd}, ${dd}/${mm}/${day.getFullYear()}, ${time}`;
}

// Lưới khung giờ sắp tới: các ngày làm việc, mỗi ngày các ca, bắt đầu từ ngày mai.
// times: khung giờ mong muốn, mặc định WORK_TIMES nếu không truyền.
export function buildGrid({ from = new Date(), days = 40, times = WORK_TIMES } = {}) {
  const useTimes = Array.isArray(times) && times.length ? times : WORK_TIMES;
  const slots = [];
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + 1);
  for (let i = 0; i < days; i++) {
    const wd = day.getDay();
    if (wd !== 0 && wd !== 6) {
      for (const t of useTimes) slots.push(slotLabel(day, t));
    }
    day.setDate(day.getDate() + 1);
  }
  return slots;
}

// Đọc khung giờ phỏng vấn mong muốn từ app_config. Không có thì dùng mặc định.
export async function loadWindows(client) {
  const { data, error } = await client
    .from('app_config')
    .select('value')
    .eq('key', 'interview_windows')
    .maybeSingle();
  if (error) return WORK_TIMES;
  const v = data?.value;
  return Array.isArray(v) && v.length ? v : WORK_TIMES;
}

// Cấp n khung giờ còn trống, bỏ qua khung đã có trong tập taken.
// Thêm khung vừa cấp vào taken để lượt sau không cấp trùng.
export function allocateSlots(taken, n = 3, opts = {}) {
  const grid = buildGrid(opts);
  const out = [];
  for (const s of grid) {
    if (taken.has(s)) continue;
    out.push(s);
    taken.add(s);
    if (out.length >= n) break;
  }
  return out;
}

// Gom các khung giờ đã đề xuất từ những mục thư mời trong approval_queue.
// Trả về một Set các chuỗi khung giờ đang bị chiếm.
export async function loadTakenSlots(client) {
  const { data, error } = await client
    .from('approval_queue')
    .select('payload')
    .eq('kind', 'hr_interview');
  if (error) throw new Error('Đọc lịch đã xếp lỗi: ' + error.message);
  const taken = new Set();
  for (const row of data || []) {
    const khung = row.payload?.khung_gio;
    if (Array.isArray(khung)) for (const s of khung) taken.add(s);
  }
  return taken;
}
