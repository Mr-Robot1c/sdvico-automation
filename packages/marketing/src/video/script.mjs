// Sinh kịch bản video nhiều cảnh từ nội dung đã đăng, chọn tư liệu cho từng cảnh.
// Giọng brand-voice + hàng rào product-boundary trong system prompt; quét compliance sau khi sinh.
import { assessDraft } from '../compliance.mjs';
import { knownFactValues, testFactValues } from '../product-facts.mjs';
import { guardLines, guardViolations, stripViolatingSentences } from '../product-guard.mjs';
import { logTokenUsage } from '../token-log.mjs';
import { getPriceTeaser, publicName, redactExactPrices, ensureSpokenTeaser } from '../products.mjs';

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';
// 10/9 tối (2 lượt CI liên tiếp sinh kịch bản bài 3826e7f9 dính 500 INTERNAL từ flash-lite, cùng lúc
// gọi thử 1 câu ngắn vẫn 200): 500 không nằm trong danh sách thử lại và không có model dự phòng nên
// cả bài rớt, giữ chỗ 30 phút. Nay: 500/INTERNAL cũng thử lại, hết lượt thì đổi model kế trong chuỗi
// (cùng thứ tự với lib/plan-directions.ts). MKT_MODEL_CHAIN (env, phẩy) ghi đè.
const MODEL_CHAIN = (process.env.MKT_MODEL_CHAIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const SCRIPT_MODELS = [...new Set([MKT_MODEL, ...(MODEL_CHAIN.length ? MODEL_CHAIN : ['gemini-3.6-flash', 'gemini-3.5-flash'])])];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gọi Gemini có thử lại khi quá tải hoặc lỗi nội bộ (503/429/500) với giãn cách tăng dần; hết lượt
// thì đổi sang model kế trong SCRIPT_MODELS (params.model là model đầu). Trả res, kèm res.modelUsed.
async function generateWithRetry(ai, params, tries = 3) {
  let lastErr;
  const models = [...new Set([params.model, ...SCRIPT_MODELS].filter(Boolean))];
  for (const model of models) {
    for (let i = 0; i < tries; i++) {
      try {
        const res = await ai.models.generateContent({ ...params, model });
        if (res && typeof res === 'object') res.modelUsed = model;
        return res;
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message || e);
        const transient = /503|429|500|UNAVAILABLE|INTERNAL|high demand|overloaded|RESOURCE_EXHAUSTED/i.test(msg);
        if (!transient) throw e;
        if (i < tries - 1) {
          const wait = 1500 * 2 ** i;
          console.warn(`Gemini ${model} lỗi tạm (${msg.slice(0, 60)}), thử lại sau ${wait}ms...`);
          await sleep(wait);
        }
      }
    }
    const next = models[models.indexOf(model) + 1];
    if (next) console.warn(`Gemini ${model} hỏng ${tries} lần, đổi sang ${next}`);
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
  // 11/9 (Thanh: "kịch bản nó cứ 1 màu miết"): trước đây cảnh đầu luôn "kết quả + đây là cảnh thật ở
  // đâu", cảnh cuối luôn "1 câu hỏi mở", ví dụ trong prompt lại có "Bà con có thấy vậy không?" nên
  // video nào cũng một khuôn. Nay 6 KIỂU KỂ xoay theo bài (băm id, cùng bài dựng lại vẫn cùng kiểu;
  // opts.styleIdx / env VIDEO_CONTENT_STYLE ghi đè), mỗi kiểu mở khác, kết khác, nhịp khác, kèm
  // danh sách cụm đã mòn bị cấm.
  // Cụm đã mòn (lặp ở nhiều video trước). Dùng 2 chỗ: cấm trong prompt + soát sau khi sinh, dính thì
  // sinh lại 1 lần (bản 5392815a vẫn chép "mấy hôm nay ghé cảng", "đời người đi biển gắn liền với con
  // tàu" từ bài nguồn dù prompt đã cấm).
  const WORN_PHRASES = [
    'đây là cảnh thật', 'cảnh quay thực tế', 'bà con có thấy vậy không', 'anh em có thấy vậy không',
    'đời người đi biển gắn liền với con tàu', 'thương cái nghiệp biển khơi', 'thương các nghiệp biển khơi',
    'mấy hôm nay ghé cảng', 'cặm cụi kiểm tra từng con ốc',
  ];
  // 14/9 (sếp: "kịch bản video lọc dầu / lọc nước đừng cứ mãi mất luồng cá lớn, đổi cho đừng giống
  // nhau quá"): video BÁN HÀNG trước đây ép đúng 1 kiểu hook nghịch lý + ví dụ toàn "trúng luồng cá
  // phải quay bờ", cảnh 2 lại gợi ý "vợ con đợi tiền / xót đứt ruột / nằm bờ cả tuần" nên bài nào
  // cũng một khuôn. Nay: 6 KIỂU MỞ xoay theo bài (băm id như video content, env VIDEO_SALES_STYLE
  // ghi đè), mỗi kiểu kèm 1 TÌNH HUỐNG MẤT MÁT khác nhau, và danh sách cụm đã mòn bị cấm + soát sau
  // khi sinh (dính thì sinh lại 1 lần).
  const SALES_WORN = [
    'trúng luồng cá', 'luồng cá lớn', 'mất luồng cá', 'quay vào bờ', 'quay đầu về bờ', 'phải quay bờ',
    'chuyến đi đứt', 'chuyến biển đi đứt', 'chuyến biển đứt', 'đứt gánh', 'trong nháy mắt',
    'xót đứt ruột', 'tiếc đứt ruột', 'uất nghẹn', 'uất không nói nên lời', 'vợ con ở nhà',
    'nằm bờ cả tuần', 'giữa khơi xa', 'tàu bạc tỷ', 'chén nước lã',
  ];
  const SALES_STYLES = [
    { key: 'nghich-ly', label: 'Nghịch lý mất mát',
      open: 'mở bằng 1 CÂU KHẲNG ĐỊNH <=15 chữ có 2 mảnh đối lập: việc đã làm đúng / đầu tư lớn NHƯNG hỏng vì 1 thứ nhỏ trong dầu hoặc trong nước. KHÔNG dùng tình huống trúng cá phải về bờ',
      situation: 'máy đang chạy ngon bỗng khục khặc rồi tắt giữa chừng, thợ tháo ra thấy toàn cặn' },
    { key: 'con-so', label: 'Con số túi tiền',
      open: 'mở bằng MỘT CON SỐ tiền hoặc lít dầu hoặc ngày công (có trong bài nguồn, không có thì nói "mấy triệu", "cả chục triệu", "cả tuần") đặt ngay đầu câu, rồi 1 câu số đó bay đi đâu',
      situation: 'tiền thay kim phun, bơm cao áp, tiền dầu đốt hao, tiền nước ngọt mua từ bờ cộng dồn mỗi chuyến' },
    { key: 'loi-tho-may', label: 'Lời thợ máy',
      open: 'mở bằng MỘT CÂU NÓI TRỰC TIẾP của thợ máy hoặc chủ tàu (trong ngoặc kép, không bịa tên, gọi "anh thợ máy", "bác chủ tàu"), rồi 1 câu ai vừa nói và nói lúc nào',
      situation: 'thợ máy sửa tới lần thứ ba trong tháng, lắc đầu vì nguyên nhân vẫn là dầu bẩn / nước lợ' },
    { key: 'thoi-quen-sai', label: 'Thói quen hay mắc',
      open: 'mở bằng 1 THÓI QUEN nhiều tàu vẫn làm mà tưởng đúng (đổ dầu là chạy, mua nước bờ chở theo, xả cặn qua loa), 1 câu <=14 chữ, rồi 1 câu cái giá phải trả. KHÔNG bịa tỷ lệ phần trăm hay "9 trên 10 tàu"',
      situation: 'tưởng tiết kiệm được chút ban đầu, cuối chuyến tính lại tốn gấp mấy lần' },
    { key: 'giac-quan', label: 'Giác quan tại chỗ',
      open: 'mở bằng ÂM THANH, MÙI hoặc HÌNH ẢNH cụ thể trên tàu (tiếng máy lịm dần, mùi khét, nước lợ mặn chát, vệt cặn đen trong cốc dầu), 1 câu ngắn, rồi 1 câu điều đó báo hiệu gì',
      situation: 'cả tàu im lặng nghe máy, hoặc anh em nhăn mặt vì ca nước lợ' },
    { key: 'truoc-sau', label: 'Trước và sau',
      open: 'mở bằng HAI TÀU hoặc HAI CHUYẾN đặt cạnh nhau trong cùng 1 câu (tàu lắp / tàu chưa lắp, chuyến trước / chuyến này), rồi 1 câu khác nhau ở đâu. Không bịa tên tàu, tên người',
      situation: 'tàu bên cạnh về bến đúng hẹn còn tàu mình còn loay hoay sửa máy hoặc chia từng ca nước' },
  ];
  const CONTENT_STYLES = [
    { key: 'chung-kien', label: 'Chứng kiến tại chỗ',
      open: 'mở bằng MỘT CHI TIẾT NHỎ nhìn thấy trong clip (bàn tay, con ốc, vệt dầu, tiếng máy), 1 câu <=12 chữ, KHÔNG nói "đây là cảnh thật", địa điểm chỉ lướt qua trong cảnh giữa nếu bài nguồn có',
      close: 'kết bằng 1 câu hỏi về KINH NGHIỆM riêng của bà con (họ làm khác chỗ nào), không hỏi "có thấy vậy không"' },
    { key: 'loi-ke', label: 'Lời một người trên tàu',
      open: 'mở bằng MỘT CÂU NÓI TRỰC TIẾP của người trong clip theo bài nguồn (đặt trong ngoặc kép, không bịa tên; không có tên thì gọi "chú", "anh thợ máy", "bác tài công"), rồi 1 câu ai vừa nói câu đó',
      close: 'kết bằng LỜI NHẮN của chính người đó gửi anh em đi biển, câu cảm, KHÔNG câu hỏi' },
    { key: 'con-so', label: 'Con số thật',
      open: 'mở bằng MỘT CON SỐ có trong bài nguồn (ngày, chuyến, lít, năm nghề), 1 câu ngắn, rồi 1 câu con số đó đổi lấy cái gì; không có con số trong bài thì dùng mốc thời gian (bao nhiêu năm, mấy giờ sáng)',
      close: 'kết bằng câu đố nhẹ: mời bà con bình luận con số của tàu mình (bao nhiêu ngày, bao nhiêu chuyến)' },
    { key: 'truoc-sau', label: 'Trước và sau',
      open: 'mở bằng HAI THỜI ĐIỂM đối lập trong cùng 1 câu (lúc ra khơi / lúc về bến, sáng / chiều, ngày xưa / bây giờ), rồi 1 câu cái gì đổi khác giữa hai lúc đó',
      close: 'kết bằng 1 câu hỏi "tàu bà con đang ở đoạn nào", hoặc câu cảm ngắn về đoạn sau' },
    { key: 'nhip-nhanh', label: 'Nhịp nhanh câu ngắn',
      open: 'mở bằng ĐỘNG TỪ, câu 4 tới 7 chữ, 3 câu liên tiếp như đếm nhịp (siết. kiểm. nổ máy.), không câu nào quá 8 chữ trong cảnh đầu',
      close: 'kết bằng 1 câu cảm ngắn có dấu chấm than về nghề, KHÔNG câu hỏi, KHÔNG lời chúc' },
    { key: 'tam-su', label: 'Tâm sự chậm',
      open: 'mở bằng THỜI ĐIỂM TRONG NGÀY và một hình ảnh tĩnh (chiều muộn ở cảng, sáng sớm sương chưa tan), giọng kể chậm, câu 8 tới 12 chữ',
      close: 'kết bằng MỘT LỜI CHÚC ngắn cho chuyến biển tới, không câu hỏi, không kêu gọi' },
  ];
  const styleIdx = Number.isInteger(opts.styleIdx) ? opts.styleIdx
    : process.env.VIDEO_CONTENT_STYLE !== undefined && process.env.VIDEO_CONTENT_STYLE !== '' ? Number(process.env.VIDEO_CONTENT_STYLE)
      : [...String(content.id || '')].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const STYLE = CONTENT_STYLES[Math.abs(styleIdx) % CONTENT_STYLES.length];
  if (opts.contentVideo) console.log(`Kiểu kể video content: ${STYLE.label} (${STYLE.key})`);
  const salesIdx = process.env.VIDEO_SALES_STYLE !== undefined && process.env.VIDEO_SALES_STYLE !== '' ? Number(process.env.VIDEO_SALES_STYLE) : styleIdx;
  const SALES_STYLE = SALES_STYLES[Math.abs(salesIdx) % SALES_STYLES.length];
  if (!opts.contentVideo) console.log(`Kiểu mở video bán hàng: ${SALES_STYLE.label} (${SALES_STYLE.key})`);
  const CONTENT_STRUCTURE = [
    'ĐÂY LÀ VIDEO CỘNG ĐỒNG "NGƯỜI THẬT TÀU THẬT": dựng từ clip THẬT đội SDVICO quay tại tàu, cảng, xưởng. KHÔNG bán hàng, KHÔNG nhắc giá, KHÔNG kêu nhắn Page hay gọi điện. Sản phẩm chỉ xuất hiện khi bài nguồn kể tới, và chỉ như một phần câu chuyện.',
    `KIỂU KỂ CỦA VIDEO NÀY: "${STYLE.label}". Bám đúng kiểu này, không trộn kiểu khác.`,
    `CẢNH ĐẦU: ${STYLE.open}. Câu đầu tiên là câu người xem nghe đầu tiên, phải khác hẳn các video trước.`,
    'CẢNH GIỮA: kể chuyện có người: ai đang làm gì, vất vả chỗ nào, bà con nói gì. Chạm 1 chữ cảm xúc NGHỀ / TIỀN / RỦI RO / TỰ HÀO như bài nguồn. Không bịa tên người, con số không có trong bài nguồn. Địa điểm (tên cảng, tỉnh) chỉ nói nếu bài nguồn có. KỂ LẠI BẰNG LỜI CỦA MÌNH: giữ ý của bài nguồn nhưng KHÔNG chép nguyên câu, không lặp lại cụm từ của bài nguồn quá 5 chữ liền nhau.',
    `CẢNH CUỐI: ${STYLE.close}. Không lời kêu gọi bán hàng.`,
    `CỤM ĐÃ MÒN, CẤM DÙNG (đã lặp ở nhiều video trước, kể cả khi bài nguồn có): ${WORN_PHRASES.map((p) => `"${p}"`).join(', ')}. Muốn nói ý đó thì tìm cách nói khác.`,
  ];
  const SALES_STRUCTURE = [
    `KIỂU MỞ CỦA VIDEO NÀY (sếp 14/9: mỗi video một kiểu, không được giống nhau): "${SALES_STYLE.label}". CẢNH ĐẦU: ${SALES_STYLE.open}. Cảnh đầu = câu mở + 1 câu tô đậm nỗi mất, KHÔNG có câu chào phía trước, KHÔNG câu hỏi thăm chung chung ("có thấy vậy không?", "có gặp chưa?"). Bám 1 trong 4 CHỮ CẢM XÚC: NGHỀ (khoe kinh nghiệm) / TIỀN (con số túi tiền) / RỦI RO (cảnh báo sai lầm, mất chuyến) / TỰ HÀO (lộc biển, danh dự nghề). Bài phải chạm đúng 1 chữ, không sáo rỗng.`,
    `TÌNH HUỐNG MẤT MÁT của video này (dùng cho cảnh đầu và cảnh đồng cảm, kể bằng lời mình theo bài nguồn): ${SALES_STYLE.situation}. CẤM dùng lại tình huống "đang trúng cá / trúng luồng cá phải quay về bờ" trừ khi bài nguồn kể đúng chuyện đó, và kể cả khi đó cũng phải nói bằng cách khác.`,
    `CỤM ĐÃ MÒN, CẤM DÙNG (đã lặp ở nhiều video bán hàng trước): ${SALES_WORN.map((p) => `"${p}"`).join(', ')}. Muốn nói ý đó thì tìm cách nói khác.`,
    'CẢNH 2 (đồng cảm) BẮT BUỘC — không được bỏ để nhảy thẳng vào lối thoát: tả đúng khoảnh khắc đau bà con thấy "ủa mình rồi", tạo cảm xúc TIẾC + UẤT + LO (playbook chốt: cảm xúc mạnh nhất ở nhịp này). Kể ra HẬU QUẢ cụ thể (kim phun hỏng mất bao nhiêu tiền, chuyến biển tiếc nuối, tàu nằm bờ). Không lan man.',
    'CẢNH GIỮA: lối thoát bằng LỢI ÍCH cụ thể (không liệt kê thông số kỹ thuật khô) → phần thưởng cụ thể (đỡ tốn bao nhiêu, đi được bao xa, chở thêm được gì) → tin cậy 1 câu ngắn (lắp tận bến, bảo hành).',
    'CẢNH CUỐI: 1 câu chốt ngắn về LỢI ÍCH/thông điệp sản phẩm (đã có luật ở trên), có thể là câu hỏi mở nhẹ cho bà con nghĩ tiếp. KHÔNG nhắc "gọi", "liên hệ", "hotline" — outro cố định đầu ký đã lo phần đó.',
  ];

  const system = [
    'Bạn dựng kịch bản video ngắn cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Giọng gần gũi bà con ngư dân, câu ngắn gọn, dễ nghe khi lồng tiếng. Nhấn lợi ích ĐÚNG VỚI SẢN PHẨM trong bài nguồn (xem SỰ THẬT NGHỀ bên dưới); KHÔNG tự thêm lợi ích không có trong bài.',
    'LỜI THOẠI PHẢI CÓ CẢM XÚC như người kể chuyện cho bạn nghe (sếp góp ý 21/8: giọng đọc đều đều buồn ngủ): xen câu hỏi tu từ đúng chỗ (tự nghĩ câu mới theo nội dung, KHÔNG dùng lại "Bà con có thấy vậy không?" vì đã mòn), câu cảm ngắn ("Đã lắm!", "Yên tâm hẳn!"), ngắt nhịp bằng dấu phẩy và câu ngắn 6 tới 12 chữ. Máy đọc lên xuống giọng THEO DẤU CÂU, nên dấu chấm hỏi, chấm than, dấu phẩy đặt đúng chỗ là giọng có hồn. BẮT BUỘC (sếp 5/9, các sếp chê giọng đều đều): MỖI CẢNH có ít nhất 1 câu cảm ngắn kết bằng dấu chấm than hoặc 1 câu hỏi ngắn kết bằng dấu chấm hỏi; câu dài quá 14 chữ phải tách thành 2 câu.',
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
          `CẢNH 1 role="hook" (8-12s, ~25-35 từ): theo KIỂU KỂ "${STYLE.label}" ở trên (${STYLE.open}).`,
          'CẢNH 2 role="story" (15-20s, ~45-60 từ): chuyện người thật, việc thật, cảm xúc thật theo bài nguồn.',
          `CẢNH 3 role="closing" (6-10s, ~20-30 từ): ${STYLE.close}. Không giá, không gọi, không nhắn Page.`,
        ]
      : short
        ? [
          'ĐÂY LÀ VIDEO SHORTS GÂY CHÚ Ý (40-55 giây, tăng từ 18-25s để cảnh empathy có chỗ nêu HẬU QUẢ CHI TIẾT — user 26/8: "thời gian có thể tăng miễn dưới 1 phút").',
          'CHÍNH XÁC 3 CẢNH, role LẦN LƯỢT: "hook", "empathy", "solution". KHÔNG thêm cảnh, KHÔNG bớt cảnh, KHÔNG lặp role.',
          'Bản dọc (vertical): 3 cảnh, tổng lời thoại 40-55 giây (~120-160 từ tiếng Việt). Cả video DƯỚI 60 giây (kể cả outro cố định ~5s).',
          '',
          'CẢNH 1 role="hook" (8-12s, ~25-35 từ):',
          `  Theo KIỂU MỞ "${SALES_STYLE.label}" ở trên: ${SALES_STYLE.open}. Rồi 1 câu tô đậm nỗi mất theo TÌNH HUỐNG đã cho.`,
          '  CẤM: câu chào mở đầu ("Alo alo", "Hello anh em", "Xin chào bà con"...), câu hỏi thăm chung chung ("xót ruột không?", "có thấy vậy không?"), câu chung chung không có hình ảnh cụ thể, và mọi cụm đã mòn ở trên.',
          '',
          'CẢNH 2 role="empathy" (15-20s, ~45-60 từ) — CẢNH DÀI NHẤT, nhịp cảm xúc mạnh nhất playbook. BẮT BUỘC, KHÔNG được gộp/bỏ:',
          '  Tả 3-4 HẬU QUẢ CỤ THỂ để bà con thấy TIẾC + UẤT + LO đầy đủ, bám TÌNH HUỐNG MẤT MÁT đã cho ở trên. PHẢI nêu đủ 4 ý, mỗi ý tự nghĩ cách nói riêng cho video này:',
          '  1. Tiền mất (phụ tùng, tiền dầu, tiền nước, tiền công thợ)',
          '  2. Thời gian mất (chờ sửa, chờ phụ tùng, chuyến bị ngắn lại)',
          '  3. Cơ hội mất (chuyến biển, con nước, mối hàng, uy tín với bạn ghe)',
          '  4. Tâm trạng (chọn 1 cảm xúc cụ thể của người trong cuộc, KHÔNG dùng "xót đứt ruột", "uất nghẹn", "vợ con ở nhà")',
          '  Ví dụ về CẤU TRÚC (chủ đề khác, CẤM chép): "Bình chết là đèn tắt, máy dò tắt, cả tàu mù giữa đêm. Thay bình mới mất mấy triệu, thêm hai ngày nằm chờ hàng về. Tức nhất là bạn ghe bên cạnh vẫn sáng đèn kéo mực đều đều!"',
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
          `CẢNH 1 role="hook": theo KIỂU MỞ "${SALES_STYLE.label}" (${SALES_STYLE.open}), rồi 1 câu tô đậm nỗi mất theo TÌNH HUỐNG đã cho. KHÔNG câu chào mở đầu, KHÔNG câu hỏi thăm chung chung.`,
          'CẢNH 2 role="empathy" (BẮT BUỘC, không bỏ): tả HẬU QUẢ TIẾC + UẤT + LO cụ thể (tiền mất, thời gian mất, cơ hội mất, tâm trạng) bám TÌNH HUỐNG đã cho, không dùng cụm đã mòn. Không nhắc sản phẩm SDVICO.',
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
  let worn = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = (!viol.length ? '' :
      `\n\nLẦN TRƯỚC LỜI THOẠI SAI NGHỀ, phải bỏ hẳn các ý: ${viol.map((v) => `"${v.phrase}"`).join(', ')}. ${viol[0].why}`)
      + (!worn.length ? '' :
      `\n\nLẦN TRƯỚC LỜI THOẠI VẪN DÙNG CỤM ĐÃ MÒN: ${worn.map((p) => `"${p}"`).join(', ')}. Viết lại toàn bộ, diễn đạt khác hẳn, tuyệt đối không dùng các cụm đó.`);
    const res = await generateWithRetry(ai, {
      model: MKT_MODEL,
      contents: user + extra,
      config: { systemInstruction: system, responseMimeType: 'application/json' },
    });
    logTokenUsage(client, 'creator_video_script', res?.modelUsed || MKT_MODEL, res?.usageMetadata);
    parsed = parseJson(res.text || '');
    // 26/8 siết lần 3: log warning nếu SHORTS thiếu scene role='empathy' (model hay lách gộp
    // vào hook hoặc solution). Không auto-regenerate (đắt token) nhưng log để soi khi debug.
    if (short && !opts.contentVideo) {
      for (const k of ['vertical']) { // 14/9: chỉ còn bản dọc, bỏ cảnh báo thừa cho horizontal
        const roles = (parsed[k]?.scenes || []).map((s) => s?.role);
        if (!roles.includes('empathy')) {
          console.warn(`[script] SHORTS ${k} thieu scene role='empathy' (roles=${JSON.stringify(roles)}) - can canh 2 dong cam TIEC+UAT theo playbook.`);
        }
      }
    }
    const all = [...(parsed.vertical?.scenes || []), ...(parsed.horizontal?.scenes || [])].map((x) => x?.narration || '').join('\n');
    viol = guardViolations(all, topic);
    worn = (opts.contentVideo ? WORN_PHRASES : SALES_WORN).filter((p) => all.toLowerCase().includes(p));
    if (worn.length) console.warn(`[script] loi thoai dung cum da mon (lan ${attempt + 1}): ${worn.join(' | ')}`);
    if (!viol.length && !worn.length) break;
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
