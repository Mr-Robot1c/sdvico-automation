-- 20260813150000_widen_channel_source_checks.sql
-- Nới hai ràng buộc CHECK để không chặn âm thầm bản ghi hợp lệ:
--
--  1) mkt_posts.channel: thêm 'tiktok'. Code đã đăng TikTok (apps/approval-ui/app/actions.ts
--     insert channel='tiktok') nhưng CHECK cũ chỉ cho website/facebook/youtube, nên insert
--     THẤT BẠI mà không báo lỗi ra luồng đăng, làm mất dấu vết bài TikTok trong DB.
--
--  2) mkt_metrics.source: thêm 'manual'. Dành cho số liệu nhập tay (đo lường conversion về sau).
--     Hiện conversion ghi tay đang lưu ở mkt_content.brief.conversions, chưa ghi vào mkt_metrics;
--     thêm 'manual' để chuẩn bị, tránh dính lại đúng bẫy chặn âm thầm khi chuyển sang bảng metrics.
--
-- Chỉ NỚI danh sách cho phép. Không sửa dữ liệu, không phá cột, không đụng bảng khác.
-- An toàn với dữ liệu cũ (mọi dòng cũ vẫn thỏa danh sách rộng hơn) và có thể đảo lại.

-- mkt_posts.channel
alter table public.mkt_posts
  drop constraint if exists mkt_posts_channel_check;
alter table public.mkt_posts
  add constraint mkt_posts_channel_check
  check (channel in ('website','facebook','youtube','tiktok'));

-- mkt_metrics.source
alter table public.mkt_metrics
  drop constraint if exists mkt_metrics_source_check;
alter table public.mkt_metrics
  add constraint mkt_metrics_source_check
  check (source in ('gsc','ga4','facebook','youtube','manual'));
