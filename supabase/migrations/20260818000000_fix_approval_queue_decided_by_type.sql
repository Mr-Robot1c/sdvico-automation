-- Sửa lỗi kiểu dữ liệu: approval_queue.decided_by được tạo là uuid ở
-- 20260810090000_init.sql. Migration 20260815010000_audit_columns.sql dùng
-- "add column if not exists decided_by text" nên bị bỏ qua vì cột đã tồn tại —
-- cột vẫn giữ nguyên kiểu uuid, trong khi code (app/actions.ts) ghi email dạng
-- text vào đây khi AUTH_MODE=supabase.
--
-- Hậu quả thấy được: Postgres báo "invalid input syntax for type uuid" mỗi lần
-- ghi decided_by.
--   - decideForm/approveAndPublish có throw khi lỗi -> trang crash, error.tsx
--     tự tải lại -> bấm Duyệt/Đăng ngay lúc nào cũng lỗi, không đăng được gì.
--   - dismissQueueItem không kiểm tra lỗi -> update âm thầm không chạy -> mục
--     vẫn còn status 'pending', trông như không xóa được khỏi hàng đợi.
--
-- Chưa có dữ liệu decided_by nào ghi thành công trước đây (luôn null ở chế độ
-- basic, luôn lỗi ở chế độ supabase) nên đổi kiểu thẳng sang text là an toàn.

alter table public.approval_queue
  alter column decided_by type text using decided_by::text;
