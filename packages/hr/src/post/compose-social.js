// Soạn bài đăng tuyển dụng cho mạng xã hội (Facebook) từ dữ liệu vị trí.
// Máy soạn, người bấm Duyệt (điều cấm 1). Ưu tiên Groq khi có khóa, không thì lùi về bản ghép
// từ JD sẵn có. Ràng buộc giọng văn và ranh giới sản phẩm ngay trong prompt (điều cấm 4 và 5).

import Groq from 'groq-sdk';

const MODEL = process.env.HR_POST_MODEL || process.env.HR_SCREEN_MODEL || 'openai/gpt-oss-120b';
const EMAIL = process.env.HR_CONTACT_EMAIL || 'sdvicotuyendung@gmail.com';
const HOTLINE = '1900 23 23 49';

// Bản lùi: dùng bản facebook trong jd_versions nếu có, không thì ghép từ thông tin vị trí.
// Luôn trả về một bài dùng được, kể cả khi chưa có khóa mô hình.
export function composeFallback(job) {
  const v = job.jd_versions || {};
  if (v.facebook && String(v.facebook).trim()) return String(v.facebook).trim();
  const dong = [`Công ty SDVICO tuyển ${job.title}${job.location ? ' tại ' + job.location : ''}.`];
  if (job.short_desc) dong.push('', String(job.short_desc).trim());
  dong.push('', `Ứng tuyển: gửi CV về ${EMAIL}. Hotline ${HOTLINE}.`);
  return dong.join('\n');
}

function systemPrompt() {
  return [
    'Bạn viết bài đăng tuyển dụng ngắn cho Công ty SDVICO, ngành thiết bị biển và thủy sản, trụ sở Vũng Tàu.',
    'Mục tiêu: đăng lên Facebook để ứng viên thấy và gửi CV. Giọng gần gũi, câu ngắn, dễ đọc trên điện thoại.',
    'Độ dài khoảng 80 tới 160 từ. Nêu vị trí, một hai điểm hấp dẫn nhất, nơi làm việc, và cách ứng tuyển.',
    `Kết bài kêu gọi gửi CV về ${EMAIL} hoặc gọi ${HOTLINE}. Có thể thêm vài hashtag ngành biển và thủy sản.`,
    '',
    'Quy tắc bắt buộc:',
    '- Không bịa mức lương, phúc lợi, con số. Chỉ nêu khi dữ liệu vị trí có ghi (điều cấm 5).',
    '- Không mô tả phần mềm đối tác như năng lực của SDVICO (điều cấm 4).',
    '- Số theo chuẩn Việt Nam, dấu chấm ngăn cách hàng nghìn.',
    '- Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu, ký hiệu thay chữ và.',
    '',
    'Chỉ trả về nội dung bài đăng, không kèm lời giải thích nào khác.'
  ].join('\n');
}

function userPrompt(job) {
  const v = job.jd_versions || {};
  return [
    `Vị trí: ${job.title}.`,
    job.department ? `Phòng ban: ${job.department}.` : '',
    job.location ? `Nơi làm việc: ${job.location}.` : '',
    job.short_desc ? `Mô tả ngắn: ${job.short_desc}.` : '',
    job.requirements ? `Yêu cầu chính: ${job.requirements}.` : '',
    v.facebook ? `Bản Facebook đã có, tham khảo và viết hấp dẫn hơn: ${v.facebook}` : '',
    !v.facebook && v.job_board ? `Bản chi tiết, rút gọn lại cho ngắn gọn thu hút: ${v.job_board}` : ''
  ].filter(Boolean).join('\n');
}

// Soạn bài Facebook cho một vị trí. Trả { noi_dung, generator }.
// Dùng Groq khi có khóa; lỗi hoặc thiếu khóa thì lùi về bản ghép, không làm hỏng lượt chạy.
export async function composeFacebookPost(job, { apiKey = process.env.GROQ_API_KEY } = {}) {
  if (!apiKey) return { noi_dung: composeFallback(job), generator: 'fallback' };
  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      max_tokens: 700,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: userPrompt(job) }
      ]
    });
    const text = String(completion.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('Mô hình trả về rỗng.');
    return { noi_dung: text, generator: MODEL };
  } catch (e) {
    console.warn('Groq lỗi khi soạn bài, lùi về bản ghép:', e.message);
    return { noi_dung: composeFallback(job), generator: 'fallback' };
  }
}
