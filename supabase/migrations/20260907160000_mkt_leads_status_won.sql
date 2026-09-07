-- 20260907160000_mkt_leads_status_won.sql
-- Trang thai "Da mua" cho khach hoi mua (7/9). Muc tieu tuan 7 toi 13/9 user giao nhom IT
-- 5/9: 10 khach MUA san pham (SEA-40, SF-50, SD12-300). Truoc day chi co Xong (closed) kem
-- ghi chu "da mua" nen /tong-quan khong dem duoc so khach mua so voi muc tieu.
--
-- status: new = moi, contacted = da lien he, won = DA MUA (chot don), closed = xong (khong
-- mua / het viec), spam = rac. updated_at duoc ghi luc doi trang thai (actions.ts) -> dem
-- "Da mua tuan nay" theo updated_at nam trong tuan.
-- Ten constraint tren DB song: mkt_leads_status_check (kiem 7/9 qua pg_constraint).
alter table public.mkt_leads drop constraint if exists mkt_leads_status_check;
alter table public.mkt_leads add constraint mkt_leads_status_check
  check (status in ('new','contacted','won','closed','spam'));
