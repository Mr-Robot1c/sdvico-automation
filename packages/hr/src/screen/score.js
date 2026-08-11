// Chấm một CV đã ẩn danh bằng Google Gemini, theo thang điểm cố định.
// Mô hình chỉ chấm theo trục có sẵn, không tự nghĩ tiêu chí (cổng an toàn mục 2).
// Đầu ra: điểm từng trục, ba câu tóm tắt, ba điểm mạnh, ba điểm cần làm rõ khi phỏng vấn.
// Không đưa ra quyết định đỗ hay trượt (điều cấm 2): việc đó của con người.
//
// Dùng Gemini API miễn phí (Google AI Studio) thay cho API tính phí.
// Ẩn danh trước khi gọi (mục 1, điều cấm 6): giảm dữ liệu nhận dạng rời hạ tầng công ty.

import { GoogleGenAI } from '@google/genai';
import { weightedScore } from './rubric.js';

// Model mặc định miễn phí. Đổi bằng biến môi trường HR_SCREEN_MODEL nếu muốn model khác.
const MODEL = process.env.HR_SCREEN_MODEL || 'gemini-2.0-flash';

// Lược đồ JSON theo định dạng Gemini (kiểu viết hoa, không có additionalProperties).
function buildSchema(rubric) {
  const scoreProps = {};
  for (const axis of rubric.axes) {
    scoreProps[axis.key] = { type: 'INTEGER' };
  }
  return {
    type: 'OBJECT',
    properties: {
      diem_tung_truc: {
        type: 'OBJECT',
        properties: scoreProps,
        required: rubric.axes.map((a) => a.key)
      },
      tom_tat: { type: 'ARRAY', items: { type: 'STRING' } },
      diem_manh: { type: 'ARRAY', items: { type: 'STRING' } },
      can_lam_ro: { type: 'ARRAY', items: { type: 'STRING' } }
    },
    required: ['diem_tung_truc', 'tom_tat', 'diem_manh', 'can_lam_ro']
  };
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
    '- tom_tat: đúng ba câu ngắn tóm tắt hồ sơ.',
    '- diem_manh: đúng ba điểm mạnh cụ thể.',
    '- can_lam_ro: đúng ba điều cần làm rõ khi phỏng vấn.',
    '- Nếu hồ sơ quá sơ sài để chấm một trục, cho điểm thấp và ghi lý do vào can_lam_ro.'
  ].join('\n');
}

// Chấm một CV. Trả { score_json, summary, strengths, clarifications, overall, model }.
// score_json gồm điểm từng trục và điểm tổng thang 100.
export async function scoreCv(anonymizedText, rubric, { apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY } = {}) {
  if (!apiKey) {
    throw new Error('Thiếu GEMINI_API_KEY. Đặt khóa Google AI Studio để chạy chấm CV.');
  }
  if (!anonymizedText || anonymizedText.trim().length < 20) {
    throw new Error('Văn bản CV quá ngắn để chấm.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Hồ sơ ứng tuyển đã ẩn danh, chấm theo thang điểm:\n\n${anonymizedText}`,
    config: {
      systemInstruction: buildSystemPrompt(rubric),
      responseMimeType: 'application/json',
      responseSchema: buildSchema(rubric),
      temperature: 0.2,
      maxOutputTokens: 2000
    }
  });

  const raw = response.text;
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
