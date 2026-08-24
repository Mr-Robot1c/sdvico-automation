-- 20260824150000_mkt_metrics_source_tiktok.sql
-- Nới CHECK cho mkt_metrics.source để cho 'tiktok'.
--
-- BỐI CẢNH: từ 24/8 cron kéo view/like/comment TikTok về mkt_metrics với source='tiktok'
-- (commit 1f7a7c0). Nhưng migration cũ 20260813150000_widen_channel_source_checks.sql chỉ
-- cho ('gsc','ga4','facebook','youtube','manual') — insert 'tiktok' bị chặn với lỗi
-- "new row for relation \"mkt_metrics\" violates check constraint \"mkt_metrics_source_check\""
-- -> bảng /do-luong không có dòng TikTok nào dù cron đã kéo được video (test qua /api/tt-diag
-- xác nhận videoCount=1, matched=1, insert 400).
--
-- Chỉ NỚI danh sách. Không sửa dữ liệu, không đụng bảng khác. An toàn với dữ liệu cũ.

alter table public.mkt_metrics
  drop constraint if exists mkt_metrics_source_check;
alter table public.mkt_metrics
  add constraint mkt_metrics_source_check
  check (source in ('gsc','ga4','facebook','youtube','tiktok','manual'));
