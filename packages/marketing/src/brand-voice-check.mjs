// brand-voice-check.mjs — bộ rà GIỌNG VĂN theo skill brand-voice và CLAUDE.md.
//
// Bắt các lỗi phong cách mà compliance.mjs (product-boundary) không lo: gạch dài, mũi tên,
// dấu chấm tròn giữa câu, ký hiệu thay chữ "và", số sai chuẩn Việt Nam, hứa pháp lý tuyệt
// đối, và lời hoa mỹ hoặc khẳng định quá mức không có dẫn chứng.
//
// Dùng cặp với compliance.mjs: brand-voice lo GIỌNG, product-boundary lo SỰ THẬT SẢN PHẨM.

// Lời hoa mỹ và khẳng định vượt mức, cần bằng chứng mới được nói (Điều cấm 5).
const OVERCLAIM = [
  'đẳng cấp', 'tối tân', 'vượt trội', 'hoàn hảo', 'tuyệt hảo', 'thượng hạng', 'đỉnh cao',
  'siêu phẩm', 'số 1', 'số một', 'tốt nhất', 'hàng đầu', 'duy nhất', 'lớn nhất',
  'giải thưởng', 'được nhà nước công nhận', 'đối tác chính thức',
];

// Hứa pháp lý tuyệt đối, không được nói (skill brand-voice).
const ABSOLUTE_LEGAL = [
  'chắc chắn không bị phạt', 'cam kết không bị phạt', 'tuyệt đối không bị phạt',
  'đảm bảo không bị phạt', '100% không bị phạt', 'chắc chắn được chứng nhận',
  'chắc chắn không bị bắt',
];

// 1/9 (user feedback: "văn phong AI thô"): jargon kỹ thuật trong bài đăng cho ngư dân.
// Bà con không cần biết ffmpeg/1080x1920/webhook — bài phải diễn đạt bằng lời thường
// (video dọc / cân âm lượng / gắn phụ đề). Regex vì có nhiều biến thể (1080x1920 vs 1080×1920).
const TECH_JARGON = [
  /\bffmpeg\b/i, /\bwebhook\b/i, /\bendpoint\b/i, /\bcron\s?job\b/i, /\bAPI\b/, /\bLLM\b/,
  /\bONNX\b/, /\bservice[- ]role\b/i, /burn phụ đề/i, /\d{3,4}\s?[x×]\s?\d{3,4}/,
  /\b9\s*:\s*16\b/, /\b16\s*:\s*9\b/,
];

// Rà một đoạn, trả về danh sách lỗi giọng văn. Rỗng nghĩa là đạt.
export function scanStyle(text) {
  const t = text || '';
  const low = t.toLowerCase();
  const issues = [];

  if (/[—–]/.test(t)) issues.push('gạch dài');
  if (/->|=>|→/.test(t)) issues.push('mũi tên');
  if (/[•·]/.test(t)) issues.push('dấu chấm tròn giữa câu');
  if (/\s[&+]\s/.test(t)) issues.push('ký hiệu thay chữ và');
  if (/\d{1,3}(,\d{3})+/.test(t)) issues.push('số ngăn hàng nghìn bằng dấu phẩy');

  for (const w of ABSOLUTE_LEGAL) if (low.includes(w)) { issues.push('hứa pháp lý tuyệt đối'); break; }
  for (const w of OVERCLAIM) if (low.includes(w)) { issues.push('lời hoa mỹ hoặc khẳng định quá: ' + w); break; }
  for (const re of TECH_JARGON) {
    const m = t.match(re);
    if (m) { issues.push('jargon kỹ thuật lộ ra bài: ' + m[0]); break; }
  }

  return [...new Set(issues)];
}
