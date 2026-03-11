@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul

echo =========================================
echo       GitHub Release Configurator
echo =========================================

:: Đọc version hiện tại từ package.json
set "PACKAGE_JSON=D:\Documents\Tool\PNGToQuizlet\appAndroid\package.json"
set "CURRENT_VERSION="

for /f "tokens=2 delims=:," %%a in ('type "%PACKAGE_JSON%" ^| findstr /C:"\"version\""') do (
    set "CURRENT_VERSION=%%~a"
)
:: Bỏ khoảng trắng và dấu nháy kép
set "CURRENT_VERSION=%CURRENT_VERSION: =%"
set "CURRENT_VERSION=%CURRENT_VERSION:"=%"

echo [INFO] Phien ban hien tai (trong package.json): %CURRENT_VERSION%
echo.

:: Hỗ trợ chạy script tự động (dành cho AI) thông qua arguments
:: Cú pháp: release_gh.bat [type: 1|2|3] [version] "[notes]"
if not "%~1"=="" (
    set "CHOICE=%~1"
    set "NEW_VERSION=%~2"
    set "NOTES=%~3"
    if "!CHOICE!"=="1" ( set "REL_DOTNET=y" & set "REL_PYTHON=y" & set "REL_MOBILE=n" )
    if "!CHOICE!"=="2" ( set "REL_DOTNET=n" & set "REL_PYTHON=n" & set "REL_MOBILE=y" )
    if "!CHOICE!"=="3" ( set "REL_DOTNET=y" & set "REL_PYTHON=y" & set "REL_MOBILE=y" )
    echo [AI-Mode] Dang chay tu dong voi lua chon: !CHOICE!, Version: !NEW_VERSION!
    goto auto_run
)

:ask_dotnet
echo.
echo =========================================
set /p REL_DOTNET="1. Ban co muon release Desktop (.NET exe)? (y/n, hoac x de thoat): "
if /i "!REL_DOTNET!"=="x" goto end

:ask_python
echo.
set /p REL_PYTHON="2. Ban co muon release Desktop (Python lib)? (y/n, hoac x de quay lai): "
if /i "!REL_PYTHON!"=="x" goto ask_dotnet

:ask_mobile
echo.
set /p REL_MOBILE="3. Ban co muon release Mobile (.apk)? (y/n, hoac x de quay lai): "
if /i "!REL_MOBILE!"=="x" goto ask_python

:ask_version
echo.
set /p NEW_VERSION="4. Nhap version moi (vd: 1.0.5, hoac x de quay lai): "
if /i "!NEW_VERSION!"=="x" goto ask_mobile

:ask_notes
echo.
set /p NOTES="5. Nhap mo ta ban update nay (hoac x de quay lai): "
if /i "!NOTES!"=="x" goto ask_version

:auto_run
echo.

set "RELEASE_DIR=D:\Documents\Tool\PNGToQuizlet\releaseApp"
set "EXE_FILE="
set "APK_FILE="

if not exist "%RELEASE_DIR%" (
    echo [LỖI] Khong tim thay thu muc %RELEASE_DIR%
    goto end
)

set "DOTNET_EXE="
set "PYTHON_EXE="
:: Tìm file .exe mới nhất trong thư mục Publish của .NET và dist của Python
for %%f in ("D:\Documents\Tool\PNGToQuizlet\appDotNet\FlashcardAI\bin\Release\net8.0-windows\win-x64\publish\FlashcardAI-DotNet-*.exe") do (
    set "DOTNET_EXE=%%f"
)
for %%f in ("D:\Documents\Tool\PNGToQuizlet\appPython\dist\FlashcardAI-Python-*.exe") do (
    set "PYTHON_EXE=%%f"
)

:: Tìm file .apk mới nhất trong thư mục release Android
for %%f in ("D:\Documents\Tool\PNGToQuizlet\appAndroid\android\app\build\outputs\apk\release\FlashcardAI-Android-*.apk") do (
    set "APK_FILE=%%f"
)

echo =========================================
echo Đang tiến hành Release (Version: %NEW_VERSION%)
echo =========================================

set "ASSETS="
set "RELEASE_TYPES="

if /i "!REL_DOTNET!"=="y" (
    if "!DOTNET_EXE!"=="" (
        echo [CẢNH BÁO] Khong tim thay file DotNet .exe!
    ) else (
        set "ASSETS=!ASSETS! "!DOTNET_EXE!""
        set "RELEASE_TYPES=!RELEASE_TYPES! .NET"
    )
)

if /i "!REL_PYTHON!"=="y" (
    if "!PYTHON_EXE!"=="" (
        echo [CẢNH BÁO] Khong tim thay file Python .exe!
    ) else (
        set "ASSETS=!ASSETS! "!PYTHON_EXE!""
        set "RELEASE_TYPES=!RELEASE_TYPES! Python"
    )
)

if /i "!REL_MOBILE!"=="y" (
    if "!APK_FILE!"=="" (
        echo [CẢNH BÁO] Khong tim thay file .apk!
    ) else (
        set "ASSETS=!ASSETS! "!APK_FILE!""
        set "RELEASE_TYPES=!RELEASE_TYPES! Android"
    )
)

if "!ASSETS!"=="" (
    echo [LỖI] Khong co file hop le nao duoc chon de release!
    goto end
)

echo [Phat hanh] Dang phat hanh cac phien ban:!RELEASE_TYPES!
gh release create "v%NEW_VERSION%" !ASSETS! --title "Release v%NEW_VERSION%" --notes "%NOTES%"
echo Release thanh cong!

:end
:: Tự động cập nhật package.json sang version mới nếu thành công
if not "%NEW_VERSION%"=="" (
    powershell -Command "(Get-Content '%PACKAGE_JSON%') -replace '\"version\":\s*\".*\"', '\"version\": \"%NEW_VERSION%\"' | Set-Content '%PACKAGE_JSON%'"
    echo [INFO] Da cap nhat version %NEW_VERSION% vao package.json.
)

:: Chỉ dừng lại bắt người dùng bấm phim (pause) nếu chạy bằng tay
if "%~1"=="" pause
