// Khử dấu tiếng Việt và hạ ASCII để tạo slug URL an toàn.
// Xử lý riêng chữ đ/Đ (không phải diacritic, không bị NFD tách).
// Cắt ở 60 ký tự để URL không quá dài; unique bảo đảm bằng hậu tố id ở makeJobSlug.

export function slugifyBase(input: string): string {
  const t = (input || '').toString().trim();
  if (!t) return '';
  return t
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

// Slug cho hr_jobs: [title-slugified]-[8 ký tự hex đầu của uuid].
// Hậu tố hex bảo đảm không trùng ngay cả khi 2 tin cùng tiêu đề.
// Rỗng thì fallback 'tin' để URL không có dạng /tuyen-dung/-abcdef01.
export function makeJobSlug(title: string, uuid: string): string {
  const base = slugifyBase(title) || 'tin';
  const suffix = uuid.replace(/-/g, '').slice(0, 8);
  return `${base}-${suffix}`;
}
