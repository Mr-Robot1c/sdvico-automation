// direction-dedupe.mjs — bắt hướng đi TRÙNG Ý bằng code (22/10, user: "sao hôm nay lại tạo lại bài s-tracking rồi?").
//
// Kế hoạch tuần 19-25/10 có 3 hướng S-Tracking cùng một ý: "Hậu quả nặng nề khi giấu thiết bị giám sát hành trình"
// (đăng 19/10), "Hậu quả nặng khi ngắt kết nối VMS" (22/10), "Hậu quả mất sóng VMS và bài học đắt giá" (còn chờ).
// Prompt sinh kế hoạch đã dặn "không lặp lại, không viết na ná" (plan-directions.ts) nhưng Gemini đổi vài chữ là
// qua, so tiêu đề y hệt cũng không bắt được. Ở đây gom các cách nói cùng một khái niệm về một mã (giấu / ngắt / mất
// sóng = MẤT KẾT NỐI; VMS = thiết bị giám sát hành trình...), bỏ chữ chung chung, rồi so phần giao.
// Thuần hàm, không mạng. Dùng ở plan.ts (lúc sinh kế hoạch), /api/rotate và week-plan.ts (lúc rút hướng).

const strip = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

// Thứ tự quan trọng: cụm dài trước cụm ngắn.
const CONCEPTS = [
  ['VMS', /thiet bi giam sat hanh trinh|giam sat hanh trinh|\bvms\b|s[- ]?tracking|dinh vi tau/g],
  ['MATKETNOI', /ngat ket noi|mat ket noi|cat ket noi|mat song|mat tin hieu|chap chon|\bgiau\b|\bngat\b|tat may|\bthao\b/g],
  ['HAUQUA', /hau qua|cai gia|bai hoc|xu phat|bi phat|\bphat\b|canh bao|rui ro|phap ly/g],
  ['LOCDAU', /may loc dau|binh loc dau|tui loc dau|loc dau|sf300b|sd12[- ]?300/g],
  ['CANDAU', /can dau|can ban|dau ban|dau lan nuoc|nuoc lan trong dau/g],
  ['VESINH', /ve sinh|xa can|lam sach|loc sach|thay loi|thay tui/g],
  ['LAPDAT', /lap dat|tho may|\blap\b/g],
  ['TAIBEN', /tan ben|tan cang|tan tau|bam cang|\bben\b|\bcang\b/g],
  ['GIAM', /ha nhiet|giam|ha gia|re hon/g],
  ['TOIUU', /toi uu|tiet kiem|chi phi|co hoi/g],
  ['NUOCNGOT', /may loc nuoc|loc nuoc bien|nuoc ngot/g],
  ['GIADAU', /gia dau|nhien lieu/g],
  ['LIENLAC', /thuraya|marine ?star|dien thoai ve tinh|lien lac/g],
];
// Mã SẢN PHẨM không tính khi so: chỉ so hướng trong cùng một sản phẩm, nên chữ "lọc dầu" có mặt ở mọi hướng SF300B.
const PRODUCT_CODES = new Set(['VMS', 'LOCDAU', 'NUOCNGOT', 'LIENLAC']);
// Chữ chung chung không mang ý riêng của hướng đi.
const STOP = new Set(('khi va cua cho trong truoc sau nhung cung de nang ne nhat moi the nao gi ai la co khong duoc '
  + 'tau ca bien chuyen ngu dan ba con anh em sdvico thuc te chuyen nghe tai voi tu len ra vao mot hai ba bon nam '
  + 'dai ngay dat gia that day du cach meo kinh nghiem may bo lon nho tan dung bai toan hoi').split(' '));

export function angleTokens(title) {
  let t = strip(title);
  for (const [code, re] of CONCEPTS) t = t.replace(re, ` ${code} `);
  const isCode = (w) => /[A-Z]/.test(w) && w === w.toUpperCase();
  return new Set(t.split(/[^a-zA-Z0-9]+/)
    .filter((w) => w && (isCode(w) ? !PRODUCT_CODES.has(w) : !STOP.has(w) && w.length > 1)));
}

// Hai tiêu đề (CÙNG sản phẩm) cùng một ý: giao ít nhất 2 token và phủ từ 60% tập nhỏ hơn trở lên.
export function sameAngle(a, b) {
  const A = angleTokens(a), B = angleTokens(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter >= 2 && inter / Math.min(A.size, B.size) >= 0.6;
}

// Tiêu đề đầu tiên trong recent trùng ý với title (null = không trùng).
export function duplicateOf(title, recent = []) {
  for (const r of recent) if (r && sameAngle(title, r)) return r;
  return null;
}
