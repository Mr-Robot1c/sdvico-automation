// keywords.mjs — kho từ khóa SEO cho SDVICO, dựng theo chiến lược Ngày 2.
// File này THUẦN DỮ LIỆU, không đụng mạng, để hai bạn review chéo dễ.
// Bốn nhóm ý định khớp bảng mkt_keywords: info, compare, transaction, service.
// Nhóm giao dịch và dịch vụ được nhân theo tỉnh ven biển vì đây là SEO địa phương
// (lắp đặt và hỗ trợ là dịch vụ tại chỗ). Xem mục 4 trong day2-marketing-strategy.md.
//
// Lưu ý tuân thủ:
//  - Nhóm info chạm quy định nhà nước (số nghị định, mức phạt, ngưỡng mét). Nội dung
//    viết cho các từ khóa này BẮT BUỘC qua duyệt cấp quản lý (Điều cấm số 3).
//    Ở đây đánh dấu bằng target_page bắt đầu bằng '/kien-thuc/' và ghi cờ needsReview.
//  - Không bịa thông số, giá, cước, tên khách hàng, đối tác (Điều cấm số 5).
//  - Không nhận vơ phần mềm đối tác thành của SDVICO (Điều cấm số 4).

// Các tỉnh ven biển trọng điểm nghề cá. Nhân từ khóa giao dịch và dịch vụ theo danh
// sách này để phủ SEO địa phương. Có thể thêm bớt khi Phòng Kinh doanh xác nhận
// vùng đang thật sự phủ dịch vụ (mục 10 chiến lược).
export const PROVINCES = [
  'Quảng Ninh',
  'Thanh Hóa',
  'Nghệ An',
  'Hà Tĩnh',
  'Quảng Bình',
  'Quảng Trị',
  'Đà Nẵng',
  'Quảng Nam',
  'Quảng Ngãi',
  'Bình Định',
  'Phú Yên',
  'Khánh Hòa',
  'Ninh Thuận',
  'Bình Thuận',
  'Bà Rịa Vũng Tàu',
  'Kiên Giang',
  'Cà Mau',
  'Bạc Liêu',
];

// Bỏ dấu tiếng Việt để làm slug trang đích. "Bà Rịa Vũng Tàu" -> "ba-ria-vung-tau".
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu thanh và dấu mũ (dải dấu tổ hợp Unicode)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Nhóm THÔNG TIN (info). Người đang tìm hiểu. Trang đích là bài giải thích.
// Phần lớn chạm quy định nên needsReview = true.
const INFO = [
  'thiết bị giám sát hành trình tàu cá là gì',
  'giám sát hành trình tàu cá hoạt động thế nào',
  'tàu cá bao nhiêu mét phải lắp giám sát hành trình',
  'quy định lắp thiết bị giám sát hành trình tàu cá',
  'mất kết nối giám sát hành trình tàu cá bị phạt bao nhiêu',
  'mất tín hiệu giám sát hành trình tàu cá xử lý thế nào',
  'nghị định 41 về giám sát hành trình tàu cá',
  'luật thủy sản 2017 quy định giám sát tàu cá',
  'chống khai thác IUU là gì',
  'thẻ vàng IUU ảnh hưởng ngư dân thế nào',
  'giấy phép khai thác thủy sản cần gì',
  'đăng kiểm tàu cá cần lắp thiết bị gì',
  'thiết bị giám sát tàu cá dùng sóng gì',
  'VMS tàu cá là gì',
  'tàu cá dưới 15m có phải lắp giám sát không',
  'quy định báo cáo vị trí tàu cá bao lâu một lần',
  'thiết bị giám sát tàu cá có định vị vệ tinh không',
  'vùng biển nào bắt buộc bật giám sát hành trình',
];

// Nhóm SO SÁNH (compare). Người đang cân nhắc. Trang đích là trang tư vấn chọn thiết bị.
// Cẩn thận không bịa thông số và không nhận vơ phần mềm đối tác.
const COMPARE = [
  'thiết bị giám sát tàu cá loại nào tốt',
  'so sánh thiết bị giám sát hành trình tàu cá',
  'nên chọn thiết bị giám sát tàu cá hãng nào',
  'thiết bị giám sát tàu cá loại nào bền',
  'cước thuê bao giám sát tàu cá hàng tháng bao nhiêu',
  'thiết bị giám sát tàu cá loại nào ít mất kết nối',
  'thiết bị giám sát tàu cá pin trâu',
  'giám sát tàu cá dùng vệ tinh và dùng sóng di động khác nhau thế nào',
  'thiết bị giám sát tàu cá nào dễ bảo hành',
  'tiêu chí chọn thiết bị giám sát hành trình tàu cá',
  'thiết bị giám sát tàu cá hợp quy chuẩn nào',
  'thiết bị giám sát tàu cá loại nào hỗ trợ tốt khi sự cố',
];

// Nhóm GIAO DỊCH (transaction) toàn quốc, không gắn tỉnh.
const TRANSACTION_NATIONAL = [
  'lắp thiết bị giám sát hành trình tàu cá',
  'đại lý thiết bị giám sát hành trình tàu cá',
  'giá lắp đặt thiết bị giám sát tàu cá',
  'mua thiết bị giám sát hành trình tàu cá ở đâu',
  'tổng đài lắp giám sát tàu cá 1900 23 23 49',
  'đăng ký lắp thiết bị giám sát hành trình tàu cá',
];

// Mẫu GIAO DỊCH nhân theo tỉnh. {t} thay bằng tên tỉnh.
const TRANSACTION_LOCAL = [
  'lắp thiết bị giám sát hành trình tàu cá ở {t}',
  'đại lý thiết bị giám sát tàu cá {t}',
  'giá lắp đặt thiết bị giám sát tàu cá {t}',
];

// Nhóm DỊCH VỤ (service) toàn quốc. Nhóm sát insight nhất, ít đối thủ làm.
const SERVICE_NATIONAL = [
  'thiết bị giám sát tàu cá mất kết nối phải làm sao',
  'tàu cá mất tín hiệu giám sát khắc phục thế nào',
  'gia hạn cước giám sát hành trình tàu cá',
  'sửa thiết bị giám sát hành trình tàu cá',
  'thay thiết bị giám sát hành trình tàu cá',
  'bảo trì thiết bị giám sát tàu cá',
  'thiết bị giám sát tàu cá báo lỗi không lên tín hiệu',
  'hỗ trợ kỹ thuật thiết bị giám sát tàu cá',
];

// Mẫu DỊCH VỤ nhân theo tỉnh. {t} thay bằng tên tỉnh.
const SERVICE_LOCAL = [
  'sửa thiết bị giám sát tàu cá ở {t}',
  'gia hạn cước giám sát hành trình tàu cá {t}',
  'thay thiết bị giám sát hành trình tàu cá {t}',
];

// Trang đích mặc định cho từng nhóm. Local có slug tỉnh để phục vụ SEO địa phương.
function targetPage(intent, province) {
  const p = province ? '-' + slugify(province) : '';
  if (intent === 'info') return '/kien-thuc';
  if (intent === 'compare') return '/tu-van-chon-thiet-bi';
  if (intent === 'transaction') return '/dich-vu/lap-dat' + p;
  if (intent === 'service') return '/dich-vu/ho-tro-ket-noi' + p;
  return '/';
}

// Nguồn mặc định theo nhóm, khớp chú thích schema (google gợi ý | hộp thư | tổng đài | đối thủ).
// Nhóm dịch vụ gắn 'tổng đài' vì câu hỏi thật ở 1900 23 23 49 là mỏ từ khóa dịch vụ sát nhất.
function defaultSource(intent) {
  if (intent === 'compare') return 'đối thủ';
  if (intent === 'service') return 'tổng đài';
  return 'google gợi ý';
}

// Dựng toàn bộ kho từ khóa thành một mảng bản ghi khớp cột bảng mkt_keywords.
// needsReview đánh dấu từ khóa mà NỘI DUNG viết cho nó phải qua duyệt (nhóm info quy định).
export function buildKeywords() {
  const rows = [];
  const push = (keyword, intent, province) => {
    rows.push({
      keyword,
      intent,
      target_page: targetPage(intent, province),
      source: defaultSource(intent),
      needsReview: intent === 'info',
    });
  };

  for (const k of INFO) push(k, 'info');
  for (const k of COMPARE) push(k, 'compare');
  for (const k of TRANSACTION_NATIONAL) push(k, 'transaction');
  for (const k of SERVICE_NATIONAL) push(k, 'service');

  for (const t of PROVINCES) {
    for (const tpl of TRANSACTION_LOCAL) push(tpl.replace('{t}', t), 'transaction', t);
    for (const tpl of SERVICE_LOCAL) push(tpl.replace('{t}', t), 'service', t);
  }

  return rows;
}

// Đếm nhanh theo nhóm, dùng để in báo cáo khi nạp.
export function countByIntent(rows) {
  return rows.reduce((acc, r) => {
    acc[r.intent] = (acc[r.intent] ?? 0) + 1;
    return acc;
  }, {});
}
