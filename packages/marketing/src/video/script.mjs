// Sinh kịch bản video nhiều cảnh từ nội dung đã đăng, chọn tư liệu cho từng cảnh.
// Giọng brand-voice + hàng rào product-boundary trong system prompt; quét compliance sau khi sinh.
import { assessDraft } from '../compliance.mjs';
import { knownFactValues, testFactValues } from '../product-facts.mjs';

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gọi Gemini có thử lại khi quá tải (503/429/UNAVAILABLE) với giãn cách tăng dần.
async function generateWithRetry(ai, params, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (!/503|429|UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED/i.test(msg) || i === tries - 1) throw e;
      const wait = 1500 * 2 ** i;
      console.warn(`Gemini quá tải, thử lại sau ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function parseJson(text) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

// content: {title, draft, brief}. assets: [{id, kind, title}]. facts: PRODUCT_FACTS.
export async function generateVideoScript(content, assets, facts = []) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const allowed = facts
    .filter((f) => f.value)
    .map((f) => `${f.brand || ''} ${f.model || ''} ${f.attribute}: ${f.value}${f.verified ? '' : ' (CHƯA XÁC NHẬN)'}`.trim());

  const assetList = assets
    .map((a) => `- id=${a.id} | ${a.kind} | ${a.title}`)
    .join('\n');

  const system = [
    'Bạn dựng kịch bản video ngắn cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Giọng gần gũi bà con ngư dân, câu ngắn gọn, dễ nghe khi lồng tiếng. Nhấn lợi ích cụ thể: ra khơi an toàn, tuân thủ quy định, tiết kiệm nhiên liệu và nước ngọt.',
    'Số theo chuẩn Việt Nam (dấu chấm ngăn hàng nghìn). KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ nêu thông số có trong danh sách được phép; không có thì nói chung chung.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO; chỉ nói phân phối, lắp đặt, tương thích.',
    'Mỗi cảnh chọn đúng một tư liệu bằng id trong danh sách, ưu tiên tư liệu khớp nội dung cảnh và ưu tiên video cho cảnh có chuyển động.',
    'Lời thoại mỗi cảnh là câu nói trơn, không ghi chú, không tiêu đề, vì sẽ được máy đọc thành tiếng.',
    'Kết bằng một cảnh mời gọi tổng đài 1900 23 23 49.',
    '',
    allowed.length ? 'Thông số được phép nêu:\n' + allowed.join('\n') : 'Chưa có thông số được duyệt: nói chung chung, không nêu số cụ thể.',
    '',
    'Tư liệu có sẵn (chỉ được dùng id trong đây):',
    assetList,
  ].join('\n');

  const user = [
    `Nội dung nguồn (đã đăng): "${content.title || ''}".`,
    content.draft ? `Bài viết:\n${String(content.draft).slice(0, 2000)}` : '',
    '',
    'Trả về JSON đúng cấu trúc sau, không thêm chữ ngoài JSON:',
    '{',
    '  "titles": ["ba tiêu đề khác nhau, ngắn, hấp dẫn"],',
    '  "vertical": {"scenes": [{"narration": "câu thoại", "asset_id": "id"}]},',
    '  "horizontal": {"scenes": [{"narration": "câu thoại", "asset_id": "id"}]}',
    '}',
    'Bản dọc (vertical): 4 tới 5 cảnh, tổng lời thoại đọc khoảng 55 tới 60 giây.',
    'Bản ngang (horizontal): 5 tới 7 cảnh, TỔNG LỜI THOẠI ĐỌC HẾT KHOẢNG 40-50 GIÂY (khoảng 100-130 từ tiếng Việt).',
    'Lời thoại mỗi cảnh 6-9 giây (~15-25 từ). Súc tích, không lặp ý, không lan man - video ngắn hiệu quả hơn dài.',
  ].filter(Boolean).join('\n');

  const res = await generateWithRetry(ai, {
    model: MKT_MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: 'application/json' },
  });
  const parsed = parseJson(res.text || '');

  const ids = new Set(assets.map((a) => a.id));
  const fix = (scenes, kind) => (scenes || [])
    .map((s, i) => {
      let assetId = s.asset_id;
      if (!ids.has(assetId)) assetId = assets[i % assets.length]?.id; // fallback vòng xoay
      return { narration: String(s.narration || '').trim(), assetId };
    })
    .filter((s) => s.narration && s.assetId);

  const vertical = fix(parsed.vertical?.scenes, 'vertical');
  const horizontal = fix(parsed.horizontal?.scenes, 'horizontal');
  const titles = Array.isArray(parsed.titles) ? parsed.titles.filter(Boolean).slice(0, 3) : [];

  // Quét tuân thủ trên toàn bộ lời thoại (điều cấm 3, 4, 5).
  const allText = [...vertical, ...horizontal].map((s) => s.narration).join('\n');
  const assessment = assessDraft(allText, {
    knownFactValues: knownFactValues(facts),
    testFactValues: testFactValues(facts),
  });

  return { titles, vertical, horizontal, assessment };
}
