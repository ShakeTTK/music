#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地构建脚本（云端 GitHub Actions 构建的备份通道）

流程:
  1) 生成内容      scripts/generate.py      —— 失败也继续（会用旧清单）
  2) Faircamp 构建 site/  ->  site/.faircamp_build/
  3) 构建后处理    scripts/postprocess.py   —— 失败只告警

用法:
  python scripts/build_local.py            # 只构建
  python scripts/build_local.py --preview  # 构建后本地预览
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
BUILD = SITE / ".faircamp_build"
CACHE = SITE / ".faircamp_cache"
SCRIPTS = ROOT / "scripts"


def find_faircamp():
    env = os.environ.get("FAIRCAMP_EXE")
    if env and Path(env).exists():
        return env
    for candidate in (
        Path(r"D:\AIMUSIC\Faircamp2\app\faircamp.exe"),
        Path(r"D:\AIMUSIC\Faircamp\faircamp.exe"),
    ):
        if candidate.exists():
            return str(candidate)
    found = shutil.which("faircamp")
    return found


def run_generate():
    print("== [1/3] 生成内容 ==")
    script = SCRIPTS / "generate.py"
    try:
        result = subprocess.run([sys.executable, str(script)], cwd=str(ROOT))
        if result.returncode != 0:
            print("== [警告] 生成阶段有错误，将继续使用上一次的清单构建 ==")
    except Exception as exc:  # noqa: BLE001
        print(f"== [警告] 生成脚本运行失败，继续使用旧清单: {exc}")


def run_build(faircamp):
    print("== [2/3] Faircamp 构建 ==")
    BUILD.mkdir(parents=True, exist_ok=True)
    cmd = [
        faircamp,
        "build",
        "--site-dir", str(SITE),
        "--build-dir", str(BUILD),
        "--cache-dir", str(CACHE),
        "--non-interactive",
    ]
    try:
        result = subprocess.run(cmd, cwd=str(SITE))
    except Exception as exc:  # noqa: BLE001
        print(f"[错误] 无法启动 Faircamp: {exc}")
        return False
    if result.returncode != 0:
        print(f"[错误] Faircamp 构建失败（退出码 {result.returncode}）")
        return False
    if not (BUILD / "index.html").exists():
        print("[错误] 构建目录里没有 index.html")
        return False
    return True


def run_postprocess():
    print("== [3/3] 构建后处理（失败不影响站点） ==")
    try:
        sys.path.insert(0, str(SCRIPTS))
        import postprocess  # noqa: WPS433 - 故意的延迟导入
        postprocess.run_all(BUILD)
    except Exception as exc:  # noqa: BLE001
        print(f"[警告] 后处理失败，已跳过: {exc}")


def run_preview():
    import http.server
    import socketserver
    import threading
    import webbrowser

    port = 8123
    print(f"== 预览地址: http://127.0.0.1:{port}/  （Ctrl+C 停止）")
    os.chdir(str(BUILD))
    handler = http.server.SimpleHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
            threading.Timer(0.8, lambda: webbrowser.open(f"http://127.0.0.1:{port}/")).start()
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\n已停止预览")
    except OSError as exc:
        print(f"[错误] 无法启动预览服务器: {exc}")


def main():
    faircamp = find_faircamp()
    if not faircamp:
        print("[错误] 找不到 Faircamp 2 程序。")
        print("       请设置环境变量 FAIRCAMP_EXE，或安装到 D:\\AIMUSIC\\Faircamp2\\app\\faircamp.exe")
        return 1
    print(f"使用 Faircamp: {faircamp}")
    run_generate()
    if not run_build(faircamp):
        return 1
    run_postprocess()
    print(f"== 构建完成: {BUILD}")
    if "--preview" in sys.argv[1:]:
        run_preview()
    return 0


if __name__ == "__main__":
    sys.exit(main())
