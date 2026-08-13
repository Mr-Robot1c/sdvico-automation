-- Thêm trạng thái 'dismissed' cho approval_queue.
-- 'dismissed' khác 'rejected': người dùng xóa mục khỏi hàng đợi mà không xét nội dung,
-- thường để worker soạn lại bản mới. 'rejected' nghĩa là nội dung không đạt sau khi đã đọc.

alter table public.approval_queue
  drop constraint if exists approval_queue_status_check;

alter table public.approval_queue
  add constraint approval_queue_status_check
  check (status in ('pending','approved','rejected','dismissed'));
