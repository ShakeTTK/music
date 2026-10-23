#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
content/  ->  site/  生成脚本（模块化 / 容错版）

设计原则:
  1. 每个内容模块（发行日期、歌词、创作说明、封面描述、下载链接、关于页、
     艺术家信息、背景图、自定义封面）都是独立函数，互不依赖。
  2. 任何一个模块出错，只记录警告并使用空值/默认值，不会中断整体构建。
  3. 只有核心步骤（写入 site/site.eno）失败才会退出，因为站点没有它无法构建。
  4. 生成结束后写 logs/generate-report.txt，列出所有警告与模块状态。

用法:
    python scripts/generate.py            # 宽松模式（默认）：能生成多少生成多少
    python scripts/generate.py --strict   # 严格模式：有任何警告就返回非零退出码
"""

import json
import os
import re
import shutil
import subprocess
import sys
import traceback
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
CONTENT = ROOT / "content"
ASSETS_SRC = ROOT / "scripts" / "assets"
LOGS = ROOT / "logs"

AUDIO_EXTS = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".opus", ".aiff", ".aif"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
RESERVED_DIRS = {"Homepage", "Artist", "images", "assets"}

REPORT = {"started": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "warnings": [], "errors": [], "modules": []}


# --------------------------------------------------------------------------
# 报告与容错
# --------------------------------------------------------------------------
def log(msg: str) -> None:
    print(f"[生成] {msg}")


def warn(msg: str) -> None:
    REPORT["warnings"].append(msg)
    print(f"[警告] {msg}")


def error(msg: str) -> None:
    REPORT["errors"].append(msg)
    print(f"[错误] {msg}")


def run_module(name: str, fn, fallback=None, required: bool = False):
    """运行一个独立模块；失败时返回 fallback，绝不中断整体流程。"""
    try:
        value = fn()
        REPORT["modules"].append({"name": name, "status": "ok"})
        return value
    except Exception as exc:  # noqa: BLE001 - 故意兜底所有异常
        REPORT["modules"].append({"name": name, "status": "failed", "detail": str(exc)})
        if required:
            error(f"模块 [{name}] 失败: {exc}")
            traceback.print_exc()
        else:
            warn(f"模块 [{name}] 失败，已跳过: {exc}")
        return fallback


def truthy(value) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on", "enabled"}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig") if path.exists() else ""


def strip_html_comments(text: str) -> str:
    return re.sub(r"<!--.*?-->", "", text, flags=re.S).strip()


def slug_from_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "track"


def parse_kv_lines(path: Path):
    """解析 key = value 文本；忽略空行/# 注释；同 key 可多行。"""
    result = {}
    if not path.exists():
        return result
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            warn(f"{path.name}: 忽略无法解析的行: {line}")
            continue
        key, value = line.split("=", 1)
        result.setdefault(key.strip(), []).append(value.strip())
    return result


# --------------------------------------------------------------------------
# 配置
# --------------------------------------------------------------------------
def load_config():
    cfg = {
        "site": {"title": "千里的音乐小站", "language": "zh-hans-cn", "base_url": "https://shakettk.github.io/music/"},
        "artist": {"name": "千里", "permalink": "qianli", "synopsis": "千里的音乐小站，一些自己的音乐。"},
        "theme": {"mode": "dark"},
        "water": {"enabled": "true", "strength": "1.2", "opacity": "0.55"},
        "comments": {
            "enabled": "true",
            "repo": "ShakeTTK/music",
            "repo_id": "",
            "category": "Comments",
            "category_id": "",
        },
        "analytics": {"enabled": "false", "provider": "cloudflare", "token": ""},
        "embed": {"enabled": "true"},
        "brand": {"logo": "1"},
    }
    path = CONTENT / "config.ini"
    if not path.exists():
        warn("content/config.ini 不存在，使用默认配置")
        return cfg

    section = None
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^\[(.+)\]$", line)
        if m:
            section = m.group(1).strip()
            cfg.setdefault(section, {})
            continue
        if "=" in line and section:
            key, value = line.split("=", 1)
            cfg[section][key.strip()] = value.strip()
        elif line:
            warn(f"config.ini: 忽略无法解析的行: {line}")

    mode = cfg["theme"].get("mode", "dark").lower()
    if mode not in {"dark", "light", "adaptive"}:
        warn(f"theme.mode={mode} 无效，回退为 dark")
        mode = "dark"
    cfg["theme"]["mode"] = mode
    if not cfg["site"].get("base_url"):
        warn("site.base_url 为空：分享卡片/订阅源将不会生成")

    # 敏感配置可放在 GitHub Actions Secret 里，通过环境变量注入，不写进公开仓库
    env_token = os.environ.get("SITE_ANALYTICS_TOKEN")
    if env_token:
        cfg["analytics"]["token"] = env_token
        log("已从环境变量 SITE_ANALYTICS_TOKEN 读取统计 token（不会写入仓库）")
    return cfg


# --------------------------------------------------------------------------
# 各内容模块（互相独立）
# --------------------------------------------------------------------------
def load_releases():
    raw = parse_kv_lines(CONTENT / "releases.txt")
    result = {}
    for key, values in raw.items():
        value = values[-1].strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", value):
            warn(f"releases.txt: 日期格式无效，已忽略: {key} = {value}")
            continue
        result[key] = value
    return result


def load_cover_descriptions():
    return {k: v[-1] for k, v in parse_kv_lines(CONTENT / "cover-descriptions.txt").items()}


def load_downloads():
    raw = parse_kv_lines(CONTENT / "downloads.txt")
    result = {}
    for key, values in raw.items():
        links = []
        for value in values:
            m = re.search(r"https?://\S+", value)
            if not m:
                warn(f"downloads.txt: 缺少 http(s) 链接，已忽略: {key} = {value}")
                continue
            url = m.group(0)
            label = (value[: m.start()] + value[m.end():]).strip() or "下载"
            links.append((label, url))
        if links:
            result[key] = links
    return result


def load_artist():
    artist_dir = CONTENT / "artist"
    bio = strip_html_comments(read_text(artist_dir / "bio.md"))
    avatar = None
    if artist_dir.exists():
        for f in sorted(artist_dir.iterdir()):
            if f.is_file() and f.suffix.lower() in IMAGE_EXTS:
                avatar = f
                break
    links = []
    links_file = artist_dir / "links.txt"
    if links_file.exists():
        for raw in links_file.read_text(encoding="utf-8-sig").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            m = re.search(r"https?://\S+", line)
            if not m:
                warn(f"artist/links.txt: 缺少链接，已忽略: {line}")
                continue
            url = m.group(0)
            label = (line[: m.start()] + line[m.end():]).strip(" :-=") or url
            links.append((label, url))
    return {"bio": bio, "avatar": avatar, "links": links}


def load_pages():
    pages = {}
    for key, title in (
        ("about", "关于"),
        ("contact", "联系方式"),
        ("license", "版权与授权"),
        ("support", "支持作者"),
    ):
        try:
            text = strip_html_comments(read_text(CONTENT / "pages" / f"{key}.md"))
            if text:
                pages[key] = (title, text)
        except Exception as exc:  # noqa: BLE001
            warn(f"读取 pages/{key}.md 失败，已跳过: {exc}")
    return pages


def load_backgrounds():
    bg = {}
    for key in ("dark", "light", "home"):
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            f = CONTENT / "backgrounds" / f"{key}{ext}"
            if f.exists():
                bg[key] = f
                break
        if key not in bg and (CONTENT / "backgrounds" / key).exists():
            warn(f"backgrounds/{key} 是目录或无扩展名文件，已忽略")
    return bg


def load_cover_overrides():
    covers = {}
    cover_dir = CONTENT / "covers"
    if cover_dir.exists():
        for f in sorted(cover_dir.iterdir()):
            if f.is_file() and f.suffix.lower() in IMAGE_EXTS:
                covers[f.stem.lower()] = f
    return covers


def copy_file(src: Path, dst: Path, label: str) -> bool:
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return True
    except Exception as exc:  # noqa: BLE001
        warn(f"{label} 复制失败: {exc}")
        return False


def discover_tracks():
    tracks = []
    for d in sorted(SITE.iterdir()):
        if not d.is_dir() or d.name in RESERVED_DIRS or d.name.startswith("."):
            continue
        try:
            has_audio = any(f.is_file() and f.suffix.lower() in AUDIO_EXTS for f in d.iterdir())
        except Exception as exc:  # noqa: BLE001
            warn(f"读取作品目录 {d.name} 失败，已跳过: {exc}")
            continue
        if has_audio:
            tracks.append({"dir": d, "name": d.name, "slug": existing_permalink(d) or slug_from_name(d.name)})
    return tracks


def existing_permalink(track_dir: Path) -> str:
    try:
        m = re.search(r"^permalink:\s*(\S+)\s*$", read_text(track_dir / "track.eno"), flags=re.M)
        return m.group(1) if m else ""
    except Exception:  # noqa: BLE001
        return ""


def write_track_manifest(track, releases, descriptions, downloads, artist_name):
    """单个作品失败不影响其它作品。"""
    try:
        lines = [
            f"title: {track['name']}",
            f"permalink: {track['slug']}",
            "",
            "artists:",
            f"- {artist_name}",
        ]

        released = releases.get(track["slug"]) or releases.get(track["name"])
        if released:
            lines.append(f"released: {released}")

        description = descriptions.get(track["slug"]) or descriptions.get(track["name"])
        if not description:
            description = f"《{track['name']}》的封面图"
        lines.append(f"cover_description: {description}")

        links = downloads.get(track["slug"]) or downloads.get(track["name"])
        if links:
            lines += ["", "download_access: external", "download_links:"]
            for label, url in links:
                lines.append(f"- {label} {url}")

        lyrics = strip_html_comments(read_text(CONTENT / "lyrics" / f"{track['slug']}.md"))
        notes = strip_html_comments(read_text(CONTENT / "notes" / f"{track['slug']}.md"))
        sections = []
        if lyrics:
            sections.append(f"## 歌词\n\n{lyrics}")
        if notes:
            sections.append(f"## 创作说明\n\n{notes}")
        if sections:
            label = "歌词与创作说明" if lyrics and notes else ("歌词" if lyrics else "创作说明")
            lines += ["", f"more_label: {label}", "", "-- more", "\n\n".join(sections), "-- more"]

        (track["dir"] / "track.eno").write_text("\n".join(lines) + "\n", encoding="utf-8")
        return True
    except Exception as exc:  # noqa: BLE001
        warn(f"作品 {track['name']} 的 track.eno 生成失败，已跳过: {exc}")
        return False


def remove_other_images(folder: Path, keep: Path) -> None:
    try:
        for f in folder.iterdir():
            if f.is_file() and f.suffix.lower() in IMAGE_EXTS and f.resolve() != keep.resolve():
                f.unlink()
    except Exception as exc:  # noqa: BLE001
        warn(f"清理旧封面失败: {exc}")


def apply_cover_override(track, override) -> None:
    try:
        dst = track["dir"] / f"cover{override.suffix.lower()}"
        if copy_file(override, dst, f"封面 {track['name']}"):
            remove_other_images(track["dir"], dst)
    except Exception as exc:  # noqa: BLE001
        warn(f"应用封面 {track['name']} 失败: {exc}")


def write_artist_manifest(artist_cfg, artist_data):
    artist_dir = SITE / "Artist"
    artist_dir.mkdir(exist_ok=True)
    avatar_name = None
    if artist_data["avatar"]:
        avatar_name = f"avatar{artist_data['avatar'].suffix.lower()}"
        if copy_file(artist_data["avatar"], artist_dir / avatar_name, "艺术家头像"):
            remove_other_images(artist_dir, artist_dir / avatar_name)

    lines = [
        f"name: {artist_cfg['name']}",
        f"permalink: {artist_cfg['permalink']}",
        "",
        "-- synopsis",
        artist_cfg.get("synopsis") or f"{artist_cfg['name']}的音乐小站。",
        "-- synopsis",
    ]
    if avatar_name:
        lines += ["", f"image: {avatar_name}", "image_description: 艺术家的头像或照片"]
    if artist_data["bio"]:
        lines += ["", "more_label: 简介", "", "-- more", artist_data["bio"], "-- more"]
    if artist_data["links"]:
        lines += ["", "links:"]
        for label, url in artist_data["links"]:
            lines.append(f"- {label} {url}")
    (artist_dir / "artist.eno").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_catalog_manifest(site_cfg, pages, home_image_name, artist_links):
    homepage_dir = SITE / "Homepage"
    homepage_dir.mkdir(exist_ok=True)

    image = f"../images/{home_image_name}" if home_image_name else "../images/2.png"
    lines = ["links:", "- gitpage https://github.com/ShakeTTK/music"]
    for label, url in artist_links:
        lines.append(f"- {label} {url}")
    lines += [
        f"title: \"{site_cfg['title']}\"",
        "",
        f"image: {image}",
        "image_description: 站点首页图片",
        "",
        "-- synopsis",
        "一些自己的音乐，欢迎收听",
        "-- synopsis",
        "",
        "m3u: enabled",
        "",
        "permalink: homepage",
    ]
    sections = [f"## {title}\n\n{text}" for _, (title, text) in pages.items()]
    if sections:
        lines += ["", "more_label: 关于", "", "-- more", "\n\n".join(sections), "-- more"]
    (homepage_dir / "catalog.eno").write_text("\n".join(lines) + "\n", encoding="utf-8")


def prepare_assets():
    """把 scripts/assets 下存在的文件复制到站点根目录；缺失的功能自动降级。"""
    copied = []
    wanted = [
        ("custom.css", "custom.css", "css", '<link href="{{custom.css}}" rel="stylesheet">'),
        ("ripples/jquery.min.js", "jquery.min.js", "js", '<script src="{{jquery.min.js}}" defer></script>'),
        ("ripples/jquery.ripples.min.js", "jquery.ripples.min.js", "js", '<script src="{{jquery.ripples.min.js}}" defer></script>'),
        ("water.js", "water.js", "js", '<script src="{{water.js}}" defer></script>'),
        ("comments.js", "comments.js", "js", '<script src="{{comments.js}}" defer></script>'),
        ("analytics.js", "analytics.js", "js", '<script src="{{analytics.js}}" defer></script>'),
    ]
    css_tags, js_tags = [], []
    if not ASSETS_SRC.exists():
        warn("scripts/assets 不存在，站点将不带自定义样式和交互")
        return copied, css_tags, js_tags
    for src_rel, dest_name, kind, tag in wanted:
        src = ASSETS_SRC / src_rel
        if not src.exists():
            warn(f"scripts/assets/{src_rel} 不存在，对应功能已禁用")
            continue
        try:
            shutil.copy2(src, SITE / dest_name)
            copied.append(dest_name)
            (css_tags if kind == "css" else js_tags).append(tag)
        except Exception as exc:  # noqa: BLE001
            warn(f"复制 {dest_name} 失败，对应功能已禁用: {exc}")
    return copied, css_tags, js_tags


def find_ffmpeg():
    env = os.environ.get("FFMPEG_EXE")
    if env and Path(env).exists():
        return env
    for candidate in (
        Path(r"D:\AIMUSIC\Faircamp2\app\ffmpeg.exe"),
        Path(r"D:\AIMUSIC\Faircamp\ffmpeg.exe"),
    ):
        if candidate.exists():
            return str(candidate)
    return shutil.which("ffmpeg")


def prepare_water_bg(src: Path):
    """水波效果用的背景图：缩放压缩为 jpg，避免把 4MB+ 原图直接放进站点。"""
    dst = SITE / "water-bg.jpg"
    ffmpeg = find_ffmpeg()
    if ffmpeg:
        try:
            subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-vf", "scale=1920:-2", "-q:v", "3", str(dst)],
                check=True,
                timeout=180,
            )
            return "water-bg.jpg"
        except Exception as exc:  # noqa: BLE001
            warn(f"水波背景图压缩失败，尝试直接复制: {exc}")
    if copy_file(src, SITE / f"water-bg{src.suffix.lower()}", "水波背景图"):
        return f"water-bg{src.suffix.lower()}"
    return None


def write_site_config_js(cfg):
    """把前端运行时配置写成独立的 site-config.js，避免和 Faircamp 的 {{...}} 语法冲突。"""
    runtime = {
        "water": cfg["water"],
        "comments": cfg["comments"],
        "analytics": cfg["analytics"],
    }
    content = "window.__SITE_CONFIG__ = " + json.dumps(runtime, ensure_ascii=False) + ";\n"
    (SITE / "site-config.js").write_text(content, encoding="utf-8")
    return "site-config.js"


def install_logo(cfg):
    """按 content/config.ini 的 [brand] logo 选项，把选定的 LOGO 安装为网站图标。"""
    number = str(cfg.get("brand", {}).get("logo", "1")).strip() or "1"
    candidates = sorted((ROOT / "docs" / "logo-proposals").glob(f"logo-{number}-*.svg"))
    if not candidates:
        warn(f"未找到第 {number} 版 LOGO（docs/logo-proposals/），回退使用第 1 版")
        candidates = sorted((ROOT / "docs" / "logo-proposals").glob("logo-1-*.svg"))
    if not candidates:
        warn("docs/logo-proposals/ 下没有 LOGO 文件，保留默认图标")
        return None
    if copy_file(candidates[0], SITE / "logo.svg", "站点 LOGO"):
        return "logo.svg"
    return None


def write_site_manifest(cfg, asset_files, css_tags, js_tags, has_config_js, logo_file=None, water_bg_file=None):
    mode = cfg["theme"]["mode"]
    dark_bg = cfg.get("dark_background_rel") or "images/1.png"
    lines = [
        f"title: \"{cfg['site']['title']}\"",
        "",
        f"language: {cfg['site']['language']}",
        "",
        f"base_url: {cfg['site']['base_url']}",
        "",
        "clean_urls",
        "",
        f"*.theme.mode: {mode}",
        "",
        "*.theme.dark:",
        "background_alpha = 30",
        f"background_image = {dark_bg}",
        "accent_hue = 210",
        "accent_chroma = 60",
        "accent_brightening = 70",
        "base_hue = 0",
        "base_chroma = 0",
    ]
    if mode == "adaptive" and cfg.get("light_background_rel"):
        lines += ["", "*.theme.light:", "background_alpha = 12", f"background_image = {cfg['light_background_rel']}"]
    lines += ["", "*.theme.round_corners: enabled", ""]
    if logo_file:
        lines += ["disable_favicon", ""]
    if truthy(cfg["embed"]["enabled"]):
        lines += ["*.embedding: enabled", ""]
    lines += ["track.download_access: disabled", ""]

    if asset_files:
        lines += ["assets:"] + [f"- {a}" for a in asset_files] + [""]

    metadata_tags = list(css_tags)
    if logo_file:
        metadata_tags.insert(0, '<link href="{{logo.svg}}" rel="icon" type="image/svg+xml">')
    if water_bg_file:
        metadata_tags.append('<meta name="water-bg" content="{{' + water_bg_file + '}}">')
    if has_config_js:
        metadata_tags.append('<script src="{{site-config.js}}" defer></script>')
    metadata_tags += js_tags
    lines += ["-- metadata"] + metadata_tags + ["-- metadata"]
    (SITE / "site.eno").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_report():
    try:
        LOGS.mkdir(exist_ok=True)
        path = LOGS / "generate-report.txt"
        lines = [
            f"生成时间: {REPORT['started']}",
            f"警告: {len(REPORT['warnings'])} / 错误: {len(REPORT['errors'])}",
            "",
            "== 模块状态 ==",
        ]
        for m in REPORT["modules"]:
            detail = f" — {m['detail']}" if m.get("detail") else ""
            lines.append(f"- {m['name']}: {m['status']}{detail}")
        if REPORT["warnings"]:
            lines += ["", "== 警告 =="] + [f"- {w}" for w in REPORT["warnings"]]
        if REPORT["errors"]:
            lines += ["", "== 错误 =="] + [f"- {e}" for e in REPORT["errors"]]
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------
def main():
    strict = "--strict" in sys.argv[1:]
    log("开始生成（模块化容错模式） ...")

    config = run_module("配置 config.ini", load_config, fallback=None, required=True)

    releases = run_module("发行日期", load_releases, fallback={})
    descriptions = run_module("封面描述", load_cover_descriptions, fallback={})
    downloads = run_module("下载链接", load_downloads, fallback={})
    artist = run_module("艺术家资料", load_artist, fallback={"bio": "", "avatar": None, "links": []})
    pages = run_module("关于类页面", load_pages, fallback={})
    backgrounds = run_module("背景图", load_backgrounds, fallback={})
    cover_overrides = run_module("自定义封面", load_cover_overrides, fallback={})
    tracks = run_module("作品目录扫描", discover_tracks, fallback=[])

    # 背景图（失败也不影响构建）
    dark_rel = light_rel = home_name = ""
    for key, target in (("dark", "background-dark"), ("light", "background-light"), ("home", "home")):
        src = backgrounds.get(key) if backgrounds else None
        if not src:
            continue
        ext = src.suffix.lower()
        if not copy_file(src, SITE / "images" / f"{target}{ext}", f"背景图 {key}"):
            continue
        if key == "dark":
            dark_rel = f"images/{target}{ext}"
        elif key == "light":
            light_rel = f"images/{target}{ext}"
        else:
            home_name = f"{target}{ext}"
    config["dark_background_rel"] = dark_rel
    config["light_background_rel"] = light_rel

    # 水波效果背景图（压缩后的 jpg）
    water_bg = None
    if truthy(config["water"].get("enabled", "true")):
        if config["theme"]["mode"] == "light":
            water_src = backgrounds.get("light") or backgrounds.get("dark") or (SITE / "images" / "1.png")
        else:
            water_src = backgrounds.get("dark") or (SITE / "images" / "1.png")
        water_bg = run_module("水波背景图", lambda: prepare_water_bg(water_src), fallback=None)

    # 自定义封面
    for track in tracks:
        override = cover_overrides.get(track["slug"]) or cover_overrides.get(track["name"].lower())
        if override:
            apply_cover_override(track, override)

    successes = sum(
        1
        for t in tracks
        if write_track_manifest(t, releases, descriptions, downloads, config["artist"]["name"])
    )
    log(f"作品清单: {successes}/{len(tracks)} 首生成成功")

    run_module("艺术家页面", lambda: write_artist_manifest(config["artist"], artist), required=False)
    run_module(
        "首页 catalog.eno",
        lambda: write_catalog_manifest(config["site"], pages, home_name, artist["links"]),
        required=True,
    )

    asset_files, css_tags, js_tags = run_module("前端资源", prepare_assets, fallback=([], [], []))
    config_js = run_module("前端运行时配置", lambda: write_site_config_js(config), fallback=None)
    logo_file = run_module("站点 LOGO", lambda: install_logo(config), fallback=None)
    if config_js:
        asset_files = list(asset_files) + [config_js]
    if logo_file:
        asset_files = list(asset_files) + [logo_file]
    if water_bg:
        asset_files = list(asset_files) + [water_bg]
    run_module(
        "站点 site.eno",
        lambda: write_site_manifest(config, asset_files, css_tags, js_tags, bool(config_js), logo_file, water_bg),
        required=True,
    )

    write_report()
    log(f"完成：{successes} 首作品，警告 {len(REPORT['warnings'])} 条")
    if REPORT["warnings"]:
        log(f"详细报告: {LOGS / 'generate-report.txt'}")
    if REPORT["errors"]:
        return 1
    if strict and REPORT["warnings"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
