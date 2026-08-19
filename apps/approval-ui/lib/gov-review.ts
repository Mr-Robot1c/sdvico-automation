// P2-17: heuristic phát hiện nội dung chạm quy định nhà nước / IUU / Cục Thủy sản / Kiểm ngư.
// Điều cấm 3: những nội dung này phải qua duyệt của cấp quản lý trước khi đăng.
// Heuristic KHÔNG phải bộ lọc tuyệt đối — thà đánh nhầm còn hơn bỏ sót; người vận hành
// vẫn có thể bấm "Đánh dấu đã duyệt" nếu xét thấy không thuộc phạm vi.

const KEYWORDS: RegExp[] = [
  /\bIUU\b/i,
  /iuu/i,
  /c[uụ]c\s+th[uủ]y\s+s[ảa]n/i,
  /ki[eể]m\s+ng[uư]/i,
  /ki[eể]m\s+ng[uư]\s+vi[eệ]t\s+nam/i,
  /ngh[iị]\s+đ[iị]nh/i,
  /th[oô]ng\s+t[uư]\s+\d+\/\d+/i,
  /quy\s+đ[iị]nh\s+nh[aà]\s+n[uư][oớ]c/i,
  /quy\s+đ[iị]nh\s+ph[aá]p\s+lu[aậ]t/i,
  /gi[aấ]y\s+ph[eé]p\s+khai\s+th[aá]c/i,
  /vi\s+ph[aạ]m\s+h[aà]nh\s+ch[ií]nh/i,
  /chi[eế]n\s+d[iị]ch\s+ch[oố]ng/i,
  /ch[oố]ng\s+kh[aa]i\s+th[aá]c\s+b[aấ]t\s+h[oợ]p\s+ph[aá]p/i,
  /truy\s+xu[aấ]t\s+ngu[oồ]n\s+g[oố]c/i,
  /\bVMS\b/i, // Vessel Monitoring System — thuộc quản lý nhà nước.
];

export function detectGovReviewNeeded(text: string): boolean {
  if (!text) return false;
  return KEYWORDS.some((re) => re.test(text));
}

// Từ khoá đã khớp (dùng cho log/UI để giải thích vì sao bị gán cờ).
export function matchedGovKeywords(text: string): string[] {
  if (!text) return [];
  const hits = new Set<string>();
  for (const re of KEYWORDS) {
    const m = text.match(re);
    if (m) hits.add(m[0]);
  }
  return Array.from(hits);
}
