// Playbook 27/8 PHẦN 3 pattern 5 "Thời sự nghề là xăng tăng lực viral miễn phí".
// Sinh bài bám trend Việt Nam (bóng đá VN thắng, sự kiện lớn, tin sốt) + gợi ý 5-8 ảnh
// search Google CSE để user tự dựng video ghép (CapCut, InShot). Không dựng ffmpeg trong
// server (Vercel serverless không có ffmpeg + storage lớn) — user dùng script build-video.mjs
// local hoặc dựng tay.
//
// Móc trend về ngư dân/tàu cá: VD "VN vô địch → ngư dân Vũng Tàu treo cờ đỏ ra khơi",
// "Bão số 5 → tàu vào tránh, ngư dân chờ hết bão để lại ra khơi".

import { logTokenUsage } from './token-log.mjs';

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function genWithRetry(ai, params, tries = 3) {
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

function parseJson(t) {
  let s = (t || '').trim();
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (f) s = f[1].trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

// Sinh 1 bài trend + kịch bản video ngắn (nếu user muốn dựng) + 5-8 image keyword để search.
// Input: trendEvent (sự kiện hot, VD "Đội tuyển VN vô địch AFF Cup"), publicKnowledge (context
// từ Data 2 học được về sự kiện đó — optional).
export async function generateTrendPost({ trendEvent, publicKnowledge = '', client = null }) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const system = [
    'Bạn viết bài Facebook TREND cho Công ty SDVICO — nhà phân phối thiết bị hàng hải cho ngư dân Việt Nam.',
    '',
    'BỐI CẢNH: khách của SDVICO là NGƯỜI ĐI BIỂN (ngư dân, chủ tàu, thợ máy) - KHÔNG phải người ăn hải sản.',
    'Playbook PHẦN 3 pattern 5: "Thời sự nghề là xăng tăng lực viral miễn phí". Bám sự kiện đang nóng, móc sang góc ngư dân/nghề biển.',
    '',
    'Nhiệm vụ: từ 1 SỰ KIỆN NÓNG (bóng đá VN thắng, tin sốt xã hội, bão lớn, giải quốc gia...) sinh 1 bài Facebook 150-200 chữ CHẠM 4 chữ cảm xúc playbook (NGHỀ/TIỀN/RỦI RO/TỰ HÀO). Ưu tiên TỰ HÀO cho sự kiện tích cực Việt Nam.',
    '',
    'CÁCH MÓC SỰ KIỆN → NGƯ DÂN (không gượng ép):',
    '- VN vô địch bóng đá → ngư dân treo cờ đỏ ra khơi, chào mừng ngoài biển; bám hình ảnh "chiếc ghe câu cắm cờ đỏ vẫy trong nắng".',
    '- Bão lớn Biển Đông → tàu vào bờ tránh, ngư dân chờ hết bão; bám hình ảnh "bến cá vắng lặng, ngư dân ngồi bên tàu chờ trời yên".',
    '- Giải VĐQG bóng đá → không móc được -> chọn góc "tinh thần đoàn kết" của bạn thuyền trên tàu, hoặc bỏ qua.',
    '- Tin sốt xã hội tiêu cực (thảm họa, tai nạn) → CẨN THẬN, chỉ móc nếu liên quan biển; không cợt nhả, không đùa.',
    '',
    'KHUNG BÀI (6 nhịp playbook):',
    '1) HOOK: câu đầu bài ≤15 chữ, nêu SỰ KIỆN + móc ngay ngư dân. VD "VN vô địch — ngư dân Vũng Tàu cũng vui theo cách của mình."',
    '2) ĐỒNG CẢM: tả cảnh ngư dân cảm nhận sự kiện (nghe qua radio tàu, hoặc trở về bờ đúng lúc VN đá).',
    '3) NIỀM TỰ HÀO: sự kiện + tinh thần dân biển. Cờ đỏ trên ghe, tiếng còi tàu mừng.',
    '4) LỜI MỜI: kể trải nghiệm bà con (comment: "bà con nghe VN thắng ở đâu, trên tàu hay ở bờ?").',
    '5) TIN CẬY nhẹ: câu ngắn nhắc SDVICO đồng hành ngư dân, không quảng cáo dày.',
    '6) KẾT thân thiện: chúc mừng chung.',
    '',
    'Giọng bạn thuyền, câu ngắn, KHÔNG dùng gạch dài, KHÔNG dùng mũi tên, số theo chuẩn VN (3.000.000đ).',
    'KHÔNG bịa danh tính người thật/nhân vật cụ thể có tên đầy đủ. Dùng "chú Ba", "anh Tư"...',
    'KHÔNG mô tả sản phẩm cụ thể trong bài trend (bài này để lan, không để bán).',
    '',
    'CŨNG SINH kịch bản video ghép ảnh 30-45s (nếu user muốn dựng CapCut/InShot):',
    '- 5-8 cảnh, mỗi cảnh 4-6 giây, có ảnh keyword + narration ngắn 8-12 chữ.',
    '- Cảnh 1: HOOK sự kiện. Cảnh cuối: cờ đỏ + tinh thần ngư dân.',
  ].join('\n');

  const user = [
    `SỰ KIỆN NÓNG: ${trendEvent}`,
    publicKnowledge ? `\nContext từ tri thức public đã học:\n${publicKnowledge.slice(0, 800)}` : '',
    '',
    'Trả JSON đúng dạng, không thêm chữ ngoài JSON:',
    `{
  "headline": "tiêu đề 6-12 từ có emoji",
  "body": "thân bài 150-200 chữ theo khung 6 nhịp",
  "emotion": "TỰ HÀO|NGHỀ|RỦI RO",
  "hook_15w": "câu hook ≤15 chữ",
  "video_scenes": [
    {"scene": 1, "duration_sec": 4, "narration": "câu narration 8-12 chữ", "image_keyword_vi": "từ khoá tìm ảnh tiếng Việt", "image_keyword_en": "từ khoá tìm ảnh tiếng Anh"}
  ],
  "extra_hashtags": ["#hashtag_bổ_sung_liên_quan_sự_kiện"]
}`,
  ].filter(Boolean).join('\n');

  const res = await genWithRetry(ai, {
    model: MKT_MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0.9 },
  });
  logTokenUsage(client, 'creator_trend', MKT_MODEL, res?.usageMetadata);
  const parsed = parseJson(res.text || '{}');
  return {
    headline: String(parsed.headline || '').replace(/#[^\s#]+/g, '').trim(),
    body: String(parsed.body || '').trim(),
    emotion: String(parsed.emotion || 'TỰ HÀO'),
    hook15w: String(parsed.hook_15w || ''),
    videoScenes: Array.isArray(parsed.video_scenes) ? parsed.video_scenes.slice(0, 8) : [],
    extraHashtags: Array.isArray(parsed.extra_hashtags) ? parsed.extra_hashtags.slice(0, 5) : [],
  };
}
