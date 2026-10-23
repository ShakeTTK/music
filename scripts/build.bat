@echo off
chcp 65001 >nul
cd /d "%~dp0.."
python "%~dp0build_local.py"
if errorlevel 1 (
    echo.
    echo 构建失败，请查看上面的提示。
    pause
    exit /b 1
)
pause
