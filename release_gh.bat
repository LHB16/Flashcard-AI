@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul

echo =========================================
echo       GitHub Release Configurator
echo =========================================

:: Đọc version và versionCode hiện tại
set "PACKAGE_JSON=%~dp0appAndroid\package.json"
set "APP_JSON=%~dp0appAndroid\app.json"
set "BUILD_GRADLE=%~dp0appAndroid\android\app\build.gradle"

set "CURRENT_VERSION="
for /f "tokens=2 delims=:," %%a in ('type "%PACKAGE_JSON%" ^| findstr /C:"\"version\""') do (
    set "CURRENT_VERSION=%%~a"
)
set "CURRENT_VERSION=%CURRENT_VERSION: =%"
set "CURRENT_VERSION=%CURRENT_VERSION:"=%"

set "CURRENT_VC="
for /f "tokens=2" %%a in ('findstr "versionCode" "%BUILD_GRADLE%"') do set "CURRENT_VC=%%a"
set "CURRENT_VC=%CURRENT_VC: =%"

echo [INFO] Phien ban hien tai: %CURRENT_VERSION% (versionCode: %CURRENT_VC%)
echo.

:: Hỗ trợ chạy script tự động (dành cho AI) thông qua arguments
:: Cú pháp: release_gh.bat [type: 1|2|3] [version] [versionCode] "[notes]"
if not "%~1"=="" (
    set "CHOICE=%~1"
    set "NEW_VERSION=%~2"
    set "NEW_VC=%~3"
    set "NOTES=%~4"
    if "!CHOICE!"=="1" ( set "REL_DOTNET=y" & set "REL_PYTHON=y" & set "REL_MOBILE=n" )
    if "!CHOICE!"=="2" ( set "REL_DOTNET=n" & set "REL_PYTHON=n" & set "REL_MOBILE=y" )
    if "!CHOICE!"=="3" ( set "REL_DOTNET=y" & set "REL_PYTHON=y" & set "REL_MOBILE=y" )
    echo [AI-Mode] Dang chay tu dong - Version: !NEW_VERSION! (VC: !NEW_VC!)
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
set /p NEW_VERSION="4. Nhap version moi (hien tai: %CURRENT_VERSION%, hoac x de quay lai): "
if "!NEW_VERSION!"=="" set "NEW_VERSION=%CURRENT_VERSION%"
if /i "!NEW_VERSION!"=="x" goto ask_mobile

:ask_vc
echo.
set /a NEXT_VC=%CURRENT_VC%+1
set /p NEW_VC="5. Nhap versionCode moi (mac dinh: !NEXT_VC!, hoac x de quay lai): "
if "!NEW_VC!"=="" set "NEW_VC=!NEXT_VC!"
if /i "!NEW_VC!"=="x" goto ask_version

:ask_notes
echo.
set /p NOTES="6. Nhap mo ta ban update nay (hoac x de quay lai): "
if /i "!NOTES!"=="x" goto ask_vc

:auto_run
echo.

set "RELEASE_DIR=%~dp0releaseApp"
set "DOTNET_EXE="
set "PYTHON_EXE="
set "APK_FILE="

:: Tìm file mới nhất
for %%f in ("%~dp0appDotNet\FlashcardAI\bin\Release\net8.0-windows\win-x64\publish\FlashcardAI-DotNet-*.exe") do set "DOTNET_EXE=%%f"
for %%f in ("%~dp0appPython\dist\FlashcardAI-Python-*.exe") do set "PYTHON_EXE=%%f"
for %%f in ("%~dp0appAndroid\android\app\build\outputs\apk\release\FlashcardAI-Android-*.apk") do set "APK_FILE=%%f"

echo =========================================
echo Đang tiến hành Release (Version: %NEW_VERSION%, VC: %NEW_VC%)
echo =========================================

set "ASSETS="
set "RELEASE_TYPES="

if /i "!REL_DOTNET!"=="y" (
    if "!DOTNET_EXE!"=="" ( echo [CẢNH BÁO] Khong tim thay file DotNet .exe! ) else (
        set "ASSETS=!ASSETS! "!DOTNET_EXE!""
        set "RELEASE_TYPES=!RELEASE_TYPES! .NET"
    )
)
if /i "!REL_PYTHON!"=="y" (
    if "!PYTHON_EXE!"=="" ( echo [CẢNH BÁO] Khong tim thay file Python .exe! ) else (
        set "ASSETS=!ASSETS! "!PYTHON_EXE!""
        set "RELEASE_TYPES=!RELEASE_TYPES! Python"
    )
)
if /i "!REL_MOBILE!"=="y" (
    if "!APK_FILE!"=="" ( echo [CẢNH BÁO] Khong tim thay file .apk! ) else (
        set "ASSETS=!ASSETS! "!APK_FILE!""
        set "RELEASE_TYPES=!RELEASE_TYPES! Android"
    )
)

if "!ASSETS!"=="" (
    echo [LỖI] Khong co file hop le nao duoc chon de release!
    goto end
)

echo [DEBUG] Dang cap nhat phien ban vao cac file he thong...
:: Update package.json
powershell -Command "(Get-Content '%PACKAGE_JSON%') -replace '\"version\":\s*\".*\"', '\"version\": \"%NEW_VERSION%\"' | Set-Content '%PACKAGE_JSON%'"
:: Update app.json (version & versionCode)
powershell -Command "$json = Get-Content '%APP_JSON%' | ConvertFrom-Json; $json.expo.version = '%NEW_VERSION%'; $json.expo.android.versionCode = [int]%NEW_VC%; $json | ConvertTo-Json -Depth 10 | Set-Content '%APP_JSON%'"
:: Update build.gradle (versionName & versionCode)
powershell -Command "$c = Get-Content '%BUILD_GRADLE%'; $c = $c -replace 'versionName\s+\".*\"', 'versionName \"%NEW_VERSION%\"'; $c = $c -replace 'versionCode\s+\d+', 'versionCode %NEW_VC%'; $c | Set-Content '%BUILD_GRADLE%'"

echo [Phat hanh] Dang phat hanh cac phien ban:!RELEASE_TYPES!
gh release create "v%NEW_VERSION%" !ASSETS! --title "Release v%NEW_VERSION%" --notes "%NOTES%"
echo Release thanh cong!

:end
if "%~1"=="" pause
