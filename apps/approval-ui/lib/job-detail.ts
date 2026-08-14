// Ghép khối "chi tiết gốc" từ thông tin người dùng nhập: mô tả công việc, yêu cầu, quyền lợi.
// Đặt NGAY DƯỚI phần AI viết, giữ nguyên văn bản gốc để người đọc nắm rõ công việc cụ thể,
// quyền lợi cụ thể, và tự đối chiếu xem có đủ điều kiện không — không để AI lược bớt.
//
// Giọng văn (CLAUDE.md mục 4): không gạch dài, không mũi tên, không dấu chấm tròn giữa câu.
// Nhãn mục dùng emoji nhẹ để dễ đọc trên newsfeed, giữ đúng thứ tự người dùng quen thuộc.
export function buildJobDetailSection(fields: {
  short_desc?: string | null;
  requirements?: string | null;
  benefits?: string | null;
}): string {
  const clean = (s?: string | null) => String(s ?? '').trim();
  const md = clean(fields.short_desc);
  const yc = clean(fields.requirements);
  const ql = clean(fields.benefits);

  const sections: string[] = [];
  if (md) sections.push(`📋 Công việc cụ thể\n${md}`);
  if (yc) sections.push(`✅ Yêu cầu ứng viên\n${yc}`);
  if (ql) sections.push(`🎁 Quyền lợi\n${ql}`);

  if (!sections.length) return '';
  // Hai dòng trống ngăn cách phần AI viết với phần chi tiết gốc.
  return '\n\n' + sections.join('\n\n');
}
