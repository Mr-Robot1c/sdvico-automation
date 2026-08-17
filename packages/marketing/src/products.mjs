// Danh mục 8 folder sản phẩm SDVICO (theo kho tư liệu, đặt tên STT).
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
    hashtags: ['#máy_lọc_nước_biển', '#nước_ngọt_trên_tàu', '#lọc_nước_RO', '#SEA40'] },
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
};

export function getFeatures(group) {
  return FEATURES[group] || [];
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
  for (const p of PRODUCTS) {
    if (p.match.some((m) => t.includes(noAccent(m)))) return p.group;
  }
  return null;
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
