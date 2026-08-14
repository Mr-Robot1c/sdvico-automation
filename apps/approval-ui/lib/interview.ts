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

// Cấp n khung giờ trống, tránh trùng khung đã đề xuất cho ứng viên khác.
export async function allocateInterviewSlots(client: DbClient, n = 3): Promise<string[]> {
  let times = WORK_TIMES;
  const { data: cfg } = await client.from('app_config').select('value').eq('key', 'interview_windows').maybeSingle();
  if (Array.isArray(cfg?.value) && cfg!.value.length) times = cfg!.value as string[];

  const taken = new Set<string>();
  const { data: rows } = await client.from('approval_queue').select('payload').eq('kind', 'hr_interview');
  for (const r of (rows || []) as Array<{ payload: { khung_gio?: string[] } | null }>) {
    const k = r.payload?.khung_gio;
    if (Array.isArray(k)) for (const s of k) taken.add(s);
  }

  const out: string[] = [];
  for (const s of buildGrid(times)) {
    if (taken.has(s)) continue;
    out.push(s);
    if (out.length >= n) break;
  }
  return out;
}

// Thư mời phỏng vấn. name có thể null.
export function composeInterviewLetter({ name, position, slots }: { name?: string | null; position: string; slots: string[] }): string {
  const xh = 'anh/chị';
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
