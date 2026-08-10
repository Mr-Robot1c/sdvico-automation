---
description: Sinh mô tả công việc bốn phiên bản độ dài cho bốn kênh, lưu vào hr_jobs
argument-hint: <tên vị trí hoặc thông tin vị trí; hoặc --id <hr_jobs.id> để cập nhật>
---

# Lệnh /hr-jd

Sinh mô tả công việc (JD) cho một vị trí tuyển dụng của SDVICO thành **bốn phiên bản độ dài cho bốn kênh**, rồi lưu vào bảng `hr_jobs`.

Đọc kỹ `CLAUDE.md` trước, đặc biệt **mục 1 (bối cảnh công ty)**, **mục 2 (sản phẩm và ranh giới)**, **mục 4 (giọng văn)** và **Bảy điều cấm**.

## Đầu vào

Người dùng cung cấp qua `$ARGUMENTS`:
- Tên vị trí và thông tin có được (phòng ban, nơi làm việc, mô tả ngắn, yêu cầu, quyền lợi, mức lương nếu được công bố).
- Nếu có `--id <hr_jobs.id>` thì cập nhật jd_versions cho vị trí đã có thay vì tạo mới.

Nếu thông tin quá thiếu (không rõ vị trí làm gì, yêu cầu gì), **hỏi lại người dùng**, đừng bịa (điều cấm 5).

## Bốn kênh phải sinh

Bám đúng đặc tả trong `packages/hr/src/jd/channels.js`:

1. `website` — Website tuyển dụng công ty. Bản **đầy đủ** (khoảng 400 tới 700 từ): giới thiệu ngắn về SDVICO, mô tả công việc, yêu cầu, quyền lợi, cách ứng tuyển.
2. `job_board` — Trang tuyển dụng chuyên (TopCV, VietnamWorks). Bản **chuẩn** (khoảng 250 tới 450 từ), gạch đầu dòng câu ngắn, dễ quét mắt.
3. `facebook` — Mạng xã hội. Bản **ngắn thu hút** (khoảng 80 tới 160 từ), nêu điểm hấp dẫn nhất, nơi làm việc, lời kêu gọi ứng tuyển, có thể vài hashtag ngành biển và thủy sản.
4. `zalo_sms` — Tin nhắn Zalo hoặc SMS. Bản **rất ngắn** (khoảng 20 tới 45 từ), một đoạn duy nhất.

Nếu chưa chắc bốn kênh, đọc lại `channels.js` để lấy danh sách hiện hành.

## Ràng buộc bắt buộc

- **Giọng văn (mục 4):** không gạch dài, không mũi tên, không dấu chấm tròn giữa câu, không ký hiệu thay chữ "và". Số theo chuẩn Việt Nam (3.000.000 đồng). Câu rõ ràng, không sáo rỗng, không mở đầu kiểu "trong thế giới ngày nay". Xưng hô gần gũi, thực tế.
- **Ranh giới sản phẩm (điều cấm 4):** nếu JD nhắc thiết bị của hãng (Viettel S-Tracking, Thuraya, VNPT VSS, Vishipel), mô tả đúng vai trò SDVICO là phân phối, lắp đặt, bảo hành. Không mô tả phần mềm của hãng như năng lực của SDVICO.
- **Không bịa (điều cấm 5):** không bịa mức lương, phúc lợi, số liệu, giải thưởng. Mục nào chưa có dữ kiện thì để trống hoặc ghi rõ cần bổ sung, không tự điền.
- Áp tinh thần skill `brand-voice` và `product-boundary` (khi đã có bản cài đặt thì chạy qua để soát lại).
- Liên hệ ứng tuyển mặc định: hộp thư `tuyendung@sdvico.vn`, hotline `1900 23 23 49`, trừ khi người dùng nói khác.

## Các bước

1. Đọc `CLAUDE.md` và `packages/hr/src/jd/channels.js`.
2. Làm rõ thông tin vị trí với người dùng nếu thiếu.
3. Soạn bốn phiên bản đúng độ dài từng kênh, tuân giọng văn và ranh giới sản phẩm.
4. Tự soát: đã đủ bốn kênh chưa, có lỗi giọng văn hay ranh giới sản phẩm không.
5. Ghi JSON ra file tạm rồi lưu bằng script:

```bash
node packages/hr/src/jd/save-jd.mjs < jd.json
```

   Cập nhật vị trí đã có:

```bash
node packages/hr/src/jd/save-jd.mjs --id <hr_jobs.id> < jd.json
```

6. Báo lại người dùng `job_id` và bốn bản đã sinh. **Không tự đăng tin ở đâu** (điều cấm 1). Việc đăng đi qua hàng đợi duyệt và người bấm.

## Định dạng JSON để lưu

```json
{
  "title": "Kỹ thuật viên lắp đặt thiết bị hàng hải",
  "department": "Kỹ thuật",
  "location": "Vũng Tàu",
  "short_desc": "Lắp đặt và bảo hành thiết bị giám sát hành trình, máy lọc nước cho tàu cá.",
  "requirements": "Tốt nghiệp trung cấp điện hoặc điện tử trở lên, chịu được đi công tác cảng cá.",
  "jd_versions": {
    "website": "...",
    "job_board": "...",
    "facebook": "...",
    "zalo_sms": "..."
  }
}
```
