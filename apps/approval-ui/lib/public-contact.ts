// Mot nguon duy nhat cho so dien thoai trang public (Thanh chot 2/10: 0939 243 222,
// trung so bai ban/caption, co nguoi truc va do duoc cuoc goi). Doi so = doi env, khong sua tung cho.
// Chi dung cho UI public cua approval-ui (header, footer, nut goi, CTA san pham, privacy/terms).
// KHONG dung cho noi dung bai may sinh (packages/marketing, lib/gen) — day la luong khac.
// Khong phai bi mat nen process.env co the duoc inline vao client bundle luc build.
export const PUBLIC_HOTLINE_DISPLAY = (process.env.PUBLIC_HOTLINE_DISPLAY || '0939 243 222').trim();
export const PUBLIC_HOTLINE_TEL = 'tel:' + PUBLIC_HOTLINE_DISPLAY.replace(/\D/g, '');
