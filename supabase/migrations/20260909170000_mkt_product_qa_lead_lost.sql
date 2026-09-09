-- 20260909170000_mkt_product_qa_lead_lost.sql
-- Lenh sep Long 9/9 15:12 (nhom Zalo, Hoa xac nhan): kenh online tu tra loi, tu chot, KHONG pass lead
-- cho Kinh doanh; khong chot duoc thi ket qua la "khong chot"; moi cau hoi + cau tra loi gom thanh
-- KHO KIEN THUC theo tung san pham, la dau vao cho Bot Live Stream phase 2.
--
-- 1) mkt_leads.status them 'lost' (Khong chot) + cot lost_reason (ly do, de hoc).
-- 2) Bang mkt_product_qa: hoi dap theo san pham. product_group = ten nhom trong products.mjs
--    ("2. May loc nuoc bien SEA-40", "9. May Loc Dau Diesel SD12-300", ...) hoac 'Chung'.
--    verified = nguoi phu trach da xac nhan dung (bot uu tien dong verified). used_count = so lan bot
--    dung de tra loi. lead_id = khach nao hoi (de doi chieu), null khi nhap tay.
-- 3) Moi 1 dot hoi dap tu van ban chinh sach gia GD TTKD Trinh Minh Tien 9/9/2026 + bang quy cach
--    Kinh doanh gui 9/9, de bot tra loi duoc ngay. Dong nao chua chac thi verified=false.

alter table public.mkt_leads drop constraint if exists mkt_leads_status_check;
alter table public.mkt_leads add constraint mkt_leads_status_check
  check (status in ('new','contacted','won','lost','closed','spam'));
alter table public.mkt_leads add column if not exists lost_reason text;

create table if not exists public.mkt_product_qa (
  id            uuid primary key default gen_random_uuid(),
  product_group text not null default 'Chung',
  question      text not null,
  answer        text not null,
  source        text,                        -- van ban / nguoi cap thong tin
  confirmed_by  text,                        -- ai xac nhan (Tien, Hoa, Linh, Thanh...)
  verified      boolean not null default false,
  used_count    integer not null default 0,
  lead_id       uuid references public.mkt_leads(id) on delete set null,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists mkt_product_qa_group_idx on public.mkt_product_qa (product_group, verified, created_at desc);

alter table public.mkt_product_qa enable row level security;
do $$
begin
  drop policy if exists mkt_product_qa_staff_all on public.mkt_product_qa;
  create policy mkt_product_qa_staff_all on public.mkt_product_qa
    for all to authenticated using (true) with check (true);
end $$;

-- Moi du lieu (idempotent: chi chen khi bang trong).
insert into public.mkt_product_qa (product_group, question, answer, source, confirmed_by, verified)
select * from (values
  ('Chung', 'Số điện thoại tư vấn ghi trên bài bán và ảnh là số nào?',
   'Hotline 0939 243 222 (số trên văn bản chính sách giá và mọi bài bán, poster, video từ 9/9/2026). Tổng đài 1900 23 23 49 chỉ dùng trên web sdvico.vn và trang chính sách. Email congnghebien.sdvico@gmail.com. Địa chỉ 283 Nguyễn Hữu Cảnh, phường Rạch Dừa, TP. Hồ Chí Minh.',
   'Văn bản chính sách giá GĐ TTKD 9/9/2026; Thanh chốt 9/9', 'Thanh Huynh', true),
  ('Chung', 'Luật ghi giá trên bài công khai (Page, group, TikTok, video) là gì?',
   'Bài công khai KHÔNG ghi số chính xác, chỉ ghi mốc: lọc nước "máy cơ giảm từ 45 triệu còn 3X triệu, máy điện giảm từ 56 triệu còn 4X triệu, đã gồm công lắp, tặng 10 lõi lọc thô"; lọc dầu "bộ lọc dầu giảm từ 12 triệu còn 9,X triệu". Số chính xác chỉ nói trong inbox, điện thoại và trên sàn Shopee. Câu kết mọi bài bán: Anh em cmt "lọc dầu" hay "lọc nước" để em tư vấn cho anh em nhé! Mốc 45, 56, 12 triệu là mốc kích thích do Thanh chốt, không có trong văn bản chính sách, nên bài vẫn qua duyệt.',
   'Thanh chốt 8/9 và 9/9/2026', 'Thanh Huynh', true),
  ('Chung', 'Trước khi đăng listing, bài có giá lên web hoặc sàn phải làm gì?',
   'Theo anh Trịnh Minh Tiến (GĐ Trung tâm Kinh doanh, 9/9/2026): đăng lên web và sàn chỉ ghi giá bán lẻ, không bao giờ ghi giá đại lý; trước khi đăng gửi lên nhóm Zalo để mọi người xem qua, ok mới đăng. Nội dung chạm quy định nhà nước, IUU, Cục Thủy sản, Kiểm ngư (kể cả bài giám sát hành trình) phải cấp quản lý duyệt trước khi đăng (điều cấm 3).',
   'Chat nhóm Zalo 9/9/2026 11:04', 'Trịnh Minh Tiến', true),
  ('Chung', 'Kênh online chốt đơn thế nào, có chuyển lead cho Kinh doanh không?',
   'Lệnh sếp Long 9/9/2026 15:12: kênh online và chat do Thanh trực tiếp trả lời và tự chốt, KHÔNG chuyển, KHÔNG pass lead cho Kinh doanh. Không chốt được thì ghi trạng thái Không chốt kèm lý do. Kinh doanh (Tiến, Hòa, Linh) chỉ cấp thông tin sản phẩm. Mọi câu khách hỏi và câu trả lời gom vào kho hỏi đáp này, là đầu vào cho Bot Live Stream giai đoạn 2.',
   'Chat nhóm Zalo 9/9/2026 15:12 tới 15:16', 'Long Nguyễn', true),
  ('Chung', 'Link Shopee của 2 máy là gì?',
   'Gian Shopee SDVICO (shop 212723941). Máy lọc nước: https://shopee.vn/product/212723941/45017630539/ (giá 49.000.000 đ máy điện, 38.000.000 đ máy cơ, hàng cồng kềnh 60 kg). Máy lọc dầu SF300B: https://shopee.vn/product/212723941/29945752663/ (niêm yết 12.000.000 đ, khách lưu voucher giảm 2.100.000 đ còn 9.900.000 đ). Shopee cấm ghi số điện thoại trong tên, mô tả, ảnh. Không đưa hàng Viettel, Thuraya, PVOIL lên sàn.',
   'Thanh đăng gian 9/9/2026', 'Thanh Huynh', true),
  ('2. Máy lọc nước biển SEA-40', 'Giá máy lọc nước biển bao nhiêu?',
   'Giá bán lẻ đã gồm VAT và công lắp đặt: máy chạy điện 49.000.000 đ, máy cơ 38.000.000 đ. Khuyến mãi kèm: tặng 10 lõi lọc thô khi mua và hoàn tất lắp đặt. Trên bài công khai chỉ ghi "máy cơ giảm từ 45 triệu còn 3X triệu, máy điện giảm từ 56 triệu còn 4X triệu". Số chính xác chỉ nói riêng với khách.',
   'Văn bản chính sách giá máy lọc nước GĐ TTKD Trịnh Minh Tiến 9/9/2026', 'Trịnh Minh Tiến', true),
  ('2. Máy lọc nước biển SEA-40', 'Thông số kỹ thuật máy lọc nước biển (bản chạy điện)?',
   'Theo bảng quy cách Kinh doanh gửi 9/9/2026 (ghi model SEA250): công suất lọc thiết kế khoảng 250 lít nước ngọt mỗi giờ ở độ mặn 32 g/l; tỷ lệ tách muối 99,6%; nước ra dưới 500 ppm đạt chuẩn nước ăn uống WHO; màng RO Membranium (Nga) hoặc tương đương; bơm cao áp RO inox 316, motor 3 pha 220/380VAC 2,2 kW; điện áp 1 pha 220VAC hoặc 3 pha 220/380VAC 50/60Hz, công suất điện khoảng 2,2 kW; áp suất làm việc 50 tới 57 bar, tối đa 60 bar; nước cấp là nước biển sạch lấy từ bơm làm mát máy tàu, dưới 35 độ C; kích thước 150 x 50 x 80 cm; nặng khoảng 60 kg; thiết kế và lắp ráp tại Việt Nam.',
   'Bảng quy cách SEA250 Kinh doanh gửi Zalo 9/9/2026 09:10', 'Kinh doanh', true),
  ('2. Máy lọc nước biển SEA-40', 'Máy lọc nước bảo hành bao lâu?',
   'Bảo hành kỹ thuật chung 12 tháng. Màng RO bảo hành 18 tháng, đổi mới. Đầu bơm cao áp bảo hành 2 năm.',
   'Bảng quy cách SEA250 Kinh doanh gửi 9/9/2026', 'Kinh doanh', true),
  ('2. Máy lọc nước biển SEA-40', 'Nước lọc ra uống liền được không?',
   'Được. Nước ra dưới 500 ppm, đạt chuẩn nước ăn uống WHO theo bảng quy cách. Bài công khai được nói "nước đạt chuẩn ăn uống". Không nói "bớt chở nước", "nhẹ tàu", "tiết kiệm dầu" cho máy lọc nước (cấp trên chê 19/8).',
   'Bảng quy cách SEA250 9/9/2026; product-guard', 'Kinh doanh', true),
  ('2. Máy lọc nước biển SEA-40', 'Tên máy lọc nước là SEA-40 hay SEA250?',
   'CHƯA CHỐT. Bài bán và listing Shopee đang ghi SEA-40 (web cũ ghi SEA-40 là 40 lít/giờ), còn bảng quy cách Kinh doanh gửi 9/9 ghi model SEA250 với 250 lít/giờ, 60 kg. Phải hỏi Kinh doanh tên chính thức trước khi sửa tiêu đề. Máy cơ chưa có bảng thông số riêng.',
   'Đối chiếu 9/9/2026', null, false),
  ('9. Máy Lọc Dầu Diesel SD12-300', 'Giá máy lọc dầu bao nhiêu?',
   'Giá bán lẻ đã gồm VAT, CHƯA gồm vận chuyển và công lắp đặt: bộ lọc dầu bơm điện (SF300B) 9.900.000 đ, bộ lọc dầu cơ 7.900.000 đ. Giá đại lý 8.000.000 đ và 6.000.000 đ KHÔNG bao giờ công khai. Bài công khai chỉ ghi "bộ lọc dầu giảm từ 12 triệu còn 9,X triệu". Trên Shopee niêm yết 12.000.000 đ kèm voucher 2.100.000 đ.',
   'Chính sách bán hàng bộ lọc dầu GĐ TTKD Trịnh Minh Tiến 9/9/2026', 'Trịnh Minh Tiến', true),
  ('9. Máy Lọc Dầu Diesel SD12-300', 'Thông số máy lọc dầu SF300B?',
   'Tên công khai là SF300B (không ghi SD12-300 hay SF-50B Motor). Máy lọc dầu diesel chuyên dụng cho động cơ máy thủy. Lọc cặn 1 tới 10 micron, tách nước 100%. Lưu lượng 180 lít mỗi giờ. Màng lọc 3 lớp sợi tổng hợp (polyester, cellulose). Motor điện 12V tới 13,8V một chiều (điện bình tàu). Vỏ inox 304. Kích thước 52 x 20 x 50 cm, nặng 15 kg, đặt vừa hầm máy, có đầm chống rung. Tài liệu ghi tiết kiệm nhiên liệu 5 tới 10% sau khi lọc. Bảo hành 12 tháng. Dễ lắp, tự lắp được.',
   'Tính năng.txt folder Lọc dầu SF300B 8/9/2026 + bài Kinh doanh (Đạt) 9/9/2026', 'Thanh Huynh', true),
  ('9. Máy Lọc Dầu Diesel SD12-300', 'Bộ lọc dầu cơ khác bộ bơm điện chỗ nào?',
   'CHƯA CÓ THÔNG SỐ bộ lọc cơ. Văn bản chính sách 9/9 chỉ ghi giá bộ lọc cơ 7.900.000 đ. Cần hỏi Kinh doanh model, lưu lượng, ảnh trước khi đăng phân loại này lên Shopee.',
   'Đối chiếu 9/9/2026', null, false),
  ('3. Thiết bị giám sát hành trình Viettel S-Tracking', 'Giá thiết bị giám sát hành trình Viettel S-Tracking?',
   'Bảng báo giá SDVICO ngày 5/9/2026 (Viettel xác nhận): thiết bị giám sát hành trình tàu cá Viettel S-Tracking, model MTR-V02-VNM, xuất xứ Việt Nam, 23.601.000 đ một bộ, đã gồm VAT và lắp đặt. Chính sách cho khách hàng cuối, không áp đồng thời với chính sách dự án tại địa phương. Bài công khai chỉ ghi "2X triệu trọn gói". Không đưa lên Shopee. SDVICO phân phối, lắp đặt, bảo hành; thiết bị và app là của Viettel (điều cấm 4). Bài về sản phẩm này phải sếp duyệt (điều cấm 3).',
   'Bảng báo giá SDVICO_BG_GSHT_VTT 5/9/2026', 'Trịnh Minh Tiến', true),
  ('3. Thiết bị giám sát hành trình Viettel S-Tracking', 'Chức năng chính của Viettel S-Tracking?',
   'Truyền dữ liệu 90 phút một lần. Cứu hộ SOS gửi tin 15 phút một lần. Cảnh báo bằng đèn và âm thanh khi tàu vượt ranh giới, 1 phút một lần cho tới khi quay lại ranh giới và ra khỏi vùng cấm. Cảnh báo pin nội dưới 30%. Tự lưu hành trình khi mất tín hiệu và tự gửi lại khi có sóng. Chống nước: ngâm 30 phút ở độ sâu 1 m. Nguồn: năng lượng mặt trời, điện tàu, pin nội. Miễn phí nhắn tin 2 chiều qua app Viettel S-Tracking. Phần mềm và tài khoản riêng biệt theo từng tàu: mỗi tàu một tài khoản trên app Viettel S-Tracking, chủ tàu tự theo dõi tàu mình (Thanh 9/9/2026). Bảo hành 12 tháng thiết bị chính, 6 tháng phụ kiện khi lỗi do nhà cung cấp. Điện thoại chăm sóc khách hàng ghi trên bảng báo giá: 0389.40.68.72, 0336.40.68.72, 0868.69.84.79.',
   'Bảng báo giá SDVICO_BG_GSHT_VTT 5/9/2026', 'Trịnh Minh Tiến', true),
  ('Wifi vệ tinh', 'Giá thiết bị và cước wifi vệ tinh Starlink?',
   'Chính sách bán hàng GĐ TTKD 9/9/2026: Starlink V4 15.000.000 đ một thiết bị, Starlink Mini 13.000.000 đ, đã gồm VAT, chưa gồm vận chuyển và công lắp đặt. Cước duy trì hằng tháng: gói 10 GB 5.500.000 đ (10 GB tốc độ cao, sau đó tốc độ thấp), gói 25 GB 6.000.000 đ. Bài công khai trước đây chỉ ghi "wifi vệ tinh, giảm còn 1X triệu" và không nêu tên hãng cho tới khi sếp cho; văn bản 9/9 đã ghi tên Starlink, hỏi lại sếp trước khi nêu hãng trên bài.',
   'Chính sách bán hàng và cước dịch vụ thiết bị Starlink GĐ TTKD 9/9/2026', 'Trịnh Minh Tiến', true)
) as v(product_group, question, answer, source, confirmed_by, verified)
where not exists (select 1 from public.mkt_product_qa);
