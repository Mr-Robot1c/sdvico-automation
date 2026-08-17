// Soạn thư mời phỏng vấn NGAY trong app (không chờ worker): khung giờ + câu hỏi + thư.
// Port từ packages/hr/src/interview. Máy soạn, người bấm Duyệt mới gửi (điều cấm 1).

import type { getServerClient } from './supabase-server';
import { groqChat } from './groq';

type DbClient = ReturnType<typeof getServerClient>;

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const WORK_TIMES = ['09:00', '10:30', '14:00', '15:30'];

function slotLabel(day: Date, time: string): string {
  const wd = WEEKDAYS[day.getDay()];
  const dd = String(day.getDate()).padStart(2, '0');
  const mm = String(day.getMonth() + 1).padStart(2, '0');
  return `${wd}, ${dd}/${mm}/${day.getFullYear()}, ${time}`;
}

// Định dạng khung giờ do người duyệt chọn: dateStr 'YYYY-MM-DD' + time 'HH:MM'.
export function formatSlot(dateStr: string, time: string): string {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return '';
  return slotLabel(new Date(y, m - 1, d), time);
}

// Đoán giới tính để xưng hô đúng (anh/chị). Cục bộ, không đưa lên mô hình.
// Ưu tiên thông tin ghi trong CV, sau đó suy từ tên. Không chắc thì 'anh/chị'.
const FEMALE_MID = ['thị'];
const MALE_MID = ['văn'];
const FEMALE_NAMES = new Set(['hoa', 'mai', 'lan', 'hồng', 'hương', 'thu', 'trang', 'linh', 'ngọc', 'hà', 'yến', 'nhung', 'thảo', 'vân', 'my', 'hằng', 'oanh', 'loan', 'diệu', 'phượng', 'nga', 'hạnh', 'thúy', 'tuyết', 'quỳnh', 'nhi', 'châu']);
const MALE_NAMES = new Set(['sơn', 'nam', 'quân', 'hải', 'huy', 'tùng', 'đức', 'minh', 'tuấn', 'hùng', 'dũng', 'long', 'phong', 'cường', 'thành', 'lợi', 'khoa', 'bình', 'phúc', 'thắng', 'trung', 'kiên', 'hoàng', 'vũ', 'lâm', 'đạt', 'tài']);

function xungHoFor(name?: string | null, text = ''): string {
  const t = (text || '').toLowerCase();
  if (/giới tính\s*[:\-]?\s*nữ|gender\s*[:\-]?\s*female/.test(t)) return 'chị';
  if (/giới tính\s*[:\-]?\s*nam|gender\s*[:\-]?\s*male/.test(t)) return 'anh';

  const parts = (name || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    if (FEMALE_MID.includes(parts[1])) return 'chị';
    if (MALE_MID.includes(parts[1])) return 'anh';
  }
  const given = parts[parts.length - 1];
  if (given && FEMALE_NAMES.has(given)) return 'chị';
  if (given && MALE_NAMES.has(given)) return 'anh';
  return 'anh/chị';
}

// Lưới khung giờ các ngày làm việc, bắt đầu từ ngày mai.
function buildGrid(times: string[], days = 40): string[] {
  const useTimes = times.length ? times : WORK_TIMES;
  const out: string[] = [];
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + 1);
  for (let i = 0; i < days; i++) {
    const wd = day.getDay();
    if (wd !== 0 && wd !== 6) for (const t of useTimes) out.push(slotLabel(day, t));
    day.setDate(day.getDate() + 1);
  }
  return out;
}

// Cấp n khung giờ trống. Một khung được coi là "đầy" khi số ứng viên đang chiếm nó đã
// đạt sức chứa. Trước đây mỗi khung chỉ chứa được một, và khung đã đề xuất bị coi là
// chiếm vĩnh viễn, kể cả khi ứng viên bị từ chối. Cách đó khiến lưới 112 khung của
// 40 ngày hết sạch sau khoảng 37 ứng viên.
//
// Nay:
// - Sức chứa mỗi khung đọc từ app_config key 'interview_capacity', mặc định 3.
//   Đổi trong trang Cài đặt hoặc Lịch phỏng vấn.
// - Chỉ ứng viên còn ở bước phỏng vấn và chưa đánh dấu đã phỏng vấn mới tính chiếm.
//   Đã Nhận, Không nhận, hoặc đã đánh dấu phỏng vấn xong đều coi là đã trả khung.
// - Nếu ứng viên đã chọn một khung thì chỉ khung đó bị tính, hai khung còn lại nhả.
export async function allocateInterviewSlots(client: DbClient, n = 3): Promise<string[]> {
  const [{ data: winCfg }, { data: capCfg }] = await Promise.all([
    client.from('app_config').select('value').eq('key', 'interview_windows').maybeSingle(),
    client.from('app_config').select('value').eq('key', 'interview_capacity').maybeSingle(),
  ]);
  const times = Array.isArray(winCfg?.value) && winCfg!.value.length ? (winCfg!.value as string[]) : WORK_TIMES;
  const capacity = Math.max(1, Number(capCfg?.value) || 3);

  // Lấy các hồ sơ còn đang giữ khung: stage='interview' và chưa có interviewed_at.
  // Cột interviewed_at có thể chưa migrate ở môi trường cũ, đọc an toàn.
  const { data: apps } = await client
    .from('hr_applications')
    .select('id, stage, chosen_slot, interviewed_at')
    .eq('stage', 'interview');
  const active = ((apps || []) as Array<{ id: string; chosen_slot: string | null; interviewed_at: string | null }>)
    .filter((a) => !a.interviewed_at);
  const chosenById = new Map(active.map((a) => [a.id, a.chosen_slot]));
  const activeIds = new Set(active.map((a) => a.id));

  const { data: rows } = await client
    .from('approval_queue')
    .select('ref_id, payload, status')
    .eq('kind', 'hr_interview')
    .in('status', ['pending', 'approved']);
  const load = new Map<string, number>();
  for (const r of (rows || []) as Array<{ ref_id: string | null; payload: { khung_gio?: string[] } | null }>) {
    if (!r.ref_id || !activeIds.has(r.ref_id)) continue;
    const chosen = chosenById.get(r.ref_id);
    const slots = chosen ? [chosen] : r.payload?.khung_gio || [];
    for (const s of slots) load.set(s, (load.get(s) || 0) + 1);
  }

  const out: string[] = [];
  for (const s of buildGrid(times)) {
    if ((load.get(s) || 0) >= capacity) continue;
    out.push(s);
    if (out.length >= n) break;
  }
  return out;
}

// Thư mời phỏng vấn. name có thể null.
export function composeInterviewLetter({ name, position, slots, cvText = '' }: { name?: string | null; position: string; slots: string[]; cvText?: string }): string {
  const xh = xungHoFor(name, cvText);
  const hasName = name && name.trim() && name.trim() !== 'anh/chị';
  const greeting = hasName ? `Kính gửi ${xh} ${name!.trim()},` : `Kính gửi ${xh},`;
  return [
    greeting,
    '',
    `Cảm ơn ${xh} đã ứng tuyển ${position} tại Công ty SDVICO. Sau khi xem hồ sơ, chúng tôi trân trọng mời ${xh} tham gia phỏng vấn.`,
    '',
    `Đề xuất các khung giờ, ${xh} chọn giúp một khung phù hợp:`,
    ...slots.map((s, i) => `${i + 1}. ${s}`),
    '',
    `Buổi làm việc gồm phần trao đổi chuyên môn và một bài về nhà ngắn khoảng ba giờ. Chúng tôi sẽ gửi đề bài sau khi ${xh} xác nhận lịch.`,
    '',
    'Trân trọng,',
    'Phòng Nhân sự, Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO)',
  ].join('\n');
}

// Sinh câu hỏi phỏng vấn bằng Groq (best-effort). Lỗi/không có khóa → trả rỗng, không chặn luồng.
export async function generateInterviewQuestions(
  cvText: string,
  position: string
): Promise<{ cau_hoi_ky_thuat: string; cau_hoi_hanh_vi: string; bai_ve_nha: string }> {
  const empty = { cau_hoi_ky_thuat: '', cau_hoi_hanh_vi: '', bai_ve_nha: '' };
  const text = (cvText || '').trim();
  if (text.length < 20) return empty;

  // Bỏ email/số điện thoại trước khi đưa lên mô hình (điều cấm 6).
  const anon = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/(\+?\d[\d\s.\-]{7,}\d)/g, '[sđt]').slice(0, 6000);

  const system = [
    'Bạn là trợ lý chuẩn bị phỏng vấn cho Công ty SDVICO, ngành thiết bị biển và thủy sản.',
    `Ứng viên ứng tuyển: ${position}.`,
    'Dựa vào hồ sơ, soạn bộ câu hỏi và một bài về nhà riêng cho ứng viên này.',
    '- Đúng 8 câu hỏi kỹ thuật bám sát kinh nghiệm trong hồ sơ.',
    '- Đúng 4 câu hỏi hành vi.',
    '- Một bài về nhà khoảng ba giờ, kèm barem 3 tới 5 tiêu chí.',
    'Chỉ dựa vào hồ sơ, không bịa (điều cấm 5). Không dùng gạch dài, mũi tên.',
    'Chỉ trả về JSON đúng dạng: {"cau_hoi_ky_thuat":[...],"cau_hoi_hanh_vi":[...],"bai_ve_nha":{"de_bai":"...","barem":[...]}}',
  ].join('\n');

  try {
    const raw = await groqChat(system, `Hồ sơ ứng tuyển:\n\n${anon}`, { json: true, temperature: 0.4, maxTokens: 2000 });
    if (!raw) return empty;
    const obj = JSON.parse(raw) as { cau_hoi_ky_thuat?: string[]; cau_hoi_hanh_vi?: string[]; bai_ve_nha?: { de_bai?: string; barem?: string[] } };
    const numList = (arr?: string[]) => (Array.isArray(arr) ? arr.map((s, i) => `${i + 1}. ${String(s).trim()}`).join('\n') : '');
    const bai = obj.bai_ve_nha;
    const baiStr = bai?.de_bai
      ? `Đề bài (khoảng ba giờ):\n${bai.de_bai}${Array.isArray(bai.barem) && bai.barem.length ? `\n\nBarem chấm:\n${bai.barem.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : ''}`
      : '';
    return { cau_hoi_ky_thuat: numList(obj.cau_hoi_ky_thuat), cau_hoi_hanh_vi: numList(obj.cau_hoi_hanh_vi), bai_ve_nha: baiStr };
  } catch {
    return empty;
  }
}
