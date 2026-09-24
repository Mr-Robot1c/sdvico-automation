-- 24/9: sếp Long chỉ phễu rớt ở câu trả lời đầu ("họ hỏi là có 10% attention, em trả lời
-- xong nó về 0"). Bước 1 là dữ liệu hoá: phân loại CÂU KHÁCH HỎI để biết khách kẹt ở đâu
-- và SP nào dễ bán nhất. Máy phân loại bằng từ khóa (cron), người không phải làm gì.
alter table mkt_leads
  add column if not exists intent text
  check (intent in ('gia','ky_thuat','lap_dat','bao_hanh','so_sanh','khac'));

comment on column mkt_leads.intent is 'Loại câu hỏi của khách, máy đoán bằng từ khóa (lead-intent.mjs)';
