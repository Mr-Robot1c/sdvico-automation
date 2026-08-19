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
// isReinvite = true khi hồ sơ đã ứng tuyển trước đây và giờ được mời lại cho vị trí phù hợp
// hơn (auto qua cron reinvite-scan hoặc tay qua "Mời lại cho vị trí khác"). Đổi câu mở đầu
// để ứng viên biết ngay đây là dựa trên hồ sơ đã có, không phải lần đầu bất chợt.
export function composeInterviewLetter({
  name,
  position,
  slots,
  cvText = '',
  isReinvite = false,
}: {
  name?: string | null;
  position: string;
  slots: string[];
  cvText?: string;
  isReinvite?: boolean;
}): string {
  const xh = xungHoFor(name, cvText);
  const hasName = name && name.trim() && name.trim() !== 'anh/chị';
  const greeting = hasName ? `Kính gửi ${xh} ${name!.trim()},` : `Kính gửi ${xh},`;

  const openingLine = isReinvite
    ? `Cảm ơn ${xh} đã gửi hồ sơ ứng tuyển tại SDVICO. Sau khi rà lại các vị trí đang tuyển, chúng tôi nhận thấy hồ sơ của ${xh} phù hợp với ${position}, và trân trọng mời ${xh} tham gia phỏng vấn cho vị trí này.`
    : `Cảm ơn ${xh} đã ứng tuyển ${position} tại Công ty SDVICO. Sau khi xem hồ sơ, chúng tôi trân trọng mời ${xh} tham gia phỏng vấn.`;

  return [
    greeting,
    '',
    openingLine,
    '',
    `Đề xuất các khung giờ, ${xh} bấm link cuối thư để xác nhận một khung phù hợp:`,
    ...slots.map((s, i) => `${i + 1}. ${s}`),
    '',
    `Trong trường hợp cả ${slots.length} khung trên không phù hợp, ${xh} bấm link cuối thư và đề xuất giờ khác. Phòng Nhân sự sẽ liên hệ lại để chốt lịch.`,
    '',
    `Buổi phỏng vấn khoảng 60 phút, trao đổi trực tiếp về chuyên môn và kinh nghiệm.`,
    '',
    'Trân trọng,',
    'Phòng Nhân sự, Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO)',
  ].join('\n');
}

// Ẩn danh CV trước khi gửi Groq (điều cấm 6 + chống thiên vị).
// Trước đây chỉ regex email/SĐT trên chính raw text; nay:
//  - che thêm tên đã trích được (full_name), địa chỉ trực tiếp;
//  - áp dụng cả regex SĐT có dấu cách/chấm/gạch nối;
//  - bỏ các dòng có nhãn nhạy cảm ("Địa chỉ:", "Ngày sinh:", ...).
// Trùng ý với anonymizeCv trong packages/hr/src/screen/anonymize.js, giữ ở đây để
// tránh import chéo package.
function redactForGroq(cvText: string, pii?: { full_name?: string | null; email?: string | null; phone?: string | null; address?: string | null }): string {
  let t = cvText || '';
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [val, tag] of [
    [pii?.full_name, '[TÊN]'],
    [pii?.email, '[EMAIL]'],
    [pii?.phone, '[SĐT]'],
    [pii?.address, '[ĐỊA CHỈ]'],
  ] as Array<[string | null | undefined, string]>) {
    if (val && String(val).trim().length >= 3) {
      t = t.replace(new RegExp(esc(String(val).trim()), 'gi'), tag);
    }
  }
  t = t.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[EMAIL]');
  t = t.replace(/(?<!\d)(?:\+?84|0)\d{8,10}(?!\d)/g, '[SĐT]');
  t = t.replace(/(?<!\d)(?:\+?84|0)[\s.\-]?\d{2,3}[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}(?!\d)/g, '[SĐT]');

  const SENSITIVE = /^\s*(họ và tên|họ tên|ho ten|full name|giới tính|gioi tinh|gender|ngày sinh|ngay sinh|date of birth|dob|birthday|tuổi|tuoi|age|quê quán|que quan|hometown|địa chỉ|dia chi|address|thường trú|thuong tru|nơi ở|noi o|dân tộc|dan toc|tôn giáo|ton giao|nationality|quốc tịch|email|e-mail|điện thoại|dien thoai|phone|mobile|tel|sđt|sdt|facebook|zalo|linkedin)\s*[:\-]/i;
  t = t.split(/\r?\n/).filter((line, idx) => {
    if (SENSITIVE.test(line)) return false;
    // Dòng ở 5 dòng đầu chỉ chữ hoa 2-4 từ → banner tên; bỏ để không lộ.
    if (idx < 5) {
      const s = line.trim();
      if (s.length >= 4 && s.length <= 60 && /^[\p{Lu}\p{M}\s'.-]+$/u.test(s)) {
        const words = s.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && words.length <= 4) return false;
      }
    }
    return true;
  }).join('\n');
  return t;
}

// Sinh câu hỏi phỏng vấn bằng Groq (best-effort). Lỗi/không có khóa → trả rỗng, không chặn luồng.
// pii: các trường đã trích được từ CV để redact TRƯỚC KHI gọi Groq. Truyền càng đủ càng ẩn được sạch.
// Bỏ "bai_ve_nha" — SDVICO không giao bài về nhà; buổi phỏng vấn chỉ trao đổi trực tiếp.
// Câu hỏi vẫn được sinh để người phỏng vấn dùng làm gợi ý (không gửi cho ứng viên).
export async function generateInterviewQuestions(
  cvText: string,
  position: string,
  pii?: { full_name?: string | null; email?: string | null; phone?: string | null; address?: string | null }
): Promise<{ cau_hoi_ky_thuat: string; cau_hoi_hanh_vi: string; bai_ve_nha: string }> {
  const empty = { cau_hoi_ky_thuat: '', cau_hoi_hanh_vi: '', bai_ve_nha: '' };
  const text = (cvText || '').trim();
  if (text.length < 20) return empty;

  const anon = redactForGroq(text, pii).slice(0, 6000);

  const system = [
    'Bạn là trợ lý chuẩn bị phỏng vấn cho Công ty SDVICO, ngành thiết bị biển và thủy sản.',
    `Ứng viên ứng tuyển: ${position}.`,
    'Dựa vào hồ sơ, soạn bộ câu hỏi cho người phỏng vấn dùng khi trao đổi với ứng viên này.',
    '- Đúng 8 câu hỏi kỹ thuật bám sát kinh nghiệm trong hồ sơ.',
    '- Đúng 4 câu hỏi hành vi.',
    'Chỉ dựa vào hồ sơ, không bịa (điều cấm 5). Không dùng gạch dài, mũi tên.',
    'Chỉ trả về JSON đúng dạng: {"cau_hoi_ky_thuat":[...],"cau_hoi_hanh_vi":[...]}',
  ].join('\n');

  try {
    const raw = await groqChat(system, `Hồ sơ ứng tuyển:\n\n${anon}`, { json: true, temperature: 0.4, maxTokens: 1500 });
    if (!raw) return empty;
    const obj = JSON.parse(raw) as { cau_hoi_ky_thuat?: string[]; cau_hoi_hanh_vi?: string[] };
    const numList = (arr?: string[]) => (Array.isArray(arr) ? arr.map((s, i) => `${i + 1}. ${String(s).trim()}`).join('\n') : '');
    return { cau_hoi_ky_thuat: numList(obj.cau_hoi_ky_thuat), cau_hoi_hanh_vi: numList(obj.cau_hoi_hanh_vi), bai_ve_nha: '' };
  } catch {
    return empty;
  }
}
