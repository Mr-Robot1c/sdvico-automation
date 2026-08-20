@echo off
rem Day file Zalo len bucket roi NAP ngay vao Kho tri thuc cho AI hoc (khong cho server).
rem Chay tay sau moi lan doc Zalo xong, hoac bat cu luc nao muon AI hoc lieu moi.
cd /d "%~dp0.."
echo == BUOC 1: Cho AI xem video moi trong Zalo\media ==
node packages\marketing\src\hoc-video.mjs
echo == BUOC 2: Day file len bucket kho-tri-thuc-noi-bo ==
node packages\marketing\src\upload-zalo-to-bucket.mjs
echo == BUOC 2b: Up anh/video Zalo len KHO TU LIEU (phan loai + chan giay to ca nhan) ==
node packages\marketing\src\up-media-kho-tu-lieu.mjs
echo == BUOC 3: Nap vao Kho tri thuc (AI hoc ngay) ==
node apps\approval-ui\scripts\run-knowledge-now.mjs --only-internal
pause
