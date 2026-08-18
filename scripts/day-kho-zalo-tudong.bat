@echo off
rem Ban chay tu dong cho Windows Task Scheduler (khong pause). Task: SDVICO-DayKhoZalo, 16:30 hang ngay.
rem 1) Day file trong folder Zalo len bucket kho-tri-thuc-noi-bo (sau phien Cowork doc Zalo 16:00).
rem    upload-zalo-to-bucket tu bo qua tai lieu huong dan, va tao ban co ngay khi noi dung doi.
rem 2) Cho AI Data 1 hoc NGAY (import bucket -> mkt_knowledge_internal), khong doi cron toi.
cd /d "%~dp0.."
echo ===== %date% %time% ===== >> Zalo\upload-log.txt
node packages\marketing\src\upload-zalo-to-bucket.mjs >> Zalo\upload-log.txt 2>&1
node apps\approval-ui\scripts\run-knowledge-now.mjs --only-internal >> Zalo\upload-log.txt 2>&1
