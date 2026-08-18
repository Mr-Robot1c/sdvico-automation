-- Phân loại bình luận để chọn hành động đúng, tránh soạn thư mời duyệt cho mọi bình luận:
--   muon_biet_them  — hỏi thêm chi tiết (giá, lương, cách ứng tuyển...) → máy soạn câu mời
--                      nhắn tiếp qua Messenger, vẫn qua approval_queue, người duyệt mới đăng
--                      (điều cấm 1 — đây là NỘI DUNG công khai, phải qua người).
--   tich_cuc        — khen, ủng hộ, không hỏi gì → máy tự react (like) trực tiếp, KHÔNG qua
--                      hàng đợi duyệt. Một lượt thích không phải "thư hoặc tin nhắn" theo điều
--                      cấm 1 — không có nội dung do máy soạn ra để có thể sai hay lệch giọng văn,
--                      nên xử lý như một tín hiệu ghi nhận, không phải một lượt gửi.
--   khac            — không thuộc hai loại trên → bỏ qua, không làm gì.

alter table public.hr_fb_comments
  add column if not exists phan_loai text check (phan_loai in ('muon_biet_them','tich_cuc','khac'));

alter table public.hr_fb_comments drop constraint if exists hr_fb_comments_trang_thai_check;
alter table public.hr_fb_comments add constraint hr_fb_comments_trang_thai_check
  check (trang_thai in ('new','composed','approved','replied','ignored','failed','reacted'));

comment on column public.hr_fb_comments.phan_loai is 'Kết quả phân loại máy, quyết định hành động: soạn thư mời Messenger, tự react, hay bỏ qua.';
