// Soạn bài tương tác hâm nóng trang tuyển dụng từ kho góc bài.
// Máy soạn, người bấm Duyệt (điều cấm 1). Ưu tiên Groq khi có khóa, không thì lùi về bản có sẵn
// trong kho góc bài. Ràng buộc giọng văn và ranh giới sản phẩm ngay trong prompt (điều cấm 3, 4, 5).
//
// Groq được nạp bằng import động, chỉ khi có khóa, để module chạy được cả khi chưa cài groq-sdk
// (ví dụ khi chạy test bản lùi).

import { THEMES } from './engagement-topics.js';

const MODEL = process.env.HR_POST_MODEL || process.env.HR_SCREEN_MODEL || 'openai/gpt-oss-120b';

// Làm sạch theo chuẩn giọng văn: bỏ gạch dài, mũi tên, dấu chấm tròn giữa câu, ký hiệu thay chữ "và".
// Bỏ luôn markdown (**bold**, *italic*, __bold__, _italic_, # heading) vì Facebook không render,
// mô hình hay quen tay chèn vào và sẽ hiện literal trên bài đăng.
export function sanitizeVoice(text) {
  return String(text || '')
    .replace(/\s*[—–]\s*/g, ', ')      // gạch dài và gạch ngang dài thay bằng dấu phẩy
    .replace(/[→⇒►▶➤]/g, '')            // mũi tên
    .replace(/\s*[•·]\s*/g, ' ')       // dấu chấm tròn giữa câu
    .replace(/\s+&\s+/g, ' và ')       // ký hiệu và
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')   // **bold** -> giữ chữ
    .replace(/__([^_\n]+)__/g, '$1')       // __bold__ -> giữ chữ
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1$2')  // *italic* -> giữ chữ, tránh dính * lẻ
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1$2')    // _italic_ -> giữ chữ
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')    // # heading markdown -> bỏ ký hiệu
    .replace(/[ \t]+\n/g, '\n')        // bỏ khoảng trắng cuối dòng
    .replace(/\n{3,}/g, '\n\n')        // gộp nhiều dòng trống
    .trim();
}

// Soát lỗi giọng văn, trả về danh sách vi phạm (rỗng là sạch). Dùng cho test và tự soát.
export function checkVoice(text) {
  const loi = [];
  const s = String(text || '');
  if (/[—–]/.test(s)) loi.push('có gạch dài hoặc gạch ngang dài');
  if (/[→⇒►▶➤]/.test(s)) loi.push('có mũi tên');
  if (/[•·]/.test(s)) loi.push('có dấu chấm tròn giữa câu');
  if (/\s&\s/.test(s)) loi.push('dùng ký hiệu thay chữ và');
  if (/\*\*[^*\n]+\*\*/.test(s)) loi.push('còn markdown **bold**');
  if (/__[^_\n]+__/.test(s)) loi.push('còn markdown __bold__');
  if (/^\s{0,3}#{1,6}\s/m.test(s)) loi.push('còn tiêu đề markdown #');
  return loi;
}

// Soát chất lượng bài Groq trả về, cứng tay hơn checkVoice. Bài xấu thì quăng lỗi, để lùi
// về bản kho có sẵn thay vì đăng bài cụt hay chèn tiếng Anh sai xưng hô.
// Trả về danh sách vi phạm, rỗng là dùng được.
export function checkQuality(text) {
  const loi = checkVoice(text);
  const s = String(text || '').trim();
  if (!s) { loi.push('bài rỗng'); return loi; }

  // 1. Bài phải kết bằng dấu kết câu hợp lệ. Model hay cắt cụt giữa câu, đăng lên đọc dở.
  //    Chấp nhận: . ! ? … " ' ) ] } và emoji (dải Unicode phổ biến).
  const last = s.slice(-1);
  const ketHopLe = /[.!?…"'’”)\]}]/.test(last) || /\p{Extended_Pictographic}/u.test(last);
  if (!ketHopLe) loi.push('bài cụt giữa câu, không có dấu kết');

  // 2. Xưng "bạn" hoặc "các bạn" sai người đọc (đọc giả là ngư dân, chủ tàu, không phải học sinh).
  //    Dùng lookaround ký tự chữ VN thay \b vì \b không hiểu Unicode.
  if (/(^|[^A-Za-zÀ-ỹ])(bạn|các bạn|các bạn ơi)([^A-Za-zÀ-ỹ]|$)/i.test(s)) {
    loi.push('xưng "bạn/các bạn" sai người đọc, phải là "anh em" hoặc "bà con"');
  }

  // 3. Chèn từ tiếng Anh có sẵn từ Việt tương đương (follow, share, subscribe, like button).
  //    "comment" giữ được vì đã chừa trong prompt (bảo bà con "comment số").
  if (/\b(follow|share|subscribe|newsfeed|feed)\b/i.test(s)) {
    loi.push('chèn từ tiếng Anh không cần thiết (follow, share, subscribe)');
  }

  return loi;
}

// Tách bài thô của mô hình thành tiêu đề (dòng mở) và thân bài.
function splitHookBody(text) {
  const clean = sanitizeVoice(text);
  const idx = clean.indexOf('\n\n');
  if (idx > 0) {
    return { tieu_de: clean.slice(0, idx).replace(/\n/g, ' ').trim(), noi_dung: clean.slice(idx + 2).trim() };
  }
  const nl = clean.indexOf('\n');
  if (nl > 0) return { tieu_de: clean.slice(0, nl).trim(), noi_dung: clean.slice(nl + 1).trim() };
  return { tieu_de: clean.trim(), noi_dung: '' };
}

function systemPrompt() {
  return [
    'Bạn viết bài đăng Facebook để hâm nóng trang tuyển dụng của Công ty SDVICO, ngành thiết bị biển và thủy sản, trụ sở tại TP. Hồ Chí Minh, tiền thân ở Vũng Tàu.',
    'Đây KHÔNG phải tin tuyển dụng. Mục tiêu là tạo tương tác thật với ngư dân, chủ tàu và người quan tâm ngành biển, để trang có sức lan tỏa trước khi đăng tin tuyển dụng.',
    'Giọng gần gũi, câu ngắn, dễ đọc trên điện thoại. Độ dài khoảng 60 tới 150 từ.',
    'Bố cục: dòng đầu là một câu mở thu hút dạng tiêu đề ngắn, rồi một dòng trống, rồi thân bài. Kết bài nên có một câu mời bình luận hoặc theo dõi trang.',
    '',
    'Quy tắc bắt buộc:',
    '- Không bịa số liệu, giải thưởng, số lượng khách hàng, đối tác (điều cấm 5). Chỉ nêu dữ kiện được cung cấp.',
    '- Máy lọc nước biển thành nước ngọt và thiết bị xử lý dầu là sản phẩm SDVICO tự phát triển. Thiết bị giám sát hành trình, bộ đàm, máy định vị, dầu nhớt là hàng của hãng, SDVICO phân phối, lắp đặt, bảo hành. Không mô tả phần mềm của hãng như năng lực của SDVICO (điều cấm 4).',
    '- Không khẳng định về quy định nhà nước, IUU, Cục Thủy sản, Kiểm ngư (điều cấm 3).',
    '- Không hứa hẹn quá khả năng, không so sánh hạ thấp đối thủ.',
    '- Số theo chuẩn Việt Nam, dấu chấm ngăn cách hàng nghìn.',
    '- Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu, ký hiệu thay chữ và.',
    '- Không dùng markdown: không **bold**, không *italic*, không __gạch chân__, không # tiêu đề, không bảng. Facebook không hiển thị các ký hiệu này, sẽ hiện literal.',
    '- Xưng hô nhất quán "tụi mình" khi nói về SDVICO, không dùng "chúng tôi". Với ngư dân và chủ tàu xưng "anh em" hoặc "bà con", KHÔNG xưng "bạn" hay "các bạn" (nghe như quảng cáo cho học sinh, sai người đọc).',
    '- Dùng tiếng Việt, không chèn từ tiếng Anh khi có từ Việt tương đương: viết "theo dõi trang" thay "follow", "chia sẻ" thay "share", "thích" thay "like", "bình luận" thay "comment" (trừ khi đang bảo bà con gõ "comment số" quen tai thì được).',
    '- Địa danh: viết đúng "Bà Rịa Vũng Tàu" (không có dấu phẩy giữa hai từ). Sau sáp nhập là TP. Hồ Chí Minh.',
    '- Không để số điện thoại hay đường link trong bài, phần đó để riêng ở bình luận.',
    '',
    'Chỉ trả về nội dung bài đăng, không kèm lời giải thích nào khác.'
  ].join('\n');
}

function userPrompt(topic) {
  return [
    `Chủ đề: ${THEMES[topic.chu_de] || topic.chu_de}.`,
    `Góc bài cần viết: ${topic.goc}`,
    '',
    'Tham khảo một bản đã có, hãy viết bản mới cùng ý nhưng tươi và tự nhiên hơn, giữ đúng dữ kiện:',
    `${topic.tieu_de}`,
    '',
    `${topic.noi_dung}`
  ].join('\n');
}

// Soạn một bài tương tác cho một góc bài. Trả { tieu_de, noi_dung, generator }.
// Dùng Groq khi có khóa; lỗi hoặc thiếu khóa thì lùi về bản có sẵn, không làm hỏng lượt chạy.
export async function composeEngagementPost(topic, { apiKey = process.env.GROQ_API_KEY } = {}) {
  const fallback = {
    tieu_de: sanitizeVoice(topic.tieu_de),
    noi_dung: sanitizeVoice(topic.noi_dung),
    generator: 'fallback'
  };
  if (!apiKey) return fallback;
  try {
    const { default: Groq } = await import('groq-sdk');
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      max_tokens: 700,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: userPrompt(topic) }
      ]
    });
    const text = String(completion.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('Mô hình trả về rỗng.');
    const finish = completion.choices?.[0]?.finish_reason;
    if (finish && !['stop', 'end_turn', null, undefined].includes(finish)) {
      throw new Error(`Mô hình dừng bất thường (finish_reason=${finish}), bài có thể cụt.`);
    }
    const { tieu_de, noi_dung } = splitHookBody(text);
    if (!tieu_de || !noi_dung) throw new Error('Bài mô hình soạn thiếu tiêu đề hoặc thân bài.');
    const loi = checkQuality(`${tieu_de}\n\n${noi_dung}`);
    if (loi.length) throw new Error('Bài mô hình soạn không đạt: ' + loi.join('; '));
    return { tieu_de, noi_dung, generator: MODEL };
  } catch (e) {
    console.warn('Groq lỗi khi soạn bài tương tác, lùi về bản có sẵn:', e.message);
    return fallback;
  }
}
