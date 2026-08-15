@echo off
REM Go: khong cho watcher tu chay khi dang nhap Windows nua.
schtasks /delete /tn "SDVICO Video Watcher" /f
echo.
echo Da go tu dong chay (neu truoc do co cai). Watcher dang chay se van chay den khi dong cua so.
pause
