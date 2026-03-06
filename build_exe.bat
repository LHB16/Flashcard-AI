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
echo Xay dung hoan tat! File .exe nam trong thu muc dist
echo ==============================================
echo Dang mo thu muc dist...
if exist "dist" (
    start dist
) else (
    echo Khong tim thay thu muc dist. Co the qua trinh build gap loi.
)

pause
