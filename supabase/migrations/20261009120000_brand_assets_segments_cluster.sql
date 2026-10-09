-- 20261009120000_brand_assets_segments_cluster.sql
-- 9/10 ĐỢT A (chọn đoạn trong clip + giữ một cụm tư liệu xuyên suốt video). Gốc: assemble.mjs luôn lấy clip
-- từ giây 0 và lặp nếu ngắn; scene-match chấm từng cảnh riêng nên video nhảy giữa nhiều buổi quay khác nhau.
-- Thêm 2 cột (null mặc định, không đụng dữ liệu cũ):
--   segments       mảng đoạn trong clip: [{ start, end, action, people, equipment, setting, vertical_ok, note }]
--                  (giây số thực; action = hành động THỰC SỰ thấy; vertical_ok = cắt khung dọc 9:16 còn thấy rõ chủ thể)
--   shoot_cluster  cụm buổi quay: { id, confidence: 'chac' | 'co_the', basis, checked_at }
--                  (id dạng "<ngày>|<nhóm>|<số>"; ngày Zalo + nhóm chỉ là ỨNG VIÊN cụm, đã đối chiếu thiết bị, người,
--                  khoang tàu, hoạt động mới ghi; chưa chắc thì confidence = 'co_the')
alter table public.brand_assets add column if not exists segments jsonb;
alter table public.brand_assets add column if not exists shoot_cluster jsonb;

comment on column public.brand_assets.segments is
  'Cac doan trong clip: [{start,end,action,people,equipment,setting,vertical_ok,note}] (giay). Day chuyen video cat dung doan thay vi lap tu giay 0.';
comment on column public.brand_assets.shoot_cluster is
  'Cum buoi quay: {id, confidence chac|co_the, basis, checked_at}. Video giu MOT cum xuyen suot de hinh cung viec, cung buoi.';
