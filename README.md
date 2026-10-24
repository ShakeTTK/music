# 千里的音乐小站 · 新版源码

Faircamp 2 静态站点 + 内容外置框架 + GitHub Actions 云端构建。

- 线上地址：https://shakettk.github.io/music/
- 站内地址：https://shakettk.github.io/music/qianli/ （艺术家页）

## 快速上手

| 我想做什么 | 怎么做 |
|---|---|
| 改歌词 / 创作说明 | 在 `content/lyrics/`、`content/notes/` 放 `<作品slug>.md` |
| 加发行日期 | 编辑 `content/releases.txt` |
| 改封面描述 | 编辑 `content/cover-descriptions.txt` |
| 换封面 | 把图片放进 `content/covers/`，文件名用作品文件夹名 |
| 换背景 / 首页大图 | 把图片放进 `content/backgrounds/`（`dark.jpg` / `light.jpg` / `home.jpg`） |
| 写关于 / 联系方式 / 版权 / 支持作者 | 编辑 `content/pages/*.md` |
| 写艺术家简介 / 头像 / 社交链接 | 编辑 `content/artist/` |
| 加外链下载 | 编辑 `content/downloads.txt` |
| 功能开关（水波、歌单、评论、统计、嵌入） | 编辑 `content/config.ini` |
| 多语言界面文案（中/英等） | 编辑 `content/i18n/*.json`，新增语言只需复制一个文件 |
| 更新并上传 | 双击 `scripts/update.bat` |

> 临时歌单播放器在站点左下角「歌单」按钮里：勾选歌曲加入临时歌单，可顺序 / 单曲 / 随机播放；站内点击链接切换页面不会中断播放（无刷新跳转）。页面右上角可切换界面语言（默认按浏览器语言自动选择）。

详细说明：

- [内容填写说明](docs/01-内容填写说明.md)
- [部署与更新说明](docs/02-部署与更新说明.md)
- [目录结构与模块说明](docs/03-目录结构与模块说明.md)
- [SPA 重构方案（未来升级用）](docs/04-SPA重构方案.md)
- [多语言文案说明](docs/05-多语言文案说明.md)

## 本地预览（云端构建的备份通道）

1. 安装 Faircamp 2（当前本机在 `D:\AIMUSIC\Faircamp2\app\faircamp.exe`）
2. 双击 `scripts\preview.bat`

## 模块化说明

所有内容模块彼此独立：发行日期、歌词、创作说明、封面描述、下载链接、关于页、艺术家资料、背景图、自定义封面。任何一个模块写错或留空，只会影响它自己，构建会继续并记录警告到 `logs/generate-report.txt`。
