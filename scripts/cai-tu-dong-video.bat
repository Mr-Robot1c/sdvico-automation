@echo off
REM ============================================================================
REM  Cai dat: cho watcher dung video tu chay moi khi DANG NHAP Windows.
REM  Bam dup file nay MOT LAN de cai. (Khong can quyen admin.)
REM ============================================================================
schtasks /create /tn "SDVICO Video Watcher" /tr "\"%~dp0video-watch.bat\"" /sc onlogon /f
echo.
if %errorlevel%==0 (
  echo [OK] Da cai. Lan dang nhap Windows sau, watcher tu chay.
  echo      Muon chay NGAY bay gio: bam dup "video-watch.bat".
) else (
  echo [LOI] Cai khong duoc (ma %errorlevel%). Thu chay file nay bang quyen Admin.
)
pause
