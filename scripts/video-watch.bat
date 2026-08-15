@echo off
REM ============================================================================
REM  SDVICO - Watcher dung video tu dong
REM  Theo doi cac bai da bam nut "Lam video" tren web (trang Noi dung), tu dung
REM  video (FB 16:9 + TikTok doc) roi day vao Hang doi duyet. KHONG tu dang -
REM  nguoi bam Duyet moi dang (dieu cam 1).
REM  De cua so nay chay. Dong cua so = dung watcher.
REM ============================================================================
title SDVICO Video Watcher
cd /d "%~dp0.."
set "NODE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
echo [SDVICO] Dang theo doi yeu cau "Lam video" (quet moi 60 giay).
echo [SDVICO] Dong cua so nay de dung.
echo.
:loop
"%NODE%" packages\marketing\src\video\build-video-all.mjs --requested --watch --interval 60
echo.
echo [SDVICO] Watcher thoat (ma %errorlevel%). Chay lai sau 10 giay... Ctrl+C de dung han.
timeout /t 10 /nobreak >nul
goto loop
