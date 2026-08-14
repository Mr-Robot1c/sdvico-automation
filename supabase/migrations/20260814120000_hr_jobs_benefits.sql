-- Lưu "Quyền lợi" (benefits) người dùng nhập thành cột riêng trên hr_jobs.
-- Trước đây form có ô Quyền lợi nhưng chỉ đẩy vào Groq sinh JD rồi mất, không lưu lại.
-- Cần cột này để ghép nguyên văn quyền lợi vào cuối bài đăng (phần chi tiết gốc).
alter table if exists public.hr_jobs
  add column if not exists benefits text;
