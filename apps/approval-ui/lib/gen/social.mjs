// Sinh text bài mạng xã hội cho một sản phẩm: thân bài có emoji + khối hashtag.
// Giọng brand-voice, hàng rào product-boundary (không bịa thông số, không nhận vơ phần mềm đối tác).
import { assessDraft } from './compliance.mjs';
import { knownFactValues, testFactValues, PRODUCT_FACTS } from './product-facts.mjs';
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
    'Giọng gần gũi bà con ngư dân, câu ngắn, trả lời ngay câu đầu, đọc trên điện thoại. Nhấn lợi ích cụ thể: ra khơi an toàn, tuân thủ quy định, tiết kiệm nhiên liệu và nước ngọt.',
    'Chèn vài emoji hợp cảnh biển và thiết bị cho sinh động (ví dụ ⚓ 🚢 🌊 📡 💧 🛟 📞), đừng lạm dụng.',
    'Số theo chuẩn Việt Nam (dấu chấm ngăn hàng nghìn). KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ nêu thông số có trong danh sách được phép; không có thì nói chung chung, không nêu số.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO; chỉ nói phân phối, lắp đặt, tương thích.',
    isTikTok
      ? 'Đây là chú thích cho video TikTok: 2 tới 4 câu thật ngắn, cuốn, kết bằng mời gọi.'
      : 'Đây là bài Facebook: 4 tới 6 câu, có thể có 2 tới 3 dòng gạch đầu lợi ích (dùng emoji làm đầu dòng, không dùng dấu chấm tròn).',
    'Kết bằng lời mời rõ ràng, đúng kiểu bán hàng: liên hệ SDVICO hoặc gọi tổng đài 1900 23 23 49 để được tư vấn, báo giá và lắp đặt. KHÔNG tự viết hashtag, hệ thống sẽ tự thêm.',
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

  const res = await genWithRetry(ai, {
    model: MKT_MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 1.05 },
  });
  const parsed = parseJson(res.text || '');
  const body = String(parsed.body || '').trim();
  const headline = String(parsed.headline || '').replace(/#[^\s#]+/g, '').trim();
  if (!body) throw new Error('Gemini trả rỗng.');

  const tags = hashtagBlock(productGroup);
  const text = `${body}\n\n${tags}`;

  const assessment = assessDraft(text, {
    knownFactValues: knownFactValues(facts),
    testFactValues: testFactValues(facts),
  });
  return { text, body, headline, hashtags: tags, assessment };
}

// Bài CONTENT (không bán trực tiếp): viết theo một chủ đề để nuôi trang, lấy tương tác.
// AI tự nghĩ nội dung theo chủ đề, KHÔNG bịa tin tức/số liệu cụ thể (điều cấm 5).
export async function generateContentPost({ topic, facts = PRODUCT_FACTS } = {}) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const chosen = topic || CONTENT_TOPICS[Math.floor(Math.random() * CONTENT_TOPICS.length)];

  const system = [
    'Bạn viết bài cộng đồng cho trang của Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Đây KHÔNG phải bài bán hàng. Mục tiêu là gần gũi, hữu ích, lấy tương tác từ bà con ngư dân.',
    'Giọng ấm áp, gần gũi, câu ngắn, đọc trên điện thoại. Chèn vài emoji hợp cảnh biển (⚓ 🚢 🌊 🐟 🎣), đừng lạm dụng.',
    'Số theo chuẩn Việt Nam. KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'KHÔNG bịa tin tức, số liệu, sự kiện, quy định cụ thể. Nói chung, đúng, không phịa chi tiết.',
    'KHÔNG mô tả phần mềm đối tác như của SDVICO. Có thể nhắc SDVICO đồng hành cùng bà con một cách nhẹ nhàng ở cuối.',
    '4 tới 6 câu. Có thể kết bằng một câu hỏi mở để bà con bình luận, hoặc lời chúc ra khơi bình an.',
    'KHÔNG tự viết hashtag, hệ thống tự thêm.',
  ].join('\n');

  const user = [
    `Chủ đề: ${chosen}.`,
    'Trả về JSON đúng dạng, không thêm chữ ngoài JSON:',
    '{"headline": "tiêu đề ngắn 6 tới 12 từ, cuốn, có thể kèm 1 emoji", "body": "thân bài (chưa gồm hashtag)"}',
  ].join('\n');

  const res = await genWithRetry(ai, {
    model: MKT_MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 1.1 },
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
  return { text, body, headline, topic: chosen, hashtags: tags, assessment };
}
