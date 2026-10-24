# SPA 重构方案（未来升级用）

> 目标：把当前的 Faircamp 多页静态站升级为 **单页应用（SPA）**，
> 让播放器天然常驻、页面切换不整页刷新，并为后续功能（收藏、歌单、歌词、账户等）留出扩展空间。
>
> 本文档是实施蓝图，不包含代码；实施时按阶段推进，每个阶段单独开一条对话/会话，避免上下文超限。

## 一、为什么是 SPA

当前站点每次点击链接都会整页重新加载，浏览器的 JS 上下文被销毁，所以音频会停止。
A 方案（PJAX）可以做到"不刷新换页"，但仍要兼容 Faircamp 生成的页面脚本；
C 方案是彻底的前端重构：应用只加载一次，路由切换全部在客户端完成，播放器放在路由出口之外，天然不断音。

## 二、技术选型

| 选项 | 说明 | 结论 |
|---|---|---|
| Astro + View Transitions | 内容静态生成，页面切换用 ClientRouter；可用 `transition:persist` 保留播放器 | ✅ 推荐 |
| Vue/React SPA + 静态部署 | 纯客户端渲染或 SSG + hydration | 可选，SEO 需要额外处理 |
| 继续 Faircamp + 自研路由 | 改造成本低，但受 Faircamp HTML/脚本限制 | 过渡方案（接近 A） |

**推荐**：Astro（静态输出）+ Vue/React 岛屿（播放器、搜索、评论），
部署方式保持 GitHub Pages + GitHub Actions，域名不变。

## 三、目标结构

```
content/                    用户内容（保持现有格式）
scripts/generate.py         生成内容 JSON（新增导出）
data/site.json              站点信息、艺术家、关于页、链接
data/tracks.json            曲目列表（标题/时长/封面/音频/歌词/下载）
data/tracks/<slug>.json     单曲详情
web/                        Astro 应用
├─ src/layouts/Base.astro
├─ src/components/Header.astro
├─ src/components/Player.astro       （transition:persist，常驻）
├─ src/pages/index.astro             首页目录（对应现在的 catalog）
├─ src/pages/[slug].astro            作品详情（保持现有 URL）
├─ src/pages/qianli.astro            艺术家页
├─ src/pages/embed/[slug].astro      嵌入播放器（APlayer 或自研）
└─ src/styles/…                      迁移现有主题与水波
scripts/build_site.py       调用 generate.py + Astro 构建 + 后处理
```

## 四、页面与 URL 映射

| 现有页面 | 新路由 | 说明 |
|---|---|---|
| `/music/` | `/` | 首页目录 |
| `/music/<slug>/` | `/<slug>/` | 作品详情，URL 保持不变 |
| `/music/qianli/` | `/qianli/` | 艺术家页 |
| `/music/<slug>/embed/` | `/<slug>/embed/` | 嵌入播放器 |
| `/music/homepage/feed.atom` | 仍生成 feed | 内容构建阶段产出 |
| `/music/qianli/feed.atom` | 仍生成 feed | 同上 |

所有旧 URL 需保持可访问；如有变更，用重定向页或 `404.html` 兜底。

## 五、播放器设计

- 全局单例：`PlayerProvider` 挂载在 `BaseLayout` 外层，路由切换时 `transition:persist`。
- 状态：当前曲目、播放列表、播放模式、进度、音量、播放状态。
- 持久化：`localStorage`（歌单/模式）+ `Media Session API`（系统媒体控制）。
- 页面内"收听"按钮 → 调用 `player.play(slug)`，不再各自创建 `<audio>`。
- 详情页/首页/嵌入页共用同一个曲目数据源。

## 六、迁移阶段（每阶段单独会话）

### 阶段 1：数据层（预计 0.5 天）
- 扩展 `scripts/generate.py`：输出 `data/*.json`（站点、曲目、歌词、关于页、下载链接）
- 保持现有 Faircamp 构建不动，双轨验证数据正确性
- 验收：JSON 字段完整、29 首曲目信息与原站一致

### 阶段 2：应用外壳 + 常驻播放器（预计 1–2 天）
- 初始化 Astro 工程，搭建 `BaseLayout`、Header、Footer
- 实现常驻播放器（勾选歌单、顺序/单曲/随机、全选、进度、封面）
- 接入现有视觉（背景图、水波 jquery.ripples、暗色主题、LOGO 第三版）
- 验收：首页 ↔ 详情页 ↔ 艺术家页切换时播放不断、URL 正确、刷新可直达

### 阶段 3：页面迁移（预计 2–3 天）
- 首页目录、艺术家页、作品详情页、嵌入页
- 歌词/创作说明、发行日期、封面描述、下载外链、关于页
- 保留原有分享卡片（SSR meta/OG）、订阅源
- 验收：所有页面视觉与内容与现站一致，移动端正常

### 阶段 4：功能与回归（预计 2–3 天）
- 搜索/浏览、复制链接、嵌入代码、评论区（giscus）、访问统计
- 404、重定向、旧链接兼容
- 与 Faircamp 站并行部署验证后切换
- 验收：全站回归清单通过，Lighthouse/移动端检查通过

## 七、构建与部署

- 继续使用 GitHub Actions：安装 Node/pnpm → `generate.py` 产出数据 → Astro 构建 → Postprocess（Feed 修复、嵌入页、播放器索引）→ Pages artifact。
- 保留当前 Faircamp 构建脚本作为回滚通道。
- 分支策略：`spa` 分支开发 → 预览部署（可用 Cloudflare Pages/临时仓库）→ 验证后合并 `main`。

## 八、风险与回滚

| 风险 | 应对 |
|---|---|
| Faircamp 功能迁移遗漏（搜索、嵌入、订阅） | 建立功能清单逐项验收 |
| SEO 退化 | 所有页面 SSR 输出静态 HTML，保留 OG/canonical/sitemap |
| 旧链接失效 | 保持 permalink 映射 + 404 兜底 |
| 工作量大、上下文超限 | 分 4 个阶段、每阶段单独会话，本文档作为交接依据 |
| 视觉回退 | 保留 Faircamp 站，随时切回 |

## 九、验收清单（最终）

- [ ] 站内任意页面切换，正在播放的歌曲不中断
- [ ] 首页 / 详情 / 艺术家页 URL 与现在一致
- [ ] 歌单（全选、顺序/单曲/随机）与当前一致
- [ ] 歌词、日期、封面描述、下载外链正常
- [ ] 搜索、复制链接、嵌入代码、评论、统计正常
- [ ] 分享卡片（OG）、订阅源、移动端正常
- [ ] 云端构建成功，线上无 404/旧链接问题
