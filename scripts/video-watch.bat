@echo off
REM ============================================================================
REM  SDVICO - Watcher dung video tu dong
REM  Theo doi cac bai da bam nut "Lam video" tren web (trang Noi dung), tu dung
REM  video (FB 16:9 + TikTok doc) roi day vao Hang doi duyet. KHONG tu dang -
REM  nguoi bam Duyet moi dang (dieu cam 1).
REM  De cua so nay chay. Dong cua so = dung watcher.
REM ============================================================================
REM 30/8: logic vong lap + restart dua sang scripts/video-watch.mjs (chay chung ca Win/Mac/
REM Linux). File .bat nay chi la loi tat bam-dup cho Windows, goi vao launcher Node do.
title SDVICO Video Watcher
cd /d "%~dp0.."
set "NODE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
echo [SDVICO] Dang theo doi yeu cau "Lam video". Dong cua so nay de dung.
echo.
"%NODE%" scripts\video-watch.mjs
