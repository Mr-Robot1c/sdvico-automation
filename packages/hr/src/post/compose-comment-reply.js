// Phân loại bình luận rồi soạn gợi ý trả lời khi cần. Máy soạn, người bấm Duyệt (điều cấm 1)
// — hàm này KHÔNG đăng gì, chỉ trả về phân loại và (nếu cần) câu chữ để đẩy vào approval_queue.
//
// Ba loại, ba hướng xử lý (quyết định ở nơi gọi, không phải ở đây):
//   muon_biet_them — hỏi thêm chi tiết → soạn câu mời nhắn tiếp qua Messenger (không trả lời
//                    chi tiết ngay tại bình luận công khai, tránh lộ thông tin sai/thiếu ngữ cảnh).
//   tich_cuc       — khen, ủng hộ, không hỏi gì → không cần soạn chữ, nơi gọi tự react.
//   khac           — bỏ qua.

import Groq from 'groq-sdk';

const MODEL = process.env.HR_POST_MODEL || process.env.HR_SCREEN_MODEL || 'openai/gpt-oss-120b';
const EMAIL = process.env.HR_CONTACT_EMAIL || 'inoudead@gmail.com';
const HOTLINE = '1900 23 23 49';

// Bản lùi không cần khóa mô hình: heuristic từ khoá, đủ dùng khi chưa có GROQ_API_KEY hoặc gọi lỗi.
const DETAIL_PATTERNS = [
  /\?/, /chi ti[eế]t/i, /gi[aá] (bao nhi[eê]u|c[aả]|nh[uư] th[eế] n[aà]o)/i, /l[uư][oơ]ng/i,
  /li[eê]n h[eệ]/i, /s[oố] ?(đi[eệ]n tho[aạ]i|dt)/i, /[uứ]ng tuy[eể]n/i, /y[eê]u c[aầ]u/i,
  /tuy[eể]n (kh[oô]ng|n[uữ]a)/i, /c[oò]n tuy[eể]n/i, /l[aà]m (ở ?đ[aâ]u|g[iì])/i,
];
const POSITIVE_PATTERNS = [
  /\bhay\b/i, /tuy[eệ]t/i, /[uủ]ng h[oộ]/i, /good/i, /tốt/i, /like/i, /qu[aá] (t[oố]t|hay|đ[eẹ]p)/i,
  /👍|❤️|😍|🔥|👏/,
];

// Heuristic đơn giản, không gọi mô hình. Dùng làm bản lùi hoặc khi bình luận quá ngắn.
function classifyHeuristic(comment) {
  const text = (comment || '').trim();
  if (!text) return 'khac';
  if (DETAIL_PATTERNS.some((re) => re.test(text))) return 'muon_biet_them';
  if (POSITIVE_PATTERNS.some((re) => re.test(text))) return 'tich_cuc';
  return 'khac';
}

function classifyPrompt() {
  return [
    'Bạn phân loại bình luận Facebook dưới bài tuyển dụng của Công ty SDVICO thành đúng MỘT nhãn:',
    '- "muon_biet_them": người bình luận hỏi thêm thông tin (lương, yêu cầu, cách ứng tuyển, còn tuyển không, liên hệ thế nào...) hoặc đặt câu hỏi bất kỳ liên quan tới vị trí.',
    '- "tich_cuc": chỉ khen, ủng hộ, cảm thán tích cực, KHÔNG hỏi gì thêm.',
    '- "khac": spam, không liên quan, tiêu cực, hoặc không rõ ý.',
    'Chỉ trả về JSON: {"nhan": "muon_biet_them"} hoặc {"nhan": "tich_cuc"} hoặc {"nhan": "khac"}, không kèm chữ nào khác.'
  ].join('\n');
}

export async function classifyComment(comment, { apiKey = process.env.GROQ_API_KEY } = {}) {
  const fallback = classifyHeuristic(comment);
  if (!apiKey || !comment?.trim()) return fallback;
  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0,
      // 256 token: model suy luận (gpt-oss) cần chỗ cho suy luận rồi mới trả JSON; 40 token
      // khiến nó lỗi json_validate_failed và luôn rơi về phân loại bằng regex.
      max_tokens: 256,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: classifyPrompt() },
        { role: 'user', content: comment }
      ]
    });
    const text = completion.choices?.[0]?.message?.content || '{}';
    const obj = JSON.parse(text);
    if (['muon_biet_them', 'tich_cuc', 'khac'].includes(obj.nhan)) return obj.nhan;
    return fallback;
  } catch (e) {
    console.warn('Groq lỗi khi phân loại bình luận, lùi về heuristic:', e.message);
    return fallback;
  }
}

// Bản lùi: không cần khóa mô hình, luôn mời được, không bịa thông tin, không tự trả lời chi tiết.
export function composeFallback() {
  return `Chào bạn, cảm ơn bạn đã quan tâm. Bạn nhắn tin trực tiếp cho page qua Messenger hoặc gửi CV về ${EMAIL} (hotline ${HOTLINE}) để được tư vấn chi tiết hơn nhé.`;
}

function systemPrompt() {
  return [
    'Bạn trả lời bình luận Facebook cho Công ty SDVICO, ngành thiết bị biển và thủy sản.',
    'Người bình luận đang hỏi thêm chi tiết. Mục tiêu duy nhất: cảm ơn ngắn gọn rồi MỜI HỌ NHẮN TIN',
    'TRỰC TIẾP QUA MESSENGER của trang (hoặc gửi CV) để được tư vấn kỹ hơn — KHÔNG trả lời chi tiết',
    'câu hỏi ngay tại bình luận công khai này (tránh trả lời thiếu ngữ cảnh hoặc sai thông tin cụ thể).',
    'Độ dài 1 tới 2 câu. Giọng gần gũi, lịch sự, không sáo rỗng.',
    '',
    'Quy tắc bắt buộc:',
    '- Không hứa hẹn kết quả tuyển dụng, không hứa lương/phúc lợi cụ thể nếu không có trong bài gốc (điều cấm 5).',
    '- Không mô tả phần mềm đối tác như năng lực của SDVICO (điều cấm 4).',
    '- Không tự trả lời số liệu/chi tiết ngay tại đây — luôn hướng người bình luận sang Messenger hoặc CV.',
    `- Câu mời phải nhắc rõ "nhắn Messenger" (hoặc "gửi CV về ${EMAIL}").`,
    '- Số theo chuẩn Việt Nam. Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    '',
    'Chỉ trả về câu trả lời, không kèm lời giải thích nào khác.'
  ].join('\n');
}

function userPrompt({ postContext, comment }) {
  return [
    postContext ? `Bài đăng gốc: ${postContext}` : '',
    `Bình luận cần trả lời: ${comment}`
  ].filter(Boolean).join('\n');
}

// Soạn câu trả lời gợi ý cho một bình luận thuộc loại muon_biet_them. Trả { goi_y_tra_loi, generator }.
export async function composeCommentReply({ postContext, comment }, { apiKey = process.env.GROQ_API_KEY } = {}) {
  if (!comment || !comment.trim()) return { goi_y_tra_loi: composeFallback(), generator: 'fallback' };
  if (!apiKey) return { goi_y_tra_loi: composeFallback(), generator: 'fallback' };
  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      max_tokens: 300,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: userPrompt({ postContext, comment }) }
      ]
    });
    const text = String(completion.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('Mô hình trả về rỗng.');
    return { goi_y_tra_loi: text, generator: MODEL };
  } catch (e) {
    console.warn('Groq lỗi khi soạn trả lời comment, lùi về bản chung:', e.message);
    return { goi_y_tra_loi: composeFallback(), generator: 'fallback' };
  }
}
