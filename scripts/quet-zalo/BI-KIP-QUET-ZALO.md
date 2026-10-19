# Bí kíp: phiên Claude quét Zalo hằng ngày cho AI Data 1 (Mac mini)

> 19/10/2026. Thay phiên đọc Zalo trên laptop Windows "zephyrus-g15" (hỏng từ 09/10: tab khác giành phiên,
> rồi Zalo Web đăng xuất 6 ngày liền). Phiên này chạy trên Mac mini của Thanh, Brave có extension Claude in Chrome.
> Lịch chạy: scheduled task "quet-zalo-data1" trong app Claude (Mac mini).

Thư mục:
- Repo: `~/Desktop/SDVICO/ZALO-Data/sdvico-automation` (gọi tắt REPO)
- Dữ liệu: `~/Desktop/SDVICO/ZALO-Data` (gọi tắt DATA): `kho/zalo-messages.jsonl` kho tổng (chỉ giữ 30 ngày, để biết mốc),
  `kho/quet/` file quét, `Zalo/` tin mới chờ đẩy bucket, `drive/` file chờ lên Drive, `nhat-ky.log`, `bao-cao/<ngày>.md`.
  Sau mỗi lần chạy, máy chỉ còn kho tổng, nhật ký và báo cáo.

## Luật cứng

1. CHỈ ĐỌC. Không gõ vào ô soạn tin, không gửi, không thả cảm xúc, không bấm tải file đính kèm của nhóm.
2. Chỉ mở các nhóm `bat: true` trong `REPO/scripts/quet-zalo/nhom-zalo.json`. Không mở tin nhắn riêng.
   Mở nhầm (tiêu đề không khớp) thì bỏ nhóm đó, ghi vào báo cáo.
3. Zalo hiện trang đăng nhập (mã QR) thì DỪNG, ghi báo cáo "CẦN THANH QUÉT QR TRÊN BRAVE MAC MINI". Không tự đăng nhập.
4. Không dán nội dung tin nhắn vào chat hay báo cáo, chỉ ghi số lượng.

## Các bước

0. Khoá phiên: nếu `DATA/kho/.lock` có mốc trong 2 giờ qua thì dừng (phiên khác đang chạy). Không thì ghi mốc ISO hiện tại vào đó.
1. Kiểm Ollama: `curl -s localhost:11434/api/tags` phải có `sdvico-gemma`. Không có thì vẫn quét, bước tóm tắt tự lùi Gemini.
2. Trình duyệt: nạp công cụ Claude in Chrome bằng một lần ToolSearch
   (`select:mcp__claude-in-chrome__select_browser,mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__tabs_close_mcp`).
   `select_browser` deviceId `e224cf66-7a15-4490-a438-c25b58df2940` (Brave Mac mini). Không được thì dừng, ghi báo cáo.
   `tabs_context_mcp` createIfEmpty, mở `https://chat.zalo.me` trong tab của phiên, chờ 6 giây, chụp màn hình.
   - Hộp "Bạn đang mở Zalo trên một Tab khác": bấm "Kích hoạt" MỘT lần (giữa hộp, phía phải, khoảng 897,430 khung 1512x806).
     Hiện lại lần nữa trong lúc quét thì dừng, ghi "có Zalo Web khác đang mở".
   - Trang đăng nhập: luật 3.
3. Mốc: `node REPO/scripts/quet-zalo/gop-zalo.mjs moc` ra JSON {tên nhóm: mốc ms}. Tối đa vét 14 ngày.
4. Nạp đoạn trích xuất: đọc nguyên văn `REPO/scripts/quet-zalo/trich-zalo.js`, chạy bằng `javascript_tool`. Sau đó
   `window.__zx` có sẵn (giữ qua các lần chuyển nhóm; mất thì nạp lại).
5. Mỗi nhóm `bat: true`:
   a. Bấm ô tìm kiếm góc trên trái (khoảng 130,40), `cmd+a`, gõ trường `tim`, chờ 3 giây, chụp màn hình,
      bấm kết quả khớp tên nhóm (thường là dòng đầu, khoảng 140,131).
   b. `window.__zx.groupName()` phải khớp `ten` (bỏ qua khác biệt khoảng trắng). Không khớp: bỏ nhóm.
   c. `await window.__zx.quetVaGiu({ cutoffTs: <mốc>, maxRounds: 80 })`. Ghi lại count và reachedCutoff.
   d. `window.__zx.nutLuu('<key>')` chèn nút xanh "Lưu kết quả quét" giữa mép trên trang, trả {x, y, vw}. Bấm nút bằng
      `computer left_click` ở toạ độ ảnh chụp (x * 1512 / vw, y * 1512 / vw) nếu ảnh chụp khung 1512 rộng (đo 19/10: vw 2316,
      nút ở 798,13). Phải là cú bấm chuột thật: Brave chặn tải khi script tự gọi taiVe. Sau 2 giây kiểm
      `ls ~/Downloads/zalo-quet-<key>-*.jsonl`. Không thấy thì bấm lại một lần; vẫn không thấy thì ghi báo cáo và dừng.
      Không cần kiểm count: nhóm 0 tin cũng lưu (file rỗng, bước gộp bỏ qua).
   e. Nhóm có nhiều kết quả tìm (vd "Sdvico Hcm" ra cả "nv-sdvico-hcm"): chụp vùng kết quả, bấm đúng dòng có tên nhóm.
      Bước b chặn mở nhầm.
6. Đóng tab Zalo của phiên (`tabs_close_mcp`), để Zalo không giành phiên với người dùng.
7. `bash REPO/scripts/quet-zalo/day-va-hoc.sh` (gộp, tạo file tin mới, đẩy bucket, Data 1 tóm tắt bằng Gemma).
8. Google Drive: bước 7 đã gọi `scripts/quet-zalo/day-len-drive.mjs`, tự đẩy `DATA/drive/zalo-*.md` lên thư mục
   "SDVICO - Lưu trữ Zalo" (riêng tư, OAuth client công ty, cần GOOGLE_CLIENT_ID/SECRET + GDRIVE_REFRESH_TOKEN trong .env)
   rồi xoá bản trên máy. Phiên KHÔNG tự đẩy qua connector (phải chép lại nội dung, dễ sai). Còn file trong DATA/drive
   thì ghi báo cáo "Drive chưa cấu hình hoặc lỗi, file chờ lần sau".
9. Báo cáo `DATA/bao-cao/<YYYY-MM-DD>.md`: giờ chạy, từng nhóm (số tin, chạm mốc hay chưa, bỏ qua vì sao), số file
   đẩy, số mẩu tri thức mới, file đã lên Drive, dòng cuối nhật ký day-va-hoc. Xoá `DATA/kho/.lock`.
   Báo cáo cũ hơn 30 ngày thì xoá.

## Giới hạn đã biết (19/10)

- Ảnh trên Zalo Web là `blob:` tạm, video chỉ có link sau khi bấm phát: phiên này chỉ ghi "[ảnh]"/"[video]" kèm mã tin,
  KHÔNG tải media cho kho tư liệu. Data 1 học chữ nên không ảnh hưởng.
- Tin "thu hồi" bị bỏ qua.
