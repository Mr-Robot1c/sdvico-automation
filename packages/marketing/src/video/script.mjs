// Sinh kịch bản video nhiều cảnh từ nội dung đã đăng, chọn tư liệu cho từng cảnh.
// Giọng brand-voice + hàng rào product-boundary trong system prompt; quét compliance sau khi sinh.
import { assessDraft } from '../compliance.mjs';
import { knownFactValues, testFactValues } from '../product-facts.mjs';
import { guardLines, guardViolations, stripViolatingSentences } from '../product-guard.mjs';
import { logTokenUsage } from '../token-log.mjs';

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

// 4/9 (sếp): bỏ hẳn lời chào đầu video ("Alo alo bà con ơi!", "Hello các thuyền trưởng!"...).
// Prompt đã cấm, nhưng model quen mẫu cũ (21/8 tới 3/9) vẫn có thể chào -> cắt câu chào ở đầu
// cảnh 1 cho chắc. Chỉ cắt khi câu mở đầu là chào rõ ràng (alo/hello/xin chào/chào...) hoặc
// câu gọi ngắn kết bằng "ơi!" / "ơi," ("Bà con ơi!", "Anh em đi biển ơi,"). Không đụng câu hook.
// (Không dùng \b vì \b trong JS chỉ hiểu chữ ASCII, đứng cạnh "ô", "ơ" là hỏng.)
const GREETING_RE = /^(?:(?:(?:a\s?l[oô]\s*)+|hell?o|hê\s?lô|xin chào|chào)(?=[\s,!.?]|$)[^.!?,]{0,40}[.!?,]\s*|[^.!?,]{0,20}(?:^|\s)ơi\s*[!,.]\s*)+/iu;
export function stripGreeting(text) {
  const t = String(text || '').trim();
  const out = t.replace(GREETING_RE, '').trim();
  if (!out || out === t) return t;
  return out.charAt(0).toUpperCase() + out.slice(1);
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
export async function generateVideoScript(content, assets, facts = [], opts = {}, client = null) {
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
    'KHÔNG MỞ ĐẦU BẰNG LỜI CHÀO (sếp bỏ 4/9): CẤM mọi câu chào kiểu "Alo alo bà con ơi!", "Hello anh em đi biển ơi!", "Hello các thuyền trưởng!", "Hello các con vợ ơi!", "Anh em ơi, nghe nè!", "Xin chào bà con", "Chào cả nhà"... Câu ĐẦU TIÊN của video phải là HOOK vào thẳng vấn đề, không chào, không xưng tên kênh. Cả video vẫn nói như người trẻ kể chuyện cho anh em đi biển nghe: năng lượng cao, tự nhiên, có thể chêm "nha", "nè", "luôn á"; NHƯNG vẫn tôn trọng bà con, không chửi bậy, không lố tới mức mất uy tín thiết bị.',
    'PLAYBOOK 24/8 (bộ lọc vàng): CẢNH ĐẦU phải MỞ NGAY bằng 1 CÂU HOOK NGHỊCH LÝ MẤT MÁT <=15 chữ (thành quả lớn bị phá bởi nguyên nhân nhỏ) — ví dụ câu đầu tiên của video: "Trúng luồng cá mà phải quay vào bờ vì hết nước." Cảnh đầu = hook + 1 câu tô đậm nỗi mất, KHÔNG có câu chào phía trước. Bám 1 trong 4 CHỮ CẢM XÚC: NGHỀ (khoe kinh nghiệm) / TIỀN (con số túi tiền) / RỦI RO (cảnh báo sai lầm, mất chuyến) / TỰ HÀO (lộc biển, danh dự nghề). Bài phải chạm đúng 1 chữ, không sáo rỗng.',
    'HOOK NGHỊCH LÝ = CÂU KHẲNG ĐỊNH có 2 mảnh đối lập: THÀNH QUẢ LỚN + MẤT MÁT BẤT NGỜ. Ví dụ ĐÚNG: "Trúng luồng cá phải quay bờ vì cặn dầu.", "Đổ đầy dầu mà máy vẫn lịm giữa lộng.", "Dầu 38.000đ/lít đốt trôi vì kim phun bẩn." Ví dụ SAI (cấm): "Máy nổ có xót ruột không?", "Bà con có thấy vậy không?", "Anh em có gặp chưa?" — CÂU HỎI thăm/tu từ KHÔNG THAY THẾ được hook nghịch lý. Câu hỏi để dành cảnh cuối.',
    'CẢNH 2 (đồng cảm) BẮT BUỘC — không được bỏ để nhảy thẳng vào lối thoát: tả đúng khoảnh khắc đau bà con thấy "ủa mình rồi", tạo cảm xúc TIẾC + UẤT + LO (playbook chốt: cảm xúc mạnh nhất ở nhịp này). Kể ra HẬU QUẢ cụ thể (kim phun hỏng mất bao nhiêu tiền, chuyến biển tiếc nuối, tàu nằm bờ). Không lan man.',
    'CẢNH GIỮA: lối thoát bằng LỢI ÍCH cụ thể (không liệt kê thông số kỹ thuật khô) → phần thưởng cụ thể (đỡ tốn bao nhiêu, đi được bao xa, chở thêm được gì) → tin cậy 1 câu ngắn (lắp tận bến, bảo hành).',
    'CẢNH CUỐI: 1 câu chốt ngắn về LỢI ÍCH/thông điệp sản phẩm (đã có luật ở trên), có thể là câu hỏi mở nhẹ cho bà con nghĩ tiếp. KHÔNG nhắc "gọi", "liên hệ", "hotline" — outro cố định đầu ký đã lo phần đó.',
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
    '  "vertical": {"scenes": [{"role": "hook|empathy|solution|reward|closing", "narration": "câu thoại", "asset_id": "id"}]},',
    '  "horizontal": {"scenes": [{"role": "hook|empathy|solution|reward|closing", "narration": "câu thoại", "asset_id": "id"}]}',
    '}',
    'FIELD "role" BẮT BUỘC — không được thiếu, không được trùng. Model hay bỏ qua role và gộp/bỏ nhịp; đây là cách ép cấu trúc.',
    ...(short
      ? [
          'ĐÂY LÀ VIDEO SHORTS GÂY CHÚ Ý (40-55 giây, tăng từ 18-25s để cảnh empathy có chỗ nêu HẬU QUẢ CHI TIẾT — user 26/8: "thời gian có thể tăng miễn dưới 1 phút").',
          'CHÍNH XÁC 3 CẢNH, role LẦN LƯỢT: "hook", "empathy", "solution". KHÔNG thêm cảnh, KHÔNG bớt cảnh, KHÔNG lặp role.',
          'Bản dọc (vertical) VÀ Bản ngang (horizontal): mỗi bản 3 cảnh, tổng lời thoại 40-55 giây (~120-160 từ tiếng Việt). Cả video DƯỚI 60 giây (kể cả outro cố định ~5s).',
          '',
          'CẢNH 1 role="hook" (8-12s, ~25-35 từ):',
          '  "[HOOK NGHỊCH LÝ MẤT MÁT <=15 chữ, câu KHẲNG ĐỊNH 2 mảnh đối lập — là câu ĐẦU TIÊN, không chào]. [1 câu tô đậm nỗi mất]."',
          '  Ví dụ ĐÚNG: "Mua dầu tưởng sạch, ai ngờ dính cặn nước làm nghẹt máy giữa biển. Thế là cả chuyến đi đứt trong nháy mắt."',
          '  CẤM: câu chào mở đầu ("Alo alo", "Hello anh em", "Xin chào bà con"...), câu hỏi thay hook ("xót ruột không?", "có thấy vậy không?"), câu chung chung, thiếu 2 mảnh đối lập.',
          '',
          'CẢNH 2 role="empathy" (15-20s, ~45-60 từ) — CẢNH DÀI NHẤT, nhịp cảm xúc mạnh nhất playbook. BẮT BUỘC, KHÔNG được gộp/bỏ:',
          '  Tả 3-4 HẬU QUẢ CỤ THỂ để bà con thấy TIẾC + UẤT + LO đầy đủ. PHẢI nêu đủ:',
          '  1. Con số tiền mất (VD "mất mấy triệu tiền phụ tùng", "sửa hết chục triệu")',
          '  2. Thời gian mất (VD "nằm bờ cả tuần", "cả chuyến biển đi đứt")',
          '  3. Cơ hội mất (VD "đang trúng luồng cá phải bỏ", "vợ con ở nhà mong tiền")',
          '  4. Tâm trạng (VD "xót đứt ruột", "uất nghẹn không nói nên lời")',
          '  Ví dụ ĐÚNG (~50 từ): "Kim phun tắc, phải nằm bờ sửa cả tuần, mất hơn năm triệu tiền phụ tùng. Đang giữa mùa trúng cá mà phải quay vào bờ, cả tàu tiếc đứt ruột. Vợ con ở nhà đợi tiền, mình thì đứng nhìn máy hỏng, uất không nói nên lời anh em ơi."',
          '  CẤM: câu ngắn cụt ("máy hỏng vặt lắm"), lặp lại hook, nhắc sản phẩm SDVICO (chưa tới lối thoát).',
          '',
          'CẢNH 3 role="solution" (10-15s, ~35-45 từ):',
          '  LỐI THOÁT bằng sản phẩm + PHẦN THƯỞNG cụ thể + CHỐT lợi ích. Có chỗ nêu 2-3 lợi ích cụ thể (dầu sạch, máy khỏe, tiết kiệm bao nhiêu). KHÔNG nhắc gọi/liên hệ (outro cố định lo).',
          '  Ví dụ ĐÚNG (~40 từ): "May có SF-50 giữ dầu sạch từ đầu vào buồng đốt, tách hết cặn nước ngay từ đầu ống. Máy nổ êm suốt hải trình, đỡ hẳn hỏng vặt, tiết kiệm cả tiền sửa lẫn tiền dầu. Yên tâm vươn khơi bám cá dài ngày."',
        ]
      : [
          'ĐÂY LÀ VIDEO DÀI (40-60 giây). CHÍNH XÁC 5 CẢNH, role LẦN LƯỢT: "hook", "empathy", "solution", "reward", "closing".',
          'Bản dọc (vertical): 5 cảnh, tổng lời thoại 55-60 giây.',
          'Bản ngang (horizontal): 5 cảnh, tổng lời thoại 40-50 giây (~100-130 từ tiếng Việt).',
          'Lời thoại mỗi cảnh 8-12 giây (~20-30 từ). Súc tích, không lặp ý.',
          '',
          'CẢNH 1 role="hook": vào thẳng HOOK NGHỊCH LÝ MẤT MÁT <=15 chữ (câu khẳng định 2 mảnh đối lập) rồi 1 câu tô đậm nỗi mất. KHÔNG câu chào mở đầu. Cấm câu hỏi.',
          'CẢNH 2 role="empathy" (BẮT BUỘC, không bỏ): tả HẬU QUẢ TIẾC + UẤT + LO cụ thể (số tiền mất, thời gian mất, tâm trạng). Không nhắc sản phẩm SDVICO.',
          'CẢNH 3 role="solution": sản phẩm xuất hiện như LỐI THOÁT, nói bằng LỢI ÍCH (không thông số kỹ thuật khô).',
          'CẢNH 4 role="reward": PHẦN THƯỞNG cụ thể (chở thêm bao nhiêu, đi xa bao nhiêu, tiết kiệm gì).',
          'CẢNH 5 role="closing": câu chốt ngắn về lợi ích. Cấm nhắc gọi/liên hệ/hotline (outro cố định lo).',
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
    logTokenUsage(client, 'creator_video_script', MKT_MODEL, res?.usageMetadata);
    parsed = parseJson(res.text || '');
    // 26/8 siết lần 3: log warning nếu SHORTS thiếu scene role='empathy' (model hay lách gộp
    // vào hook hoặc solution). Không auto-regenerate (đắt token) nhưng log để soi khi debug.
    if (short) {
      for (const k of ['vertical', 'horizontal']) {
        const roles = (parsed[k]?.scenes || []).map((s) => s?.role);
        if (!roles.includes('empathy')) {
          console.warn(`[script] SHORTS ${k} thieu scene role='empathy' (roles=${JSON.stringify(roles)}) - can canh 2 dong cam TIEC+UAT theo playbook.`);
        }
      }
    }
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
      let narration = String(s.narration || '').trim();
      // 4/9: cảnh 1 không được mở bằng câu chào (xem stripGreeting).
      if (i === 0) {
        const cut = stripGreeting(narration);
        if (cut !== narration) console.warn(`[script] ${kind}: da cat cau chao dau canh 1: "${narration.slice(0, 60)}"`);
        narration = cut;
      }
      return { narration, assetId };
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
