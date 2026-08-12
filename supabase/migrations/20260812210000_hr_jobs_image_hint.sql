-- Thêm cột từ khóa ảnh vào vị trí tuyển dụng.
-- Từ khóa này hướng dẫn Unsplash tìm ảnh đúng ngành hơn, ví dụ: "tàu cá định vị biển".
-- Để trống thì hệ thống tự đoán theo tên vị trí như trước.

alter table hr_jobs add column if not exists image_hint text;
