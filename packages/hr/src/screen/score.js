// Chấm một CV đã ẩn danh bằng Groq (Llama 3.3 70B), theo thang điểm cố định.
// Mô hình chỉ chấm theo trục có sẵn, không tự nghĩ tiêu chí (cổng an toàn mục 2).
// Đầu ra: điểm từng trục, ba câu tóm tắt, ba điểm mạnh, ba điểm cần làm rõ khi phỏng vấn.
// Không đưa ra quyết định đỗ hay trượt (điều cấm 2): việc đó của con người.
//
// Dùng Groq API miễn phí (console.groq.com). Groq không huấn luyện trên dữ liệu người dùng.
// Ẩn danh trước khi gọi (mục 1, điều cấm 6): giảm dữ liệu nhận dạng rời hạ tầng công ty.

import Groq from 'groq-sdk';
import { weightedScore } from './rubric.js';

// Model mặc định miễn phí. Đổi bằng biến môi trường HR_SCREEN_MODEL nếu muốn model khác.
const MODEL = process.env.HR_SCREEN_MODEL || 'llama-3.3-70b-versatile';

// Mô tả dạng JSON để mô hình trả đúng khóa. Groq dùng chế độ json_object, không có lược đồ chặt.
function jsonShape(rubric) {
  const axes = rubric.axes.map((a) => `"${a.key}": số nguyên 0 tới 10`).join(', ');
  return [
    '{',
    `  "diem_tung_truc": { ${axes} },`,
    '  "tom_tat": ["câu 1", "câu 2", "câu 3"],',
    '  "diem_manh": ["điểm mạnh 1", "điểm mạnh 2", "điểm mạnh 3"],',
    '  "can_lam_ro": ["điều cần làm rõ 1", "điều cần làm rõ 2", "điều cần làm rõ 3"]',
    '}'
  ].join('\n');
}

function buildSystemPrompt(rubric) {
  const axisLines = rubric.axes
    .map((a) => `- ${a.key} (${a.label}, trọng số ${a.weight}): ${a.mo_ta} Cho điểm 0 tới 10.`)
    .join('\n');
  return [
    'Bạn là trợ lý chấm hồ sơ ứng tuyển cho Công ty SDVICO, ngành thiết bị biển và thủy sản.',
    'Chấm hồ sơ đã được ẩn danh, chỉ dựa vào năng lực và kinh nghiệm trong văn bản.',
    '',
    'Thang điểm cố định, chấm đúng các trục sau, không thêm trục, không tự nghĩ tiêu chí:',
    axisLines,
    '',
    'Quy tắc:',
    '- Chỉ chấm theo bằng chứng có trong hồ sơ. Không suy đoán, không bịa (điều cấm 5).',
    '- Không quyết định đỗ hay trượt. Chỉ chấm điểm và nêu nhận xét (điều cấm 2).',
    '- Viết tiếng Việt tự nhiên. Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    '- tom_tat: đúng ba câu ngắn. diem_manh: đúng ba điểm. can_lam_ro: đúng ba điều.',
    '- Nếu hồ sơ quá sơ sài để chấm một trục, cho điểm thấp và ghi lý do vào can_lam_ro.',
    '',
    'Chỉ trả về một đối tượng JSON đúng dạng sau, không kèm chữ nào khác:',
    jsonShape(rubric)
  ].join('\n');
}

// Chấm một CV. Trả { score_json, summary, strengths, clarifications, overall, model }.
// score_json gồm điểm từng trục và điểm tổng thang 100.
export async function scoreCv(anonymizedText, rubric, { apiKey = process.env.GROQ_API_KEY } = {}) {
  if (!apiKey) {
    throw new Error('Thiếu GROQ_API_KEY. Đặt khóa Groq để chạy chấm CV.');
  }
  if (!anonymizedText || anonymizedText.trim().length < 20) {
    throw new Error('Văn bản CV quá ngắn để chấm.');
  }

  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(rubric) },
      { role: 'user', content: `Hồ sơ ứng tuyển đã ẩn danh, chấm theo thang điểm:\n\n${anonymizedText}` }
    ]
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Mô hình không trả về nội dung chấm.');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('Không đọc được JSON chấm điểm: ' + err.message);
  }

  // Kẹp điểm từng trục về 0..10 và tính điểm tổng thang 100.
  const axisScores = {};
  for (const axis of rubric.axes) {
    const rawScore = Number(parsed.diem_tung_truc?.[axis.key]);
    axisScores[axis.key] = Number.isFinite(rawScore) ? Math.max(0, Math.min(10, Math.round(rawScore))) : 0;
  }
  const overall = weightedScore(rubric, axisScores);

  const asThree = (arr) => (Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean).slice(0, 3) : []);

  return {
    score_json: {
      rubric: rubric.key,
      rubric_version: rubric.version,
      diem_tung_truc: axisScores,
      diem_tong: overall
    },
    summary: asThree(parsed.tom_tat).join(' '),
    strengths: asThree(parsed.diem_manh),
    clarifications: asThree(parsed.can_lam_ro),
    overall,
    model: MODEL
  };
}
