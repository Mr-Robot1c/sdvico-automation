# Plan cho Sonnet: nhịp điệu giọng đọc tự nhiên hơn (chỉ đạo sếp Long 28/9)

Người lập: Fable 5, 29/9/2026. Người thi công: Sonnet. Repo: sdvico-automation, nhánh làm việc
tách từ `origin/ngay2-marketing`, xong push `nhánh:ngay2-marketing` và `nhánh:main` (main = deploy).

## 1. Bối cảnh và yêu cầu

Sếp Long xem reel (207 views) nhắn trong nhóm 28/9: khen "cũng ok đấy" và dặn
**"chỉnh cái nhịp điệu của voice cho tự nhiên hơn"**. Giọng là VieNeu Mỹ Duyên đọc một hơi cả
video (whole-take, 17/9), màu giọng đã đồng nhất — vấn đề còn lại là NHỊP: khoảng nghỉ.

## 2. Root cause (đo thật 29/9, ffmpeg silencedetect noise=-30dB d=0.10)

Hai video mới nhất (`sdvico_cae2b6a7_doc_*.mp4` 38,6s và `sdvico_dfcdd456_doc_*.mp4` 33,7s,
bucket brand-assets):

- cae2b6a7: 28 khoảng nghỉ giữa chừng, dài **0,11 tới 0,36s**, trung vị 0,23s, KHÔNG có khoảng
  nghỉ nào quá 0,36s trong suốt video.
- dfcdd456: 26 khoảng nghỉ, 0,10 tới 0,37s, trung vị 0,21s.

Người đọc thật nghỉ ~0,15-0,25s ở dấu phẩy, **0,4-0,6s cuối câu, 0,6-0,9s khi chuyển ý** —
video của mình mọi khoảng nghỉ bị ép phẳng về ~0,22s, cứ ~1,4 giây một nhịp đều tăm tắp,
nghe dồn dập không chỗ thở. Hai thủ phạm trong `packages/marketing/src/video/`:

1. **tidy.py nén MỌI khoảng lặng nội bộ > 0,25s xuống đúng 0,25s** (`--maxgap` mặc định 0.25,
   thêm 10/9 để trị bug VieNeu "ngất" 1,6s giữa câu). Trị được bug nhưng giết luôn khoảng nghỉ
   cuối câu tự nhiên VieNeu vốn tạo ra (0,3-0,8s). Sau atempo 1.12 còn ~0,22s.
2. **Đệm cuối cảnh (padSecOf trong build-video.mjs) chỉ 0,16s** (0,26s cho câu !/?) — chuyển
   cảnh = chuyển ý mà nghỉ ngắn hơn cả dấu phẩy của người thật.

## 3. Thiết kế fix — CHỈ ĐỤNG KHOẢNG NGHỈ, TUYỆT ĐỐI KHÔNG ĐỤNG CAO ĐỘ/TỐC ĐỘ

Lịch sử phải tôn trọng (đừng lặp lại lỗi cũ):
- 10/9 Thanh chê "mỗi clip một tone" → ĐÃ BỎ lên xuống cao độ theo câu. 10/9 (2) Thanh chê
  "nhanh chậm nhanh chậm" → ĐÃ BỎ đổi tốc độ theo câu. **KHÔNG thêm lại bất kỳ per-sentence
  pitch/tempo nào.** Tempo chung giữ nguyên TTS_TEMPO 1.12 (sếp chốt 5/9).
- 10/9 (3) "tạch tạch tạch": silenceremove của ffmpeg đóng gói (bản 2018) băm sóng → mọi việc
  cắt lặng chỉ làm trong tidy.py (numpy). **KHÔNG thêm silenceremove ffmpeg.**
- 18/9 "khựng 1 nhịp, phụ đề không kịp giọng": đệm cuối khúc phải đi qua `padSecOf` (export)
  vì assemble/srt trừ đúng phần đệm khỏi quỹ thời gian phụ đề. **Đổi GIÁ TRỊ trong padSecOf
  thì hợp đồng này tự khớp; không tạo đường đệm riêng.**

### Việc 1 — tidy.py: nới trần nén lặng nội bộ 0,25 → 0,55s, chỉnh ở CALL SITE

`build-video.mjs` hàm `tidyWav` (~dòng 342) đang gọi `python('tidy.py', [wav, out])` không
truyền `--maxgap`. Sửa thành:

```js
const maxgap = Number(process.env.TTS_PAUSE_MAXGAP || 0.55) || 0.55;
const res = await python('tidy.py', [wav, out, '--maxgap', String(maxgap)]);
```

Kèm comment ngắn: 29/9 sếp Long "chỉnh nhịp điệu voice tự nhiên hơn" — trần 0,25 (bug ngất 1,6s
10/9) ép phẳng mọi khoảng nghỉ cuối câu về 0,22s; 0,55 giữ được nghỉ cuối câu 0,3-0,55s của
VieNeu mà lặng 1,6s vẫn bị nén còn 0,55 (~0,49s sau tempo). tidy.py KHÔNG sửa (default 0.25
giữ cho chỗ khác nếu có ai gọi tay).

### Việc 2 — padSecOf: đệm cuối cảnh 0,16/0,26 → 0,30/0,42

`build-video.mjs` (~dòng 128):

```js
// Trước
export function padSecOf(sentence) {
  return /[!?]$/.test(String(sentence || '').trim()) ? 0.26 : 0.16;
}
// Sau (29/9, sếp Long "nhịp điệu tự nhiên hơn": chuyển cảnh = chuyển ý, người thật nghỉ 0,3-0,5s;
// câu hỏi/cảm cho khán giả nửa giây ngấm)
export function padSecOf(sentence) {
  return /[!?]$/.test(String(sentence || '').trim()) ? 0.42 : 0.30;
}
```

Ghi chú kỹ thuật đã kiểm: chuỗi filter là `livelyFilter,sentenceGap` — atempo chạy TRƯỚC apad
nên đệm KHÔNG bị co 12%. apad dùng pad_len theo mẫu (48000/s) vì ffmpeg đóng gói chưa có
pad_dur — `sentenceGap` tự tính từ padSecOf, không phải đổi gì thêm.

### Việc 3 — test

- `packages/marketing/src/test-video-rules.mjs` (chạy `npm run test:video` Ở GỐC REPO): tìm chỗ
  test padSecOf nếu có thì cập nhật mốc 0,30/0,42; chưa có thì thêm 3 ca: câu thường 0.30,
  câu `?` 0.42, câu `!` 0.42.
- Kiểm tidy.py bằng wav tổng hợp (không cần VieNeu): sinh wav 48kHz có 3 đoạn tone 440Hz xen
  3 khoảng lặng 0,20s / 0,50s / 1,60s (dùng ffmpeg đóng gói `@ffmpeg-installer/ffmpeg` qua
  `packages/marketing/src/video/ffmpeg.mjs`, filter aevalsrc hoặc concat anullsrc+sine), chạy
  `python tidy.py in.wav out.wav --maxgap 0.55`, rồi silencedetect đo out.wav: lặng 0,20 và
  0,50 GIỮ NGUYÊN (±0,05), lặng 1,60 còn ~0,55 (±0,08). Viết thành script kiểm 1 lần trong
  scratchpad là đủ, KHÔNG cần commit script này; dán số đo vào commit message.
  (python + numpy có sẵn trên máy — tidy.py vẫn chạy hằng ngày trong pipeline.)

## 4. Ràng buộc repo

- Node PATH: PowerShell cần `$env:Path = "C:\Program Files\nodejs;$env:Path"` nếu node không thấy.
- Worktree không có node_modules: tạo junction từ checkout chính
  (`cmd /c mklink /J node_modules "C:\Users\ADMIN\Desktop\SDVICO Marketing\node_modules"`), XÓA junction trước khi xong.
- Commit dạng `fix(video): ...`, KHÔNG commit .env/khóa; đồng bộ cả `ngay2-marketing` lẫn `main`.
- Hook app-map sẽ chặn commit: thêm entry `<!-- re-verified: 2026-09-29 (2) - NHIP DIEU VOICE ... -->`
  lên ĐẦU khối re-verified của `docs/app-map/marketing.md` (ngay dưới dòng `covers:`), bump
  `last_verified:` nếu cũ hơn, và thêm dòng `re-verify(docs/app-map/marketing.md): <tóm tắt>` vào commit message.

## 5. Điều kiện dừng (dừng và báo, không tự chế)

- tidy.py không nhận `--maxgap` từ call site (lỗi arg) → dừng, báo.
- Đo wav tổng hợp thấy khoảng lặng 0,50s bị nén hoặc xuất hiện tiếng tạch (số `cuts` tidy.py
  in ra tăng bất thường so với chạy cùng file với maxgap 0.25) → dừng, báo.
- Bất kỳ thay đổi nào kéo theo phải sửa cao độ/tốc độ → dừng, báo (ngoài phạm vi).

## 6. Definition of Done

1. 2 file sửa: `packages/marketing/src/video/build-video.mjs` (tidyWav + padSecOf), test.
2. `npm run test:video` xanh toàn bộ (hiện 143, sẽ ≥ 143), `npm run test:scene` xanh (không đụng nhưng chạy cho chắc).
3. Kiểm wav tổng hợp đạt như Việc 3, số đo ghi trong commit message.
4. Push `ngay2-marketing` + `main`. KHÔNG cần dựng video thật — lượt cron 5h/13h VN hôm sau
   sẽ dựng bằng code mới; người lập plan sẽ đo lại phân bố khoảng nghỉ video mới (kỳ vọng:
   xuất hiện khoảng nghỉ 0,3-0,55s ở cuối câu/chuyển cảnh, trung vị tăng từ ~0,22 lên ~0,25-0,30,
   max ≥ 0,40s; video dài thêm ~2-3s là đúng dự kiến).
