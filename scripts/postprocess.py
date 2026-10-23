#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建后处理（模块化，每个步骤独立；任何一步失败只告警，不影响已生成的站点）

目前包含:
  1. 修复 Faircamp 2.0.1 订阅源 self 链接缺少斜杠的问题
     （https://.../homepagefeed.atom -> https://.../homepage/feed.atom）

用法:
  python scripts/postprocess.py [构建目录]
"""

import html as html_module
import json
import os
import re
import shutil
import sys
import urllib.parse
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FEED_NAMES = {"feed.atom", "feed.rss"}
SELF_LINK_PATTERN = re.compile(r"(https?://[^\"\s]+?/)([a-z0-9-]+?)(feed\.(?:atom|rss))")


def step(name):
    def decorator(fn):
        def wrapper(*args, **kwargs):
            try:
                fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001
                print(f"[警告] 后处理步骤 [{name}] 失败，已跳过: {exc}")
        return wrapper
    return decorator


@step("修复订阅源自链接")
def fix_feed_self_links(build_dir: Path) -> None:
    fixed = 0
    for path in build_dir.rglob("*"):
        if not path.is_file() or path.name not in FEED_NAMES:
            continue
        text = path.read_text(encoding="utf-8-sig")
        new_text, count = SELF_LINK_PATTERN.subn(r"\1\2/\3", text)
        if count:
            path.write_text(new_text, encoding="utf-8")
            fixed += count
    if fixed:
        print(f"  已修复 {fixed} 处订阅源自链接")


@step("清理嵌入播放器背景")
def fix_embed_background(build_dir: Path) -> None:
    injected = 0
    style = (
        '<style id="embed-background-fix">'
        "html,body{background:transparent!important}"
        "body::before{display:none!important}"
        "</style>"
    )
    for path in build_dir.rglob("index.html"):
        if not path.parent.name == "embed":
            continue
        text = path.read_text(encoding="utf-8-sig")
        if "embed-background-fix" in text:
            continue
        if "</head>" in text:
            path.write_text(text.replace("</head>", style + "</head>", 1), encoding="utf-8")
            injected += 1
    if injected:
        print(f"  已清理 {injected} 个嵌入播放器页面的背景")


def read_artist_name(repo: Path) -> str:
    manifest = repo / "site" / "Artist" / "artist.eno"
    if manifest.exists():
        match = re.search(r"^name:\s*(.+)$", manifest.read_text(encoding="utf-8-sig"), flags=re.M)
        if match:
            return match.group(1).strip()
    return "千里"


EMBED_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-hans-cn">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{title_text} · 千里的音乐小站</title>
<link rel="stylesheet" href="../../_aplayer/APlayer.min.css">
<style>
    html, body {{
        margin: 0;
        height: 100%;
        background: transparent;
    }}
    body {{
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 10px;
        box-sizing: border-box;
        font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    }}
    .embed-shell {{
        width: 100%;
        max-width: 520px;
    }}
    #embed-player.aplayer {{
        margin: 0;
        border-radius: 12px;
        background: #0d1826;
        color: #dbe9f6;
        box-shadow: 0 10px 30px hsl(0 0% 0% / 38%);
    }}
    #embed-player .aplayer-pic {{
        border-radius: 12px 0 0 12px;
    }}
    #embed-player .aplayer-info .aplayer-music .aplayer-title {{ color: #eef6ff; }}
    #embed-player .aplayer-info .aplayer-music .aplayer-author {{ color: #8fb1ca; }}
    #embed-player .aplayer-info .aplayer-controller .aplayer-bar-wrap .aplayer-bar {{ background: #24384f; }}
    #embed-player .aplayer-info .aplayer-controller .aplayer-bar-wrap .aplayer-bar .aplayer-loaded {{ background: #3b5772; }}
    #embed-player .aplayer-info .aplayer-controller .aplayer-time {{ color: #8fb1ca; }}
    #embed-player .aplayer-icon {{ fill: #dbe9f6; }}
    .embed-footer {{
        margin-top: 6px;
        text-align: right;
        font-size: 12px;
        line-height: 1.4;
    }}
    .embed-footer a {{
        color: #9ecbe8;
        text-decoration: none;
    }}
</style>
</head>
<body>
<div class="embed-shell">
    <div id="embed-player"></div>
    <div class="embed-footer"><a href="../../{slug}/" target="_blank" rel="noopener">千里的音乐小站 · 收听更多</a></div>
</div>
<script src="../../_aplayer/APlayer.min.js"></script>
<script>
(function () {{
    var audioUrl = {audio_json};
    var fallback = function () {{
        document.getElementById('embed-player').innerHTML =
            '<audio controls preload="metadata" style="width:100%" src="' + audioUrl + '"></audio>';
    }};
    try {{
        if (typeof APlayer === 'undefined') {{ fallback(); return; }}
        var player = new APlayer({{
            container: document.getElementById('embed-player'),
            audio: [{{
                name: {title_json},
                artist: {artist_json},
                url: audioUrl,
                cover: {cover_json}
            }}],
            theme: '#3b8fc4',
            loop: 'all',
            order: 'list',
            volume: 0.72,
            preload: 'metadata',
            listFolded: true,
            mutex: true
        }});
        player.on('error', fallback);
    }} catch (error) {{
        fallback();
    }}
}})();
</script>
</body>
</html>
"""


@step("升级嵌入播放器（APlayer）")
def upgrade_embed_player(build_dir: Path) -> None:
    """用 APlayer（MIT 开源播放器）替换 Faircamp 原生嵌入页。

    失败时抛异常，由 step 包装器捕获；此时原生嵌入页保持原样（故障隔离）。
    """
    repo = build_dir.parent.parent
    src = repo / "scripts" / "assets" / "aplayer"
    js_src = src / "APlayer.min.js"
    css_src = src / "APlayer.min.css"
    if not js_src.exists() or not css_src.exists():
        raise FileNotFoundError("scripts/assets/aplayer 下缺少 APlayer 文件")

    player_dir = build_dir / "_aplayer"
    player_dir.mkdir(exist_ok=True)
    shutil.copy2(js_src, player_dir / "APlayer.min.js")
    shutil.copy2(css_src, player_dir / "APlayer.min.css")

    artist = read_artist_name(repo)
    upgraded = 0

    for embed_page in build_dir.glob("*/embed/index.html"):
        track_dir = embed_page.parent.parent
        slug = track_dir.name
        key = build_dir / slug / "index.html"

        title = slug
        if key.exists():
            match = re.search(r"<title>(.*?)</title>", key.read_text(encoding="utf-8-sig"), flags=re.S)
            if match:
                title = html_module.unescape(match.group(1).strip())

        audio_files = sorted(track_dir.glob("mp3-v5/**/*.mp3")) or sorted(track_dir.glob("opus-96/**/*.opus"))
        if not audio_files:
            continue
        audio_rel = os.path.relpath(audio_files[0], embed_page.parent).replace(os.sep, "/")
        audio_url = urllib.parse.quote(audio_rel, safe="/-_.")

        covers = sorted(track_dir.glob("release_*_800.jpg")) or sorted(track_dir.glob("release_*.jpg")) or sorted(track_dir.glob("release_*.png"))
        cover_url = ""
        if covers:
            cover_rel = os.path.relpath(covers[-1], embed_page.parent).replace(os.sep, "/")
            cover_url = urllib.parse.quote(cover_rel, safe="/-_.")

        content = EMBED_TEMPLATE.format(
            title_text=html_module.escape(title),
            slug=slug,
            audio_json=json.dumps(audio_url, ensure_ascii=False),
            title_json=json.dumps(title, ensure_ascii=False),
            artist_json=json.dumps(artist, ensure_ascii=False),
            cover_json=json.dumps(cover_url, ensure_ascii=False),
        )
        embed_page.write_text(content, encoding="utf-8")
        upgraded += 1

    # 原生嵌入代码里的 iframe 高度是按原生播放条生成的，这里同步为新播放器高度
    for code_page in build_dir.glob("*/embed_codes/index.html"):
        text = code_page.read_text(encoding="utf-8-sig")
        new_text, count = re.subn(r"height:\s*49\.6px", "height: 132px", text)
        if count:
            code_page.write_text(new_text, encoding="utf-8")

    if upgraded:
        print(f"  已升级 {upgraded} 个嵌入播放器页面（APlayer）")


@step("生成播放器曲目索引")
def build_player_index(build_dir: Path) -> None:
    """把构建结果里的曲目、音频地址、封面整理成 player-index.json，供前端歌单播放器使用。"""
    repo = build_dir.parent.parent
    artist = read_artist_name(repo)
    tracks = []

    for track_dir in sorted(build_dir.iterdir()):
        if not track_dir.is_dir() or track_dir.name.startswith("."):
            continue
        if track_dir.name in {"Homepage", "Artist", "images", "_aplayer"}:
            continue
        page = track_dir / "index.html"
        if not page.exists():
            continue
        audio_files = sorted(track_dir.glob("mp3-v5/**/*.mp3")) or sorted(track_dir.glob("opus-96/**/*.opus"))
        if not audio_files:
            continue

        html_text = page.read_text(encoding="utf-8-sig")
        title_match = re.search(r"<title>(.*?)</title>", html_text, flags=re.S)
        title = html_module.unescape(title_match.group(1).strip()) if title_match else track_dir.name
        duration_match = re.search(r'data-duration="([\d.]+)"', html_text)
        duration = float(duration_match.group(1)) if duration_match else None

        audio_rel = audio_files[0].relative_to(build_dir).as_posix()
        covers = (
            sorted(track_dir.glob("release_*_800.jpg"))
            or sorted(track_dir.glob("release_*_640.jpg"))
            or sorted(track_dir.glob("release_*_320.jpg"))
        )
        cover_rel = covers[-1].relative_to(build_dir).as_posix() if covers else ""

        tracks.append(
            {
                "slug": track_dir.name,
                "title": title,
                "artist": artist,
                "url": urllib.parse.quote(audio_rel, safe="/"),
                "cover": urllib.parse.quote(cover_rel, safe="/") if cover_rel else "",
                "duration": duration,
            }
        )

    payload = {"artist": artist, "tracks": tracks}
    (build_dir / "player-index.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    if tracks:
        print(f"  已生成播放器曲目索引：{len(tracks)} 首")


def read_base_url(repo: Path) -> str:
    manifest = repo / "site" / "site.eno"
    if manifest.exists():
        match = re.search(r"^base_url:\s*(\S+)\s*$", manifest.read_text(encoding="utf-8-sig"), flags=re.M)
        if match:
            return match.group(1).rstrip("/")
    return ""


@step("M3U 播放列表兼容化（Opus -> MP3）")
def upgrade_m3u_playlists(build_dir: Path) -> None:
    """Faircamp 默认用 Opus 生成 M3U，很多播放器不支持 Opus。

    这里把 M3U 里的音频地址改为 MP3，并额外保留一份 Opus 版（playlist-opus.m3u）。
    """
    repo = build_dir.parent.parent
    base = read_base_url(repo)
    if not base:
        raise RuntimeError("未找到 site.eno 里的 base_url")

    changed = 0
    for m3u in sorted(build_dir.rglob("*.m3u")):
        original = m3u.read_text(encoding="utf-8-sig")
        lines = original.splitlines()
        output = []
        for line in lines:
            stripped = line.strip()

            if stripped.startswith("http") and "/opus-96/" in stripped:
                relative = stripped[len(base) + 1:] if stripped.startswith(base + "/") else ""
                slug = relative.split("/")[0] if relative else ""
                mp3_files = sorted((build_dir / slug).glob("mp3-v5/**/*.mp3")) if slug else []
                if mp3_files:
                    mp3_rel = mp3_files[0].relative_to(build_dir).as_posix()
                    output.append(base + "/" + urllib.parse.quote(mp3_rel, safe="/"))
                    changed += 1
                    continue

            if stripped.startswith("#EXTIMG:") and not stripped.startswith("#EXTIMG:http"):
                image = stripped[len("#EXTIMG:"):]
                playlist_dir = m3u.parent.relative_to(build_dir).as_posix()
                absolute = base + "/" + ("" if playlist_dir == "." else playlist_dir + "/") + image
                output.append("#EXTIMG:" + absolute)
                changed += 1
                continue

            output.append(line)

        if changed:
            opus_copy = m3u.with_name(m3u.stem + "-opus.m3u")
            opus_copy.write_text(original, encoding="utf-8")
            m3u.write_text("\n".join(output) + "\n", encoding="utf-8")

    if changed:
        print(f"  已把 {changed} 处 M3U 地址改为 MP3 兼容格式")


def run_all(build_dir: Path) -> None:
    steps = [
        fix_feed_self_links,
        fix_embed_background,
        upgrade_embed_player,
        build_player_index,
        upgrade_m3u_playlists,
    ]
    for fn in steps:
        fn(build_dir)


if __name__ == "__main__":
    target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "site" / ".faircamp_build"
    if not target.exists():
        print(f"[错误] 构建目录不存在: {target}")
        sys.exit(1)
    run_all(target)
