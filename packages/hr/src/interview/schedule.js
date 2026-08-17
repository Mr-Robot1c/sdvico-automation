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

// Đọc sức chứa mỗi khung phỏng vấn từ app_config. Mặc định 3 người.
export async function loadCapacity(client) {
  const { data, error } = await client
    .from('app_config').select('value').eq('key', 'interview_capacity').maybeSingle();
  if (error) return 3;
  const n = Number(data?.value);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

// Cấp n khung giờ còn chỗ, bỏ qua khung đã đạt sức chứa.
// load là Map<string, number> đếm số ứng viên đang chiếm mỗi khung.
export function allocateSlots(load, n = 3, opts = {}) {
  const capacity = opts.capacity || 1;
  const grid = buildGrid(opts);
  const out = [];
  for (const s of grid) {
    if ((load.get(s) || 0) >= capacity) continue;
    out.push(s);
    load.set(s, (load.get(s) || 0) + 1);
    if (out.length >= n) break;
  }
  return out;
}

// Đếm số ứng viên đang chiếm mỗi khung.
// Chỉ tính hồ sơ còn ở bước 'interview' và chưa đánh dấu phỏng vấn xong. Đã chọn khung
// nào thì chỉ tính khung đó, hai khung còn lại được nhả về lưới trống.
// Trước đây chỉ trả về một Set khung "đã chiếm vĩnh viễn", không phân biệt ứng viên đã
// bị từ chối hay đã xong, nên lưới cạn dần và lịch trôi xa. Cách mới đọc trạng thái thật.
export async function loadTakenSlots(client) {
  const { data: apps, error: e1 } = await client
    .from('hr_applications')
    .select('id, chosen_slot, interviewed_at')
    .eq('stage', 'interview');
  if (e1) throw new Error('Đọc hồ sơ ứng tuyển lỗi: ' + e1.message);
  const active = (apps || []).filter((a) => !a.interviewed_at);
  const chosenById = new Map(active.map((a) => [a.id, a.chosen_slot]));
  const activeIds = new Set(active.map((a) => a.id));

  const { data: rows, error: e2 } = await client
    .from('approval_queue')
    .select('ref_id, payload, status')
    .eq('kind', 'hr_interview')
    .in('status', ['pending', 'approved']);
  if (e2) throw new Error('Đọc lịch đã xếp lỗi: ' + e2.message);

  const load = new Map();
  for (const r of rows || []) {
    if (!r.ref_id || !activeIds.has(r.ref_id)) continue;
    const chosen = chosenById.get(r.ref_id);
    const slots = chosen ? [chosen] : r.payload?.khung_gio || [];
    for (const s of slots) load.set(s, (load.get(s) || 0) + 1);
  }
  return load;
}
