@echo off
title Build Desktop EXE
color 0A

echo ==============================================
echo       XAY DUNG UNG DUNG WINDOWS (EXE)
echo ==============================================
echo.
echo Kiem tra va cai dat PyInstaller...
pip install pyinstaller >nul 2>&1

echo Dang tien hanh dong goi. Vui long doi vai phut...
:: --onefile: Gom moi thu thanh 1 file cha duy nhat
:: --windowed: An man hinh console den
:: --name: Ten file chiec xh
pyinstaller --noconfirm --onefile --windowed --name "FlashcardAI" app.py

echo.
echo ==============================================
echo Xay dung hoan tat!
echo Dang doi ten file hien tai thanh phien ban...

:: Extract version from package.json
for /f "delims=" %%i in ('node -p "require('./androidApp/package.json').version"') do set APP_VERSION=%%i

set "OLD_EXE=dist\FlashcardAI.exe"
set "NEW_EXE=dist\FlashcardAI-v%APP_VERSION%.exe"

if exist "%OLD_EXE%" (
    move /Y "%OLD_EXE%" "%NEW_EXE%" >nul
    echo ==============================================
    echo File da duoc tao tai:
    echo %NEW_EXE%
    echo ==============================================
) else (
    echo [LOI] Khong tim thay file EXE trong thu muc dist de doi ten!
)

echo Dang mo thu muc dist...
if exist "dist" (
    start dist
) else (
    echo Khong tim thay thu muc dist. Co the qua trinh build gap loi.
)

pause
