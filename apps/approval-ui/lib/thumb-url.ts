// Ảnh thu nhỏ cho ô lưới tư liệu (9/10, review UI: thumbnail Xưởng sản xuất hay hỏng).
// Ảnh Drive (lh3.googleusercontent.com/d/<id>) mặc định trả bản 960px, 150 tới 300 KB mỗi ảnh; một trang
// 48 ô 68px là chừng 12 MB, tải dồn thì Google trả lỗi phần lớn ảnh. Hậu tố "=w<px>" cho bản nhỏ (~25 KB
// ở 200px), đã thử curl 9/10. Ảnh Supabase Storage hay link ngoài giữ nguyên. Không import gì phía server
// nên dùng được trong component client.
export function thumbUrl(url: string | null | undefined, width = 200): string {
  const u = String(url || '');
  if (!/^https:\/\/lh3\.googleusercontent\.com\/d\/[^/?#=]+$/.test(u)) return u;
  return `${u}=w${width}`;
}
