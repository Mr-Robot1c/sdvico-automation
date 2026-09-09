// Danh mục 10 folder sản phẩm SDVICO (theo kho tư liệu, đặt tên STT).
// product_group trong brand_assets nhận đúng nhãn 'group' dưới đây.
// 'match' = từ khóa để tự gán tư liệu cũ theo tên. 'hashtag' = thẻ riêng của sản phẩm.

// hashtags: bộ thẻ RIÊNG đúng sản phẩm (đừng để lẫn thẻ sản phẩm khác). hashtag (số ít) giữ lại
// cho tương thích code cũ = thẻ đầu tiên.
export const PRODUCTS = [
  { no: 1, group: '1. PV Engine RMI Nano Graphene',
    match: ['pv engine', 'rmi', 'nano graphene', 'graphene', 'nano dung cho dong co', 'pvoil', 'dau nhot'],
    hashtags: ['#dầu_nhớt_Nano_Graphene', '#PVOil', '#tiết_kiệm_nhiên_liệu', '#bảo_vệ_động_cơ'] },
  { no: 2, group: '2. Máy lọc nước biển SEA-40',
    match: ['loc nuoc', 'sea-40', 'sea40', 'nuoc ngot', 'nuoc bien thanh nuoc ngot', 'mln'],
    hashtags: ['#máy_lọc_nước_biển', '#nước_ngọt_trên_tàu', '#khỏi_chở_nước', '#SEA40'] },
  { no: 3, group: '3. Thiết bị giám sát hành trình Viettel S-Tracking',
    match: ['giam sat hanh trinh', 's-tracking', 's tracking', 'stracking', 'gsht', 'viettel'],
    hashtags: ['#giám_sát_hành_trình', '#thiết_bị_VMS', '#S_Tracking', '#chống_khai_thác_IUU'] },
  { no: 4, group: '4. Thuraya Marine Star MNB-01',
    match: ['thuraya', 'marine star', 'marinestar', 'mnb-01', 'mnb01', 'mnb 01'],
    hashtags: ['#Thuraya_MarineStar', '#điện_thoại_vệ_tinh', '#liên_lạc_trên_biển', '#MNB01'] },
  { no: 5, group: '5. Điện thoại vệ tinh XT-Pro',
    match: ['xt-pro', 'xt pro', 'xtpro', 'dien thoai ve tinh'],
    hashtags: ['#điện_thoại_vệ_tinh', '#liên_lạc_vệ_tinh', '#XT_Pro', '#gọi_về_bờ'] },
  { no: 6, group: '6. Thiết bị lọc dầu SF-50',
    match: ['loc dau', 'sf-50', 'sf50', 'may loc dau', 'xu ly dau', 'tiet kiem dau'],
    hashtags: ['#thiết_bị_lọc_dầu', '#tiết_kiệm_dầu', '#lọc_dầu_diesel', '#SF50'] },
  { no: 7, group: '7. Ắc quy Accu Nano SDViCo',
    match: ['ac quy', 'accu', 'acquy', 'ac-quy'],
    hashtags: ['#ắc_quy_Nano', '#ắc_quy_tàu_cá', '#Accu_Nano', '#ắc_quy_bền_bỉ'] },
  { no: 8, group: '8. Sơn RARE',
    match: ['son rare', 'son-rare', 'rare'],
    hashtags: ['#sơn_RARE', '#sơn_chống_nóng', '#chống_nóng_tàu', '#làm_mát_tàu'] },
  // 26/8: SP mới do user cung cấp (folder "9. Máy Lọc Dầu Diesel SD12-300"). Match ưu tiên
  // "sd12" và "diesel" — tranh dụng chung "loc dau" (SF-50 no 6 sẽ match trước).
  // 8/9: tên công khai là SF300B (Thanh chốt), SD12-300 chỉ là mã tem + tên folder → thêm match, đổi thẻ.
  { no: 9, group: '9. Máy Lọc Dầu Diesel SD12-300',
    match: ['sd12-300', 'sd12 300', 'sd12300', 'sd12', 'sf300b', 'sf 300b', 'sf-300b', 'may loc dau sf300b', 'loc dau sf300b', 'loc dau diesel', 'may loc dau diesel', 'loc dau sd12'],
    hashtags: ['#máy_lọc_dầu_Diesel', '#SF300B', '#bảo_vệ_kim_phun', '#lọc_cặn_dầu'] },
  // 5/9: SDFish — app do SDVICO TỰ LÀM cho ngư dân (web sdfish.sdvico.vn). Sếp Long lệnh
  // truyền thông 5/9. Match ưu tiên tên riêng; "app ngu dan" / "ban dong hanh" là câu khẩu hiệu.
  { no: 10, group: '10. SDFish',
    match: ['sdfish', 'sd fish', 'app sdfish', 'ung dung sdfish', 'app ngu dan', 'ban dong hanh cua ngu dan', 'app cho ngu dan'],
    hashtags: ['#SDFish', '#bạn_đồng_hành_của_ngư_dân', '#app_cho_ngư_dân', '#SDVICO'] },
];

// Tính năng - thông số THẬT của từng sản phẩm (nguồn: file "tính năng N.txt" trong kho tư liệu).
// Đưa vào prompt sinh text để bài viết nêu đúng đặc điểm, không nói chung chung, không bịa (điều cấm 5).
export const FEATURES = {
  '1. PV Engine RMI Nano Graphene': [
    'Công nghệ Nano Graphene tiên tiến',
    'Giảm ma sát và tiết kiệm nhiên liệu',
    'Bảo vệ động cơ khỏi hao mòn',
    'Tăng hiệu suất hoạt động',
  ],
  '2. Máy lọc nước biển SEA-40': [
    'Công nghệ RO tiên tiến',
    'Hoạt động bằng điện 220VAC/380VAC',
    'Thiết kế compact, phù hợp tàu thuyền',
    'Phù hợp cho tàu cá và ứng dụng biển',
  ],
  '3. Thiết bị giám sát hành trình Viettel S-Tracking': [
    'Định vị GPS chính xác',
    'Truyền dữ liệu qua mạng di động và vệ tinh',
    'Chống nước IP67',
    'Phù hợp môi trường tàu cá ngoài biển',
  ],
  '4. Thuraya Marine Star MNB-01': [
    'Liên lạc qua vệ tinh trên biển',
    'Chất lượng thoại ổn định',
    'GPS tích hợp',
    'Phù hợp môi trường hàng hải',
  ],
  '5. Điện thoại vệ tinh XT-Pro': [
    'Kết nối toàn cầu',
    'Thiết kế siêu bền',
    'GPS và SOS tích hợp',
    'Phù hợp hoạt động ngoài khơi',
  ],
  '6. Thiết bị lọc dầu SF-50': [
    'Hiệu suất lọc cao',
    'Tự động hóa',
    'Tiết kiệm năng lượng',
    'Hỗ trợ giảm chi phí vận hành',
  ],
  '7. Ắc quy Accu Nano SDViCo': [
    'Hai điện cực inox 316 chịu ăn mòn hơi nước và muối biển',
    'Có cọc riêng cho thiết bị GPS, bộ đàm, giám sát',
    'Phụ gia nano carbon tăng tuổi thọ tuần hoàn và số lần khởi động',
    'Hợp kim đặc biệt nâng cao tuổi thọ, hiệu suất làm việc cao',
  ],
  '8. Sơn RARE': [
    'Phản xạ tới 95% năng lượng mặt trời, từ vùng khả kiến tới hồng ngoại nhiệt',
    'Làm mát bằng bức xạ trong vùng 8 tới 14 micromet, tỏa nhiệt trực tiếp ra ngoài',
    'Chống nóng vượt trội so với sơn thường trên thị trường',
  ],
  // 26/8: nguồn từ file "Tính năng 9.txt" trong kho tư liệu user cung cấp.
  '9. Máy Lọc Dầu Diesel SD12-300': [
    // 8/9 tối: tên công khai SF300B (chỉ còn 1 máy lọc dầu); thông số từ file "Tính năng.txt" folder
    // "Lọc dầu SF300B" user cấp 8/9 (đã nạp product_facts verified).
    'Máy lọc dầu SF300B, bơm điện công suất lớn SF300',
    'Lọc nước và cặn bẩn trong dầu diesel, độ lọc 1 tới 10 micromet, tách nước 100%',
    'Hỗ trợ bảo vệ kim phun, bơm cao áp; tiết kiệm nhiên liệu 5 tới 10% sau khi lọc',
    'Kích thước 52 x 20 x 50 cm, nặng 15 kg, đặt vừa hầm máy, đầm máy chống rung',
    'Vỏ inox 304 không rỉ sét, chịu muối biển',
    'Dễ lắp đặt, vệ sinh và bảo dưỡng; bảo hành 12 tháng',
  ],
  // 5/9: SDFish — CHỈ điều đã kiểm trên web sdfish.sdvico.vn (điều cấm 5). Không ghi giá, gói,
  // App Store, tính năng đang làm.
  '10. SDFish': [
    'App SDVICO tự làm cho ngư dân Việt Nam, dùng được trên web sdfish.sdvico.vn',
    'Ra khơi: dự báo cá, gió sóng, dẫn đường, có cảnh báo bão trên trang chủ',
    'Tàu cá: giữ giấy tờ tàu, dịch vụ, đồ SDVICO một chỗ',
    'Bạn thuyền: sổ thuyền viên, hồ sơ, chứng chỉ, bảo hiểm, tra cảnh báo trước khi nhận bạn mới',
    'Giao dịch: giá cá tham khảo theo vùng, tin mua bán, đầu mối gọi thẳng',
    'Có chat, nhóm, gọi điện, họp online ngay trong app',
    'Đăng nhập bằng số điện thoại; tài khoản do SDVICO tạo giúp khi bà con nhắn Page hoặc gọi 0939 243 222',
  ],
};

export function getFeatures(group) {
  return FEATURES[group] || [];
}

// 8/9/2026: GIÁ ÚP MỞ cho kênh công khai. Sếp đưa giá thật 14:04 ngày 8/9; Thanh chốt cùng chiều:
// bài đăng Page, group, TikTok, YouTube, quảng cáo KHÔNG ghi số chính xác, chỉ ghi mốc "9,X triệu"
// để bà con tò mò nhắn hỏi. Số chính xác chỉ nói trong inbox, điện thoại, sàn, và KHÔNG nằm trong
// file này (để máy không lỡ in ra). Nhóm chưa có giá thì không có dòng, bài viết như cũ (điều cấm 5).
// key = cụm phải có mặt trong bài để coi là "đã có câu giá". Bản sao y hệt ở packages/marketing.
// 8/9 chiều (Thanh: "áp giá vào caption video"): thêm spoken (dạng ĐỌC ĐƯỢC cho lời thoại, TTS không
// đọc được "3X"/"9,X"), spokenKey (cụm để biết cảnh cuối đã có câu giá), badge (tem giá vàng trên hình,
// 2 dòng, qua drawtext textfile). Vẫn không có số chính xác.
export const PRICE_TEASER = {
  '2. Máy lọc nước biển SEA-40': {
    text: 'Tháng 9 giảm 7 triệu, máy cơ chỉ còn 3X triệu, máy chạy điện 4X triệu',
    key: '3X triệu',
    spoken: 'Tháng 9 giảm 7 triệu, máy cơ còn hơn 30 triệu thôi. Bình luận lọc dầu hay lọc nước, em tư vấn ngay nha!',
    spokenKey: 'hơn 30 triệu',
    badge: 'Tháng 9 giảm 7 triệu\nMáy cơ chỉ còn 3X triệu',
  },
  '9. Máy Lọc Dầu Diesel SD12-300': {
    text: 'Tháng 9 từ 12 triệu giảm còn 9,X triệu',
    key: '9,X triệu',
    spoken: 'Tháng 9 từ 12 triệu giảm còn chưa tới 10 triệu. Bình luận lọc dầu hay lọc nước, em tư vấn ngay nha!',
    spokenKey: 'chưa tới 10 triệu',
    badge: 'Tháng 9: từ 12 triệu\ncòn 9,X triệu',
  },
};
export function getPriceTeaser(group) {
  return PRICE_TEASER[group] || null;
}

// Tên gọi CÔNG KHAI khi khác nhãn folder kho. 8/9 Thanh chốt: máy lọc dầu gọi là SF300B; SD12-300
// chỉ là mã trên tem máy và tên folder brand_assets, không ghi lên bài.
export const PUBLIC_NAME = {
  '9. Máy Lọc Dầu Diesel SD12-300': 'Máy lọc dầu SF300B',
};
export function publicName(group) {
  return PUBLIC_NAME[group] || null;
}

// 8/9 tối (Thanh): "giờ chỉ còn 1 máy lọc dầu là SF300B, các sản phẩm kia cho bài bán ảnh".
// VIDEO_GROUPS = nhóm được dựng video bán hàng (chiếm ô YouTube/TikTok); nhóm khác LUÔN ra bài ảnh
// trên Facebook. DISCONTINUED_GROUPS = ngừng bán, rotate bỏ qua dù kế hoạch còn nhắc.
// Bản sao y hệt ở packages/marketing.
export const VIDEO_GROUPS = new Set([
  '2. Máy lọc nước biển SEA-40',
  '9. Máy Lọc Dầu Diesel SD12-300',
]);
export const DISCONTINUED_GROUPS = new Set([
  '6. Thiết bị lọc dầu SF-50',
]);
export function isPhotoOnlyGroup(group) {
  return !VIDEO_GROUPS.has(group);
}
export function isDiscontinuedGroup(group) {
  return DISCONTINUED_GROUPS.has(group);
}

// Chặn số tiền chính xác lọt ra kênh công khai (lưới sau prompt, phòng model quên luật).
// Số dạng N.NNN.NNN từ 1 triệu trở lên đổi thành mốc úp mở: dưới 10 triệu thành "9,X triệu",
// từ 10 triệu thành "4X triệu". Các mốc "42 triệu", "9,9 triệu"... của giá đang áp cũng đổi.
// "12 triệu" (giá cũ lọc dầu) và "7 triệu" (mức giảm) được phép vì nằm trong câu úp mở đã chốt.
const EXACT_MILLIONS = [42, 31, 13, 49, 38, 14];
export function redactExactPrices(text) {
  let s = String(text || '');
  s = s.replace(/(\d{1,3}(?:\.\d{3}){2,})\s*(?:đồng|đ|vnđ|vnd)?/gi, (m, num) => {
    const n = Number(num.replace(/\./g, ''));
    if (!n || n < 1000000) return m;
    const tr = Math.floor(n / 1000000);
    return tr < 10 ? `${tr},X triệu` : `${String(tr)[0]}X triệu`;
  });
  s = s.replace(/\b9[,.]9\s*(?:triệu|tr)\b/gi, '9,X triệu').replace(/\b9tr9\b/gi, '9,X triệu');
  for (const tr of EXACT_MILLIONS) {
    s = s.replace(new RegExp(`\\b${tr}\\s*(?:triệu|tr)\\b`, 'gi'), `${String(tr)[0]}X triệu`);
  }
  return s;
}

// Bảo đảm bài bán có đúng câu giá úp mở: chặn số chính xác, thiếu câu giá thì chèn trước dòng
// CTA cuối (giữ câu hỏi mở kết bài). Nhóm không có giá thì trả nguyên văn, không đụng gì.
export function ensurePriceTeaser(body, teaser) {
  if (!teaser) return body;
  const s = redactExactPrices(body);
  if (s.includes(teaser.key)) return s;
  const sentence = `${teaser.text}. Giá chính xác em gửi riêng, kỹ thuật lắp tận tàu.`;
  const lines = s.split('\n');
  let last = lines.length - 1;
  while (last > 0 && !lines[last].trim()) last--;
  if (last <= 0) return `${s.trim()}\n\n${sentence}`;
  lines.splice(last, 0, sentence, '');
  return lines.join('\n');
}

// 9/9 (Thanh): MỌI bài bán kết bằng câu kêu bà con BÌNH LUẬN từ khóa ("anh em cmt 'lọc dầu' hay 'lọc
// nước' để em tư vấn"): kéo tương tác, lộ ra ai cần gì để Kinh doanh nhảy vào tư vấn (người trả lời,
// máy không tự trả lời, điều cấm 1). Hai máy chủ lực dùng chung 1 câu; sản phẩm khác dùng từ khóa riêng.
const CTA_FLAGSHIP = 'Anh em cmt "lọc dầu" hay "lọc nước" để em tư vấn cho anh em nhé!';
const CTA_KEYWORD = {
  '1. PV Engine RMI Nano Graphene': 'dầu nhớt',
  '3. Thiết bị giám sát hành trình Viettel S-Tracking': 'giám sát hành trình',
  '4. Thuraya Marine Star MNB-01': 'vệ tinh',
  '5. Điện thoại vệ tinh XT-Pro': 'vệ tinh',
  '7. Ắc quy Accu Nano SDViCo': 'ắc quy',
  '8. Sơn RARE': 'sơn',
  '10. SDFish': 'SDFish',
};
export function commentCta(group) {
  if (group === '2. Máy lọc nước biển SEA-40' || group === '9. Máy Lọc Dầu Diesel SD12-300' || group === '6. Thiết bị lọc dầu SF-50') return CTA_FLAGSHIP;
  const k = CTA_KEYWORD[group];
  return k ? `Anh em cmt "${k}" để em tư vấn cho anh em nhé!` : 'Anh em cmt "tư vấn" để em tư vấn cho anh em nhé!';
}
// Bảo đảm câu CTA bình luận là câu CUỐI bài (model quên thì nối vào). Đã có câu kêu cmt/bình luận
// từ khóa rồi thì giữ nguyên.
export function ensureCommentCta(body, cta) {
  if (!cta) return body;
  const s = String(body || '').trimEnd();
  if (/(?:cmt|bình luận|comment)\s*[:]?\s*["“']/i.test(s)) return s;
  return s ? `${s}\n\n${cta}` : cta;
}

// 9/9 (Thanh): 2 máy đã lên gian Shopee SDVICO (shop 212723941). Bài bán chèn 1 dòng link sàn để bà con
// đặt ship tận nơi hoặc trả góp qua sàn; sàn là nơi duy nhất ghi giá chính xác nên link không phá luật
// giá úp mở. Chỉ 2 nhóm có link; nhóm khác không có dòng này. Bản sao y hệt ở packages/marketing/src/products.mjs.
export const SHOPEE_LINK = {
  '2. Máy lọc nước biển SEA-40': 'https://shopee.vn/product/212723941/45017630539/',
  '9. Máy Lọc Dầu Diesel SD12-300': 'https://shopee.vn/product/212723941/29945752663/',
};
export function shopeeLink(group) {
  return SHOPEE_LINK[group] || null;
}
// Bảo đảm bài có dòng link Shopee: đã có link shopee.vn thì giữ nguyên; có câu CTA cmt ở cuối thì
// chèn TRƯỚC câu đó (CTA vẫn là dòng cuối); còn lại nối vào cuối. Không link thì trả nguyên văn.
export function ensureShopeeLink(body, link) {
  if (!link) return body;
  const s = String(body || '').trimEnd();
  if (/shopee\.vn\//i.test(s)) return s;
  const line = `Đặt trên Shopee, giao tận nơi: ${link}`;
  if (!s) return line;
  const lines = s.split('\n');
  const last = lines[lines.length - 1];
  if (/(?:cmt|bình luận|comment)\s*[:]?\s*["“']/i.test(last)) {
    lines.splice(lines.length - 1, 0, line, '');
    return lines.join('\n');
  }
  return `${s}\n\n${line}`;
}

// Bảo đảm CẢNH CUỐI video có câu giá đọc được (luật 8/9). Chặn số chính xác trước; thiếu câu thì
// nối vào cuối lời thoại cảnh đó. Không teaser thì trả nguyên văn.
export function ensureSpokenTeaser(narration, teaser) {
  if (!teaser?.spoken) return narration;
  const s = redactExactPrices(String(narration || '')).trim();
  if (teaser.spokenKey && s.includes(teaser.spokenKey)) return s;
  return s ? `${s} ${teaser.spoken}` : teaser.spoken;
}

// Folder tư liệu chung cho các BÀI CONTENT (không gắn sản phẩm cụ thể): ảnh biển, cảnh
// làng chài, đời sống ngư dân... Trong brand_assets, cột product_group='Content'.
// rotate/rotate-run ưu tiên ảnh trong folder này khi sinh bài content; hết mới fallback ảnh khác.
export const CONTENT_GROUP = 'Content';

// Chủ đề cho bài content (nuôi trang, kéo tương tác - KHÔNG bán trực tiếp).
// Chia theo 5 CỤM, mỗi cụm có chỉ dẫn cấu trúc riêng trong prompt social.mjs.
// KHÔNG bịa tin tức/số liệu/sự kiện cụ thể (điều cấm 5).
// Hai cụm "chân dung người thật" và "thời sự ngành" cần người viết tay có tư liệu thật,
// KHÔNG để AI tự sinh - không nằm trong danh sách này.
export const CONTENT_TOPICS = [
  // Checklist / danh sách kiểm tra - đánh số rõ, thiết thực.
  { type: 'checklist', topic: 'những việc cần kiểm trước khi rời bến chuyến biển dài ngày' },
  { type: 'checklist', topic: 'việc phải làm với máy tàu trong 24 giờ đầu sau khi về bến' },
  { type: 'checklist', topic: 'bộ giấy tờ tàu cá cần chuẩn bị đầy đủ trước mỗi chuyến' },
  { type: 'checklist', topic: 'các thiết bị an toàn nên có mặt trên tàu cá' },
  { type: 'checklist', topic: 'lịch bảo dưỡng định kỳ cho tàu cá theo tháng' },

  // Giải thích thuật ngữ ngành - ngắn, dễ hiểu, hữu ích để chia sẻ.
  { type: 'glossary', topic: 'chống khai thác IUU là gì và tàu cá vướng khi nào' },
  { type: 'glossary', topic: 'thiết bị VMS là gì và tại sao được yêu cầu lắp' },
  { type: 'glossary', topic: 'chuẩn chống nước IP67 trên thiết bị nghĩa là chịu được cỡ nào' },
  { type: 'glossary', topic: 'điện thoại vệ tinh khác điện thoại di động ở điểm nào' },
  { type: 'glossary', topic: 'nhật ký khai thác thủy sản gồm những nội dung gì' },

  // Mẹo & kinh nghiệm sửa vặt - nội dung kỹ thuật thật, không bán.
  { type: 'tip', topic: 'ắc quy tàu cá dễ chai sớm vì những thói quen nào' },
  { type: 'tip', topic: 'nước ngọt trên tàu có mùi lạ, nguyên nhân và cách xử lý' },
  { type: 'tip', topic: 'nhận biết dầu diesel bẩn bằng mắt thường' },
  { type: 'tip', topic: 'dấu hiệu động cơ tàu cần bảo dưỡng sớm' },
  { type: 'tip', topic: 'cách bảo quản thiết bị điện tử trên tàu chống ăn mòn hơi muối' },

  // Q&A - bà con hay hỏi tổng đài, viết dạng Hỏi-Đáp ngắn.
  { type: 'qa', topic: 'giám sát hành trình có tự tắt khi hết pin tàu không' },
  { type: 'qa', topic: 'lắp máy lọc nước biển xong dùng luôn được không' },
  { type: 'qa', topic: 'sơn chống nóng tàu bao lâu phải sơn lại' },
  { type: 'qa', topic: 'điện thoại vệ tinh bắt sóng ở khu vực nào của biển' },
  { type: 'qa', topic: 'dầu nhớt hàng hải khác dầu nhớt xe máy như thế nào' },

  // Tương tác - đặt câu hỏi mở để bà con bình luận.
  { type: 'engage', topic: 'bà con ra khơi sợ nhất thứ gì' },
  { type: 'engage', topic: 'chuyến biển dài nhất bà con từng đi mấy ngày' },
  { type: 'engage', topic: 'kỷ niệm gặp cá lớn hoặc mẻ lớn ngoài khơi' },
  { type: 'engage', topic: 'câu chuyện được tàu bạn cứu giúp giữa biển' },
  { type: 'engage', topic: 'bến cá nào bà con thấy vui nhất mỗi khi về' },

  // Chân dung người trong nghề - KHUNG SƯỜN, Phòng Kinh doanh điền tên/câu nói thật rồi mới đăng.
  { type: 'portrait', topic: 'chân dung một bác thuyền trưởng nhiều năm gắn bó với biển' },
  { type: 'portrait', topic: 'câu chuyện một ngư dân trẻ nối nghiệp cha ông' },
  { type: 'portrait', topic: 'người thợ máy tàu cá và bí quyết giữ máy bền' },
  { type: 'portrait', topic: 'chủ tàu nhiều đời gắn bó với nghề đánh bắt xa bờ' },

  // Nhịp thời sự ngành - CẦN CẤP QUẢN LÝ DUYỆT (điều cấm 3, gắn needs_gov_review=true).
  { type: 'news', topic: 'cập nhật chung về quy định chống khai thác IUU cho tàu cá' },
  { type: 'news', topic: 'lưu ý mới về nhật ký khai thác thủy sản' },
  { type: 'news', topic: 'khuyến cáo an toàn cho tàu cá mùa mưa bão' },
  { type: 'news', topic: 'thông tin chung về gia hạn giấy phép khai thác' },
];

// Hashtag mặc định gắn MỌI bài (4 thẻ chung, do Phòng chốt). KHÔNG để thẻ theo loại thiết bị
// cụ thể (liên lạc, tàu cá...) ở đây kẻo bài sơn/dầu dính oan. Thẻ riêng đúng loại nằm ở
// từng sản phẩm bên trên (productHashtags), mỗi bài được cộng thêm nhiều thẻ đúng sản phẩm.
export const DEFAULT_HASHTAGS = [
  '#SDVICO', '#Đồng_hành_cùng_ngư_dân', '#Thiết_bị_tàu_biển', '#hỗ_trợ_ngư_dân',
];

// Bỏ dấu tiếng Việt để so khớp không phân biệt dấu.
function noAccent(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Đoán product_group từ tên tư liệu. Trả về nhãn group hoặc null nếu không khớp.
export function guessGroup(title) {
  const t = noAccent(title);
  // 29/8: khớp theo TỪ KHÓA DÀI NHẤT thay vì nhóm đứng trước thắng — "Máy Lọc Dầu Diesel
  // SD12-300" từng bị SF-50 (no 6, key 'loc dau') cướp trước khi xét tới nhóm 9, làm hướng
  // đi của SD12-300 sinh bài bằng folder SF-50. Từ khóa dài hơn = cụ thể hơn = đúng hơn.
  let best = null;
  let bestLen = 0;
  for (const p of PRODUCTS) {
    for (const m of p.match) {
      const k = noAccent(m);
      if (k.length > bestLen && t.includes(k)) { best = p.group; bestLen = k.length; }
    }
  }
  return best;
}

export function findProduct(group) {
  return PRODUCTS.find((p) => p.group === group) || null;
}

// Bộ hashtag RIÊNG của sản phẩm (đúng loại, không lẫn sản phẩm khác).
export function productHashtags(group) {
  const p = findProduct(group);
  return (p && p.hashtags) ? p.hashtags : [];
}

// Tương thích code cũ: trả về thẻ riêng đầu tiên.
export function productHashtag(group) {
  const tags = productHashtags(group);
  return tags[0] || null;
}
