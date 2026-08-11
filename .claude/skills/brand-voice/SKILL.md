---
name: brand-voice
description: Giọng thương hiệu SDVICO cho nội dung Marketing. Kích hoạt khi viết bài, tin nhắn, kịch bản video (mkt-brief, mkt-draft) để nội dung đọc như người Việt viết, gần gũi bà con ngư dân.
---

# brand-voice — giọng thương hiệu SDVICO

> Cặp cùng skill `product-boundary`. Đọc `CLAUDE.md` và `day2-marketing-strategy.md` trước.
> Bộ quét `packages/marketing/src/compliance.mjs` lo phần cấm, skill này lo phần giọng.

## Người đọc là ai

Bà con ngư dân, chủ tàu, đọc trên điện thoại, giữa lúc bận. Họ cần câu trả lời nhanh, thực tế, không hoa mỹ.

## Bảy quy tắc giọng văn

1. Trả lời ngay ở câu đầu. Người vội đọc câu đầu là đủ dùng, phần giải thích để sau.
2. Câu ngắn, đoạn ngắn. Mỗi đoạn hai tới ba câu. Đọc được trên điện thoại ngoài nắng.
3. Lời thường, không thuật ngữ rối. Từ kỹ thuật thì giải thích bằng lời dân dã.
4. Gần gũi, thực tế, tin cậy. Không hoa mỹ, không nói quá.
5. Số theo chuẩn Việt Nam. Dấu chấm ngăn cách hàng nghìn, ví dụ 3.000.000 đồng.
6. Không gạch dài, không mũi tên, không dấu chấm tròn giữa câu văn, không ký hiệu thay chữ "và". Gạch đầu dòng làm cấu trúc danh sách thì được.
7. Luôn có lối liên hệ ở cuối. Dẫn về tổng đài 1900 23 23 49.

## Không được

- Hứa pháp lý tuyệt đối kiểu chắc chắn không bị phạt.
- Nói quá năng lực, nhận vơ phần mềm đối tác (xem `product-boundary`).
- Nêu số liệu, giá, thông số chưa được xác nhận (xem `product-boundary`).

## Khung một bài chuẩn

Tiêu đề bám từ khóa người thật gõ. Đoạn mở trả lời ngay, tối đa ba câu. Các phần có tiêu đề phụ, mỗi phần một ý. Hộp lưu ý khi cần. Hỏi đáp ngắn gom câu hỏi thật ở tổng đài. Lời kêu gọi liên hệ và số 1900 23 23 49.

## Ví dụ

Không đạt: "Giải pháp giám sát hành trình tối tân, đẳng cấp, tích hợp công nghệ AI vượt trội đem lại trải nghiệm hoàn hảo cho quý khách hàng."

Đạt: "Tàu mất kết nối giám sát, đừng lo. Kiểm tra nguồn điện và ăng-ten trước, rồi khởi động lại thiết bị. Chưa được thì gọi 1900 23 23 49, có người hỗ trợ tận bến."

## Nối vào máy

Bộ rà `packages/marketing/src/brand-voice-check.mjs` (hàm `scanStyle`) tự bắt lỗi giọng: gạch dài, mũi tên, dấu chấm tròn giữa câu, ký hiệu thay chữ và, số sai chuẩn Việt Nam, hứa pháp lý tuyệt đối, lời hoa mỹ và khẳng định quá. Cặp với `compliance.mjs` (lo ranh giới sản phẩm). Bộ kiểm thử 20 đoạn gài lỗi ở `test-skills.mjs`, chạy `npm run test:skills`.
