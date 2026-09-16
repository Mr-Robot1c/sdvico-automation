# Bàn giao sửa web 15–16/9/2026 — việc đã xong, việc còn mở

> Dành cho Thanh mở phiên Claude mới: đọc file này là biết tiếp ở đâu. Nguồn: kế hoạch "SDVICO sửa web.docx"
> (bản 1, 15/9) và "SDVICo sửa web ver 2.docx" (16/9) của sếp qua Thanh, cộng 8 câu Thanh trả lời trưa 16/9.
> Bản web đang chạy: `main` tại `d8a4d87` (sdvico-mktit.vercel.app). Nhánh làm việc: `claude/sdvico-web-sua-c6758b`.

## A. Đã xong, đã lên web

| Trang | Việc | Ghi chú |
|---|---|---|
| Chung | Nút Quay lại về trang CHA (Khách hàng → Tổng quan, Báo cáo tuần → Kênh) | cây trang `lib/routes.ts` |
| Chung | Web chậm: cache trạng thái Facebook/YouTube/TikTok 5 phút, báo cáo tuần và hoạt động AI 2 phút, chip bot 5 phút, Tổng quan chạy song song, khung chat tải trễ | Thanh theo dõi thêm, còn chậm thì báo trang nào |
| Tổng quan | Lô nhóm chia sẻ theo BUỔI: mỗi bài Facebook 4 nhóm, ngày 2 bài = 8; nút Mở nhóm + Đã chia ngay trong bảng Kế hoạch hôm nay | máy chỉ đếm khi bấm Đã chia |
| Tổng quan | 5 ô Tiến độ bấm vào mở đúng danh sách | |
| Khách hàng | Mục menu riêng; một bảng một luồng Mới → Đã liên hệ → Đã mua / Không chốt (Lý do: ...); nút Đã mua và Không chốt cùng hàng | |
| Khách hàng | BỎ Chuyển NV và khối NV nhận Zalo (Thanh tự trả lời khách) | cột forwarded_* còn trong DB, không hiện |
| Kế hoạch | Bảng tuần mỗi bài một dòng nhiều cột; cột lô nhóm theo từng buổi; khối Lịch cố định mỗi ô hiện bài sẽ ra + lô buổi (khớp bảng trên); Lưu lịch báo "thêm X / bỏ Y bài"; Nhật ký thay đổi lịch | |
| Video | Kịch bản đi đôi với hình: máy ghi "hình cần" từng cảnh rồi chấm tư liệu theo mô tả, cảnh vấn đề cấm ảnh máy mới. Áp cho video dựng từ 15/9 | test 12/12, thử Gemini thật fit 10/9/10 |
| Video | Bảng kho: cột Bài gốc + "Ghép từ tư liệu · giây"; nút Xem mở trong trang, hết treo; 3 ô Đã đăng bấm vào từng nền tảng, số khớp danh sách | |
| Kho tư liệu | Google Drive: 190/190 tư liệu cũ đã dời sang Drive (thư mục SDVICO Kho tư liệu), file mới từ Zalo tự lên Drive 8h15/16h30/20h30; Supabase chỉ giữ link và video máy dựng | OAuth tài khoản Google của Thanh, app đã Publish (In production) |
| SEO | 5 ô bấm được; bảng bài có cột Click / Hiển thị / CTR / Vị trí; trang /seo/bai-viet đủ 48 bài | số còn "—" vì chưa nối Search Console (mục B2) |
| Kênh | Trang từng nền tảng /kenh/facebook, /kenh/youtube, /kenh/tiktok: bài, giờ đăng, lượt xem, bình luận (Facebook đọc được nội dung bình luận); 3 ô số trong thẻ bấm được | |
| Kênh | Lượt xem TikTok chỉ tính kênh hiện tại (989 → 173); chữ thống nhất "Báo cáo tuần"; Báo cáo tuần có tab riêng từng kênh với điểm chất lượng | |
| Agent | Mỗi AI hiện Lịch chạy thật + dải 7 ngày số lần chạy / lỗi | |
| Agent | Bot: lớp tìm web (Tavily/Serper) + lớp đổi model chuẩn OpenAI (DeepSeek/Qwen/Groq) đã viết, chờ key (mục B3) | không có key thì chạy như cũ |
| DB | 2 migration đã áp (Thanh chạy SQL 16/9): mkt_leads.forwarded_*, brand_assets.description | |

## B. Còn mở — ai làm gì

| # | Việc | Ai | Trạng thái |
|---|---|---|---|
| B1 | Mô tả tư liệu cũ để video chọn hình đúng | Claude | XONG 16/9 chiều: 190/190. Tư liệu mới up tự có mô tả |
| B2 | Search Console sdvico.vn: anh Thành thêm email `sdvico-kho-tu-lieu@sdvico-youtube.iam.gserviceaccount.com` (quyền Đầy đủ) | anh Thành + Thanh | Thanh đã nhắn, chờ rep. 16/9 chiều Claude gọi thử phát hiện thêm: dự án Google CHƯA BẬT Search Console API — Thanh mở link bên dưới bằng Edge, bấm Enable (1 phút). Cả hai xong thì chạy `npm run gsc:kiem`, lệnh tự báo đặt `GSC_SITE_URL` giá trị nào |
| B3 | Bot tìm web: đăng ký Tavily (https://tavily.com, free 1.000 lượt/tháng), gửi key `tvly-...` | Thanh | Chờ key → Claude đặt `TAVILY_API_KEY` trên Vercel, thử bot |
| B4 | (tuỳ chọn) Model Trung Quốc free: Groq (https://console.groq.com) key `gsk_...` chạy Qwen 3 | Thanh | Có key → Claude đặt OPENAI_BASE_URL/KEY/MODEL, chạy trước Gemini |
| B5 | Dựng thử 1 video (bài lọc dầu SD12-300, không đưa vào hàng đợi) để Thanh xem cảnh nào ghép hình nào | Claude | XONG 16/9 chiều: 54,7 s, cảnh 1 clip thật thợ xử lý sự cố máy lọc dầu, cảnh 2 ảnh thợ sửa động cơ tàu, cảnh 3 ảnh sản phẩm SF300B (điểm khớp 10/10/10). File out/video/sdvico_492313ac_vertical.mp4 (worktree), đã gửi Thanh. Chờ Thanh nhận xét |
| B6 | Web còn chậm ở trang nào | Thanh theo dõi 2 hôm rồi báo | chờ |
| B7 | Ứng dụng Google vẫn hiện cảnh báo "requires verification" vì scope YouTube | không cần làm | chỉ 1 tài khoản dùng, bỏ qua |

## C. Lệnh hay dùng

Link bật Search Console API (B2, Thanh mở bằng Edge rồi bấm Enable):
https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=sdvico-youtube

```
npm run gsc:kiem                         # kiểm Search Console: API bật chưa, anh Thành thêm quyền chưa, GSC_SITE_URL đặt gì (B2)
npm run kho:mo-ta -- --limit 200        # mô tả tư liệu còn thiếu (B1)
npm run kho:doi-drive                    # dời tư liệu Supabase → Drive (đã chạy xong, chạy lại vô hại)
npm run drive:oauth                      # lấy lại quyền Drive nếu đổi tài khoản (mở Edge http://localhost:8765/start)
npm run test:scene                       # test luật khớp cảnh ↔ tư liệu
node packages/marketing/src/up-media-kho-tu-lieu.mjs   # đẩy media Zalo lên Drive ngay
```

Deploy: ở checkout chính `git merge --ff-only claude/sdvico-web-sua-c6758b` rồi `git push origin ngay2-marketing:main`.

## D. Hướng dẫn kèm theo

- `docs/runbook-google-drive-setup.md` — đã nối, cách làm lại khi đổi tài khoản.
- `docs/runbook-search-console-setup.md` — bước cho anh Thành + biến cần đặt.
- `docs/runbook-bot-tim-kiem-model.md` — Tavily / Groq / DeepSeek cho bot.
- `docs/sql/chay-tay-15-09-sua-web.sql` — đã chạy.
