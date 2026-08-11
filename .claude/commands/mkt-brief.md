---
description: Sinh đề cương bài viết từ một từ khóa trong mkt_keywords
---

# /mkt-brief

Từ một từ khóa (hoặc từ khóa ưu tiên cao trong `mkt_keywords`), sinh đề cương bài viết: mục tiêu, các phần, trang đích, lời kêu gọi.

Bám hai skill `brand-voice` và `product-boundary`. Đề cương lưu vào `mkt_content.brief`.

Cách chạy tự động cả lô (đề cương và bản nháp cùng lúc):

```
npm run content:run
```

Logic ở `packages/marketing/src/content.mjs` hàm `buildBrief`. Không nêu model, thông số chưa xác nhận (Điều cấm 5). Nội dung chạm quy định sẽ được gắn cờ đỏ ở bước sau.
