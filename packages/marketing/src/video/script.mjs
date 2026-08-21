// Sinh kịch bản video nhiều cảnh từ nội dung đã đăng, chọn tư liệu cho từng cảnh.
// Giọng brand-voice + hàng rào product-boundary trong system prompt; quét compliance sau khi sinh.
import { assessDraft } from '../compliance.mjs';
import { knownFactValues, testFactValues } from '../product-facts.mjs';
import { guardLines, guardViolations, stripViolatingSentences } from '../product-guard.mjs';

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
// opts.short: chế độ VIDEO SHORTS 10-20 giây (flowchart v3, bài thuộc cặp thử A/B) — ít cảnh,
// lời thoại ngắn, câu đầu là móc câu. Mặc định false = bản dài 40-50 giây như cũ.
export async function generateVideoScript(content, assets, facts = [], opts = {}) {
  const short = !!opts.short;
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
    'Giọng gần gũi bà con ngư dân, câu ngắn gọn, dễ nghe khi lồng tiếng. Nhấn lợi ích ĐÚNG VỚI SẢN PHẨM trong bài nguồn (xem SỰ THẬT NGHỀ bên dưới); KHÔNG tự thêm lợi ích không có trong bài.',
    'LỜI THOẠI PHẢI CÓ CẢM XÚC như người kể chuyện cho bạn nghe (sếp góp ý 21/8: giọng đọc đều đều buồn ngủ): xen câu hỏi tu từ ("Bà con có thấy vậy không?"), câu cảm ngắn ("Đã lắm!", "Yên tâm hẳn!"), ngắt nhịp bằng dấu phẩy và câu ngắn 6 tới 12 chữ. Máy đọc lên xuống giọng THEO DẤU CÂU, nên dấu chấm hỏi, chấm than, dấu phẩy đặt đúng chỗ là giọng có hồn.',
    'CẢNH ĐẦU TIÊN PHẢI MỞ BẰNG LỜI CHÀO BẮT TAI THEO TREND GIỚI TRẺ (user 21/8), chọn hoặc biến tấu: "Hello anh em đi biển ơi!", "Hello các thuyền trưởng!", "Alo alo bà con ơi!", "Hello các con vợ ơi!", "Anh em ơi, nghe nè!" — rồi vào thẳng vấn đề. Cả video nói như TikToker trẻ kể chuyện cho anh em nghe: năng lượng cao, tự nhiên, có thể chêm "nha", "nè", "luôn á"; NHƯNG vẫn tôn trọng bà con, không chửi bậy, không lố tới mức mất uy tín thiết bị.',
    ...guardLines(`${content.title || ''} ${content.draft || ''} ${content.brief?.rotation_group || ''}`),
    'Số theo chuẩn Việt Nam (dấu chấm ngăn hàng nghìn). KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ nêu thông số có trong danh sách được phép; không có thì nói chung chung.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO; chỉ nói phân phối, lắp đặt, tương thích.',
    'Mỗi cảnh chọn đúng một tư liệu bằng id trong danh sách, ưu tiên tư liệu khớp nội dung cảnh và ưu tiên video cho cảnh có chuyển động.',
    'Lời thoại mỗi cảnh là câu nói trơn, không ghi chú, không tiêu đề, vì sẽ được máy đọc thành tiếng.',
    'CẤM cảnh cuối gọi điện / mời liên hệ SDVICO - phần OUTRO cuối video đã đọc "Gọi ngay cho SDVICO 0939 243 222" rồi, KHÔNG lặp lại ở nội dung chính (tránh trùng).',
    'Cảnh cuối nên là một câu chốt ngắn về lợi ích/thông điệp sản phẩm (vd "yên tâm vươn khơi cùng thiết bị bền bỉ"), KHÔNG nhắc số điện thoại hay từ "gọi", "liên hệ".',
    'MỌI SỐ phải VIẾT DẠNG SỐ (95%, 220V, 80 lít, 0939 243 222, 5 năm...), KHÔNG viết ra chữ ("chín lăm phần trăm", "hai trăm hai mươi vôn"). Lý do: PHỤ ĐỀ video lấy nguyên văn kịch bản này - bà con nhìn thấy "95%" dễ hiểu hơn "chín lăm phần trăm". Máy đọc tiếng sẽ tự đọc số ra chữ.',
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
    ...(short
      ? [
          'ĐÂY LÀ VIDEO SHORTS GÂY CHÚ Ý (10-20 giây).',
          'Bản dọc (vertical): 2 tới 3 cảnh, tổng lời thoại đọc khoảng 12 tới 18 giây.',
          'Bản ngang (horizontal): 2 tới 3 cảnh, TỔNG LỜI THOẠI ĐỌC HẾT KHOẢNG 10-18 GIÂY (khoảng 30-50 từ tiếng Việt).',
          'Lời thoại mỗi cảnh 4-6 giây (~10-16 từ). CÂU ĐẦU TIÊN phải là MÓC CÂU khiến bà con dừng tay: một câu hỏi trúng nỗi lo hoặc một sự thật bất ngờ.',
        ]
      : [
          'Bản dọc (vertical): 4 tới 5 cảnh, tổng lời thoại đọc khoảng 55 tới 60 giây.',
          'Bản ngang (horizontal): 5 tới 7 cảnh, TỔNG LỜI THOẠI ĐỌC HẾT KHOẢNG 40-50 GIÂY (khoảng 100-130 từ tiếng Việt).',
          'Lời thoại mỗi cảnh 6-9 giây (~15-25 từ). Súc tích, không lặp ý, không lan man - video ngắn hiệu quả hơn dài.',
        ]),
  ].filter(Boolean).join('\n');

  // Sinh -> quét SỰ THẬT NGHỀ trên lời thoại -> dính thì sinh lại 1 lần; vẫn dính thì CẮT câu sai
  // (19/8: thuyết minh video SEA-40 từng đọc "bớt chở nước nhẹ tàu tiết kiệm nhiên liệu" - sai nghề,
  // cấp trên phản hồi trong nhóm Zalo nội bộ).
  const topic = `${content.title || ''} ${content.draft || ''} ${content.brief?.rotation_group || ''}`;
  let parsed = {};
  let viol = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = !viol.length ? '' :
      `\n\nLẦN TRƯỚC LỜI THOẠI SAI NGHỀ, phải bỏ hẳn các ý: ${viol.map((v) => `"${v.phrase}"`).join(', ')}. ${viol[0].why}`;
    const res = await generateWithRetry(ai, {
      model: MKT_MODEL,
      contents: user + extra,
      config: { systemInstruction: system, responseMimeType: 'application/json' },
    });
    parsed = parseJson(res.text || '');
    const all = [...(parsed.vertical?.scenes || []), ...(parsed.horizontal?.scenes || [])].map((x) => x?.narration || '').join('\n');
    viol = guardViolations(all, topic);
    if (!viol.length) break;
  }
  if (viol.length) {
    // Dự phòng: cắt câu sai khỏi từng cảnh, cảnh rỗng sẽ bị fix() loại.
    for (const k of ['vertical', 'horizontal']) {
      for (const sc of parsed[k]?.scenes || []) sc.narration = stripViolatingSentences(sc.narration || '', topic);
    }
    console.warn('[script] da cat cau SAI NGHE khoi loi thoai:', viol.map((v) => v.phrase).join(', '));
  }

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
