@echo off
rem Goi endpoint Vercel mkt-metrics-pull de BOSS cap nhat metrics + trong so ke hoach + nap huong di.
rem Task Scheduler goi file nay moi gio (task "SDVICO-BossCron1h"). Tu 4/9 KHONG goi rotate nua.
rem Thay cho GitHub Actions het quota. Chu Nhat skip (user chot 26/8/2026);
rem toi CN muon chay vong hoc tuan thi bam tay: boss-cron.bat force
setlocal
if /i not "%~1"=="force" (
  powershell -NoProfile -Command "if ((Get-Date).DayOfWeek -eq 'Sunday') { exit 1 }"
  if errorlevel 1 exit /b 0
)
set SECRET_FILE=%USERPROFILE%\.sdvico-cron-secret
if not exist "%SECRET_FILE%" (echo [LOI] Thieu secret file & exit /b 1)
set /p CRON_SECRET=<"%SECRET_FILE%"
set LOG=%~dp0boss-cron.log
echo === %date% %time% === >> "%LOG%"
curl -sS --max-time 120 -o nul -w "metrics-pull HTTP %%{http_code} %%{time_total}s\n" -H "Authorization: Bearer %CRON_SECRET%" "https://sdvico-mktit.vercel.app/api/mkt-metrics-pull" >> "%LOG%" 2>&1
rem 4/9: BO goi /api/rotate o day. Sinh bai chi do 2 cron Vercel (?slot=sang 08h, ?slot=chieu 14h);
rem goi khong slot tu may nay co the sinh them bai truoc cron sang -> vuot 3 bai/ngay.
endlocal
