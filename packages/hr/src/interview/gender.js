// Đoán giới tính để xưng hô đúng trong thư (anh/chị). Chỉ dùng cục bộ khi ghép thư,
// không đưa lên mô hình. Đoán không chắc thì để "anh/chị" cho an toàn.
// Ưu tiên thông tin ghi rõ trong CV, sau đó suy từ tên.

// Tên đệm chỉ giới ở tiếng Việt.
const FEMALE_MID = ['thị'];
const MALE_MID = ['văn'];

// Một số tên gọi thường gặp, đủ để đoán các trường hợp rõ. Không chắc thì trả null.
const FEMALE_NAMES = new Set(['hoa', 'mai', 'lan', 'hồng', 'hương', 'thu', 'trang', 'linh', 'ngọc', 'hà', 'yến', 'nhung', 'thảo', 'vân', 'my', 'hằng', 'oanh', 'loan', 'diệu', 'phượng', 'nga', 'hạnh', 'thúy', 'tuyết', 'quỳnh', 'nhi', 'châu']);
const MALE_NAMES = new Set(['sơn', 'nam', 'quân', 'hải', 'huy', 'tùng', 'đức', 'minh', 'tuấn', 'hùng', 'dũng', 'long', 'phong', 'cường', 'thành', 'lợi', 'khoa', 'bình', 'phúc', 'thắng', 'trung', 'kiên', 'hoàng', 'vũ', 'lâm', 'đạt', 'tài']);

function low(s) {
  return (s || '').toLowerCase().trim();
}

// Trả 'nam' | 'nu' | null.
export function guessGender(name, text = '') {
  const t = low(text);
  if (/giới tính\s*[:\-]?\s*nữ|gender\s*[:\-]?\s*female|\bnữ\b/.test(t)) return 'nu';
  if (/giới tính\s*[:\-]?\s*nam|gender\s*[:\-]?\s*male/.test(t)) return 'nam';

  const parts = low(name).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const mid = parts[1];
    if (FEMALE_MID.includes(mid)) return 'nu';
    if (MALE_MID.includes(mid)) return 'nam';
  }
  const given = parts[parts.length - 1];
  if (FEMALE_NAMES.has(given)) return 'nu';
  if (MALE_NAMES.has(given)) return 'nam';
  return null;
}

// Cách xưng hô theo giới tính.
export function xungHo(gender) {
  if (gender === 'nu') return 'chị';
  if (gender === 'nam') return 'anh';
  return 'anh/chị';
}
