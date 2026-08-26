@echo off
rem Goi 2 endpoint Vercel de BOSS cap nhat metrics + trong so ke hoach.
rem Task Scheduler goi file nay moi 30 phut (task "SDVICO-BossCron30m").
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
curl -sS --max-time 60  -o nul -w "rotate HTTP %%{http_code} %%{time_total}s\n"       -H "Authorization: Bearer %CRON_SECRET%" "https://sdvico-mktit.vercel.app/api/rotate"           >> "%LOG%" 2>&1
endlocal
