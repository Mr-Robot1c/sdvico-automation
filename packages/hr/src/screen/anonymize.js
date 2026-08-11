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
  text = text.replace(/(?<!\d)(?:\+?84|0)\d{8,10}(?!\d)/g, '[SĐT]');

  // 3. Bỏ nguyên dòng có nhãn trường nhạy cảm.
  const kept = [];
  for (const line of text.split(/\r?\n/)) {
    if (isSensitiveLabelLine(line)) {
      removed.lines += 1;
      continue;
    }
    kept.push(line);
  }

  return { text: kept.join('\n').trim(), removed };
}
