// Sinh text bài mạng xã hội cho một sản phẩm: thân bài có emoji + khối hashtag.
// Giọng brand-voice, hàng rào product-boundary (không bịa thông số, không nhận vơ phần mềm đối tác).
import { assessDraft } from './compliance.mjs';
import { knownFactValues, testFactValues, PRODUCT_FACTS } from './product-facts.mjs';
import { DEFAULT_HASHTAGS, productHashtag, getFeatures } from './products.mjs';

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

// Khối hashtag: mặc định + thẻ riêng sản phẩm, khử trùng.
export function hashtagBlock(productGroup, extra = []) {
  const tags = [...DEFAULT_HASHTAGS];
  const ph = productHashtag(productGroup);
  if (ph) tags.push(ph);
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
  const system = [
    'Bạn viết bài mạng xã hội cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Giọng gần gũi bà con ngư dân, câu ngắn, trả lời ngay câu đầu, đọc trên điện thoại. Nhấn lợi ích cụ thể: ra khơi an toàn, tuân thủ quy định, tiết kiệm nhiên liệu và nước ngọt.',
    'Chèn vài emoji hợp cảnh biển và thiết bị cho sinh động (ví dụ ⚓ 🚢 🌊 📡 💧 🛟 📞), đừng lạm dụng.',
    'Số theo chuẩn Việt Nam (dấu chấm ngăn hàng nghìn). KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ nêu thông số có trong danh sách được phép; không có thì nói chung chung, không nêu số.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO; chỉ nói phân phối, lắp đặt, tương thích.',
    isTikTok
      ? 'Đây là chú thích cho video TikTok: 2 tới 4 câu thật ngắn, cuốn, kết bằng mời gọi.'
      : 'Đây là bài Facebook: 4 tới 6 câu, có thể có 2 tới 3 dòng gạch đầu lợi ích (dùng emoji làm đầu dòng, không dùng dấu chấm tròn).',
    'Kết bằng lời mời gọi tổng đài 1900 23 23 49. KHÔNG tự viết hashtag, hệ thống sẽ tự thêm.',
    '',
    allowed.length ? 'Thông số được phép nêu:\n' + allowed.join('\n') : 'Chưa có thông số được duyệt: nói chung chung, không nêu số cụ thể.',
  ].join('\n');

  const user = [
    `Sản phẩm: "${productName}".`,
    features.length ? 'Đặc điểm sản phẩm (nêu đúng, chọn vài ý nổi bật, không thêm thông số ngoài danh sách này):\n- ' + features.join('\n- ') : '',
    hasVideo ? 'Bài có kèm video minh họa.' : 'Bài dùng ảnh minh họa.',
    'Viết phần thân bài (chưa gồm hashtag).',
  ].filter(Boolean).join('\n');

  const res = await genWithRetry(ai, {
    model: MKT_MODEL, contents: user, config: { systemInstruction: system },
  });
  let body = (res.text || '').trim();
  if (!body) throw new Error('Gemini trả rỗng.');

  const tags = hashtagBlock(productGroup);
  const text = `${body}\n\n${tags}`;

  const assessment = assessDraft(text, {
    knownFactValues: knownFactValues(facts),
    testFactValues: testFactValues(facts),
  });
  return { text, body, hashtags: tags, assessment };
}
