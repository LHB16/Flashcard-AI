@echo off
title Build .NET Desktop EXE
color 0A

echo ==============================================
echo       XAY DUNG UNG DUNG WINDOWS (.NET 8 EXE)
echo ==============================================
echo.

echo Dang dọn dẹp thư mục cache...
rmdir /s /q "FlashcardAI\bin\Release" >nul 2>&1
rmdir /s /q "FlashcardAI\obj\Release" >nul 2>&1

echo Phien ban đang tải va đóng gói. Vui long doi...
dotnet publish FlashcardAI\FlashcardAI.csproj -c Release

echo.
echo ==============================================
echo Xay dung hoan tat!
echo Dang doi ten file hien tai thanh phien ban...

:: Extract version from package.json
for /f "delims=" %%i in ('node -p "require('../appAndroid/package.json').version"') do set APP_VERSION=%%i

set "PUBLISH_DIR=FlashcardAI\bin\Release\net8.0-windows\win-x64\publish"
set "OLD_EXE=%PUBLISH_DIR%\FlashcardAI.exe"
set "NEW_EXE=%PUBLISH_DIR%\FlashcardAI-DotNet-v%APP_VERSION%.exe"

if exist "%OLD_EXE%" (
    move /Y "%OLD_EXE%" "%NEW_EXE%" >nul
    echo ==============================================
    echo File da duoc tao tai:
    echo %NEW_EXE%
    echo ==============================================
) else (
    echo [LOI] Khong tim thay file EXE trong thu muc publish de doi ten!
)

echo Dang mo thu muc publish...
if exist "%PUBLISH_DIR%" (
    start "" "%PUBLISH_DIR%"
) else (
    echo Khong tim thay thu muc publish. Co the qua trinh build gap loi.
)

pause
