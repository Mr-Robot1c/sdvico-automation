---
description: Viết bản nháp bài hoàn chỉnh từ đề cương, quét tuân thủ, đẩy hàng đợi duyệt
---

# /mkt-draft

Từ đề cương, viết bản nháp hoàn chỉnh theo skill `brand-voice` (câu ngắn, trả lời ngay, số chuẩn Việt Nam, dẫn về tổng đài 1900 23 23 49) và `product-boundary` (không bịa thông số, không nhận vơ phần mềm đối tác).

Sau khi viết, bản nháp tự qua `compliance.mjs`: chạm quy định thì gắn cờ đỏ và bật duyệt cấp quản lý (Điều cấm 3), nhắc đối tác hoặc có thông số chưa xác nhận thì gắn amber. Bản nháp lưu `mkt_content.draft` và đẩy vào `approval_queue`. Không đăng, người bấm Duyệt mới đăng.

Cách chạy tự động cả lô:

```
npm run content:run
```

Logic ở `packages/marketing/src/content.mjs` hàm `buildDraft` và pipeline `run-content.mjs`. Hiện sinh bằng bản mẫu tất định, chạy được khi chưa có khóa mô hình; có `GEMINI_API_KEY` thì nối mô hình như phần chấm CV của HR.
