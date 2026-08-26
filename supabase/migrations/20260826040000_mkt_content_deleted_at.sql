-- mkt_content.deleted_at: soft-delete bai viet. Truoc day deleteContent HARD DELETE 4 bang
-- (approval_queue + mkt_posts + mkt_metrics + mkt_content) -> mat toan bo lich su Like/View
-- /Comment cua bai bi xoa. User 26/8 bi mat trang so lieu: "ngay tu dau m deo noi bay gio
-- mat trang lich su roi". Quyet dinh cach C: soft-delete mac dinh + 1 nut "Xoa han" o thung
-- rac cho case can don thuc su.
--
-- NULL = con hien, NOT NULL = da an khoi UI (Bang bai viet, Bai viet day du) nhung mkt_posts
-- va mkt_metrics KHONG bi cham -> Do luong tuan van co lich su. Trang thung rac hien danh sach
-- soft-deleted voi nut Khoi phuc va Xoa han.
alter table public.mkt_content
  add column if not exists deleted_at timestamptz;

comment on column public.mkt_content.deleted_at is
  'Soft-delete bai viet. Query UI filter deleted_at null; metric lich su van giu nguyen o mkt_metrics. Undo bang cach set null.';

-- Reload PostgREST schema cache de client thay cot moi ngay.
notify pgrst, 'reload schema';
