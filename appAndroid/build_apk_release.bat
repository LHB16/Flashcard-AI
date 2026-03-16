@echo off
title Build Android APK (RELEASE)
color 0E

echo ==============================================
echo    XAY DUNG UNG DUNG ANDROID (APK - RELEASE)
echo ==============================================
echo.

echo Thiet lap bien moi truong...
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
set "ANDROID_HOME=C:\Users\luuhu\AppData\Local\Android\Sdk"

echo.
echo [Buoc 1/3] Xoa cache Metro bundler cu...
cd /d "D:\Documents\Tool\PNGToQuizlet\appAndroid"
if exist "%TEMP%\metro-*" rd /s /q "%TEMP%\metro-*" 2>nul
if exist ".metro-cache" rd /s /q ".metro-cache" 2>nul
if exist "node_modules\.cache" rd /s /q "node_modules\.cache" 2>nul

echo.
echo [Buoc 2/2] Dang chay Gradle de bundle JS va build APK...
cd /d "D:\Documents\Tool\PNGToQuizlet\appAndroid\android"
call gradlew.bat clean
call gradlew.bat assembleRelease
if errorlevel 1 (
    echo.
    echo [LOI] Build APK that bai!
    exit /b 1
)

echo.
echo [Buoc 3/3] Dang doi ten file APK...
cd /d "D:\Documents\Tool\PNGToQuizlet\appAndroid"
for /f "delims=" %%i in ('node -p "require('./package.json').version"') do set APP_VERSION=%%i

set "OLD_APK=android\app\build\outputs\apk\release\app-release.apk"
set "NEW_APK=android\app\build\outputs\apk\release\FlashcardAI-Android-v%APP_VERSION%.apk"

if exist "%OLD_APK%" (
    move /Y "%OLD_APK%" "%NEW_APK%" >nul
    echo ==============================================
    echo Xay dung APK ^(Release^) hoan tat!
    echo File da duoc tao tai: 
    echo %NEW_APK%
    echo ==============================================
) else (
    echo [LOI] Khong tim thay file APK goc de doi ten!
)

