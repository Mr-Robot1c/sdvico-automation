// JD Analyzer. Biến mô tả công việc thành tiêu chí có cấu trúc bằng Groq.
// Đây là bộ não điều khiển: đầu ra dùng cho đăng tin (địa điểm, từ khóa) và
// sau này cho tìm kiếm ứng viên qua kênh chính thức, và cho chấm khớp JD.
//
// Chỉ phân tích văn bản JD của công ty, không đụng dữ liệu cá nhân ai (điều cấm 6).

import Groq from 'groq-sdk';
import { prioritizeLocations } from './locations.js';

const MODEL = process.env.HR_ANALYZE_MODEL || process.env.HR_SCREEN_MODEL || 'llama-3.3-70b-versatile';

function jsonShape() {
  return [
    '{',
    '  "vai_tro": "tên vai trò ngắn gọn",',
    '  "cap_bac": "mới ra trường | 1-3 năm | 3-5 năm | senior | quản lý",',
    '  "ky_nang_bat_buoc": [ "kỹ năng hoặc yêu cầu bắt buộc" ],',
    '  "ky_nang_uu_tien": [ "kỹ năng là lợi thế" ],',
    '  "dia_diem": [ "nơi làm việc nêu trong JD, ví dụ Vũng Tàu hoặc Hồ Chí Minh" ],',
    '  "tu_khoa_tim": [ "5 tới 8 từ khóa để tìm ứng viên trên sàn tuyển dụng" ]',
    '}'
  ].join('\n');
}

const SYSTEM = [
  'Bạn là trợ lý tuyển dụng cho Công ty SDVICO, ngành thiết bị biển và thủy sản, trụ sở tại Vũng Tàu.',
  'Đọc mô tả công việc và rút ra tiêu chí tuyển dụng có cấu trúc.',
  '',
  'Quy tắc:',
  '- Chỉ rút từ nội dung JD, không bịa thêm yêu cầu (điều cấm 5).',
  '- Nếu JD không nêu địa điểm, để mảng dia_diem rỗng.',
  '- tu_khoa_tim là các cụm từ ngắn để tìm ứng viên, bám vai trò và kỹ năng.',
  '- Viết tiếng Việt tự nhiên, không gạch dài, không mũi tên.',
  '',
  'Chỉ trả về một đối tượng JSON đúng dạng sau, không kèm chữ nào khác:',
  jsonShape()
].join('\n');

const asArr = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);

// Phân tích JD. Trả tiêu chí thô từ mô hình.
export async function analyzeJd(jdText, { apiKey = process.env.GROQ_API_KEY } = {}) {
  if (!apiKey) throw new Error('Thiếu GROQ_API_KEY. Đặt khóa Groq để phân tích JD.');
  if (!jdText || jdText.trim().length < 20) throw new Error('Mô tả công việc quá ngắn để phân tích.');

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Mô tả công việc:\n\n${jdText}` }
    ]
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Mô hình không trả về nội dung.');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('Không đọc được JSON phân tích JD: ' + err.message);
  }

  return {
    vai_tro: String(parsed.vai_tro || '').trim(),
    cap_bac: String(parsed.cap_bac || '').trim(),
    ky_nang_bat_buoc: asArr(parsed.ky_nang_bat_buoc),
    ky_nang_uu_tien: asArr(parsed.ky_nang_uu_tien),
    dia_diem: asArr(parsed.dia_diem),
    tu_khoa_tim: asArr(parsed.tu_khoa_tim),
    model: MODEL
  };
}

// Bổ sung ưu tiên địa điểm gần vào kết quả phân tích. Đây là tiêu chí đầy đủ để đăng tin và tìm kiếm.
export function buildTargeting(analysis) {
  return {
    ...analysis,
    dia_diem_uu_tien: prioritizeLocations(analysis.dia_diem)
  };
}
