// Sinh bộ câu hỏi phỏng vấn và bài về nhà theo từng ứng viên, bằng Groq.
// Bám vào dự án và kinh nghiệm ứng viên đã ghi. Không bịa (điều cấm 5).
// Gọi trên văn bản CV đã ẩn danh (điều cấm 6): không cần tên hay liên hệ để ra câu hỏi.

import Groq from 'groq-sdk';

const MODEL = process.env.HR_INTERVIEW_MODEL || process.env.HR_SCREEN_MODEL || 'llama-3.3-70b-versatile';

function jsonShape() {
  return [
    '{',
    '  "cau_hoi_ky_thuat": [ "8 câu hỏi kỹ thuật bám dự án và kinh nghiệm trong CV" ],',
    '  "cau_hoi_hanh_vi": [ "4 câu hỏi hành vi" ],',
    '  "bai_ve_nha": { "de_bai": "đề bài làm trong khoảng ba giờ", "barem": [ "3 tới 5 tiêu chí chấm" ] }',
    '}'
  ].join('\n');
}

function buildSystemPrompt(position) {
  return [
    'Bạn là trợ lý chuẩn bị phỏng vấn cho Công ty SDVICO, ngành thiết bị biển và thủy sản.',
    `Ứng viên ứng tuyển: ${position}.`,
    'Dựa vào hồ sơ đã ẩn danh, soạn bộ câu hỏi và một bài về nhà riêng cho ứng viên này.',
    '',
    'Yêu cầu:',
    '- Đúng 8 câu hỏi kỹ thuật, bám sát dự án, công việc, kỹ năng ứng viên đã ghi trong hồ sơ. Hỏi sâu vào việc họ thực sự làm, không hỏi lý thuyết chung chung.',
    '- Đúng 4 câu hỏi hành vi, về cách làm việc nhóm, xử lý tình huống, trách nhiệm.',
    '- Một bài về nhà làm trong khoảng ba giờ, sát công việc thực tế của vị trí, kèm barem chấm từ 3 tới 5 tiêu chí.',
    '',
    'Quy tắc:',
    '- Chỉ dựa vào bằng chứng trong hồ sơ. Không bịa dự án hay kỹ năng ứng viên không nêu (điều cấm 5).',
    '- Viết tiếng Việt tự nhiên. Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    '',
    'Chỉ trả về một đối tượng JSON đúng dạng sau, không kèm chữ nào khác:',
    jsonShape()
  ].join('\n');
}

const asN = (arr, n) => (Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean).slice(0, n) : []);

// Sinh gói phỏng vấn. Trả { cau_hoi_ky_thuat, cau_hoi_hanh_vi, bai_ve_nha, model }.
export async function generateInterview(anonymizedText, { position = 'vị trí đã ứng tuyển', apiKey = process.env.GROQ_API_KEY } = {}) {
  if (!apiKey) throw new Error('Thiếu GROQ_API_KEY. Đặt khóa Groq để sinh câu hỏi phỏng vấn.');
  if (!anonymizedText || anonymizedText.trim().length < 20) throw new Error('Văn bản CV quá ngắn để sinh câu hỏi.');

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(position) },
      { role: 'user', content: `Hồ sơ ứng tuyển đã ẩn danh:\n\n${anonymizedText}` }
    ]
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Mô hình không trả về nội dung.');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('Không đọc được JSON câu hỏi: ' + err.message);
  }

  const barem = asN(parsed.bai_ve_nha?.barem, 5);
  return {
    cau_hoi_ky_thuat: asN(parsed.cau_hoi_ky_thuat, 8),
    cau_hoi_hanh_vi: asN(parsed.cau_hoi_hanh_vi, 4),
    bai_ve_nha: {
      de_bai: String(parsed.bai_ve_nha?.de_bai || '').trim(),
      barem
    },
    model: MODEL
  };
}
