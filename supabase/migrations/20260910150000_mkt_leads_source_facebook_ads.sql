-- 20260910150000_mkt_leads_source_facebook_ads.sql
-- Nguon 'facebook_ads' cho khach hoi mua (10/9). Sep duyet quang cao Facebook 20.000 d/ngay
-- (thuc te san 26.205 d + VAT), boost reel loc nuoc muc tieu Tin nhan. Webhook Messenger chua
-- live nen may khong tu gan duoc; Thanh nhin the "Bat dau tu quang cao" trong hop thu roi nhap
-- tay o /khach-hang chon nguon Quang cao. /tong-quan dem rieng so nguoi hoi tu quang cao 7 ngay
-- de tinh chi phi moi tin nhan xin sep nang tien.
-- Ten constraint tren DB song: mkt_leads_source_check (constraint inline khi tao bang 24/8).
alter table public.mkt_leads drop constraint if exists mkt_leads_source_check;
alter table public.mkt_leads add constraint mkt_leads_source_check
  check (source in ('facebook_comment','facebook_message','facebook_ads','manual'));
