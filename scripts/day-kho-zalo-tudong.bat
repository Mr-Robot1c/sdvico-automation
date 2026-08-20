@echo off
rem Ban chay tu dong cho Windows Task Scheduler 16:30 hang ngay (khong pause, ghi log).
rem Buoc 1: cho AI "xem" video moi trong Zalo\media, viet tom tat vao Zalo\AI\<ngay>.
rem Buoc 2: day toan bo file Zalo (tin nhan, insight, hop tha Hoc, nhat ky AI) len bucket.
rem Buoc 2b (them 20/8, user chot): up anh/video Zalo/media len KHO TU LIEU brand-assets,
rem          Gemini phan loai vao dung folder san pham; CHAN giay to ca nhan + screenshot.
rem Buoc 3: nap ngay vao Kho tri thuc — AI hoc khong can cho server.
cd /d "%~dp0.."
node packages\marketing\src\hoc-video.mjs >> Zalo\upload-log.txt 2>&1
node packages\marketing\src\upload-zalo-to-bucket.mjs >> Zalo\upload-log.txt 2>&1
node packages\marketing\src\up-media-kho-tu-lieu.mjs >> Zalo\upload-log.txt 2>&1
node apps\approval-ui\scripts\run-knowledge-now.mjs --only-internal >> Zalo\upload-log.txt 2>&1
