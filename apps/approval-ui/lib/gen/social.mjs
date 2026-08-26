// Sinh text bài mạng xã hội cho một sản phẩm: thân bài có emoji + khối hashtag.
// Giọng brand-voice, hàng rào product-boundary (không bịa thông số, không nhận vơ phần mềm đối tác).
import { assessDraft } from './compliance.mjs';
import { knownFactValues, testFactValues, PRODUCT_FACTS } from './product-facts.mjs';
import { guardLines, guardViolations } from './product-guard.mjs';
import { DEFAULT_HASHTAGS, productHashtags, getFeatures, CONTENT_TOPICS } from './products.mjs';
import { insightBrief } from './insights.mjs';
import { logTokenUsage } from './token-log.mjs';

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

// 4 CHỮ CẢM XÚC (playbook 24/8/2026): ngư dân chỉ tương tác quanh NGHỀ/TIỀN/RỦI RO/TỰ HÀO.
// Trước đăng, mỗi bài phải chạm ĐÚNG 1 chữ (bộ lọc vàng) — không chạm chữ nào = chắc chắn chìm.
// Xoay đều để cả tuần phủ đủ 4 chữ. Mỗi chữ ép người xem LÀM 1 việc khác nhau.
const ANGLES = [
  'RỦI RO — sợ mất chuyến, mất tiền, mất an toàn: mở bằng cảnh báo cụ thể (mất tín hiệu, máy tua giờ, ra khơi mùa bão), kéo comment cảnh báo bạn thuyền',
  'TIỀN — ảnh hưởng trực tiếp túi tiền mỗi chuyến: mở bằng con số (dầu bao nhiêu đồng/lít, nước mấy khối, mấy chuyến tiết kiệm được bao nhiêu), kéo comment hỏi giá',
  'NGHỀ — tự nhận ra mình, muốn học và khoe kinh nghiệm: mở bằng cảnh nghề thật (kiểm tra VMS trước khi rời bến, chọn máy theo tải tàu), kéo comment kể chuyện của họ',
  'TỰ HÀO — danh dự nghề, tình bạn thuyền: mở bằng khoảnh khắc lộc biển hoặc nghề cha truyền con, kéo comment share/khoe',
];

// Cho bài CONTENT nuôi trang (không bán): bám 4 chữ, hình thức khác bài bán một chút (không có
// sản phẩm để đẩy, thay bằng "kết bằng câu hỏi mở").
const CONTENT_ANGLES = [
  'NGHỀ — bà con tự nhận ra mình, muốn học kinh nghiệm hoặc khoe kỹ thuật của mình',
  'TIỀN — chạm túi tiền cụ thể (dầu, nước, chi phí sửa), có ít nhất 1 con số',
  'RỦI RO — cảnh báo hậu quả nếu bỏ qua (mất chuyến, bị phạt, hư máy)',
  'TỰ HÀO — khoảnh khắc đẹp nghề, tình bạn thuyền, cảm giác dân biển',
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
// v2 (18/8): angleOverride + preferredHeadline dùng khi rotate bám suggestion từ Kế hoạch AI —
// bài đăng sẽ đi đúng hướng đi tuần (dựa why từ tri thức) thay vì góc random.
export async function generateSocialPost({
  productGroup, productName, channel, hasVideo,
  facts = PRODUCT_FACTS,
  angleOverride = null, preferredHeadline = null,
  insight = null,
  client = null,
}) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const allowed = facts.filter((f) => f.value)
    .map((f) => `${f.brand || ''} ${f.model || ''} ${f.attribute}: ${f.value}${f.verified ? '' : ' (CHƯA XÁC NHẬN)'}`.trim());

  const features = getFeatures(productGroup);
  const isTikTok = channel === 'tiktok';
  const angle = angleOverride || ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const system = [
    'Bạn viết bài mạng xã hội cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    `ĐÂY LÀ BÀI BÁN HÀNG cho đúng MỘT sản phẩm: "${productName}". Bắt buộc: nêu rõ tên sản phẩm này, 1 tới 2 lợi ích thật của nó. Không viết chung chung như bài tâm sự, không lạc sang sản phẩm khác.`,
    'Giọng BẠN THUYỀN kể chuyện cho bạn nghe (không phải tờ rơi kỹ thuật, không sáo rỗng, không "công nghệ tiên tiến", không "thiết kế gọn gàng"). Câu ngắn, trả lời ngay câu đầu, đọc trên điện thoại. Nhấn lợi ích ĐÚNG VỚI SẢN PHẨM ĐANG VIẾT (xem SỰ THẬT NGHỀ bên dưới); KHÔNG gán lợi ích của sản phẩm khác.',
    '',
    'CÂU ĐẦU CỦA BODY = HOOK NGHỊCH LÝ MẤT MÁT, dưới 15 chữ, khúc mạnh nhất đặt đầu (tránh bị "See more" cắt). Nghịch lý = thành quả lớn bị phá bởi nguyên nhân nhỏ. Ví dụ chuẩn: "Trúng luồng cá mà phải quay vào bờ chỉ vì hết nước ngọt." — 13 chữ, tiếc đứt ruột, tự soi mình.',
    'PHÂN BIỆT VAI TRÒ HEADLINE VÀ BODY (rất quan trọng, model hay lộn): headline là tiêu đề gợi ý (tag riêng), BODY là thân bài đăng thực tế. HOOK NGHỊCH LÝ NẰM Ở CÂU ĐẦU CỦA BODY, KHÔNG PHẢI HEADLINE — không được để hook chỉ trong headline rồi body vào tả cảnh / đồng cảm luôn. Câu đầu body phải là 1 CÂU RIÊNG, DÒNG RIÊNG (xuống dòng ngay sau nó), dưới 15 chữ, chứa mất mát cụ thể. TỰ ĐẾM CHỮ trước khi trả — nếu quá 15 thì viết ngắn lại.',
    '',
    'KHUNG 6 NHỊP cho toàn bài (bám theo thứ tự này):',
    '1) HOOK nghịch lý mất mát (đã nói ở trên, dưới 15 chữ, đứng riêng dòng đầu).',
    '2) ĐỒNG CẢM giọng bạn thuyền, tả đúng khoảnh khắc đau để chạm TIẾC + UẤT + LO. Ngư dân đọc phải thấy "ủa đúng mình rồi".',
    '3) LỐI THOÁT: sản phẩm xuất hiện như CÁCH GIẢI QUYẾT, nói bằng LỢI ÍCH (đỡ tốn dầu, đủ nước ngọt, bám biển dài hơn, ra khơi đúng quy định), KHÔNG liệt kê thông số kỹ thuật khô khan.',
    '4) PHẦN THƯỞNG cụ thể: cái được rõ ràng (chở thêm được đá/cá, tiết kiệm bao nhiêu, an tâm hơn).',
    '5) TIN CẬY 1 CÂU DUY NHẤT: lắp tận bến, bảo hành, hướng dẫn tới khi quen tay. Đủ, không sa đà khoe.',
    '6) CTA MỞ CHUYỆN: một CÂU HỎI mở kéo comment (hỏi con số/kinh nghiệm ngư dân thường có, kiểu "anh thường đi mấy ngày một chuyến, tốn bao nhiêu khối nước?") + một TỪ KHÓA NGẮN mời nhắn Page nhẹ nhàng (ví dụ nhắn "NƯỚC" / "DẦU" / "VMS" cho page, mình gửi thông tin — không gọi làm phiền). KHÔNG đòi gọi tổng đài trong bài (tệp mới, đòi gọi là quá sức).',
    '',
    ...guardLines(productName + ' ' + productGroup),
    'Chèn vài emoji hợp cảnh biển và thiết bị cho sinh động (ví dụ ⚓ 🚢 🌊 📡 💧 🛟 📞), đừng lạm dụng.',
    'Tuổi, số năm, ngày tháng, số lượng viết bằng CHỮ SỐ (ví dụ 55 tuổi, 30 năm, ngày 20/8), TUYỆT ĐỐI KHÔNG viết bằng chữ ("năm mươi lăm tuổi", "ba mươi năm" là SAI). Số lớn dùng dấu chấm ngăn hàng nghìn (3.000.000 đồng). KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ nêu thông số có trong danh sách được phép; không có thì nói chung chung, không nêu số.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO; chỉ nói phân phối, lắp đặt, tương thích.',
    isTikTok
      ? 'ĐÂY LÀ CHÚ THÍCH VIDEO TIKTOK: rút gọn khung 6 nhịp còn 2 tới 4 câu thật ngắn, giữ hook nghịch lý ở câu đầu + CTA hỏi ở câu cuối. KHÔNG viết cả 6 nhịp cho TikTok.'
      : 'ĐÂY LÀ BÀI FACEBOOK: khoảng 150 tới 220 chữ (6 tới 10 câu ngắn), viết ĐỦ 6 nhịp theo thứ tự, mỗi nhịp cách nhau bằng xuống dòng để đọc thoáng trên điện thoại. Có thể có 2 tới 3 dòng gạch đầu lợi ích ở nhịp 3 (dùng emoji làm đầu dòng, không dùng dấu chấm tròn).',
    'KHÔNG tự viết hashtag, hệ thống sẽ tự thêm.',
    'Mỗi bài phải KHÁC các bài trước: khác câu mở đầu, khác cách triển khai, khác tiêu đề.',
    'Bài phải CÓ Ý NGHĨA, xoáy vào MỘT nỗi thật của bà con (không sáo rỗng, không liệt kê tính năng khô khan). Khi có insight bên dưới thì bám đúng insight đó.',
    '',
    'BÀI MẪU CHUẨN để so sánh giọng (playbook PHẦN 12) — chỉ dùng làm ví dụ về giọng và khung 6 nhịp, KHÔNG copy nguyên chữ:',
    'Trúng luồng cá mà phải quay vào bờ chỉ vì hết nước ngọt.',
    'Anh em đi biển dài ngày chắc thấm: cá thì đang vào, mà can nước ngọt đã cạn đáy. Nước để lâu thì hôi, uống vào đau bụng cả tàu. Cuối cùng đành chạy vào bờ sớm, bỏ lại luồng cá ngay trước mắt — tiếc đứt ruột.',
    'Cái máy lọc nước biển SEA-40 lo đúng chuyện đó: biến nước biển thành nước ngọt ngay trên tàu, chạy bằng điện tàu sẵn có. Uống, nấu, tắm rửa thoải mái — khỏi chở theo mấy khối nước nặng trịch.',
    'Nghĩa là tàu nhẹ hơn, bám biển dài ngày hơn, và không phải cắt ngang chuyến chỉ vì hết nước. Chỗ nước đó để dành chở thêm đá, thêm cá.',
    'Bên mình lắp tận bến ở Vũng Tàu, bảo hành đầy đủ, hướng dẫn tới khi anh em quen tay.',
    'Anh em thường đi mấy ngày một chuyến, tốn khoảng mấy khối nước ngọt? Comment con số bên dưới, mình tính thử cái máy cỡ nào hợp với tàu mình. Cần kỹ hơn thì nhắn "NƯỚC" cho page, mình gửi thông tin — không gọi làm phiền.',
    '',
    allowed.length ? 'Thông số được phép nêu:\n' + allowed.join('\n') : 'Chưa có thông số được duyệt: nói chung chung, không nêu số cụ thể.',
  ].join('\n');

  const insightText = insight ? insightBrief(insight) : '';
  const user = [
    `Sản phẩm: "${productName}".`,
    features.length ? 'Đặc điểm sản phẩm (nêu đúng, chọn vài ý nổi bật, không thêm thông số ngoài danh sách này):\n- ' + features.join('\n- ') : '',
    hasVideo ? 'Bài có kèm video minh họa.' : 'Bài dùng ảnh minh họa.',
    insightText,
    insightText ? `Chữ cảm xúc lần này: ${angle}. Bài PHẢI chạm đúng chữ này (bộ lọc vàng playbook).` : `Chữ cảm xúc lần này: ${angle}. Bài PHẢI chạm đúng chữ này (bộ lọc vàng playbook).`,
    preferredHeadline ? `Nếu phù hợp, giữ hoặc bám gần tiêu đề gợi ý: "${preferredHeadline}" (đây là hướng đi tuần từ Kế hoạch AI). Không bắt buộc chép nguyên, nhưng nội dung phải khớp hướng đi này.` : '',
    'Trả về JSON đúng dạng, không thêm chữ ngoài JSON:',
    '{"headline": "tiêu đề ngắn 6 tới 12 từ, riêng biệt, có thể kèm 1 emoji", "body": "thân bài (chưa gồm hashtag)"}',
  ].filter(Boolean).join('\n');

  const topic = `${productName} ${productGroup}`;
  let body = '';
  let headline = '';
  let violations = [];
  // Sinh -> quét SỰ THẬT NGHỀ -> dính thì sinh lại 1 lần với lệnh cấm rõ từng cụm (19/8: bài SEA-40
  // từng bịa "bớt chở nước, nhẹ tàu, tiết kiệm dầu", cấp trên phản hồi sai nghề).
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = !violations.length ? '' :
      `\n\nLẦN TRƯỚC VIẾT SAI NGHỀ, phải bỏ hẳn các ý: ${violations.map((v) => `"${v.phrase}"`).join(', ')}. ${violations[0].why}`;
    const res = await genWithRetry(ai, {
      model: MKT_MODEL,
      contents: user + extra,
      config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 1.05 },
    });
    logTokenUsage(client, 'creator_social', MKT_MODEL, res?.usageMetadata);
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
  // Vẫn dính sau 2 lần: KHÔNG coi là sạch — gắn cờ "Sai nghề" (amber) để người duyệt thấy và sửa.
  if (violations.length) {
    assessment.flags = { ...(assessment.flags || {}), domain: violations.map((v) => `${v.phrase} (${v.product})`) };
    if (assessment.risk === 'none') assessment.risk = 'amber';
  }
  return { text, body, headline, hashtags: tags, assessment, insightId: insight?.id || null };
}

// Chỉ dẫn cấu trúc bài cho từng LOẠI content. AI phải theo đúng dạng để bài hữu ích, không sáo rỗng.
const CONTENT_TYPE_INSTRUCTION = {
  checklist:
    'MỤC ĐÍCH BÀI: giúp bà con tự kiểm tra tàu và thiết bị trước chuyến biển. Bài dạng CHECKLIST. Viết 1 câu mở ngắn dẫn dắt, XUỐNG DÒNG TRỐNG, rồi liệt kê 5 tới 7 mục ĐÁNH SỐ (1. 2. 3. ...). MỖI MỤC PHẢI XUỐNG DÒNG RIÊNG (dùng 2 ký tự xuống dòng \\n\\n giữa các mục để cách 1 dòng trống nhìn cho thoáng, KHÔNG viết liền nhau trong 1 đoạn). Mỗi mục dài 8 tới 15 từ, đầu mục có 1 emoji hợp cảnh (⚓ 🛟 🌊 📡 💧 ⚙️). Sau mục cuối, XUỐNG DÒNG TRỐNG, kết bằng 1 câu nhắc bà con lưu bài hoặc chia sẻ cho anh em.',
  glossary:
    'MỤC ĐÍCH BÀI: giúp bà con hiểu đúng thuật ngữ, thông số khi chọn mua thiết bị. Bài dạng GIẢI THÍCH THUẬT NGỮ. Câu đầu ĐỊNH NGHĨA gọn trong 1 dòng (dạng "X là..."). Sau đó 3 tới 4 câu giải thích ngắn: dùng để làm gì, khi nào bà con gặp, cần lưu ý gì. Không đi sâu kỹ thuật, dùng ví dụ đời thường. Không bịa số liệu.',
  tip:
    'MỤC ĐÍCH BÀI: giúp bà con xử lý sự cố hay gặp, đỡ tốn tiền sửa. Bài dạng MẸO / KINH NGHIỆM. Nêu vấn đề bà con hay gặp trong 1 câu, chỉ ra 2 tới 3 NGUYÊN NHÂN hoặc thói quen sai lầm (đánh dấu bằng ⚠️), rồi 2 tới 3 CÁCH XỬ LÝ (đánh dấu bằng ✅). Ngắn, thực dụng, không lý thuyết chung chung.',
  qa:
    'MỤC ĐÍCH BÀI: giúp bà con có thêm kiến thức dùng thiết bị, đi biển. Bài dạng HỎI - ĐÁP. Bắt đầu bằng dòng "❓ Hỏi: <câu hỏi>" rồi dòng "💡 Đáp: <câu trả lời gọn 3 tới 5 câu>". Đáp phải đi thẳng, chính xác, có thể mở rộng 1 tới 2 lưu ý. Không lan man.',
  engage:
    'MỤC ĐÍCH BÀI: nghe nhu cầu thật của bà con để chọn hướng bài tuần sau. Bài dạng ĐẶT CÂU HỎI để bà con bình luận. Rất ngắn: 2 tới 3 câu dẫn dắt cảm xúc/kỷ niệm, rồi KẾT bằng câu hỏi mở (dấu ? cuối) mời bà con kể chuyện trong bình luận. Không nêu sản phẩm, không nhắc SDVICO trong bài này.',
  portrait:
    'Bài dạng CHÂN DUNG NGƯỜI TRONG NGHỀ, viết HOÀN CHỈNH để đăng ngay (sếp chốt 19/8: điền sẵn, không để ô trống). Nhân vật là NGƯỜI ĐIỂN HÌNH: gọi thân mật kiểu "bác Ba", "chú Bảy", "anh Tư" (KHÔNG họ tên đầy đủ), tuổi khoảng 45-65 (hoặc 28-35 nếu ngư dân trẻ), địa phương ven biển Bà Rịa Vũng Tàu (Long Hải, Phước Tỉnh, Bình Châu, Lộc An, Bến Đá) hoặc miền Trung, số năm bám biển. Cấu trúc: 1 câu mở giới thiệu (tên gọi + tuổi + địa phương + số năm đi biển; tuổi và số năm viết bằng CHỮ SỐ, ví dụ "bác Ba 55 tuổi", "30 năm bám biển", KHÔNG viết "năm mươi lăm tuổi"), 2-3 câu bối cảnh nghề, 1 câu NÓI của nhân vật trong ngoặc kép (giọng chân chất, đúng đời sống ngư dân, không sáo), 1 câu kết chúc bà con. KHÔNG dùng ngoặc vuông, KHÔNG để chỗ trống, KHÔNG ghi chú "khung sườn"; KHÔNG gán số liệu doanh thu/sản lượng cụ thể cho nhân vật.',
  news:
    'Bài dạng NHỊP THỜI SỰ NGÀNH - CHỜ CẤP QUẢN LÝ DUYỆT. Viết TRUNG THỰC, KHÔNG nêu con số/ngày tháng/mốc quy định cụ thể (điều cấm 5). Dùng ngôn ngữ chung: "quy định mới", "gần đây", "theo cập nhật của cơ quan quản lý". Cấu trúc: 1 câu nêu chủ đề, 2-3 câu bối cảnh chung mà bà con cần biết, 1 dòng khuyên bà con theo dõi kênh chính thức của Cục Thủy sản/địa phương. Chèn đầu bài: "⚠️ CẦN CẤP QUẢN LÝ DUYỆT - nội dung chạm quy định nhà nước (điều cấm 3)".',
};

// Bài CONTENT (không bán trực tiếp): viết theo một chủ đề để nuôi trang, lấy tương tác.
// AI tự nghĩ nội dung theo chủ đề, KHÔNG bịa tin tức/số liệu cụ thể (điều cấm 5).
// Chấp nhận 3 dạng đầu vào: {type,topic} object, string chủ đề, hoặc không truyền (random).
export async function generateContentPost({ topic, facts = PRODUCT_FACTS, client = null } = {}) {
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
  const contentAngle = CONTENT_ANGLES[Math.floor(Math.random() * CONTENT_ANGLES.length)];

  const system = [
    'Bạn viết bài cộng đồng cho trang của Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Đây KHÔNG phải bài bán hàng. Mục tiêu là hữu ích thật cho bà con ngư dân đọc là học được điều gì đó, hoặc để lại bình luận.',
    `BỘ LỌC VÀNG playbook 24/8 (bắt buộc): bài PHẢI chạm 1 trong 4 chữ cảm xúc NGHỀ/TIỀN/RỦI RO/TỰ HÀO. Chữ lần này: ${contentAngle}. Bài không chạm chữ nào = chắc chắn chìm.`,
    'KẾT BÀI (bất kể type) bằng 1 CÂU HỎI MỞ nhẹ nhàng kéo bà con comment (kỷ niệm, kinh nghiệm, con số họ hay gặp). KHÔNG mời gọi tổng đài, KHÔNG mời nhắn Page — đây là bài cộng đồng, đừng bán hàng.',
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
  logTokenUsage(client, 'creator_content', MKT_MODEL, res?.usageMetadata);
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
