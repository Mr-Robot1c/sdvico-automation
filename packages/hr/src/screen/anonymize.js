// Ẩn danh CV trước khi chấm. Cổng an toàn mảng, mục 1: chống thiên vị.
// Bỏ tên, giới tính, tuổi, ngày sinh, quê quán, địa chỉ, ảnh, email, số điện thoại
// khỏi văn bản đưa vào mô hình. Điều cấm 6: giảm dữ liệu nhận dạng rời khỏi hạ tầng.
//
// Nguyên tắc: thà bỏ nhầm một dòng còn hơn để lọt trường nhạy cảm. Chấm dựa vào
// năng lực và kinh nghiệm, không dựa vào con người là ai.

// Nhãn dòng nhạy cảm cần bỏ nguyên dòng. Không phân biệt hoa thường, có dấu hoặc không.
const SENSITIVE_LINE_LABELS = [
  'họ và tên', 'ho va ten', 'họ tên', 'ho ten', 'full name', 'name',
  'giới tính', 'gioi tinh', 'sex', 'gender',
  'ngày sinh', 'ngay sinh', 'năm sinh', 'nam sinh', 'date of birth', 'dob', 'birthday',
  'tuổi', 'tuoi', 'age',
  'quê quán', 'que quan', 'nguyên quán', 'nguyen quan', 'hometown',
  'địa chỉ', 'dia chi', 'address', 'thường trú', 'thuong tru', 'nơi ở', 'noi o',
  'dân tộc', 'dan toc', 'tôn giáo', 'ton giao', 'religion', 'ethnicity',
  'tình trạng hôn nhân', 'tinh trang hon nhan', 'marital status',
  'quốc tịch', 'quoc tich', 'nationality',
  'email', 'e-mail', 'thư điện tử', 'thu dien tu',
  'điện thoại', 'dien thoai', 'số điện thoại', 'so dien thoai', 'phone', 'mobile', 'tel', 'sđt', 'sdt',
  'facebook', 'zalo', 'linkedin', 'ảnh', 'anh', 'photo'
];

function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd');
}

// Dòng có nhãn nhạy cảm ở đầu (dạng "Nhãn: giá trị" hoặc "Nhãn giá trị").
function isSensitiveLabelLine(line) {
  const norm = stripAccents(line).toLowerCase().trim();
  return SENSITIVE_LINE_LABELS.some((label) => {
    const l = stripAccents(label).toLowerCase();
    // Khớp khi nhãn đứng đầu dòng, theo sau là dấu hai chấm hoặc khoảng trắng.
    return norm.startsWith(l + ':') || norm.startsWith(l + ' ') || norm === l;
  });
}

// Thay một chuỗi giá trị cụ thể (tên, email, phone đã biết) bằng thẻ ẩn.
function redactValue(text, value, tag) {
  if (!value) return text;
  const trimmed = String(value).trim();
  if (trimmed.length < 3) return text;
  // Thoát ký tự đặc biệt của regex.
  const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(esc, 'gi'), tag);
}

// Ẩn danh. Nhận cv_json (có raw_text, full_name, email, phone), trả { text, removed }.
// removed: số dòng đã bỏ và số giá trị đã che, để ghi log truy vết.
export function anonymizeCv(cv) {
  let text = cv?.raw_text || '';
  const removed = { lines: 0, values: 0 };

  // 1. Che các giá trị nhận dạng đã trích được ở bước nạp CV.
  for (const [val, tag] of [
    [cv?.full_name, '[TÊN]'],
    [cv?.email, '[EMAIL]'],
    [cv?.phone, '[SĐT]']
  ]) {
    if (val) {
      const before = text;
      text = redactValue(text, val, tag);
      if (text !== before) removed.values += 1;
    }
  }

  // 2. Che mọi email và số điện thoại còn sót bằng mẫu chung.
  text = text.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[EMAIL]');
  // Số VN 10 số liền (không dấu cách).
  text = text.replace(/(?<!\d)(?:\+?84|0)\d{8,10}(?!\d)/g, '[SĐT]');
  // Số VN có dấu cách/chấm/gạch nối, kiểu "090 123 4567" hoặc "090.123.4567" hoặc "0901-234-567".
  // Nới sang cả +84 xxx xxx xxx. Đủ 9-11 chữ số trong toàn chuỗi.
  text = text.replace(/(?<!\d)(?:\+?84|0)[\s.\-]?\d{2,3}[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}(?!\d)/g, '[SĐT]');

  // 3. Bỏ nguyên dòng có nhãn trường nhạy cảm.
  // 3b. Heuristic: dòng ở 5 dòng đầu chỉ gồm chữ hoa (kèm dấu) 2-4 từ → có khả năng
  // là banner "NGUYỄN VĂN A" trên header CV. Bỏ đi để không lộ tên khi không có nhãn.
  const kept = [];
  const rawLines = text.split(/\r?\n/);
  rawLines.forEach((line, idx) => {
    if (isSensitiveLabelLine(line)) {
      removed.lines += 1;
      return;
    }
    if (idx < 5 && isLikelyNameBanner(line)) {
      removed.lines += 1;
      return;
    }
    kept.push(line);
  });

  return { text: kept.join('\n').trim(), removed };
}

// True khi dòng chỉ có 2-4 "từ" toàn chữ hoa (đã bỏ dấu vẫn viết hoa) — banner tên.
// Bỏ dấu để bắt cả "NGUYỄN VĂN A" và "NGUYEN VAN A".
function isLikelyNameBanner(line) {
  const s = (line || '').trim();
  if (s.length < 4 || s.length > 60) return false;
  // Cho phép chữ có dấu tiếng Việt (unicode letter class).
  if (!/^[\p{Lu}\p{M}\s'.-]+$/u.test(s)) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  // Tránh false-positive cho tiêu đề như "CV", "TÓM TẮT" (1 từ đã lọc ở trên);
  // hoặc "MỤC TIÊU NGHỀ NGHIỆP" (4 từ toàn hoa) — chấp nhận bỏ nhầm theo nguyên tắc
  // "thà bỏ nhầm một dòng còn hơn để lọt tên" ghi ở đầu file.
  return true;
}
