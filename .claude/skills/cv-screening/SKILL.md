---
name: cv-screening
description: Chấm CV theo thang điểm cố định cho SDVICO, ẩn danh trường nhạy cảm, máy chấm người quyết. Kích hoạt khi nạp xong CV cần chấm và xếp hạng, hoặc khi rà lại tiêu chí chấm.
---

# cv-screening — chấm CV theo thang cố định

> Nguồn sự thật cho con người. Thang điểm trong code ở `packages/hr/src/screen/rubric.js` phải khớp file này.
> Đọc `CLAUDE.md` và `docs/app-map/tuyen-dung.md` trước. Điều cấm 2, 5, 6 áp dụng ở đây.

## Mục đích

Chấm mỗi CV theo một thang điểm cố định, ẩn danh trước khi chấm để chống thiên vị, rồi đưa hồ sơ vào hàng chờ người xếp hạng. Máy chấm và xếp, con người quyết ai đi tiếp. Không có nhánh nào tự loại ứng viên.

## Ba nguyên tắc bắt buộc

1. Ẩn danh trước khi chấm. Bỏ tên, giới tính, tuổi, ngày sinh, quê quán, địa chỉ, ảnh, email, số điện thoại. Chỉ chấm dựa vào năng lực và kinh nghiệm.
2. Thang điểm cố định. Mô hình chỉ chấm đúng các trục bên dưới, không tự nghĩ thêm tiêu chí.
3. Không quyết đỗ hay trượt. Đầu ra là điểm và nhận xét. Người xem hàng chờ mới quyết.

## Thang điểm mặc định

Điểm mỗi trục từ 0 tới 10. Điểm tổng là trung bình có trọng số, quy về thang 100.

| Trục | Nhãn | Trọng số | Chấm cái gì |
|---|---|---|---|
| chuyen_mon | Chuyên môn phù hợp vị trí | 3 | Kỹ năng và kiến thức lõi khớp yêu cầu công việc, theo bằng chứng cụ thể. |
| kinh_nghiem | Kinh nghiệm liên quan | 3 | Số năm và mức độ liên quan. Ưu tiên sát ngành biển, thủy sản, thiết bị hàng hải. |
| thanh_tuu | Kết quả đo được | 2 | Kết quả cụ thể có số liệu. Không tính lời tự nhận chung chung. |
| ky_nang_mem | Kỹ năng mềm và giao tiếp | 1 | Bằng chứng làm việc nhóm, giao tiếp, xử lý tình huống. |
| on_dinh | Ổn định và cam kết | 1 | Thời gian gắn bó, tính liền mạch. Nhảy việc dày là điểm cần làm rõ, không phải cớ loại. |

`[CẦN XÁC NHẬN với Phòng Nhân sự: trục điểm, trọng số và ngưỡng cho từng vị trí thực tế. Đây là thang chung mặc định, đủ để chạy, chờ Nhân sự chốt thang riêng theo vị trí.]`

## Đầu ra mỗi hồ sơ

- Điểm từng trục và điểm tổng thang 100, ghi vào `hr_applications.score_json`.
- Ba câu tóm tắt hồ sơ, ghi vào `summary`.
- Ba điểm mạnh cụ thể, ghi vào `strengths`.
- Ba điều cần làm rõ khi phỏng vấn, ghi vào `clarifications`.
- Đánh dấu `screened_at` và chuyển `stage` sang `review`.

## Cách chạy

- Tự động theo lịch: GitHub Action `.github/workflows/hr-screen.yml`, chạy sau đường nạp CV.
- Diễn tập cục bộ, chỉ ẩn danh và in, không gọi mô hình, không ghi:

```bash
node packages/hr/src/screen/run.mjs --dry-run
```

- Chạy thật cần biến môi trường `ANTHROPIC_API_KEY`. Model mặc định `claude-opus-5`, đổi bằng `HR_SCREEN_MODEL`.

## Giọng văn

Nhận xét viết tiếng Việt tự nhiên. Không gạch dài, không mũi tên, không dấu chấm tròn giữa câu. Không bịa số liệu hay thành tích không có trong hồ sơ.
