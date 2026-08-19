# Slash Commands

Lệnh vận hành đóng gói trong repo. Kế hoạch:

- `hr-jd`: sinh mô tả công việc bốn phiên bản độ dài cho bốn kênh (Ngày 2).
- `hr-intake`: nạp CV từ hộp thư, trích PDF và DOCX, OCR cho CV ảnh, chuẩn hóa JSON, khử trùng lặp (Ngày 2).
- `hr-engage`: soạn bài tương tác hâm nóng trang tuyển dụng, đẩy hàng đợi duyệt. Chạy song song với tuyển dụng, dùng chung worker đăng Facebook.
- `mkt-brief`: dựng đề cương nội dung.
- `mkt-draft`: viết bản nháp theo đề cương, đưa vào hàng đợi duyệt.
- `mkt-publish`: đăng nội dung đã duyệt.

Nhắc lại điều cấm 1 và 2: các lệnh sinh nội dung chỉ soạn và đẩy vào approval_queue. Người bấm mới gửi hoặc đăng.
