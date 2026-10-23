@echo off
chcp 65001 >nul
cd /d "%~dp0.."
python "%~dp0build_local.py" --preview
pause
