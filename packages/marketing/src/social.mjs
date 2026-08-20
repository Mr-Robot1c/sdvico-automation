// Sinh text bài mạng xã hội cho một sản phẩm: thân bài có emoji + khối hashtag.
// Giọng brand-voice, hàng rào product-boundary (không bịa thông số, không nhận vơ phần mềm đối tác).
import { assessDraft } from './compliance.mjs';
import { knownFactValues, testFactValues, PRODUCT_FACTS } from './product-facts.mjs';
import { guardLines, guardViolations } from './product-guard.mjs';
import { DEFAULT_HASHTAGS, productHashtags, getFeatures, CONTENT_TOPICS } from './products.mjs';

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function genWithRetry(ai, params, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await ai.models.generateContent(params); }
    catch (e) {
      last = e;
      if (!/503|429|UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED/i.test(String(e?.message || e)) || i === tries - 1) throw e;
      await sleep(1500 * 2 ** i);
    }
  }
  throw last;
}

// Các góc tiếp cận BÁN HÀNG để mỗi bài khác nhau (chống trùng), nhưng góc nào cũng
// xoay quanh sản phẩm và kết bằng mời mua/liên hệ (không lạc thành bài tâm sự chung chung).
const ANGLES = [
  'mở bằng một nỗi lo thật khi đi biển rồi giới thiệu sản phẩm giải quyết, mời bà con sắm',
  'nhấn tiết kiệm chi phí cụ thể mỗi chuyến biển nhờ sản phẩm rồi mời liên hệ mua',
  'làm nổi bật một đặc điểm mạnh của sản phẩm và lợi ích thiết thực rồi mời đặt hàng',
  'nhấn ra khơi an toàn và đúng quy định nhờ sản phẩm rồi mời lắp đặt',
  'so sánh nhẹ trước và sau khi trang bị sản phẩm rồi mời bà con liên hệ',
  'nhấn SDVICO phân phối chính hãng, lắp đặt tận bến, bảo hành, rồi mời bà con đặt ngay',
];

function parseJson(t) {
  let s = (t || '').trim();
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (f) s = f[1].trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

// Khối hashtag: thẻ chung mặc định + BỘ thẻ riêng đúng sản phẩm, khử trùng.
export function hashtagBlock(productGroup, extra = []) {
  const tags = [...DEFAULT_HASHTAGS, ...productHashtags(productGroup)];
  for (const t of extra) if (t) tags.push(t.startsWith('#') ? t : `#${t}`);
  return [...new Set(tags)].join(' ');
}

// channel: 'facebook' | 'tiktok'. productName: tên sạch của sản phẩm. hasVideo: có kèm video không.
export async function generateSocialPost({ productGroup, productName, channel, hasVideo, facts = PRODUCT_FACTS }) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const allowed = facts.filter((f) => f.value)
    .map((f) => `${f.brand || ''} ${f.model || ''} ${f.attribute}: ${f.value}${f.verified ? '' : ' (CHƯA XÁC NHẬN)'}`.trim());

  const features = getFeatures(productGroup);
  const isTikTok = channel === 'tiktok';
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const system = [
    'Bạn viết bài mạng xã hội cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    `ĐÂY LÀ BÀI BÁN HÀNG cho đúng MỘT sản phẩm: "${productName}". Bắt buộc: nêu rõ tên sản phẩm này, 1 tới 2 lợi ích thật của nó, và MỜI bà con liên hệ SDVICO để mua hoặc lắp đặt (SDVICO phân phối chính hãng, lắp đặt tận bến, bảo hành). Không viết chung chung như bài tâm sự, không lạc sang sản phẩm khác.`,
    'Giọng gần gũi bà con ngư dân, câu ngắn, trả lời ngay câu đầu, đọc trên điện thoại. Nhấn lợi ích ĐÚNG VỚI SẢN PHẨM ĐANG VIẾT (xem SỰ THẬT NGHỀ bên dưới); KHÔNG gán lợi ích của sản phẩm khác.',
    ...guardLines(productName + ' ' + productGroup),
    'Chèn vài emoji hợp cảnh biển và thiết bị cho sinh động (ví dụ ⚓ 🚢 🌊 📡 💧 🛟 📞), đừng lạm dụng.',
    'Tuổi, số năm, ngày tháng, số lượng viết bằng CHỮ SỐ (ví dụ 55 tuổi, 30 năm, ngày 20/8), TUYỆT ĐỐI KHÔNG viết bằng chữ ("năm mươi lăm tuổi", "ba mươi năm" là SAI). Số lớn dùng dấu chấm ngăn hàng nghìn (3.000.000 đồng). KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ nêu thông số có trong danh sách được phép; không có thì nói chung chung, không nêu số.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO; chỉ nói phân phối, lắp đặt, tương thích.',
    isTikTok
      ? 'Đây là chú thích cho video TikTok: 2 tới 4 câu thật ngắn, cuốn, kết bằng mời gọi.'
      : 'Đây là bài Facebook: 4 tới 6 câu, có thể có 2 tới 3 dòng gạch đầu lợi ích (dùng emoji làm đầu dòng, không dùng dấu chấm tròn).',
    'Kết bằng lời mời rõ ràng, đúng kiểu bán hàng: NHẮN TIN cho Page SDVICO ở đây hoặc gọi tổng đài 1900 23 23 49 để được tư vấn, báo giá và lắp đặt tận bến. KHÔNG tự viết hashtag, hệ thống sẽ tự thêm.',
    'Mỗi bài phải KHÁC các bài trước: khác câu mở đầu, khác cách triển khai, khác tiêu đề.',
    '',
    allowed.length ? 'Thông số được phép nêu:\n' + allowed.join('\n') : 'Chưa có thông số được duyệt: nói chung chung, không nêu số cụ thể.',
  ].join('\n');

  const user = [
    `Sản phẩm: "${productName}".`,
    features.length ? 'Đặc điểm sản phẩm (nêu đúng, chọn vài ý nổi bật, không thêm thông số ngoài danh sách này):\n- ' + features.join('\n- ') : '',
    hasVideo ? 'Bài có kèm video minh họa.' : 'Bài dùng ảnh minh họa.',
    `Góc tiếp cận lần này: ${angle}.`,
    'Trả về JSON đúng dạng, không thêm chữ ngoài JSON:',
    '{"headline": "tiêu đề ngắn 6 tới 12 từ, riêng biệt, có thể kèm 1 emoji", "body": "thân bài (chưa gồm hashtag)"}',
  ].filter(Boolean).join('\n');

  const topic = `${productName} ${productGroup}`;
  let body = '';
  let headline = '';
  let violations = [];
  // Sinh -> quét SỰ THẬT NGHỀ -> dính thì sinh lại 1 lần (19/8: bài SEA-40 từng bịa "bớt chở nước,
  // nhẹ tàu, tiết kiệm dầu", cấp trên phản hồi sai nghề). Đồng bộ với apps/approval-ui/lib/gen/social.mjs.
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = !violations.length ? '' :
      `\n\nLẦN TRƯỚC VIẾT SAI NGHỀ, phải bỏ hẳn các ý: ${violations.map((v) => `"${v.phrase}"`).join(', ')}. ${violations[0].why}`;
    const res = await genWithRetry(ai, {
      model: MKT_MODEL,
      contents: user + extra,
      config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 1.05 },
    });
    const parsed = parseJson(res.text || '');
    body = String(parsed.body || '').trim();
    headline = String(parsed.headline || '').replace(/#[^\s#]+/g, '').trim();
    if (!body) throw new Error('Gemini trả rỗng.');
    violations = guardViolations(`${headline}\n${body}`, topic);
    if (!violations.length) break;
  }

  const tags = hashtagBlock(productGroup);
  const text = `${body}\n\n${tags}`;

  const assessment = assessDraft(text, {
    knownFactValues: knownFactValues(facts),
    testFactValues: testFactValues(facts),
  });
  if (violations.length) {
    assessment.flags = { ...(assessment.flags || {}), domain: violations.map((v) => `${v.phrase} (${v.product})`) };
    if (assessment.risk === 'none') assessment.risk = 'amber';
  }
  return { text, body, headline, hashtags: tags, assessment };
}

// Chỉ dẫn cấu trúc bài cho từng LOẠI content. AI phải theo đúng dạng để bài hữu ích, không sáo rỗng.
const CONTENT_TYPE_INSTRUCTION = {
  checklist:
    'Bài dạng CHECKLIST. Viết 1 câu mở ngắn dẫn dắt, XUỐNG DÒNG TRỐNG, rồi liệt kê 5 tới 7 mục ĐÁNH SỐ (1. 2. 3. ...). MỖI MỤC PHẢI XUỐNG DÒNG RIÊNG (dùng 2 ký tự xuống dòng \\n\\n giữa các mục để cách 1 dòng trống nhìn cho thoáng, KHÔNG viết liền nhau trong 1 đoạn). Mỗi mục dài 8 tới 15 từ, đầu mục có 1 emoji hợp cảnh (⚓ 🛟 🌊 📡 💧 ⚙️). Sau mục cuối, XUỐNG DÒNG TRỐNG, kết bằng 1 câu nhắc bà con lưu bài hoặc chia sẻ cho anh em.',
  glossary:
    'Bài dạng GIẢI THÍCH THUẬT NGỮ. Câu đầu ĐỊNH NGHĨA gọn trong 1 dòng (dạng "X là..."). Sau đó 3 tới 4 câu giải thích ngắn: dùng để làm gì, khi nào bà con gặp, cần lưu ý gì. Không đi sâu kỹ thuật, dùng ví dụ đời thường. Không bịa số liệu.',
  tip:
    'Bài dạng MẸO / KINH NGHIỆM. Nêu vấn đề bà con hay gặp trong 1 câu, chỉ ra 2 tới 3 NGUYÊN NHÂN hoặc thói quen sai lầm (đánh dấu bằng ⚠️), rồi 2 tới 3 CÁCH XỬ LÝ (đánh dấu bằng ✅). Ngắn, thực dụng, không lý thuyết chung chung.',
  qa:
    'Bài dạng HỎI - ĐÁP. Bắt đầu bằng dòng "❓ Hỏi: <câu hỏi>" rồi dòng "💡 Đáp: <câu trả lời gọn 3 tới 5 câu>". Đáp phải đi thẳng, chính xác, có thể mở rộng 1 tới 2 lưu ý. Không lan man.',
  engage:
    'Bài dạng ĐẶT CÂU HỎI để bà con bình luận. Rất ngắn: 2 tới 3 câu dẫn dắt cảm xúc/kỷ niệm, rồi KẾT bằng câu hỏi mở (dấu ? cuối) mời bà con kể chuyện trong bình luận. Không nêu sản phẩm, không nhắc SDVICO trong bài này.',
  portrait:
    'Bài dạng CHÂN DUNG NGƯỜI TRONG NGHỀ, viết HOÀN CHỈNH để đăng ngay (sếp chốt 19/8: điền sẵn, không để ô trống). Nhân vật là NGƯỜI ĐIỂN HÌNH: gọi thân mật kiểu "bác Ba", "chú Bảy", "anh Tư" (KHÔNG họ tên đầy đủ), tuổi khoảng 45-65 (hoặc 28-35 nếu ngư dân trẻ), địa phương ven biển Bà Rịa Vũng Tàu (Long Hải, Phước Tỉnh, Bình Châu, Lộc An, Bến Đá) hoặc miền Trung, số năm bám biển. Cấu trúc: 1 câu mở giới thiệu (tên gọi + tuổi + địa phương + số năm đi biển; tuổi và số năm viết bằng CHỮ SỐ, ví dụ "bác Ba 55 tuổi", "30 năm bám biển", KHÔNG viết "năm mươi lăm tuổi"), 2-3 câu bối cảnh nghề, 1 câu NÓI của nhân vật trong ngoặc kép (giọng chân chất, đúng đời sống ngư dân, không sáo), 1 câu kết chúc bà con. KHÔNG dùng ngoặc vuông, KHÔNG để chỗ trống, KHÔNG ghi chú "khung sườn"; KHÔNG gán số liệu doanh thu/sản lượng cụ thể cho nhân vật.',
  news:
    'Bài dạng NHỊP THỜI SỰ NGÀNH - CHỜ CẤP QUẢN LÝ DUYỆT. Viết TRUNG THỰC, KHÔNG nêu con số/ngày tháng/mốc quy định cụ thể (điều cấm 5). Dùng ngôn ngữ chung: "quy định mới", "gần đây", "theo cập nhật của cơ quan quản lý". Cấu trúc: 1 câu nêu chủ đề, 2-3 câu bối cảnh chung mà bà con cần biết, 1 dòng khuyên bà con theo dõi kênh chính thức của Cục Thủy sản/địa phương. Chèn đầu bài: "⚠️ CẦN CẤP QUẢN LÝ DUYỆT - nội dung chạm quy định nhà nước (điều cấm 3)".',
};

// Bài CONTENT (không bán trực tiếp): viết theo một chủ đề để nuôi trang, lấy tương tác.
// AI tự nghĩ nội dung theo chủ đề, KHÔNG bịa tin tức/số liệu cụ thể (điều cấm 5).
// Chấp nhận 3 dạng đầu vào: {type,topic} object, string chủ đề, hoặc không truyền (random).
export async function generateContentPost({ topic, facts = PRODUCT_FACTS } = {}) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let chosen = topic;
  if (!chosen) chosen = CONTENT_TOPICS[Math.floor(Math.random() * CONTENT_TOPICS.length)];
  // Chuẩn hóa: nếu chỉ là string thì suy ngược object cùng type, mặc định 'tip'.
  if (typeof chosen === 'string') {
    const match = CONTENT_TOPICS.find((t) => (typeof t === 'object' ? t.topic === chosen : t === chosen));
    chosen = typeof match === 'object' ? match : { type: 'tip', topic: chosen };
  }
  const type = chosen.type || 'tip';
  const topicText = chosen.topic || String(chosen);
  const structure = CONTENT_TYPE_INSTRUCTION[type] || CONTENT_TYPE_INSTRUCTION.tip;

  const system = [
    'Bạn viết bài cộng đồng cho trang của Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Đây KHÔNG phải bài bán hàng. Mục tiêu là hữu ích thật cho bà con ngư dân đọc là học được điều gì đó, hoặc để lại bình luận.',
    'Giọng ấm áp, gần gũi, câu ngắn, đọc trên điện thoại. Chèn vài emoji hợp cảnh biển (⚓ 🚢 🌊 🐟 🎣), đừng lạm dụng.',
    'Tuổi, số năm, ngày tháng, số lượng viết bằng CHỮ SỐ (ví dụ 55 tuổi, 30 năm, ngày 20/8), TUYỆT ĐỐI KHÔNG viết bằng chữ ("năm mươi lăm tuổi", "ba mươi năm" là SAI). Số lớn dùng dấu chấm ngăn hàng nghìn. KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'KHÔNG bịa tin tức, số liệu, sự kiện, quy định cụ thể. Nói chung, đúng, không phịa chi tiết.',
    'KHÔNG mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO.',
    'Chỉ nhắc SDVICO đồng hành nếu hợp cảnh, tối đa 1 lần cuối bài. Bài dạng ĐẶT CÂU HỎI thì tuyệt đối không nhắc thương hiệu.',
    'KHÔNG tự viết hashtag, hệ thống tự thêm.',
    '',
    structure,
  ].join('\n');

  const user = [
    `Chủ đề: ${topicText}.`,
    'Trả về JSON đúng dạng, không thêm chữ ngoài JSON:',
    '{"headline": "tiêu đề ngắn 6 tới 12 từ, cuốn, có thể kèm 1 emoji", "body": "thân bài (chưa gồm hashtag), theo đúng cấu trúc đã dặn"}',
  ].join('\n');

  const res = await genWithRetry(ai, {
    model: MKT_MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 1.05 },
  });
  const parsed = parseJson(res.text || '');
  const body = String(parsed.body || '').trim();
  const headline = String(parsed.headline || '').replace(/#[^\s#]+/g, '').trim();
  if (!body) throw new Error('Gemini trả rỗng.');

  const tags = hashtagBlock(null); // chỉ hashtag mặc định, không thẻ sản phẩm
  const text = `${body}\n\n${tags}`;
  const assessment = assessDraft(text, {
    knownFactValues: knownFactValues(facts),
    testFactValues: testFactValues(facts),
  });
  return { text, body, headline, topic: topicText, contentType: type, hashtags: tags, assessment };
}
