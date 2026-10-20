// Mot nguon duy nhat cho so dien thoai trang public (Thanh chot 2/10: 0939 243 222,
// trung so bai ban/caption, co nguoi truc va do duoc cuoc goi). Doi so = doi env, khong sua tung cho.
// Chi dung cho UI public cua approval-ui (header, footer, nut goi, CTA san pham, privacy/terms).
// KHONG dung cho noi dung bai may sinh (packages/marketing, lib/gen) — day la luong khac.
// Khong phai bi mat nen process.env co the duoc inline vao client bundle luc build.
export const PUBLIC_HOTLINE_DISPLAY = (process.env.PUBLIC_HOTLINE_DISPLAY || '0939 243 222').trim();
export const PUBLIC_HOTLINE_TEL = 'tel:' + PUBLIC_HOTLINE_DISPLAY.replace(/\D/g, '');

// 20/10 anh Tien (Kinh doanh) xin cong khai 5 so ho tro tren web va FB cong ty.
// Hotline chinh van la PUBLIC_HOTLINE_DISPLAY; cac so duoi chi hien them o chan trang public.
// Doi/bo so = sua mang nay, khong sua JSX.
export const PUBLIC_SUPPORT_LINES: { label: string; display: string; tel: string }[] = [
  ['Thị trường Khánh Hòa, Bình Thuận', '0911 638 672'],
  ['Thị trường Cà Mau, Bạc Liêu, Sóc Trăng', '0911 248 872'],
  ['Thị trường Bến Tre', '0911 381 872'],
  ['Hỗ trợ kỹ thuật toàn quốc máy lọc nước và máy lọc dầu', '0911 789 572'],
  ['Tiếp nhận phản hồi dịch vụ kinh doanh', '0911 439 672']
].map(([label, display]) => ({ label, display, tel: 'tel:' + display.replace(/\D/g, '') }));
