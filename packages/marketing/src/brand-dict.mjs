// brand-dict.mjs — TỪ ĐIỂN THƯƠNG HIỆU SDVICO (1/9, task audit văn phong).
//
// User phản ánh: AI sync tin công ty không hiểu ngữ cảnh nên viết bài lơ lửng — ví dụ
// "thịt rùa" là ẩn dụ nội bộ cho "update firmware S-Tracking", "công ty thủy sản lâu đời"
// là Baseafood, viết tắt ACC Nha Trang / data lake / EC ai đọc cũng bí, "caffe" phải chốt
// là café hay coffee. File này là NGUỒN SỰ THẬT DUY NHẤT — mọi cụm đặc thù mà bà con ngư
// dân không tự hiểu ĐỀU phải khai ở đây.
//
// USER LÀ NGƯỜI ĐIỀN. Claude KHÔNG được tự đoán định nghĩa (điều cấm 5 — không bịa số liệu,
// giải thưởng, khách hàng, đối tác). Slot còn để `null` là còn CHỜ user chốt; skill
// product-boundary sẽ cảnh báo nếu bài đăng dùng thuật ngữ chưa có định nghĩa.
//
// Áp dụng ở đâu:
//   - packages/marketing/src/brand-voice-check.mjs: rà bài, cảnh báo nếu bài dùng thuật ngữ
//     không có trong dict (hoặc dùng sai chính tả so với `spelling`).
//   - Prompt sinh bài (rotate + trend + content) inject `dictBrief()` để AI biết mở ngoặc
//     khi lần đầu nhắc thuật ngữ ("ACC Nha Trang (Trung tâm Kiểm soát ứng phó...)").

// Ẩn dụ nội bộ / biệt ngữ — cụm mà chỉ người trong công ty hiểu, bài ra ngoài phải bung nghĩa.
// KEY = cụm nguyên văn (viết thường); VALUE = chuỗi giải thích ngắn cho người ngoài.
// User điền: chép câu giải thích thật ngắn (1 câu) từ người phụ trách. Chưa chắc để null.
export const INTERNAL_JARGON = {
  // 'thịt rùa': 'cập nhật firmware thiết bị Viettel S-Tracking',
  'thịt rùa': null,
  'chuyện nhà chưa kể': null,       // chuyên mục bản tin nội bộ?
};

// Viết tắt kỹ thuật/tổ chức — bài đăng khi lần đầu nhắc PHẢI mở ngoặc dạng "ACC Nha Trang
// (Trung tâm ... Ứng phó ...)". Key giữ ĐÚNG chữ hoa/thường như dùng thật.
export const ABBREVIATIONS = {
  // 'ACC Nha Trang': 'Trung tâm Kiểm soát Không lưu Nha Trang',
  'ACC Nha Trang': null,
  'data lake': null,                // hồ dữ liệu — kho dữ liệu thô? Bà con hiểu như nào?
  'EC': null,                       // Thương mại điện tử? Environmental Control? User chốt.
  'S-Tracking': 'thiết bị giám sát hành trình tàu cá của Viettel',
};

// Đối tác / khách hàng được nhắc — chỉ khai người đã ĐỒNG Ý cho nhắc tên. Khai sai là điều
// cấm 5. Value: mô tả ngắn để bài không nhắc chung chung "công ty thủy sản lâu đời".
export const PARTNERS = {
  // 'Baseafood': 'Công ty Cổ phần Chế biến Xuất nhập khẩu Thuỷ sản Bà Rịa Vũng Tàu',
  'Baseafood': null,
};

// Chốt CHÍNH TẢ nhất quán — mọi biến thể sai đều bị brand-voice-check gọi tên.
// Key = từ ĐÚNG; value = mảng biến thể SAI cần cảnh báo. Bà con là ngư dân Việt nên ưu tiên
// từ thuần Việt hơn tiếng nước ngoài. USER chốt lần cuối (đề xuất mặc định trong comment).
export const SPELLING = {
  // Đề xuất: 'cà phê' (thuần Việt, hợp bà con) — user chốt trước khi mở khoá.
  // 'cà phê': ['caffe', 'cafe', 'café', 'coffee'],
};

// Trả về brief cho prompt AI viết bài: chỉ liệt kê các slot ĐÃ có định nghĩa (bỏ null).
// Nhét thẳng vào phần "Từ điển nội bộ" của prompt sinh bài.
export function dictBrief() {
  const lines = [];
  const push = (label, obj) => {
    const filled = Object.entries(obj).filter(([, v]) => v);
    if (!filled.length) return;
    lines.push(`\n${label}:`);
    for (const [k, v] of filled) lines.push(`- ${k}: ${v}`);
  };
  push('Biệt ngữ nội bộ (phải diễn giải khi ra ngoài)', INTERNAL_JARGON);
  push('Viết tắt (lần đầu nhắc phải mở ngoặc bung nghĩa)', ABBREVIATIONS);
  push('Đối tác được nhắc tên (đúng tên đầy đủ)', PARTNERS);
  const spells = Object.keys(SPELLING);
  if (spells.length) lines.push(`\nChính tả chuẩn: ${spells.join(', ')} (không dùng biến thể khác).`);
  return lines.join('\n');
}

// Kiểm chính tả sai — trả về mảng {wrong, correct} nếu bài dùng biến thể sai. Bỏ qua nếu
// SPELLING trống (chưa chốt).
export function scanSpelling(text) {
  const issues = [];
  const low = String(text || '').toLowerCase();
  for (const [correct, wrongs] of Object.entries(SPELLING)) {
    for (const w of wrongs) {
      if (low.includes(w.toLowerCase()) && !low.includes(correct.toLowerCase())) {
        issues.push({ wrong: w, correct });
      }
    }
  }
  return issues;
}

// Cảnh báo thuật ngữ dùng mà chưa có định nghĩa trong dict (KHÔNG chặn — chỉ đánh dấu để
// người duyệt lưu ý; slot null nghĩa là "user biết chỗ này mập mờ, chưa chốt").
export function warnUndefined(text) {
  const t = String(text || '');
  const warnings = [];
  for (const [k, v] of [...Object.entries(INTERNAL_JARGON), ...Object.entries(ABBREVIATIONS), ...Object.entries(PARTNERS)]) {
    if (!v && new RegExp(`\\b${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(t)) {
      warnings.push(`"${k}" dùng nhưng chưa có định nghĩa trong brand-dict.mjs — hỏi người phụ trách rồi điền vào.`);
    }
  }
  return warnings;
}
