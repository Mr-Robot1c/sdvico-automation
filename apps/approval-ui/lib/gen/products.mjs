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
    hashtags: ['#máy_lọc_nước_biển', '#nước_ngọt_trên_tàu', '#chủ_động_nước_ngọt', '#SEA40'] },
  { no: 3, group: '3. Thiết bị giám sát hành trình Viettel S-Tracking',
    match: ['giam sat hanh trinh', 's-tracking', 's tracking', 'stracking', 'gsht', 'viettel'],
    hashtags: ['#giám_sát_hành_trình', '#thiết_bị_VMS', '#S_Tracking', '#an_tâm_ra_khơi'] }, // 21/10: bỏ #chống_khai_thác_IUU, chính thẻ này làm mọi bài S-Tracking dính cờ đỏ (scanRegulation).
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
// 9/9 chiều (2) (Thanh chốt lại, nguyên văn): DÙNG câu giật tít có mốc giá neo để bà con thấy rẻ:
// "máy cơ giảm từ 45tr xuống còn 3X triệu, máy điện giảm từ 56tr còn 4X triệu, máy lọc dầu giảm từ 12tr
// còn 9,Xtr". Các mốc 45 / 56 / 12 triệu là mốc neo Thanh cấp, KHÔNG có trong văn bản chính sách giá
// GĐ TTKD Tiến 9/9 (chỉ có giá bán lẻ 38 / 49 / 9,9 triệu). Vì vậy bài vẫn đi qua hàng đợi duyệt và gửi
// nhóm xem trước khi đăng (luật Tiến 9/9). Số chính xác 38/49/9,9 vẫn KHÔNG nằm trong file này.
export const PRICE_TEASER = {
  '2. Máy lọc nước biển SEA-40': {
    text: 'Máy cơ giảm từ 45 triệu còn 3X triệu, máy điện giảm từ 56 triệu còn 4X triệu, đã gồm công lắp, tặng 10 lõi lọc thô',
    key: '3X triệu',
    // 10/9 (Thanh: lời đọc phải là "giảm từ 56 triệu chỉ còn 4 X triệu", không đọc "hơn 40 triệu"; câu kêu bình luận DỜI XUỐNG OUTRO build-video.mjs).
    spoken: 'Máy cơ giảm từ 45 triệu chỉ còn 3 X triệu, máy điện giảm từ 56 triệu chỉ còn 4 X triệu, đã gồm công lắp, còn tặng 10 lõi lọc thô!',
    spokenKey: '3 X triệu',
    badge: 'Máy cơ 45 triệu còn 3X triệu\nMáy điện 56 triệu còn 4X triệu',
  },
  '9. Máy Lọc Dầu Diesel SD12-300': {
    text: 'Bộ lọc dầu giảm từ 12 triệu còn 9,X triệu',
    key: '9,X triệu',
    spoken: 'Bộ lọc dầu giảm từ 12 triệu chỉ còn 9 phẩy X triệu thôi!',
    spokenKey: '9 phẩy X triệu',
    badge: 'Bộ lọc dầu: từ 12 triệu\ncòn 9,X triệu',
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
// 21/10: dạng bài KHÔNG làm video (ô YouTube/TikTok): liệt kê nhiều mục hay giải nghĩa chữ thì chỉ hợp bài ảnh đọc
// trên Facebook. Cùng luật video bài content 9/9 (CONTENT_VIDEO_KINDS ở /api/rotate). Hướng không ghi dạng thì cho qua.
export const PHOTO_ONLY_KINDS = new Set(['checklist', 'glossary', 'news', 'portrait']);
export function isVideoFitKind(kind) {
  return !kind || !PHOTO_ONLY_KINDS.has(String(kind));
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
// 10/9 (Thanh: "bình luận lọc dầu hay lọc nước dựa trên video sản phẩm nào"): từ khóa bình luận đọc
// trong OUTRO video theo ĐÚNG sản phẩm của video. Lọc nước -> "lọc nước", lọc dầu -> "lọc dầu", nhóm
// khác theo CTA_KEYWORD; video content (không sản phẩm) giữ câu gộp "lọc dầu hay lọc nước".
export function outroKeyword(group) {
  if (group === '2. Máy lọc nước biển SEA-40') return 'lọc nước';
  if (group === '9. Máy Lọc Dầu Diesel SD12-300' || group === '6. Thiết bị lọc dầu SF-50') return 'lọc dầu';
  return CTA_KEYWORD[group] || 'lọc dầu hay lọc nước';
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
  // 10/9 (Thanh): S-Tracking cung len Shopee (dao quyet dinh 7/9). Hang Viettel, SDVICO phan phoi + lap.
  '3. Thiết bị giám sát hành trình Viettel S-Tracking': 'https://shopee.vn/product/212723941/56017649187/',
  // 30/9 (Thanh): ắc quy Globe WPM-220 lên gian Shopee (listing docs/plans/listing-shopee-ac-quy-30-09.md).
  '7. Ắc quy Accu Nano SDViCo': 'https://shopee.vn/product/212723941/57818583405/',
};
export function shopeeLink(group) {
  return SHOPEE_LINK[group] || null;
}
// Bảo đảm bài có dòng link Shopee: đã có link shopee.vn thì giữ nguyên; có câu CTA cmt ở cuối thì
// chèn TRƯỚC câu đó (CTA vẫn là dòng cuối); còn lại nối vào cuối. Không link thì trả nguyên văn.
// 11/9 chiều (Thanh): social.mjs và caption build-video KHÔNG gọi hàm này nữa (bài bán bỏ dòng link).
// Giữ hàm cho ai cần chèn tay; SHOPEE_LINK vẫn dùng ở bot hỏi đáp (hoi-dap-bot.ts).
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

// 11/9 (đọc trọn 51 group Facebook nghề biển, docs/plans/phan-tich-group-ngu-dan-11-09.md): bài bán phải
// biết nói với ai. Tệp A = chủ ghe nhỏ ven bờ (khách lọc dầu); tệp B = chủ tàu khơi xa 15 m trở lên (khách
// lọc nước, giám sát). Chữ ở đây đã tránh mọi cụm SỰ THẬT NGHỀ cấm (product-guard.mjs): KHÔNG "bớt chở
// nước", "nhẹ tàu", "giảm tải", "tiết kiệm dầu" cho lọc nước. Bản sao y hệt ở apps/approval-ui/lib/gen.
export const AUDIENCE = {
  '9. Máy Lọc Dầu Diesel SD12-300': {
    key: 'A',
    who: 'chủ ghe 8 tới 12 m chạy máy Kia 33, Yanmar 2T, D30, đi gần bờ, một chuyến vài ngày, tiền eo hẹp, quen mua đồ cũ',
    pain: 'giá dầu lên, dầu lẫn cặn và nước làm nghẹt kim phun, máy khục kịch nổ không êm, nằm bờ sửa tốn tiền và mất chuyến',
    compare: 'đồ cũ "còn 90%" mua trôi nổi không ai bảo hành',
    proof: 'tự lắp được, giao tận nơi toàn quốc, bảo hành 12 tháng, vỏ inox 304 chịu muối biển',
    question: 'Ghe anh chạy máy gì, một chuyến mấy ngày?',
  },
  '6. Thiết bị lọc dầu SF-50': {
    key: 'A',
    who: 'chủ ghe 8 tới 12 m chạy máy Kia 33, Yanmar 2T, D30, đi gần bờ, một chuyến vài ngày, tiền eo hẹp, quen mua đồ cũ',
    pain: 'giá dầu lên, dầu lẫn cặn và nước làm nghẹt kim phun, máy khục kịch nổ không êm, nằm bờ sửa tốn tiền và mất chuyến',
    compare: 'đồ cũ "còn 90%" mua trôi nổi không ai bảo hành',
    proof: 'tự lắp được, giao tận nơi toàn quốc, bảo hành 12 tháng',
    question: 'Ghe anh chạy máy gì, một chuyến mấy ngày?',
  },
  '2. Máy lọc nước biển SEA-40': {
    key: 'B',
    who: 'chủ tàu 15 tới 20 m, máy 280 tới 550 cv, đi 20 tới 30 ngày một chuyến, tàu thu mua hoặc tàu hậu cần, cả tàu 8 tới 12 người ăn uống tắm rửa',
    pain: 'nước ngọt cạn giữa chuyến, nước để lâu trong thùng thì hôi và đau bụng, phải cắt chuyến quay bờ sớm khi cá đang vào',
    compare: 'thùng nước inox trên boong: chứa được bao nhiêu thì xài bấy nhiêu, hết là hết',
    proof: 'giá đã gồm công lắp, kỹ thuật SDVICO tới tận tàu lắp và hướng dẫn, tặng 10 lõi lọc thô, làm ra khoảng 250 lít nước ngọt mỗi giờ',
    question: 'Tàu anh dài bao nhiêu mét, đi mấy ngày một chuyến?',
  },
  '3. Thiết bị giám sát hành trình Viettel S-Tracking': {
    key: 'B',
    who: 'chủ tàu 15 m trở lên đi khơi xa, đang chạy máy giám sát cũ hoặc sắp phải thay',
    pain: 'máy cũ chập chờn mất tín hiệu, lắp chậm, hỏng không biết kêu ai, mỗi lần đi làm giấy lại lo',
    compare: 'máy cũ mua trôi nổi trên mạng không ai lắp, không ai bảo hành',
    proof: 'SDVICO lắp tận tàu, kích hoạt tài khoản ngay khi lắp, bảo hành 12 tháng máy và 6 tháng phụ kiện, mỗi tàu một tài khoản riêng trên app Viettel S-Tracking',
    question: 'Tàu anh đang chạy máy giám sát nào, lắp năm nào rồi?',
  },
};
export function audienceOf(group) {
  return AUDIENCE[group] || null;
}
// Khối prompt "khách của bài này" cho generateSocialPost (2 bản social.mjs). Nhóm không có hồ sơ -> [].
export function audienceLines(group) {
  const a = audienceOf(group);
  if (!a) return [];
  return [
    `KHÁCH CỦA BÀI NÀY (tệp ${a.key}, đọc từ 51 group nghề biển 11/9): ${a.who}. Viết như đang nói với đúng người này, xưng "anh em" hoặc "bà con" như thường, KHÔNG gọi "khách hàng", KHÔNG viết cho người ngoài nghề.`,
    `NỖI ĐAU đưa vào bài (chọn 1 ý, không kể hết): ${a.pain}.`,
    `SO SÁNH NHẸ với thứ bà con đang dùng: ${a.compare}. Chỉ nói khác nhau chỗ nào, không chê, không bịa con số.`,
    `CÂU TIN CẬY (đúng 1 câu): ${a.proof}.`,
    // 11/9 chiều (Thanh): KHÔNG đưa a.question vào bài nữa. Hỏi "ghe anh chạy máy gì" rồi ngay dưới
    // lại kêu cmt "lọc dầu" hay "lọc nước" nghe lạc nhịp. Câu hỏi giữ trong AUDIENCE cho Kinh doanh
    // dùng khi chat với khách, không phải cho bài.
  ];
}

// 11/9 (Thanh: bài bán phải có phép tính theo cỡ tàu). Mọi số có nguồn công khai, xem
// docs/plans/plan-bai-toan-loi-ich-11-09.md mục 1. Model KHÔNG tự tính.
// 15/10 (Thanh soát bài b8f2a8dc: bài dán nguyên dòng công thức "× 15 ngày = 2.250 lít × 27.740 đ/lít", kèm ngoặc
// nguồn dài "(Dân trí 27/2/2022, tàu 400 cv Thanh Hóa...)"; bài cc253c9d tự bịa "Dầu 38.000đ mỗi lít"): prompt dặn "viết
// thành lời kể" nhưng model chép nguyên dòng ví dụ. Nay ĐOẠN BÀI TOÁN viết sẵn thành lời, không ký hiệu, máy tự chèn vào
// bài (applyBenefitBlock); model chỉ đặt chỗ [BÀI TOÁN]. Nguồn của từng số giữ trong code (fuelSource, waterSourceNote),
// không đưa vào bài.
// Giá dầu đổi theo kỳ điều hành: đặt env DIESEL_PRICE_VND (đ/lít) và DIESEL_PRICE_DATE (dd/mm/yyyy).
export const BENEFIT_ASSUMPTIONS = {
  dieselPrice: Number(process.env.DIESEL_PRICE_VND || 27740),
  dieselPriceDate: process.env.DIESEL_PRICE_DATE || '3/9/2026',
  dieselPriceSource: 'Petrolimex DO 0,05S-II vùng 1',
  waterPerPersonPerDay: 15,          // lít, suy từ Tepbac 17/1/2018: tàu 10 người chở 3 tấn nước cho chuyến ~20 ngày
  waterSourceNote: 'theo mức ngư dân Quỳnh Lập, Nghệ An chở khoảng 3 tấn nước cho tàu 10 người một chuyến',
  fuelSavingPct: [5, 10],            // tài liệu SF300B
  tripsPerYear: 6,                   // Tạp chí Thủy sản VN 20/12/2024, một chủ tàu Vũng Tàu
  injectorLifeHours: [2000, 3000],   // thietbitpp.vn
  waterMachineLph: 250,              // SEA-40 bản chạy điện, bảng quy cách Kinh doanh 9/9
};
// LỚP MÁY: lít dầu MỖI NGÀY suy từ nguồn công khai (ghi rõ cách suy trong fuelSource). Không có nguồn cho
// máy dưới 300 cv nên lớp "nho" không tính tiền dầu (chỉ tính nước).
// 15/10: minCv = mức máy của chính nguồn. Nguồn lớp "vua" nói tàu 400 cv nên tàu 300 cv KHÔNG tính tiền dầu
// (trước đây tàu 14 m máy 300 cv dùng luôn 150 lít một ngày của tàu 400 cv, đẩy số lên quá tay).
export const ENGINE_CLASSES = {
  nho:  { label: 'máy 90 tới 150 cv', fuelPerDay: null, minCv: null, fuelSource: 'chưa có nguồn công khai cho máy nhỏ, không tính tiền dầu' },
  vua:  { label: 'máy 300 tới 400 cv', fuelPerDay: 150, minCv: 400, fuelSource: 'Dân trí 27/2/2022, tàu 400 cv Thanh Hóa 1.500 tới 2.000 lít mỗi chuyến 10 tới 15 ngày, suy ra khoảng 150 lít mỗi ngày' },
  // 340 chứ không 330: 330 × 30 = 9.900 lít bị product-guard nhóm 9 bắt nhầm là giá "9,9 triệu".
  lon:  { label: 'máy 500 tới 600 cv', fuelPerDay: 340, minCv: 500, fuelSource: 'VnExpress 4/7/2005, tàu 500 tới 600 cv khoảng 10.000 lít mỗi chuyến một tháng, suy ra khoảng 340 lít mỗi ngày' },
};
// 8 KỊCH BẢN (Thanh 11/9: đưa nhiều giả định để bài chọn đúng cỡ tàu của khách). crew = số người, days = số
// ngày một chuyến, engine = lớp máy, cv = mã lực của kịch bản. Thứ tự từ nhỏ tới lớn.
export const BENEFIT_CASES = [
  { key: 'ghe-10m-4n-3d',  label: 'ghe 10 m, máy 90 cv, 4 người, chuyến 3 ngày',            boat: 'Ghe 10 m, máy 90 cv',            cv: 90,  crew: 4,  days: 3,  engine: 'nho' },
  { key: 'ghe-12m-5n-7d',  label: 'ghe 12 m, máy 150 cv, 5 người, chuyến 7 ngày',           boat: 'Ghe 12 m, máy 150 cv',           cv: 150, crew: 5,  days: 7,  engine: 'nho' },
  { key: 'tau-14m-6n-10d', label: 'tàu 14 m, máy 300 cv, 6 người, chuyến 10 ngày',          boat: 'Tàu 14 m, máy 300 cv',           cv: 300, crew: 6,  days: 10, engine: 'vua' },
  { key: 'tau-15m-8n-15d', label: 'tàu 15 m, máy 400 cv, 8 người, chuyến 15 ngày',          boat: 'Tàu 15 m, máy 400 cv',           cv: 400, crew: 8,  days: 15, engine: 'vua' },
  { key: 'tau-15m-10n-20d',label: 'tàu 15 m, máy 400 cv, 10 người, chuyến 20 ngày',         boat: 'Tàu 15 m, máy 400 cv',           cv: 400, crew: 10, days: 20, engine: 'vua' },
  { key: 'tau-17m-10n-25d',label: 'tàu 17 m, máy 500 cv, 10 người, chuyến 25 ngày',         boat: 'Tàu 17 m, máy 500 cv',           cv: 500, crew: 10, days: 25, engine: 'lon' },
  { key: 'tau-20m-12n-30d',label: 'tàu 20 m, máy 600 cv, 12 người, chuyến 30 ngày',         boat: 'Tàu 20 m, máy 600 cv',           cv: 600, crew: 12, days: 30, engine: 'lon' },
  { key: 'hau-can-25m',    label: 'tàu hậu cần 25 m, máy 600 cv, 15 người, chuyến 30 ngày', boat: 'Tàu hậu cần 25 m, máy 600 cv',   cv: 600, crew: 15, days: 30, engine: 'lon' },
];
// Lít dầu cả chuyến của một kịch bản (null nếu lớp máy chưa có nguồn, hoặc máy nhỏ hơn mức của nguồn).
export function fuelLitersOf(c) {
  const e = ENGINE_CLASSES[c.engine];
  if (!e || !e.fuelPerDay) return null;
  if (e.minCv && Number(c.cv) < e.minCv) return null;
  return e.fuelPerDay * c.days;
}
// Tính 1 kịch bản bất kỳ (dùng cho bot hỏi đáp hoặc Kinh doanh tính tay theo tàu khách).
export function estimateBenefit({ crew, days, engine = 'vua' }) {
  const a = BENEFIT_ASSUMPTIONS;
  const e = ENGINE_CLASSES[engine] || ENGINE_CLASSES.vua;
  const fuelLiters = e.fuelPerDay ? e.fuelPerDay * days : null;
  const fuelCost = fuelLiters ? fuelLiters * a.dieselPrice : null;
  const waterLiters = crew * days * a.waterPerPersonPerDay;
  return {
    fuelLiters, fuelCost,
    fuelSaveLo: fuelCost ? fuelCost * a.fuelSavingPct[0] / 100 : null,
    fuelSaveHi: fuelCost ? fuelCost * a.fuelSavingPct[1] / 100 : null,
    waterLiters, waterCans: Math.round(waterLiters / 20), waterPerDay: crew * a.waterPerPersonPerDay,
    machineHoursPerDay: Math.ceil(crew * a.waterPerPersonPerDay / a.waterMachineLph * 10) / 10,
  };
}
export function vnd(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ';
}
// product-guard so khớp CHUỖI CON, nên số tiền lợi ích không được tạo ra các chuỗi giá bị cấm:
// nhóm 9 cấm "9,9 triệu" (49,9 triệu dính), nhóm 2 cấm "42 triệu", "31 triệu", "49 triệu", "38 triệu"
// (1.500 lít × 27.740 = 41,6 triệu làm tròn thành "42 triệu" dính). Cách in: dưới 10 triệu ưu tiên 1 số lẻ
// ("4,2 triệu đồng"), từ 10 triệu ưu tiên số chẵn ("83 triệu đồng"); cách nào dính thì đổi sang cách kia
// ("41,6 triệu đồng", "50 triệu đồng"); cả hai cùng dính (đúng 42,0) thì in "42,0 triệu đồng".
// KHÔNG import danh sách này từ product-guard vì guard là nội bộ; nếu guard thêm mốc giá thì cập nhật đây.
const GUARD_MONEY = ['9,9 triệu', '42 triệu', '31 triệu', '49 triệu', '38 triệu'];
export function trieu(n) {
  const m = n / 1000000;
  const one = (Math.round(m * 10) / 10).toFixed(1).replace('.', ',');
  const whole = String(Math.round(m));
  const order = m >= 10 ? [whole, one] : [one, whole];
  for (const c of order) {
    const s = c + ' triệu đồng';
    if (!GUARD_MONEY.some((g) => s.includes(g))) return s;
  }
  return whole + ',0 triệu đồng';
}
const num = (n) => Number(n).toLocaleString('vi-VN');
const dec = (n) => String(n).replace('.', ',');
// 15/10: ĐOẠN BÀI TOÁN viết sẵn thành lời, in nguyên vào bài. Lọc dầu: chỉ kịch bản có nguồn số lít dầu.
// "có thể ... tùy tình trạng máy" cho mức 5 tới 10% (tài liệu hãng, không phải cam kết). Bù tiền máy chỉ tính
// tiền máy 9,X triệu (giá bán lẻ 9,9 triệu, KHÔNG ghi ra bài) vì giá chưa gồm vận chuyển và công lắp (chính
// sách giá 9/9), chia cho mức tiết kiệm THẤP nhất mỗi chuyến.
export function fuelBenefitText(c) {
  const fuelLiters = fuelLitersOf(c);
  if (!fuelLiters) return null;
  const a = BENEFIT_ASSUMPTIONS;
  const e = ENGINE_CLASSES[c.engine];
  const cost = fuelLiters * a.dieselPrice;
  const [lo, hi] = a.fuelSavingPct;
  const saveLo = cost * lo / 100;
  const saveHi = cost * hi / 100;
  const payback = Math.ceil(9900000 / saveLo);
  return `${c.boat}, chuyến ${c.days} ngày, mỗi ngày đốt khoảng ${num(e.fuelPerDay)} lít, cả chuyến chừng ${num(fuelLiters)} lít dầu. `
    + `Tính theo giá dầu Petrolimex kỳ ${a.dieselPriceDate} là khoảng ${trieu(cost)} tiền dầu một chuyến. `
    + `Lọc dầu sạch có thể giúp bớt ${lo} tới ${hi}% tùy tình trạng máy (theo tài liệu SF300B), tức khoảng ${trieu(saveLo)} tới ${trieu(saveHi)} mỗi chuyến, ${a.tripsPerYear} chuyến một năm là ${trieu(saveLo * a.tripsPerYear)} tới ${trieu(saveHi * a.tripsPerYear)}. `
    + `Riêng tiền máy 9,X triệu (chưa tính vận chuyển, công lắp) thì khoảng ${payback} chuyến là bù lại.`;
}
// Lọc nước: ghe đi dưới 10 ngày mang can là đủ (tệp A), không đưa. KHÔNG tiền nước cảng đất liền (chưa có nguồn),
// KHÔNG suy ra lợi ích tải trọng hay nhiên liệu (sự thật nghề 19/8).
export function waterBenefitText(c) {
  if (c.days < 10) return null;
  const a = BENEFIT_ASSUMPTIONS;
  const litersTrip = c.crew * c.days * a.waterPerPersonPerDay;
  const cans = Math.round(litersTrip / 20);
  const perDay = c.crew * a.waterPerPersonPerDay;
  const hours = Math.ceil(perDay / a.waterMachineLph * 10) / 10;
  return `${c.boat}, ${c.crew} người đi ${c.days} ngày, mỗi người chừng ${a.waterPerPersonPerDay} lít nước ngọt một ngày, cả chuyến cần khoảng ${num(litersTrip)} lít, tức ${dec(litersTrip / 1000)} tấn nước, chừng ${num(cans)} can 20 lít phải mua, chở và giữ cho khỏi hôi. `
    + `Máy lọc ${num(a.waterMachineLph)} lít mỗi giờ chạy khoảng ${dec(hours)} giờ mỗi ngày là đủ ${num(perDay)} lít cho cả tàu, nước mới ra mỗi ngày.`;
}
// Giữ tên cũ cho test và người gọi cũ: danh sách đoạn đã viết sẵn (không còn dòng "VÍ DỤ ... × ... =").
export function fuelBenefitLines() {
  return BENEFIT_CASES.map(fuelBenefitText).filter(Boolean);
}
export function waterBenefitLines() {
  return BENEFIT_CASES.map(waterBenefitText).filter(Boolean);
}
// TikTok (Thanh 11/9): chú thích ngắn, đúng 1 câu số cố định.
const TIKTOK_ONE_LINER = {
  fuel: 'Tàu 400 cv đi 20 ngày đốt khoảng 3.000 lít dầu, lọc dầu sạch có thể giúp bớt 5 tới 10% tùy tình trạng máy (theo tài liệu SF300B).',
  water: '10 người đi 20 ngày cần khoảng 3.000 lít nước ngọt, máy chạy hơn nửa giờ mỗi ngày là đủ.',
};
const isFuelGroup = (g) => g === '9. Máy Lọc Dầu Diesel SD12-300' || g === '6. Thiết bị lọc dầu SF-50';
const isWaterGroup = (g) => g === '2. Máy lọc nước biển SEA-40';
// Chọn ĐOẠN BÀI TOÁN cho một bài: TikTok 1 câu cố định; Facebook/YouTube một kịch bản (ngẫu nhiên, rand tiêm
// được để test). Nhóm khác trả null.
export function pickBenefitBlock(group, channel = 'facebook', rand = Math.random) {
  if (!isFuelGroup(group) && !isWaterGroup(group)) return null;
  const kind = isFuelGroup(group) ? 'fuel' : 'water';
  if (channel === 'tiktok') return { key: `tiktok-${kind}`, text: TIKTOK_ONE_LINER[kind] };
  const list = BENEFIT_CASES.filter((c) => BENEFIT_PICK[kind].includes(c.key))
    .map((c) => ({ key: c.key, text: kind === 'fuel' ? fuelBenefitText(c) : waterBenefitText(c) })).filter((x) => x.text);
  const b = list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  // Câu mời tính riêng đi liền sau đoạn, máy tự gắn (model hay đặt nó lên TRƯỚC đoạn tính).
  return { ...b, text: `${b.text} ${BENEFIT_INVITE}` };
}
// 15/10 (bài dựng thử bốc trúng "tàu hậu cần 25 m ... khoảng 1 chuyến là bù lại" cho khách ghe nhỏ): chỉ bốc kịch bản
// gần tệp khách nhất. Lọc dầu (tệp A ghe nhỏ, máy dưới 300 cv chưa có nguồn số lít) lấy 2 kịch bản tàu 15 m máy 400 cv,
// mức nhỏ nhất có nguồn; lọc nước (tệp B tàu 15 tới 20 m) lấy 15 tới 20 m.
export const BENEFIT_PICK = {
  fuel: ['tau-15m-8n-15d', 'tau-15m-10n-20d'],
  water: ['tau-15m-8n-15d', 'tau-15m-10n-20d', 'tau-17m-10n-25d', 'tau-20m-12n-30d'],
};
export const BENEFIT_PLACEHOLDER = '[BÀI TOÁN]';
export const BENEFIT_INVITE = 'Tàu anh khác cỡ thì nhắn số người, số ngày, em tính riêng.';
// Khối prompt: model chỉ đặt chỗ, KHÔNG tự viết phép tính (máy chèn đoạn sau khi sinh).
export function benefitLines(group, channel = 'facebook', block = null) {
  if (!isFuelGroup(group) && !isWaterGroup(group)) return [];
  const b = block || pickBenefitBlock(group, channel);
  return [
    `BÀI TOÁN LỢI ÍCH (BẮT BUỘC, 15/10): đặt đúng MỘT dòng riêng chỉ ghi ${BENEFIT_PLACEHOLDER} ở nhịp phần thưởng (trước câu giá). Hệ thống sẽ thay dòng đó bằng đoạn tính sẵn dưới đây. Bạn KHÔNG tự viết phép tính, KHÔNG tự nêu số lít dầu, số tiền dầu, giá dầu mỗi lít hay số chuyến hoàn vốn ở bất kỳ chỗ nào khác trong bài; câu đứng trước và sau dòng đó viết sao cho đọc liền mạch với đoạn này.`,
    `Đoạn sẽ chèn (chỉ để bạn biết, KHÔNG chép lại): ${b.text}`,
    channel === 'tiktok' ? '' : 'Câu mời "tàu anh khác cỡ thì nhắn số người, số ngày, em tính riêng" đã nằm trong đoạn chèn, bạn KHÔNG viết lại.',
  ].filter(Boolean);
}

// 15/10: CHỐT TẤT ĐỊNH sau khi sinh bài bán (Facebook, TikTok, YouTube, bài ảnh). Model hay tự viết phép tính
// riêng (số lệch nguồn, bịa giá dầu "38.000đ mỗi lít", công thức × =) dù đã dặn chỉ đặt chỗ. Hàm này:
//  1. bỏ mọi CÂU tự tính ngoài đoạn tính sẵn: có ký hiệu × hay = giữa số; có giá dầu theo lít (đ/lít, đồng một lít);
//     có số lít kèm tiền hoặc kèm chuyến/ngày (trừ lưu lượng máy "lít mỗi giờ"); câu hoàn vốn/thu hồi vốn tự viết;
//  2. thay dòng [BÀI TOÁN] bằng đoạn tính sẵn; thiếu dòng đó thì chèn đoạn thành dòng riêng ngay TRƯỚC dòng giá
//     (teaserText), không có dòng giá thì trước dòng cuối (câu CTA cmt).
// Trả { body, removed: [câu đã bỏ], placed: 'placeholder' | 'inserted' | 'none' }.
const PLACEHOLDER_RE = /\[\s*b[àa]i\s*to[áa]n[^\]\n]*\]/giu;
const SENT_RE = /(?<=[.!?…])\s+/u;
const DIMS_RE = /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?\s*(?:cm|mm|m)(?!\p{L})/giu;
const normSent = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function isCalcSentence(s) {
  const t = String(s || '');
  // Kích thước "52 x 20 x 50 cm" (thông số SF300B) không phải phép tính.
  const noDims = t.replace(DIMS_RE, '');
  if (/\d\s*×\s*\d|\d\s*=\s*\d|\s=\s/u.test(noDims) || (/×/u.test(noDims) && /\d/.test(noDims))) return true;
  if (/\d[\d.,]*\s*(?:đ|đồng|vnđ|vnd|k)\s*(?:\/|mỗi|một|1)\s*lít/iu.test(t)) return true;
  if (/(?<!\p{L})(?:hoàn vốn|thu hồi vốn|gỡ vốn|lấy lại vốn|bù lại tiền máy)(?!\p{L})/iu.test(t)) return true;
  // Lưu lượng máy ("250 lít nước ngọt mỗi giờ", "300 lít/giờ") là thông số, không phải phép tính.
  const noRate = t.replace(/\d[\d.,]*\s*lít(?:\s+\p{L}+){0,3}?\s*(?:\/\s*(?:giờ|h)|mỗi giờ|một giờ)/giu, '');
  // Câu mời "tàu anh khác cỡ thì nhắn..." model tự viết: đoạn chèn đã có, bỏ để khỏi lặp.
  if (/(?<!\p{L})khác cỡ(?!\p{L})[^.!?]*(?:nhắn|tính riêng)/iu.test(t)) return true;
  const liters = /\d[\d.,]*\s*lít/iu.test(noRate);
  if (!liters) return false;
  return /(?<!\p{L})(?:triệu|nghìn|ngàn|đồng|chuyến|ngày|tháng|tấn)(?!\p{L})/iu.test(t);
}
export function applyBenefitBlock(body, blockText, { teaserText = '' } = {}) {
  const src = String(body || '');
  if (!blockText) return { body: src.replace(PLACEHOLDER_RE, '').replace(/\n{3,}/g, '\n\n').trim(), removed: [], placed: 'none' };
  // Dòng đã là đoạn chèn (chạy lại lần 2) giữ nguyên; câu lẻ model chép lại từ đoạn thì bỏ như câu tự tính (khỏi lặp).
  const whole = normSent(blockText);
  const removed = [];
  let lines = src.split('\n').map((line) => {
    if (normSent(line).includes(whole)) return line;
    if (PLACEHOLDER_RE.test(line)) { PLACEHOLDER_RE.lastIndex = 0; return line; }
    PLACEHOLDER_RE.lastIndex = 0;
    const sents = line.split(SENT_RE);
    const kept = sents.filter((s) => {
      if (!s.trim() || !isCalcSentence(s)) return true;
      removed.push(s.trim());
      return false;
    });
    return kept.length === sents.length ? line : kept.join(' ');
  });
  let placed = 'none';
  const pi = lines.findIndex((l) => { const hit = PLACEHOLDER_RE.test(l); PLACEHOLDER_RE.lastIndex = 0; return hit; });
  if (pi >= 0) {
    lines[pi] = blockText;
    placed = 'placeholder';
    lines = lines.map((l, i) => (i === pi ? l : l.replace(PLACEHOLDER_RE, '')));
  } else if (!lines.some((l) => normSent(l).includes(normSent(blockText)))) {
    const key = normSent(teaserText).slice(0, 24);
    let at = key ? lines.findIndex((l) => normSent(l).includes(key)) : -1;
    if (at < 0) { at = lines.length - 1; while (at > 0 && !lines[at].trim()) at--; }
    lines.splice(Math.max(0, at), 0, blockText, '');
    placed = 'inserted';
  }
  const out = lines.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { body: out, removed, placed };
}

// 15/10: lời dặn trong prompt lọt nguyên vào bài (bài cc253c9d mở câu bằng "Chỉ 1 câu số,") và ký hiệu thay chữ
// (CLAUDE.md mục 4: không gạch dài, mũi tên, dấu chấm tròn giữa câu, ký hiệu thay chữ "và"). Bước TẤT ĐỊNH chạy cho
// mọi bài máy sinh (bài bán, bài content, blog). Trả { text, fixes: [mô tả từng chỗ sửa] }.
const LEAKED_INSTRUCTIONS = [
  /chỉ\s*1\s*câu\s*số\s*[,:.]?\s*/giu,
  /chép\s*nguyên(?:\s*văn)?\s*[,:]\s*/giu,
  /BÀI TOÁN LỢI ÍCH[^:\n]*:\s*/gu,
  /\(\s*BẮT BUỘC\s*\)\s*[,:]?\s*|BẮT BUỘC\s*:\s*/gu,
  /VÍ DỤ\s+(?=(?:tàu|ghe)(?!\p{L}))/gu,
  /Không thêm tiền, không thêm kịch bản khác\.?\s*/giu,
  /Đây là chỉ dẫn nội bộ[^.\n]*\.?\s*/giu,
];
export function sanitizePostText(text) {
  let t = String(text || '');
  const fixes = [];
  // Kích thước giữ dạng "52 x 20 x 50 cm" (chữ x thường), không đổi thành "nhân".
  const dims = [];
  t = t.replace(DIMS_RE, (m) => { dims.push(m.replace(/\s*×\s*/g, ' x ')); return `\u0000${dims.length - 1}\u0000`; });
  for (const re of LEAKED_INSTRUCTIONS) {
    t = t.replace(re, (m) => { fixes.push(`bỏ lời dặn lọt bài "${m.trim()}"`); return ''; });
  }
  // Bỏ lời dặn ở đầu câu thì chữ đầu câu còn lại phải viết hoa ("Chỉ 1 câu số, tàu 400 cv..." -> "Tàu 400 cv...").
  if (fixes.length) t = t.replace(/(^|[.!?…]\s+|\n[ \t]*)(\p{Ll})/gu, (_, p, c) => p + c.toUpperCase());
  const sym = [
    [/(\d)\s*[–—]\s*(\d)/gu, '$1 tới $2', 'gạch nối khoảng số'],
    [/\s*×\s*/gu, ' nhân ', 'dấu nhân'],
    [/\s+=\s+|(?<=\d)\s*=\s*(?=\d)/gu, ' là ', 'dấu bằng'],
    [/\s*(?:→|⇒|->|=>)\s*/gu, ', rồi ', 'mũi tên'],
    [/\s+[—–]\s+/gu, ', ', 'gạch dài'],
    [/[—–]/gu, ', ', 'gạch dài'],
    [/(?<=\p{L})\s+&\s+(?=\p{L})/gu, ' và ', 'ký hiệu &'],
    [/(?<=\p{L})\s+\+\s+(?=\p{L})/gu, ' và ', 'dấu cộng thay chữ và'],
    [/^\s*[•●·]\s*/gmu, '', 'dấu chấm tròn đầu dòng'],
    [/\s+[•●·]\s+/gu, ', ', 'dấu chấm tròn giữa câu'],
  ];
  for (const [re, rep, label] of sym) {
    const before = t;
    t = t.replace(re, rep);
    if (t !== before) fixes.push(`đổi ${label}`);
  }
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => dims[Number(i)]);
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?])/g, '$1').replace(/,\s*,/g, ',').replace(/^(\s*),\s*/gmu, '$1');
  return { text: t.trim(), fixes: [...new Set(fixes)] };
}

// Bảo đảm CẢNH CUỐI video có câu giá đọc được (luật 8/9). Chặn số chính xác trước; thiếu câu thì
// nối vào cuối lời thoại cảnh đó. Không teaser thì trả nguyên văn.
export function ensureSpokenTeaser(narration, teaser) {
  if (!teaser?.spoken) return narration;
  const s = redactExactPrices(String(narration || '')).trim();
  // 14/9: model hay viết "3X triệu" / "9,X triệu" (liền, dấu phẩy) thay vì "3 X triệu" / "9 phẩy X
  // triệu" nên spokenKey không khớp -> câu giá bị nối thêm lần 2, video đọc giá 2 lần. So khớp sau
  // khi chuẩn hóa: bỏ khoảng trắng, thường hóa, ",X" coi như "phẩy X".
  const norm = (t) => String(t || '').toLowerCase().replace(/,\s*x/g, 'phẩyx').replace(/\s+/g, '');
  if (teaser.spokenKey && norm(s).includes(norm(teaser.spokenKey))) return s;
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
