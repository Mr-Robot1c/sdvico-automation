// product-facts.mjs — NGUỒN SỰ THẬT về sản phẩm cho nội dung Marketing.
//
// Allowlist. Nội dung chỉ được nêu model và thông số CÓ trong danh sách này. Thông số
// không có bị compliance.mjs chặn. Đây là cách thực thi Điều cấm 5 ở mức kỹ thuật.
//
// TRẠNG THÁI HIỆN TẠI: đang dùng DỮ LIỆU TEST (verified:false) vì Phòng Kinh doanh chưa
// cấp số thật. Mục đích chỉ để CHẠY THỬ dây chuyền. Chốt an toàn: mọi thông số verified:false
// vẫn bị gắn cảnh báo "thông số test, chưa xác nhận" (amber) khi lọt vào bài, nên KHÔNG bao
// giờ được coi là sạch để đăng. Khi có số thật, thay các dòng dưới bằng verified:true và xóa
// dòng test. Tên hãng, model dưới đây là BỊA để test, không phải sản phẩm thật của SDVICO.
//
// Lược đồ mỗi dòng:
//   { category, brand, model, attribute, value, source, confirmedBy, confirmedAt, verified }

export const PRODUCT_FACTS = [
  // ==== DỮ LIỆU TEST, verified:false, KHÔNG PHẢI SỐ THẬT ====
  { category: 'giam_sat_hanh_trinh', brand: 'TEST-DEMO', model: 'GS-TEST-01',
    attribute: 'khang_nuoc', value: 'IP67',
    source: 'DỮ LIỆU TEST tạm', confirmedBy: 'TEST', confirmedAt: null, verified: false },
  { category: 'giam_sat_hanh_trinh', brand: 'TEST-DEMO', model: 'GS-TEST-01',
    attribute: 'cong_suat', value: '5 W',
    source: 'DỮ LIỆU TEST tạm', confirmedBy: 'TEST', confirmedAt: null, verified: false },
  { category: 'giam_sat_hanh_trinh', brand: 'TEST-DEMO', model: 'GS-TEST-01',
    attribute: 'pin', value: '10000 mAh',
    source: 'DỮ LIỆU TEST tạm', confirmedBy: 'TEST', confirmedAt: null, verified: false },
  { category: 'lien_lac', brand: 'TEST-DEMO', model: 'LL-TEST-02',
    attribute: 'khang_nuoc', value: 'IP68',
    source: 'DỮ LIỆU TEST tạm', confirmedBy: 'TEST', confirmedAt: null, verified: false },
  // ==== Số thật sẽ điền ở đây với verified:true, ví dụ (đang chú thích): ====
  // { category: 'giam_sat_hanh_trinh', brand: '...', model: '...', attribute: 'khang_nuoc',
  //   value: 'IP67', source: 'catalogue hãng 2026', confirmedBy: 'Phòng KD', confirmedAt: '2026-08-12', verified: true },
];

function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, '');
}

// Tập giá trị đã duyệt (model và value) để đối chiếu allowlist. Gồm cả test lẫn thật.
export function knownFactValues(facts = PRODUCT_FACTS) {
  const set = new Set();
  for (const f of facts) {
    if (f.model) set.add(normalize(f.model));
    if (f.value) set.add(normalize(f.value));
  }
  return set;
}

// Tập giá trị lấy từ dòng TEST (verified:false). Bài dùng các giá trị này sẽ bị gắn cảnh báo.
export function testFactValues(facts = PRODUCT_FACTS) {
  const set = new Set();
  for (const f of facts) {
    if (f.verified) continue;
    if (f.model) set.add(normalize(f.model));
    if (f.value) set.add(normalize(f.value));
  }
  return set;
}

// Đếm nhanh trạng thái nguồn, dùng khi báo cáo.
export function factsStatus(facts = PRODUCT_FACTS) {
  const verified = facts.filter((f) => f.verified).length;
  return { total: facts.length, verified, test: facts.length - verified };
}
