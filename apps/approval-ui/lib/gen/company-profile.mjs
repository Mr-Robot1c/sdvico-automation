// company-profile.mjs — DỮ KIỆN CÔNG TY được phép nêu trong nội dung (23/10/2026).
//
// Nguồn: "Hồ sơ năng lực SDVICO" bản năm 2026 (PDF 17 trang, user gửi 23/10/2026). Đây là allowlist cho
// Điều cấm 5 ở mức công ty, giống product-facts.mjs ở mức sản phẩm: nội dung chỉ được nêu số liệu, giải
// thưởng, chứng nhận, đối tác CÓ trong danh sách này.
//
// CỐ Ý KHÔNG NẠP (dù hồ sơ có):
// - Dữ liệu cá nhân trong giấy ĐKKD: số định danh, ngày sinh, địa chỉ, phần vốn của thành viên góp vốn.
// - Số liệu tài chính (doanh thu, lợi nhuận, tài sản) và cơ cấu nhân sự: hồ sơ dùng cho đấu thầu, không phải bài đăng.
// - Tên khách hàng và giá trị trong bảng hợp đồng: chưa có đồng ý của khách để nêu công khai.
// - SF-50 và phụ gia ADNANO: SF-50 đang chặn như hàng ngừng bán (user chốt 23/10 giữ chặn), ADNANO chưa có trong catalog.
// - Cơ quan quản lý (Cục Thủy sản và Kiểm ngư...) và IUU: chạm Điều cấm 3, bài có nội dung này đã tự gắn cờ cần quản lý duyệt.
// - SDWork, SeaTrace, ForAqua: phần mềm nội bộ hoặc hướng doanh nghiệp, không phải hàng bán cho ngư dân.

export const COMPANY_SOURCE = 'Hồ sơ năng lực SDVICO 2026 (user gửi 23/10/2026)';

export const COMPANY_FACTS = [
  { key: 'ten', text: 'Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO), tên tiếng Anh Synergy Development Viet Company Limited' },
  { key: 'khoi_dau', text: 'SDVICO hoạt động từ năm 2014 (pháp nhân hiện tại đăng ký lần đầu ngày 15/07/2022)' },
  { key: 'tru_so', text: 'Trụ sở 283 Nguyễn Hữu Cảnh, Phường Rạch Dừa, TP. Hồ Chí Minh' },
  { key: 'lien_he', text: 'Tổng đài 1900 23 23 49, email info@sdvico.vn, web sdvico.vn' },
  { key: 'iso', text: 'Hệ thống quản lý chất lượng đạt ISO 9001:2015, cho các mảng thiết bị viễn thông, thiết bị xử lý dầu diesel, lắp ráp máy lọc nước biển thành nước ngọt' },
  { key: 'tau', text: 'Hơn 5.000 tàu cá đang dùng sản phẩm SDVICO' },
  { key: 'dai_ly', text: 'Hơn 40 đại lý bảo hành, xử lý sự cố 24/7 ở các cảng cá trên cả nước' },
  { key: 'giai_thuong', text: 'Bằng khen của Thủ tướng Chính phủ vì đóng góp cho ngư dân, biển đảo' },
  { key: 'soba', text: 'Nhật ký khai thác điện tử Soba do SDVICO phát triển, đạt danh hiệu "Sản phẩm tốt hướng đến quyền lợi người tiêu dùng năm 2026" (25/06/2026)' },
  { key: 'loc_nuoc', text: 'Máy lọc nước biển thành nước ngọt do SDVICO sản xuất, nước đạt QCVN 02:2009/BYT, công suất từ 80 lít/giờ tới 2,5 m³/giờ tùy model, đã lắp ở Nhà giàn DK1, các điểm đảo Trường Sa và tàu cá ven biển' },
  { key: 'sconect', text: 'Thiết bị truyền dữ liệu băng rộng SCONECT do SDVICO tự sản xuất, có giấy chứng nhận hợp quy QCVN 54:2020/BTTTT của Bộ Thông tin và Truyền thông, hiệu lực tới tháng 07/2027' },
  { key: 'doi_tac', text: 'Đối tác công nghệ, viễn thông, năng lượng: Viettel, VNPT, Vishipel, Gtel, Station Satcom, PV OIL, PV OIL Lube, Annovi Reverberi. SDVICO phân phối, lắp đặt thiết bị của đối tác, không sở hữu phần mềm của họ' },
];

// Token thông số có trong dữ kiện công ty (ISO 9001, QCVN 02, QCVN 54, 80 lít/giờ...). compliance.mjs bỏ qua các
// token này để bài nêu đúng chứng nhận không bị gắn cờ "thông số chưa xác minh".
export const COMPANY_SPEC_TEXT = COMPANY_FACTS.map((f) => f.text).join(' ');

// Khối chèn vào prompt sinh bài. Bài bán chỉ dùng tối đa 1 dữ kiện (ở câu tin cậy), không khoe dàn trải.
export function companyLines({ maxUse = 1 } = {}) {
  return [
    `DỮ KIỆN CÔNG TY ĐƯỢC PHÉP NÊU (nguồn ${COMPANY_SOURCE}). Dùng tối đa ${maxUse} dữ kiện trong bài, chép đúng số, không làm tròn lên, không thêm giải thưởng, chứng nhận, số tàu, số đại lý, khách hàng nào khác:`,
    ...COMPANY_FACTS.map((f) => `- ${f.text}`),
  ];
}
