// Sinh kịch bản video nhiều cảnh từ nội dung đã đăng, chọn tư liệu cho từng cảnh.
// Giọng brand-voice + hàng rào product-boundary trong system prompt; quét compliance sau khi sinh.
import { assessDraft } from '../compliance.mjs';
import { knownFactValues, testFactValues } from '../product-facts.mjs';
import { guardLines, guardViolations, stripViolatingSentences } from '../product-guard.mjs';
import { logTokenUsage } from '../token-log.mjs';
import { getPriceTeaser, publicName, redactExactPrices, ensureSpokenTeaser } from '../products.mjs';

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
  // 8/9 (luật giá úp mở, Thanh): video BÁN HÀNG đọc 1 câu mốc giá ở cảnh cuối; video content, trend,
  // bài quy định KHÔNG có giá. Dữ liệu ở products.mjs (không có số chính xác trong code).
  const teaser = opts.salesVideo && opts.productGroup ? getPriceTeaser(opts.productGroup) : null;
  const shownName = (opts.productGroup && publicName(opts.productGroup)) || null;
  const priceException = teaser ? ' Ngoại lệ duy nhất: câu mốc giá đã dặn ở phần GIÁ, đặt ở CUỐI cảnh này.' : '';
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const allowed = facts
    .filter((f) => f.value)
    .map((f) => `${f.brand || ''} ${f.model || ''} ${f.attribute}: ${f.value}${f.verified ? '' : ' (CHƯA XÁC NHẬN)'}`.trim());

  const assetList = assets
    .map((a) => `- id=${a.id} | ${a.kind} | ${a.title}${a.label ? ` | ${a.label}` : ''}`)
    .join('\n');

  // 9/9 (user: video "người thật tàu thật"): video CONTENT dựng từ clip thật, không bán hàng.
  const CONTENT_STRUCTURE = [
    'ĐÂY LÀ VIDEO CỘNG ĐỒNG "NGƯỜI THẬT TÀU THẬT": dựng từ clip THẬT đội SDVICO quay tại tàu, cảng, xưởng. KHÔNG bán hàng, KHÔNG nhắc giá, KHÔNG kêu nhắn Page hay gọi điện. Sản phẩm chỉ xuất hiện khi bài nguồn kể tới, và chỉ như một phần câu chuyện.',
    'CẢNH ĐẦU: mở bằng KẾT QUẢ nhìn thấy trong clip, 1 câu khẳng định <=15 chữ (ví dụ về CẤU TRÚC, chủ đề khác, CẤM chép: "Bình ắc quy chết queo, 20 phút sau đèn sáng lại."), rồi 1 câu nói rõ đây là cảnh thật ở đâu (tên tàu, cảng, tỉnh nếu bài nguồn có; không có thì nói "trên tàu bà con").',
    'CẢNH GIỮA: kể chuyện có người: ai đang làm gì, vất vả chỗ nào, bà con nói gì. Chạm 1 chữ cảm xúc NGHỀ / TIỀN / RỦI RO / TỰ HÀO như bài nguồn. Không bịa tên người, con số không có trong bài nguồn.',
    'CẢNH CUỐI: 1 câu hỏi mở kéo bà con bình luận kể chuyện của họ (kinh nghiệm, con số, tàu của họ). Không lời kêu gọi bán hàng.',
  ];
  const SALES_STRUCTURE = [
    'PLAYBOOK 24/8 (bộ lọc vàng): CẢNH ĐẦU phải MỞ NGAY bằng 1 CÂU HOOK NGHỊCH LÝ MẤT MÁT <=15 chữ (thành quả lớn bị phá bởi nguyên nhân nhỏ) — ví dụ câu đầu tiên của video: "Trúng luồng cá mà phải quay vào bờ vì hết nước." Cảnh đầu = hook + 1 câu tô đậm nỗi mất, KHÔNG có câu chào phía trước. Bám 1 trong 4 CHỮ CẢM XÚC: NGHỀ (khoe kinh nghiệm) / TIỀN (con số túi tiền) / RỦI RO (cảnh báo sai lầm, mất chuyến) / TỰ HÀO (lộc biển, danh dự nghề). Bài phải chạm đúng 1 chữ, không sáo rỗng.',
    'HOOK NGHỊCH LÝ = CÂU KHẲNG ĐỊNH có 2 mảnh đối lập: THÀNH QUẢ LỚN + MẤT MÁT BẤT NGỜ. Ví dụ ĐÚNG: "Trúng luồng cá phải quay bờ vì cặn dầu.", "Đổ đầy dầu mà máy vẫn lịm giữa lộng.", "Dầu 38.000đ/lít đốt trôi vì kim phun bẩn." Ví dụ SAI (cấm): "Máy nổ có xót ruột không?", "Bà con có thấy vậy không?", "Anh em có gặp chưa?" — CÂU HỎI thăm/tu từ KHÔNG THAY THẾ được hook nghịch lý. Câu hỏi để dành cảnh cuối.',
    'CẢNH 2 (đồng cảm) BẮT BUỘC — không được bỏ để nhảy thẳng vào lối thoát: tả đúng khoảnh khắc đau bà con thấy "ủa mình rồi", tạo cảm xúc TIẾC + UẤT + LO (playbook chốt: cảm xúc mạnh nhất ở nhịp này). Kể ra HẬU QUẢ cụ thể (kim phun hỏng mất bao nhiêu tiền, chuyến biển tiếc nuối, tàu nằm bờ). Không lan man.',
    'CẢNH GIỮA: lối thoát bằng LỢI ÍCH cụ thể (không liệt kê thông số kỹ thuật khô) → phần thưởng cụ thể (đỡ tốn bao nhiêu, đi được bao xa, chở thêm được gì) → tin cậy 1 câu ngắn (lắp tận bến, bảo hành).',
    'CẢNH CUỐI: 1 câu chốt ngắn về LỢI ÍCH/thông điệp sản phẩm (đã có luật ở trên), có thể là câu hỏi mở nhẹ cho bà con nghĩ tiếp. KHÔNG nhắc "gọi", "liên hệ", "hotline" — outro cố định đầu ký đã lo phần đó.',
  ];

  const system = [
    'Bạn dựng kịch bản video ngắn cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Giọng gần gũi bà con ngư dân, câu ngắn gọn, dễ nghe khi lồng tiếng. Nhấn lợi ích ĐÚNG VỚI SẢN PHẨM trong bài nguồn (xem SỰ THẬT NGHỀ bên dưới); KHÔNG tự thêm lợi ích không có trong bài.',
    'LỜI THOẠI PHẢI CÓ CẢM XÚC như người kể chuyện cho bạn nghe (sếp góp ý 21/8: giọng đọc đều đều buồn ngủ): xen câu hỏi tu từ ("Bà con có thấy vậy không?"), câu cảm ngắn ("Đã lắm!", "Yên tâm hẳn!"), ngắt nhịp bằng dấu phẩy và câu ngắn 6 tới 12 chữ. Máy đọc lên xuống giọng THEO DẤU CÂU, nên dấu chấm hỏi, chấm than, dấu phẩy đặt đúng chỗ là giọng có hồn. BẮT BUỘC (sếp 5/9, các sếp chê giọng đều đều): MỖI CẢNH có ít nhất 1 câu cảm ngắn kết bằng dấu chấm than hoặc 1 câu hỏi ngắn kết bằng dấu chấm hỏi; câu dài quá 14 chữ phải tách thành 2 câu.',
    'KHÔNG MỞ ĐẦU BẰNG LỜI CHÀO (sếp bỏ 4/9): CẤM mọi câu chào kiểu "Alo alo bà con ơi!", "Hello anh em đi biển ơi!", "Hello các thuyền trưởng!", "Hello các con vợ ơi!", "Anh em ơi, nghe nè!", "Xin chào bà con", "Chào cả nhà"... Câu ĐẦU TIÊN của video phải là HOOK vào thẳng vấn đề, không chào, không xưng tên kênh. Cả video vẫn nói như người trẻ kể chuyện cho anh em đi biển nghe: năng lượng cao, tự nhiên, có thể chêm "nha", "nè", "luôn á"; NHƯNG vẫn tôn trọng bà con, không chửi bậy, không lố tới mức mất uy tín thiết bị.',
    ...(opts.contentVideo ? CONTENT_STRUCTURE : SALES_STRUCTURE),
    shownName ? `TÊN SẢN PHẨM: gọi đúng "${shownName}" trong lời thoại, KHÔNG gọi tên khác, KHÔNG đọc mã SD12-300.` : '',
    teaser
      ? `GIÁ (luật 8/9, BẮT BUỘC): CẢNH CUỐI phải có đúng 1 câu mốc giá, dùng NGUYÊN VĂN: "${teaser.spoken}". Câu này CHỈ nói giá, KHÔNG kêu bình luận, nhắn Page hay gọi (phần OUTRO cuối video đã lo: nhắn Page, bình luận lọc dầu hay lọc nước, gọi số). Các cảnh khác cũng không nhắc bình luận, nhắn Page hay gọi. TUYỆT ĐỐI KHÔNG đọc giá chính xác (không 9.900.000, không 42 triệu, không 9,9 triệu, không giá cũ 49 hay 38 triệu), KHÔNG tự thêm con số tiền nào khác. Các cảnh trước KHÔNG nhắc giá.`
      : '',
    ...guardLines(`${content.title || ''} ${content.draft || ''} ${content.brief?.rotation_group || ''}`),
    'Số theo chuẩn Việt Nam (dấu chấm ngăn hàng nghìn). KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ nêu thông số có trong danh sách được phép; không có thì nói chung chung.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO; chỉ nói phân phối, lắp đặt, tương thích.',
    'Mỗi cảnh chọn đúng một tư liệu bằng id trong danh sách, ưu tiên tư liệu khớp nội dung cảnh và ưu tiên video cho cảnh có chuyển động.',
    opts.mustUseAssetId
      ? `TƯ LIỆU BẮT BUỘC (9/9): cảnh ĐẦU TIÊN phải dùng id=${opts.mustUseAssetId} (clip thật mới quay, có nhãn CLIP THẬT MỚI trong danh sách). Các cảnh khác ưu tiên tư liệu có nhãn clip thật hơn ảnh.`
      : '',
    'Lời thoại mỗi cảnh là câu nói trơn, không ghi chú, không tiêu đề, vì sẽ được máy đọc thành tiếng.',
    'CẤM CHÉP VÍ DỤ (5/9: video SF-50 đọc y nguyên câu mẫu trong hướng dẫn): mọi câu VÍ DỤ trong hướng dẫn này chỉ minh họa CẤU TRÚC và cố ý nói về chủ đề khác; không được chép nguyên văn hay gần nguyên văn, không lấy sản phẩm/tình huống trong ví dụ. Lời thoại phải viết MỚI từ chính BÀI NGUỒN bên dưới, dùng tình huống và con số có trong bài.',
    'CẤM cảnh cuối gọi điện / mời liên hệ SDVICO - phần OUTRO cuối video đã đọc "Nhắn tin cho Page SDVICO, không thì bình luận lọc dầu hay lọc nước, hoặc gọi số 0939 243 222" rồi, KHÔNG lặp lại ở nội dung chính (tránh trùng).',
    'Cảnh cuối nên là một câu chốt ngắn về lợi ích/thông điệp sản phẩm (vd "yên tâm vươn khơi cùng thiết bị bền bỉ"), KHÔNG nhắc số điện thoại hay từ "gọi", "liên hệ".',
    'MỌI SỐ phải VIẾT DẠNG SỐ (95%, 220V, 80 lít, 0939 243 222, 5 năm...), KHÔNG viết ra chữ ("chín lăm phần trăm", "hai trăm hai mươi vôn"). Lý do: PHỤ ĐỀ video lấy nguyên văn kịch bản này - bà con nhìn thấy "95%" dễ hiểu hơn "chín lăm phần trăm". Máy đọc tiếng sẽ tự đọc số ra chữ.',
    '',
    allowed.length ? 'Thông số được phép nêu:\n' + allowed.join('\n') : 'Chưa có thông số được duyệt: nói chung chung, không nêu số cụ thể.',
    '',
    'Tư liệu có sẵn (chỉ được dùng id trong đây):',
    assetList,
  ].filter((line) => line !== '').join('\n');

  const user = [
    `Nội dung nguồn (đã đăng): "${content.title || ''}".`,
    content.draft ? `Bài viết:\n${String(content.draft).slice(0, 2000)}` : '',
    '',
    'Trả về JSON đúng cấu trúc sau, không thêm chữ ngoài JSON:',
    '{',
    '  "titles": ["ba tiêu đề khác nhau, ngắn, hấp dẫn"],',
    '  "vertical": {"scenes": [{"role": "hook|empathy|solution|reward|closing", "narration": "câu thoại", "asset_id": "id"}]}',
    'CHỈ CÓ BẢN DỌC (vertical). Không sinh "horizontal" (sếp 5/9: mọi video đăng lên chỉ 1 dạng dọc cho đồng bộ).',
    '}',
    'FIELD "role" BẮT BUỘC — không được thiếu, không được trùng. Model hay bỏ qua role và gộp/bỏ nhịp; đây là cách ép cấu trúc.',
    ...(opts.contentVideo
      ? [
          'ĐÂY LÀ VIDEO CỘNG ĐỒNG 30-45 giây. CHÍNH XÁC 3 CẢNH, role LẦN LƯỢT: "hook", "story", "closing". KHÔNG thêm, KHÔNG bớt, KHÔNG lặp role.',
          'CẢNH 1 role="hook" (8-12s, ~25-35 từ): kết quả nhìn thấy trong clip + 1 câu đây là cảnh thật ở đâu.',
          'CẢNH 2 role="story" (15-20s, ~45-60 từ): chuyện người thật, việc thật, cảm xúc thật theo bài nguồn.',
          'CẢNH 3 role="closing" (6-10s, ~20-30 từ): 1 câu hỏi mở cho bà con bình luận. Không giá, không gọi, không nhắn Page.',
        ]
      : short
        ? [
          'ĐÂY LÀ VIDEO SHORTS GÂY CHÚ Ý (40-55 giây, tăng từ 18-25s để cảnh empathy có chỗ nêu HẬU QUẢ CHI TIẾT — user 26/8: "thời gian có thể tăng miễn dưới 1 phút").',
          'CHÍNH XÁC 3 CẢNH, role LẦN LƯỢT: "hook", "empathy", "solution". KHÔNG thêm cảnh, KHÔNG bớt cảnh, KHÔNG lặp role.',
          'Bản dọc (vertical): 3 cảnh, tổng lời thoại 40-55 giây (~120-160 từ tiếng Việt). Cả video DƯỚI 60 giây (kể cả outro cố định ~5s).',
          '',
          'CẢNH 1 role="hook" (8-12s, ~25-35 từ):',
          '  "[HOOK NGHỊCH LÝ MẤT MÁT <=15 chữ, câu KHẲNG ĐỊNH 2 mảnh đối lập — là câu ĐẦU TIÊN, không chào]. [1 câu tô đậm nỗi mất]."',
          '  Ví dụ về CẤU TRÚC (chủ đề khác, CẤM chép): "Đèn sáng rực cả đêm câu mực, sáng ra bình ắc quy chết queo. Thế là cả mẻ mực nằm lại ngoài khơi!"',
          '  CẤM: câu chào mở đầu ("Alo alo", "Hello anh em", "Xin chào bà con"...), câu hỏi thay hook ("xót ruột không?", "có thấy vậy không?"), câu chung chung, thiếu 2 mảnh đối lập.',
          '',
          'CẢNH 2 role="empathy" (15-20s, ~45-60 từ) — CẢNH DÀI NHẤT, nhịp cảm xúc mạnh nhất playbook. BẮT BUỘC, KHÔNG được gộp/bỏ:',
          '  Tả 3-4 HẬU QUẢ CỤ THỂ để bà con thấy TIẾC + UẤT + LO đầy đủ. PHẢI nêu đủ:',
          '  1. Con số tiền mất (VD "mất mấy triệu tiền phụ tùng", "sửa hết chục triệu")',
          '  2. Thời gian mất (VD "nằm bờ cả tuần", "cả chuyến biển đi đứt")',
          '  3. Cơ hội mất (VD "đang trúng luồng cá phải bỏ", "vợ con ở nhà mong tiền")',
          '  4. Tâm trạng (VD "xót đứt ruột", "uất nghẹn không nói nên lời")',
          '  Ví dụ về CẤU TRÚC (chủ đề khác, CẤM chép): "Bình chết là đèn tắt, máy dò tắt, cả tàu mù giữa đêm. Thay bình mới mất mấy triệu, còn phải chạy về bờ bỏ luôn con nước đang trúng. Xót không anh em? Vợ con ở nhà đợi tiền, mình đứng nhìn bình hỏng mà uất!"',
          '  CẤM: câu ngắn cụt ("máy hỏng vặt lắm"), lặp lại hook, nhắc sản phẩm SDVICO (chưa tới lối thoát).',
          '',
          'CẢNH 3 role="solution" (10-15s, ~35-45 từ):',
          '  LỐI THOÁT bằng sản phẩm + PHẦN THƯỞNG cụ thể + CHỐT lợi ích. Có chỗ nêu 2-3 lợi ích cụ thể (dầu sạch, máy khỏe, tiết kiệm bao nhiêu). KHÔNG nhắc gọi/liên hệ (outro cố định lo).' + priceException,
          '  Ví dụ về CẤU TRÚC (chủ đề khác, CẤM chép): "May mà có bộ sạc thông minh giữ bình luôn no điện, đèn sáng suốt đêm không lo! Bình bền gấp đôi, đỡ tiền thay, chuyến nào cũng trọn con nước. Yên tâm bám biển dài ngày nha anh em."',
        ]
      : [
          'ĐÂY LÀ VIDEO DÀI (40-60 giây). CHÍNH XÁC 5 CẢNH, role LẦN LƯỢT: "hook", "empathy", "solution", "reward", "closing".',
          'Bản dọc (vertical): 5 cảnh, tổng lời thoại 55-60 giây.',
          'Lời thoại mỗi cảnh 8-12 giây (~20-30 từ). Súc tích, không lặp ý.',
          '',
          'CẢNH 1 role="hook": vào thẳng HOOK NGHỊCH LÝ MẤT MÁT <=15 chữ (câu khẳng định 2 mảnh đối lập) rồi 1 câu tô đậm nỗi mất. KHÔNG câu chào mở đầu. Cấm câu hỏi.',
          'CẢNH 2 role="empathy" (BẮT BUỘC, không bỏ): tả HẬU QUẢ TIẾC + UẤT + LO cụ thể (số tiền mất, thời gian mất, tâm trạng). Không nhắc sản phẩm SDVICO.',
          'CẢNH 3 role="solution": sản phẩm xuất hiện như LỐI THOÁT, nói bằng LỢI ÍCH (không thông số kỹ thuật khô).',
          'CẢNH 4 role="reward": PHẦN THƯỞNG cụ thể (chở thêm bao nhiêu, đi xa bao nhiêu, tiết kiệm gì).',
          'CẢNH 5 role="closing": câu chốt ngắn về lợi ích. Cấm nhắc gọi/liên hệ/hotline (outro cố định lo).' + priceException,
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
    if (short && !opts.contentVideo) {
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
      // 8/9: lưới giá — số tiền chính xác không được lọt vào lời thoại/phụ đề.
      narration = redactExactPrices(narration);
      return { narration, assetId };
    })
    .filter((s) => s.narration && s.assetId);

  const vertical = fix(parsed.vertical?.scenes, 'vertical');
  // 9/9: clip thật bắt buộc. Model quên thì ép vào cảnh 1 (id phải nằm trong danh sách được phép).
  if (opts.mustUseAssetId && ids.has(opts.mustUseAssetId) && vertical.length && !vertical.some((s) => s.assetId === opts.mustUseAssetId)) {
    console.warn('[script] model khong dung clip that bat buoc, ep vao canh 1');
    vertical[0].assetId = opts.mustUseAssetId;
  }
  const sceneAssets = [...new Set(vertical.map((s) => s.assetId))];
  // 8/9: cảnh cuối video bán hàng phải có câu mốc giá đọc được (model quên thì nối vào).
  if (teaser && vertical.length) {
    const last = vertical[vertical.length - 1];
    const before = last.narration;
    last.narration = ensureSpokenTeaser(last.narration, teaser);
    if (last.narration !== before) console.warn('[script] da noi cau gia up mo vao canh cuoi (model quen luat 8/9)');
  }
  // 5/9 (sếp): chỉ dựng BẢN DỌC. Giữ key horizontal trỏ cùng mảng để code gọi không đổi.
  const horizontal = vertical;
  const titles = Array.isArray(parsed.titles) ? parsed.titles.filter(Boolean).slice(0, 3).map((t) => redactExactPrices(String(t))) : [];

  // Quét tuân thủ trên toàn bộ lời thoại (điều cấm 3, 4, 5).
  const allText = [...vertical].map((s) => s.narration).join('\n');
  const assessment = assessDraft(allText, {
    knownFactValues: knownFactValues(facts),
    testFactValues: testFactValues(facts),
  });

  return { titles, vertical, horizontal, assessment, sceneAssets };
}
