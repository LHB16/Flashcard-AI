@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul

echo =========================================
echo       GitHub Release Configurator
echo =========================================

:: Đọc version hiện tại từ package.json
set "PACKAGE_JSON=D:\Documents\Tool\PNGToQuizlet\androidApp\package.json"
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
    echo [AI-Mode] Dang chay tu dong voi lua chon: !CHOICE!, Version: !NEW_VERSION!
    goto auto_run
)

echo Chon phan ban muon release:
echo 1. Update Desktop (chi up .exe)
echo 2. Update Mobile (chi up .apk)
echo 3. Update Ca Hai (.exe va .apk)
set /p CHOICE="Nhap lua chon (1/2/3): "

echo.
set /p NEW_VERSION="Nhap version moi (vd: 1.0.5): "

echo.
set /p NOTES="Nhap mo ta ban update nay: "

:auto_run
echo.

set "RELEASE_DIR=D:\Documents\Tool\PNGToQuizlet\releaseApp"
set "EXE_FILE="
set "APK_FILE="

if not exist "%RELEASE_DIR%" (
    echo [LỖI] Khong tim thay thu muc %RELEASE_DIR%
    goto end
)

:: Tìm file .exe mới nhất trong thư mục
for %%f in ("%RELEASE_DIR%\*.exe") do (
    set "EXE_FILE=%%f"
)

:: Tìm file .apk mới nhất trong thư mục
for %%f in ("%RELEASE_DIR%\*.apk") do (
    set "APK_FILE=%%f"
)

echo =========================================
echo Đang tiến hành Release (Version: %NEW_VERSION%)
echo =========================================

if "%CHOICE%"=="1" (
    if "!EXE_FILE!"=="" (
        echo [LỖI] Khong tim thay file .exe trong %RELEASE_DIR%
        goto end
    )
    echo [Desktop] Phat hanh version: desktop-v%NEW_VERSION%
    gh release create "desktop-v%NEW_VERSION%" "!EXE_FILE!" --title "Desktop App v%NEW_VERSION%" --notes "%NOTES%"
    echo Release Desktop thanh cong!
) else if "%CHOICE%"=="2" (
    if "!APK_FILE!"=="" (
        echo [LỖI] Khong tim thay file .apk trong %RELEASE_DIR%
        goto end
    )
    echo [Mobile] Phat hanh version: android-v%NEW_VERSION%
    gh release create "android-v%NEW_VERSION%" "!APK_FILE!" --title "Android App v%NEW_VERSION%" --notes "%NOTES%"
    echo Release Mobile thanh cong!
) else if "%CHOICE%"=="3" (
    if "!EXE_FILE!"=="" (
        echo [LỖI] Khong tim thay file .exe trong %RELEASE_DIR%
        goto end
    )
    if "!APK_FILE!"=="" (
        echo [LỖI] Khong tim thay file .apk trong %RELEASE_DIR%
        goto end
    )
    echo [Ca Hai] Phat hanh version: v%NEW_VERSION%
    gh release create "v%NEW_VERSION%" "!EXE_FILE!" "!APK_FILE!" --title "Release v%NEW_VERSION%" --notes "%NOTES%"
    echo Release ca hai thanh cong!
) else (
    echo [LỖI] Lựa chọn không hợp lệ! Vui lòng kiểm tra lại.
)

:end
:: Tự động cập nhật package.json sang version mới nếu thành công
if not "%NEW_VERSION%"=="" (
    powershell -Command "(Get-Content '%PACKAGE_JSON%') -replace '\"version\":\s*\".*\"', '\"version\": \"%NEW_VERSION%\"' | Set-Content '%PACKAGE_JSON%'"
    echo [INFO] Da cap nhat version %NEW_VERSION% vao package.json.
)

:: Chỉ dừng lại bắt người dùng bấm phim (pause) nếu chạy bằng tay
if "%~1"=="" pause
