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

import { scanSpecTokens } from './compliance.mjs';

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
  // 8/9/2026: máy lọc dầu SF300B (folder kho "9. Máy Lọc Dầu Diesel SD12-300", SD12-300 chỉ là mã bơm).
  // Nguồn: file "Tính năng.txt" folder "Lọc dầu SF300B" Thanh cấp 8/9; cùng nội dung đã nạp bảng
  // product_facts. Có dòng này để bộ quét không gắn cờ "SF300B chưa xác nhận" ở đường dùng mảng tĩnh.
  { category: '9. Máy Lọc Dầu Diesel SD12-300', brand: null, model: 'SF300B',
    attribute: 'tên gọi công khai', value: 'SF300B',
    source: 'Tính năng.txt folder Lọc dầu SF300B (Thanh, 8/9/2026)', confirmedBy: 'Thanh Huynh', confirmedAt: '2026-09-08', verified: true },
  { category: '9. Máy Lọc Dầu Diesel SD12-300', brand: null, model: 'SF300B',
    attribute: 'độ lọc', value: '1 tới 10 micromet',
    source: 'Tính năng.txt folder Lọc dầu SF300B (Thanh, 8/9/2026)', confirmedBy: 'Thanh Huynh', confirmedAt: '2026-09-08', verified: true },
  { category: '9. Máy Lọc Dầu Diesel SD12-300', brand: null, model: 'SF300B',
    attribute: 'kích thước', value: '52 x 20 x 50 cm',
    source: 'Tính năng.txt folder Lọc dầu SF300B (Thanh, 8/9/2026)', confirmedBy: 'Thanh Huynh', confirmedAt: '2026-09-08', verified: true },
  { category: '9. Máy Lọc Dầu Diesel SD12-300', brand: null, model: 'SF300B',
    attribute: 'trọng lượng', value: '15 kg',
    source: 'Tính năng.txt folder Lọc dầu SF300B (Thanh, 8/9/2026)', confirmedBy: 'Thanh Huynh', confirmedAt: '2026-09-08', verified: true },
  { category: '9. Máy Lọc Dầu Diesel SD12-300', brand: null, model: 'SF300B',
    attribute: 'bảo hành', value: '12 tháng',
    source: 'Tính năng.txt folder Lọc dầu SF300B (Thanh, 8/9/2026)', confirmedBy: 'Thanh Huynh', confirmedAt: '2026-09-08', verified: true },
];

function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, '');
}

// 21/10 (user: "cái catalog t đưa cho đâu"): catalog thật (Catalog SDVICO 2026 + file tính năng, Thanh nạp qua
// trang Kiến thức) nằm ở bảng product_facts, nhưng bài Facebook của rotate vẫn đọc mảng tĩnh ở trên (4 dòng TEST
// + 5 dòng SF300B) nên model không thấy 250 lít/giờ của SEA-40, IP67 của S-Tracking..., còn được mớm IP67 TEST.
// Đọc bảng (chỉ dòng verified); lỗi hoặc bảng rỗng thì lùi về mảng tĩnh để không tịt sinh bài.
export async function loadProductFacts(client) {
  if (!client) return PRODUCT_FACTS;
  try {
    const { data, error } = await client
      .from('product_facts')
      .select('category,brand,model,attribute,value,source,verified')
      .eq('verified', true)
      .limit(1000);
    if (error || !data?.length) return PRODUCT_FACTS;
    return data;
  } catch {
    return PRODUCT_FACTS;
  }
}

// Dòng catalog của đúng một nhóm sản phẩm. category trong bảng có nơi giữ STT ("2. Máy lọc nước biển SEA-40"),
// có nơi không, nên so sau khi bỏ STT. Chỉ dòng verified: dòng TEST không bao giờ được mớm cho model.
const stripNo = (s) => String(s || '').replace(/^\s*\d+\.\s*/, '').trim().toLowerCase();
export function factsForGroup(facts, group) {
  const g = stripNo(group);
  return (facts || []).filter((f) => f.verified && f.value && stripNo(f.category) === g);
}

// Tập giá trị đã duyệt (model và value) để đối chiếu allowlist. Gồm cả test lẫn thật.
export function knownFactValues(facts = PRODUCT_FACTS) {
  const set = new Set();
  for (const f of facts) addFactTokens(set, f);
  return set;
}

// 21/10: giá trị catalog là cả câu ("Khoảng 250 lít/giờ, màng lọc 4040") nên phải tách thêm từng token thông số
// bên trong (250 lít/giờ, 4040) và mã trong tên nhóm (SEA-40), không thì bài nêu đúng catalog vẫn bị cờ "chưa xác minh".
function addFactTokens(set, f) {
  for (const field of [f.model, f.value, f.category]) {
    if (!field) continue;
    set.add(normalize(field));
    for (const t of scanSpecTokens(field)) { set.add(t.norm); set.add(t.norm.replace(/-/g, '')); }
  }
}

// Tập giá trị lấy từ dòng TEST (verified:false). Bài dùng các giá trị này sẽ bị gắn cảnh báo.
export function testFactValues(facts = PRODUCT_FACTS) {
  const set = new Set();
  for (const f of facts) {
    if (f.verified) continue;
    addFactTokens(set, f);
  }
  return set;
}

// Đếm nhanh trạng thái nguồn, dùng khi báo cáo.
export function factsStatus(facts = PRODUCT_FACTS) {
  const verified = facts.filter((f) => f.verified).length;
  return { total: facts.length, verified, test: facts.length - verified };
}
