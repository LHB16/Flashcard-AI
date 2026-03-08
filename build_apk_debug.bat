@echo off
title Build Android APK
color 0B

echo ==============================================
echo       XAY DUNG UNG DUNG ANDROID (APK)
echo ==============================================
echo.

echo Chuyen huong vao thu muc du an...
cd /d "D:\Documents\Tool\PNGToQuizlet\androidApp\android"

echo Thiet lap bien moi truong...
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
set "ANDROID_HOME=C:\Users\luuhu\AppData\Local\Android\Sdk"

echo Dang don dep cache gradle...
call .\gradlew clean

echo Dang chay gradlew assembleDebug...
call .\gradlew assembleDebug

echo.
echo ==============================================
echo Xay dung APK hoan tat! 
echo Ban co the tim thay file APK trong thu muc: 
echo androidApp\android\app\build\outputs\apk\debug\
echo ==============================================
pause
