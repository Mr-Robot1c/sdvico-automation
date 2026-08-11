// product-facts.mjs — NGUỒN SỰ THẬT về sản phẩm cho nội dung Marketing.
//
// Đây là allowlist. Nội dung sinh ra chỉ được nêu model và thông số CÓ trong danh sách này.
// Bất kỳ số hay tên model nào không nằm ở đây đều bị compliance.mjs gắn cảnh báo và chặn
// khỏi đăng cho tới khi có người xác nhận. Đây là cách thực thi Điều cấm 5 (không bịa số
// liệu) ở mức kỹ thuật, thay vì trông chờ mô hình tự giữ mình.
//
// QUY TẮC ĐIỀN:
//  - Chỉ Phòng Kinh doanh cung cấp và xác nhận. Kỹ sư KHÔNG tự điền theo phỏng đoán.
//  - Mỗi dòng ghi rõ nguồn và người xác nhận, để truy vết.
//  - Model của đối tác (Viettel, VNPT, Vishipel, Thuraya) nếu SDVICO có phân phối thì ghi
//    ở đây như THIẾT BỊ phân phối, KHÔNG mô tả phần mềm của họ như của SDVICO (Điều cấm 4).
//
// Lược đồ mỗi dòng:
//   {
//     category:   nhóm thiết bị, ví dụ 'giam_sat_hanh_trinh'
//     brand:      hãng
//     model:      tên model chính xác, ví dụ 'ABC-123'
//     attribute:  tên thông số, ví dụ 'khang_nuoc' | 'cong_suat' | 'giao_thuc'
//     value:      giá trị đúng như tài liệu, ví dụ 'IP67' | '40 L/h'
//     source:     nguồn tài liệu, ví dụ 'catalogue hãng 2026' | 'phiếu kỹ thuật'
//     confirmedBy: người xác nhận ở Phòng Kinh doanh
//     confirmedAt: ngày xác nhận, dạng 'YYYY-MM-DD'
//   }
//
// Đang RỖNG có chủ đích. Chưa có dữ liệu thì nội dung phải nói chung chung, không nêu số.

export const PRODUCT_FACTS = [
  // Ví dụ mẫu (đã chú thích, KHÔNG dùng thật vì chưa xác nhận):
  // { category: 'giam_sat_hanh_trinh', brand: '...', model: '...', attribute: 'khang_nuoc',
  //   value: 'IP67', source: '...', confirmedBy: '...', confirmedAt: '2026-08-11' },
];

// Chuẩn hóa một chuỗi về dạng so khớp: chữ thường, bỏ khoảng trắng.
function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, '');
}

// Tập giá trị đã duyệt (model và value) để compliance.mjs đối chiếu. Dạng chuẩn hóa.
export function knownFactValues(facts = PRODUCT_FACTS) {
  const set = new Set();
  for (const f of facts) {
    if (f.model) set.add(normalize(f.model));
    if (f.value) set.add(normalize(f.value));
  }
  return set;
}

// Đếm nhanh trạng thái nguồn, dùng khi báo cáo.
export function factsStatus(facts = PRODUCT_FACTS) {
  return { total: facts.length, models: new Set(facts.map((f) => f.model).filter(Boolean)).size };
}
