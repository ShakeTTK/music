param(
    [switch]$SkipBuild
)

# ============================================================
#  上传脚本：本地构建校验 -> git 提交 -> 推送
#  推送到 GitHub 后，云端 Actions 会自动构建并发布到 GitHub Pages
#  任何一步失败都会停下并给出提示，不会影响已上线的旧版本
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Write-Step($text) { Write-Host "== $text" }

# --- 1) 检查 Git 仓库 ---
if (-not (Test-Path (Join-Path $root '.git'))) {
    Write-Host "[提示] 当前目录还不是 Git 仓库。"
    Write-Host "       请先按 docs/02-部署与更新说明.md 的「首次接入」步骤完成一次初始化。"
    exit 1
}

# --- 2) 本地构建（可选跳过） ---
if (-not $SkipBuild) {
    Write-Step "本地构建校验"
    python (Join-Path $root 'scripts\build_local.py')
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 本地构建失败，已停止上传。"
        exit 1
    }
}

# --- 3) 提交 ---
Write-Step "检查改动"
git add -A
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "没有需要提交的改动。"
    exit 0
}
$staged | Select-Object -First 20 | ForEach-Object { Write-Host "  + $_" }

$message = "更新内容 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git commit -m $message
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] git commit 失败。"
    exit 1
}

# --- 4) 推送 ---
Write-Step "推送到 GitHub"
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] git push 失败。请检查网络或 GitHub 登录状态。"
    exit 1
}

Write-Host ""
Write-Host "== 已推送。GitHub Actions 会自动构建并部署，通常 1-3 分钟后生效。"
Write-Host "   查看进度: https://github.com/ShakeTTK/music/actions"
