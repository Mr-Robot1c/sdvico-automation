@echo off
REM ============================================================================
REM  SDVICO - Nen video ve duoi 50MB de tai len kho Supabase (Free tier).
REM  Cach dung: BAM DUP file .bat -> chon video muon nen -> ra file *_nen.mp4
REM  cung thu muc. Sau do tai file *_nen.mp4 len /tu-lieu.
REM
REM  Neu chan gia -> giu H.264 720p CRF 28. Nhanh, chat luong du dang bai.
REM ============================================================================
setlocal
title SDVICO Nen video
cd /d "%~dp0.."
set "NODE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"

echo.
echo [SDVICO] Chon file video can nen...
echo.

REM Mo Windows file dialog qua PowerShell de chon file
for /f "delims=" %%I in ('powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter='Video (*.mp4;*.mov;*.mkv;*.avi;*.webm)|*.mp4;*.mov;*.mkv;*.avi;*.webm|All (*.*)|*.*'; $f.Title='Chon video can nen'; if ($f.ShowDialog() -eq 'OK') { $f.FileName }"') do set "IN=%%I"

if not defined IN (
  echo Khong chon file. Thoat.
  pause
  exit /b 0
)

echo Video goc: %IN%
"%NODE%" scripts/nen-video.mjs "%IN%"
echo.
pause
