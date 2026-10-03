-- 20261003120000_approval_decided_by_text.sql
-- Phát hiện 3/10: người bấm Duyệt qua form (run_log actor decideForm) nhưng
-- approval_queue.decided_by vẫn null hàng loạt — form duyệt chưa ghi người quyết.
-- Init 10/8 khai cột là uuid, nhưng DB THẬT (lluuoygdlaadtjsbnxbk) đã là text từ trước
-- (đổi tay ngoài migration; đang chứa 'may (plan tuan 7-13/9 muc 4D)' và email người).
-- Migration này đưa repo về khớp DB thật: hệ đăng nhập nội bộ của approval-ui là MỘT
-- tài khoản chung đặt ở biến môi trường (APPROVAL_UI_USER, middleware.ts), không có bảng
-- user hay uuid nào để trỏ tới, nên decideForm ghi thẳng tên đăng nhập dạng text.
-- USING cast chạy được cả khi cột còn uuid (DB dựng mới từ init) lẫn khi đã text (no-op).
alter table public.approval_queue
  alter column decided_by type text using decided_by::text;
