// Danh mục 8 folder sản phẩm SDVICO (theo kho tư liệu, đặt tên STT).
// product_group trong brand_assets nhận đúng nhãn 'group' dưới đây.
// 'match' = từ khóa để tự gán tư liệu cũ theo tên. 'hashtag' = thẻ riêng của sản phẩm.

export const PRODUCTS = [
  { no: 1, group: '1. PV Engine RMI Nano Graphene',
    match: ['pv engine', 'rmi', 'nano graphene', 'graphene', 'nano dung cho dong co', 'pvoil', 'dau nhot'],
    hashtag: '#dầu_nhớt_Nano_Graphene' },
  { no: 2, group: '2. Máy lọc nước biển SEA-40',
    match: ['loc nuoc', 'sea-40', 'sea40', 'nuoc ngot', 'nuoc bien thanh nuoc ngot', 'mln'],
    hashtag: '#máy_lọc_nước_biển' },
  { no: 3, group: '3. Thiết bị giám sát hành trình Viettel S-Tracking',
    match: ['giam sat hanh trinh', 's-tracking', 's tracking', 'stracking', 'gsht', 'viettel'],
    hashtag: '#giám_sát_hành_trình' },
  { no: 4, group: '4. Thuraya Marine Star MNB-01',
    match: ['thuraya', 'marine star', 'marinestar', 'mnb-01', 'mnb01', 'mnb 01'],
    hashtag: '#Thuraya_MarineStar' },
  { no: 5, group: '5. Điện thoại vệ tinh XT-Pro',
    match: ['xt-pro', 'xt pro', 'xtpro', 'dien thoai ve tinh'],
    hashtag: '#điện_thoại_vệ_tinh' },
  { no: 6, group: '6. Thiết bị lọc dầu SF-50',
    match: ['loc dau', 'sf-50', 'sf50', 'may loc dau', 'xu ly dau', 'tiet kiem dau'],
    hashtag: '#thiết_bị_lọc_dầu' },
  { no: 7, group: '7. Ắc quy Accu Nano SDViCo',
    match: ['ac quy', 'accu', 'acquy', 'ac-quy'],
    hashtag: '#ắc_quy_Nano' },
  { no: 8, group: '8. Sơn RARE',
    match: ['son rare', 'son-rare', 'rare'],
    hashtag: '#sơn_RARE' },
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

// Hashtag mặc định gắn mọi bài (theo yêu cầu). Có thể ghi đè bằng app_config key 'mkt_hashtags'.
export const DEFAULT_HASHTAGS = [
  '#SDVico', '#thiết_bị_tàu_cá', '#thiết_bị_liên_lạc',
  '#Đồng_hành_cùng_ngư_dân', '#thiết_bị_tàu_biển', '#hỗ_trợ_ngư_dân',
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

// Thẻ hashtag suy từ tên sản phẩm nếu chưa có thẻ riêng.
export function productHashtag(group) {
  const p = findProduct(group);
  return p?.hashtag || null;
}
