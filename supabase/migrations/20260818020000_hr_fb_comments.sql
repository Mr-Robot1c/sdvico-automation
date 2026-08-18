-- Comment công khai nhận qua webhook Facebook (field 'feed'). Dữ liệu công khai trên
-- Facebook, không nhạy cảm như hồ sơ ứng viên/nhân viên — theo pattern RLS mặc định
-- "for all to authenticated using(true)" của phần lớn bảng khác (khác hr_users/hr_employees).
--
-- Máy soạn, người bấm gửi (điều cấm 1): worker chỉ ghi trang_thai='new'/'composed', KHÔNG có
-- worker nào tự đăng reply. Đăng thật chỉ chạy khi có approval_queue kind='fb_comment_reply'
-- status='approved' (xem packages/hr/src/post/publish-comment-reply.mjs).

create table if not exists public.hr_fb_comments (
  id             uuid primary key default gen_random_uuid(),
  job_post_id    uuid references public.hr_job_posts(id) on delete set null,
  fb_comment_id  text not null unique,
  fb_post_id     text,
  from_name      text,
  message        text,
  trang_thai     text not null default 'new' check (trang_thai in ('new','composed','approved','replied','ignored','failed')),
  goi_y_tra_loi  text, -- câu trả lời máy soạn, chờ người duyệt
  reply_text     text, -- nội dung thật đã đăng (có thể người sửa lại trước khi duyệt)
  replied_at     timestamptz,
  raw_payload    jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists hr_fb_comments_trang_thai_idx on public.hr_fb_comments(trang_thai);
create index if not exists hr_fb_comments_job_post_idx on public.hr_fb_comments(job_post_id);

alter table public.hr_fb_comments enable row level security;

drop policy if exists hr_fb_comments_staff_all on public.hr_fb_comments;
create policy hr_fb_comments_staff_all on public.hr_fb_comments for all to authenticated using (true) with check (true);
