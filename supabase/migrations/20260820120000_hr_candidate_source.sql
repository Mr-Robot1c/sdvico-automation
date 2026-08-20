-- Nguồn kênh của ứng viên: CV này đến từ kênh đăng tin nào (topcv, facebook, vietnamworks…),
-- hoặc 'gioi_thieu' (được giới thiệu) / 'khac' (khác, không rõ).
--
-- Gán TAY bởi người vận hành: ứng viên liên hệ qua email/điện thoại nên hệ thống không tự suy ra
-- được nguồn (điều cấm 2 tinh thần — máy không tự quyết). Dùng để đo hiệu quả từng kênh ở trang
-- Tổng quan và Báo cáo.
--
-- Nullable, không phá dữ liệu cũ. Khớp khóa với hr_job_posts.kenh và registry lib/channels.ts.
-- RLS của hr_candidates đã phủ toàn bảng nên cột này tự được bảo vệ, không cần thêm policy.

alter table public.hr_candidates add column if not exists nguon_kenh text;
