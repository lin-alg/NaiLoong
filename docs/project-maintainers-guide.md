# 项目结构与开发指南

本文供修改前端、数据规则、脚本、测试、GitHub Actions 或文档的贡献者使用。网站是零构建的静态站点，直接由 GitHub Pages 发布。

## 从哪里改

| 要修改的内容 | 文件 |
| :--- | :--- |
| 页面结构和文案 | `index.html` |
| 布局、主题和样式 | `assets/css/style.css` |
| 界面图标 | `assets/js/icons.js` |
| 奶蛙主题的背景眼睛 | `index.html` 的 `.naiwa-backdrop`、`assets/css/style.css` 的图标段 |
| 站内文档页和 Markdown 渲染 | `docs.html`、`assets/js/docs.js`、`assets/js/md.js`、`assets/css/docs.css` |
| 交互式 Git 投稿教程 | `contribute.html`、`assets/js/contribute.js`、`assets/css/contribute.css` |
| 本地浏览器数据差异编辑器 | `tools/data-editor/`、`assets/js/editor.js`、`scripts/data_editor_core.py`、`scripts/data_editor_server.py` |
| 本地 AI 批量标注 | `scripts/data_editor_ai.py` |
| 数据加载、路由、分页和页面交互 | `assets/js/app.js` |
| 首页访客与浏览统计 | `assets/js/stats.js` |
| 标签解析、搜索和筛选 | `assets/js/search.js` |
| 图片地址转换、代理探测和失败回退 | `assets/js/ghimg.js` |
| 角色与分类 | `data/manifest.json` |
| 表情记录与标签定义 | `data/<role-id>/` |
| 标签维度的中英文显示名 | `data/tag-translations.json` |
| 数据格式校验 | `scripts/validate_data.py` |
| 图片去重、投稿状态和评论认领 | `scripts/meme_hash.py` |
| 本地数据图形化编辑器 | `scripts/data_editor.py` |
| 预览图生成 | `scripts/generate_previews.py` |
| 自动化测试和工作流 | `tests/`、`.github/workflows/` |
| 贡献文档和提交模板 | `docs/`、`CONTRIBUTING.md`、`.github/ISSUE_TEMPLATE/`、`.github/pull_request_template.md` |

## 本地预览和检查

数据校验需要 Python 3.9 或更新版本，JavaScript 测试使用 Node.js（CI 使用 Node 20）。本地预览无需安装前端依赖。在仓库根目录运行：

```bash
python -m http.server 8080
```

打开 <http://localhost:8080>，按 `Ctrl+C` 停止服务器。修改页面后检查桌面和窄屏布局、键盘操作，以及加载失败、无结果等状态。

主页使用自适应内容宽度；桌面视口从 1012px 起将 `rem` 基准缩至 75%，1600px 及以上按视口宽度从 12px 增长到最多 18px，Hero 标题和介绍文字另行放大。表情列表在中等桌面宽度最多六列，超宽屏按卡片最小宽度自适应。检查宽屏时同时查看文字大小、卡片宽度和背景图形经过文字区域时的对比度。

打开首页后，奶蛙桌宠放大并站在屏幕中心打瞌睡，气泡提示「戳一戳」。点击桌宠或聚焦后按 Enter / 空格，会播放 `hola_ganbadie.mp3` 开头 0.9 秒并同步播放 `fear` 惊恐动作；惊恐帧结束后最多等待一秒台球图，随后奶蛙加速跑出屏幕，资源未就绪时跳过台球动画。四根球杆同时击出四张卡片；卡片持续受摩擦减速，撞边和互撞后反弹，最终全部离场。页面显现时，标题、介绍文字和统计动画开始；等落字、打字、按钮显现和背景画入等入场动画结束后，桌宠才从右侧走回来。走到指定位置后切换为 `cheer`，此时才播放笑声，大笑动画持续 15 秒。点击手势会启动同一个 Web Audio context，碰撞音、键盘声和预先解码的语音都由它播放。

等待点击和开场播放期间，页面并行加载角色数据、当前页预览图、桌宠素材与语音；桌宠雪碧图完成后才启动四张台球图片加载。仓库内素材通过 jsDelivr 的 `main` 分支地址访问；社区预览和原图按 jsDelivr、`gh-proxy.com`、其它代理、raw 的顺序尝试，raw 地址只作最后回退。当前页预览图使用 eager 加载，页面显现前等待图片和音频准备完毕，不重新创建图片节点。预览图超过 8 秒仍未完成时使用已有本地占位图并保留原图链接。按 Escape、点击「跳过开场」、改变窗口尺寸或离开首页可以结束开场；直接进入页内锚点、开启减少动态效果或未启用 JavaScript 时直接显示页面。验证时检查慢网、数据或桌宠素材失败、重复点击、键盘启动与跳过，确保页面可以恢复操作。

首页、表情库和贡献区构成三个板块。底部浮动箭头按一个板块滚动，位于桌宠之下、页面内容之上；表情库较长时，仅在接近板块起点或下一板块时显示相应箭头。减少动态效果模式使用即时滚动。

修改开场后可运行 `node tests/intro.test.js` 检查同时击球、滚动减速、卡片碰撞分离及完整离场；`node tests/resources.test.js` 使用模拟请求检查临时断连的重试与失败恢复。浏览器预览时还要核对点击后声音是否启动、笑声是否与欢呼同时触发、介绍文字在打字前是否隐藏，以及手机标题和浮动箭头是否被遮挡。

PR 和部署工作流会运行以下检查：

```bash
python scripts/validate_data.py
python -m unittest discover -s tests -v
node tests/search.test.js
node tests/ghimg.test.js
node tests/md.test.js
node tests/intro.test.js
node tests/resources.test.js
node tests/stats.test.js
```

数据、脚本或页面逻辑改动请运行相关检查；只改文档时，检查链接、示例和操作顺序即可。上述项目检查使用 Python 标准库和 Node 内置断言，不请求网络。数据投稿者运行 `python scripts/data_editor.py data` 会启动只监听 `127.0.0.1` 的本地浏览器差异编辑器；`python scripts/data_editor.py --tk data` 保留旧 Tk 编辑器。浏览器工具调用本机 Git 和校验器，不执行 PR 分支代码。可选 AI 标注经本地服务请求用户选择的官方 API，密钥不持久化；Google 视频上传完成识别后会尝试删除临时文件。AI 输出不得绕过人工复核与完整数据校验。动画转成 MP4 时保留完整时长；OpenAI / Anthropic 输入按全片取最多 160 个候选帧，用 32×32 RGB 画面去掉近似重复和循环画面，再按时间顺序上传最多 12 张代表帧及其时间位置。Gemini 使用完整 MP4，不额外抽取用不到的帧。

## 数据如何变成页面

`app.js` 从 `data/manifest.json` 读取角色和分类，再加载各分类文件及该角色的 `tags.json`。`search.js` 解析标签，建立搜索和筛选索引；维度显示名来自 `data/tag-translations.json`。

列表根据条目的 `url` 推导主仓库 `preview` 分支中的 WebP 地址。点击卡片、按下载按钮或在卡片和原图上右键时才使用原图；右键菜单提供下载原图、复制图片 URL 和复制为 Markdown。`ghimg.js` 负责 GitHub 图片地址转换和请求失败后的回退。

### 首页访问统计

首页「访客总数」「浏览总数」使用[不蒜子开源版](https://github.com/soxft/busuanzi)的公开接口 `https://bsz.iirose.cn/api`，分别显示 `site_uv` 和 `site_pv`。仅在正式页面显现后发送一次 POST：等待「戳一戳」期间不请求，跳过或完成开场后计数；直接进入页内锚点、开启减少动态效果或开场素材失败而直接显示页面时，也会计数。刷新页面后重新进入正式页面会增加浏览量，筛选、分页和页内导航不增加。

服务通过 `Set-Bsz-Identity` 响应头签发访客身份，网站将其保存为 `nai-visitor-id` Cookie（站点目录作用域、保存一年、`SameSite=Lax`，HTTPS 下加 `Secure`），后续统计通过 `Authorization: Bearer <访客身份>` 交回同一服务去重。清除 Cookie、换浏览器或禁用 Cookie 后不能保证沿用同一身份；计数结果以不蒜子服务为准。接口失败时显示「—」，不自动重发计数请求。调试网络与计数行为请使用 mock，运行 `node tests/stats.test.js`；浏览器预览时核对开场等待、跳过、完整播放、刷新和请求失败。

## 数据规范

### 角色和分类：`data/manifest.json`

```json
[
  {
    "id": "naiwa",
    "name": "奶蛙",
    "icon": "tabler:baby-bottle lucide-lab:frog-face",
    "subcategories": [
      { "id": "animated", "name": "动图", "file": "naiwa/animated.json" },
      { "id": "static", "name": "静态图", "file": "naiwa/static.json" }
    ],
    "voice": "naiwa/voice.json"
  }
]
```

- manifest 是非空数组，每个角色至少有一个分类。角色和分类的 `name` 均不能为空。
- 角色 ID 在整个 manifest 中唯一；分类 ID 在同一角色内唯一。ID 使用小写英文、数字和单个连字符分隔，例如 `naiwa`、`new-role`。
- 角色目录为 `data/<role-id>/`。`file` 是相对 `data/` 的 `.json` 路径，必须在该角色目录内；分类文件都要在 manifest 中登记。
- 默认从第一个分类文件所在目录读取 `tags.json`。也可以在角色对象的 `tags` 字段中指定相对 `data/` 的标签文件路径。
- `voice` 可选，指向该角色的语音文件；没有语音的角色省略该字段。
- `icon` 可选，是 `assets/js/icons.js` 里登记的图标名，多个名字用空格分隔，侧栏和角色简介会按顺序渲染。图标名写错时校验器报错，前端则渲染为空；界面不使用 emoji。

### 界面图标：`assets/js/icons.js`

站内图标统一用 SVG，路径取自 [Iconify](https://icon-sets.iconify.design/) 的 lucide、lucide-lab（ISC）与 tabler（MIT）集合，随仓库内联，不引入运行时依赖或 CDN。所有图标都是 24×24 视窗、`stroke="currentColor"`，颜色跟随文字色。

```html
<span data-icon="lucide:search" data-icon-size="40"></span>
```

- 静态 HTML 写 `data-icon` 宿主，页面脚本启动时由 `NaiIcons.hydrate()` 填充；JS 拼 HTML 用 `NaiIcons.svg(name, size)`，角色 `icon` 这类多图标字段用 `NaiIcons.markup(value, size)`。
- 新增图标：从 `https://api.iconify.design/<集合>.json?icons=<名字>` 取 `body`，按 `"集合:名字"` 登记进 `REGISTRY`，同时更新校验器可识别的图标名。
- `scripts/validate_data.py` 会读取该文件里的图标名来校验角色 `icon`，所以注册表的键名保持 `"前缀:名字":` 一行的写法。

### 奶蛙主题背景

`index.html` 在 `<body>` 开头放了 `<div class="naiwa-backdrop">`，里面是一只奶蛙眼的内联 SVG，只在 `data-theme="naiwa"` 下显示，常驻视口右侧。图形按投稿 GIF 的比例量出来重画：绿圈用 `r=122` 加 `stroke-width=40` 的描边圆，瞳孔 `r=102`，两处高光和左下的嘴都是描边路径；嘴使用圆头描边，SVG 画框留出完整端点的空间，避免左侧出现竖直截断。

- 画入靠 `pathLength="1"` 把描边长度归一，再用 `stroke-dashoffset: 1 → 0` 做，不需要事先量路径长度；顺序是绿圈 → 瞳孔 → 高光 → 嘴，全部在 2.6 秒内画完。
- 开场结束后才启动背景画入；嘴在开始描画前保持 `opacity: 0`，避免圆头描边在零长度时留下黑点。
- 眨眼是上下裁切，不是压扁：两层 `<clipPath>` 矩形把 `y` / `height` 从整只眼睛（`243` / `314`）收到过中心的横缝（`376` / `48`），周期互质（6.5s 与 11s）叠加后间隔不固定；入场结束后才开始，不做整段循环重播。嘴在裁剪组之外，眨不眨都在。
- 图层 `position: fixed` 加 `z-index: 0`，不用混合模式，只压在平涂的页面底色之上；首屏拼图（`z-index: 1`–`5`）、表情卡片、顶栏这些自带不透明底板的组件都画在它上面。没有底板的文字层单独抬到 `z-index: 1`：`.hero-copy`、`.sidebar`、`.toolbar`、`.tag-panel`、`.role-intro`、`.pager`、`.empty-state`、`.contribute`、`.site-footer`。侧栏只加层序，保留桌面的 `sticky` 和窄屏的 `static` 定位；筛选标签、维度名和结果计数另加主题底色，避免黑色图形影响阅读。
- 四个图元的不透明度都是 1，颜色照 GIF 实测值平涂：绿圈 `#6dfe0c`、瞳孔和嘴 `#000`、高光 `#fff`。改浓淡、尺寸或层序后，在不同窗口尺寸和滚动位置检查角色简介、结果计数、标签行标题和页脚；文字画在图形上面仍可能与黑色部分缺少对比，必要时给文字加主题底色。
- 奶蛙主题的首屏是平涂奶黄：`:root[data-theme="naiwa"] .hero-aurora` 设成 `display: none`，`body` 也不加径向光斑。这两层会在眼睛底下叠出色块，还会被 `.hero { overflow: hidden }` 切出硬边，眼睛压在上方就会跟着深浅不匀，看着像眼睛自己发花。
- `prefers-reduced-motion: reduce` 时不画入也不眨，直接呈现睁开的眼睛；1011px 及以下的单列布局不显示，避免平板和手机的首屏文字穿过眼睛。

### 表情记录：分类文件

分类文件是 JSON 数组，没有表情时填写 `[]`。每条记录包含：

```json
{
  "title": "奶蛙狂笑",
  "url": "你的用户名/<40位图片commit SHA>/assets/memes/laugh.png",
  "tags": [2, 0, 1]
}
```

`title` 和 `url` 是非空字符串；`tags` 按下面的标签规则填写。修订已有表情时修改原条目，并保留已有来源信息。

### 角色语音：`voice.json`

语音文件是 JSON 数组，每条记录一段可播放的语音；没有语音时填写 `[]`。

```json
{ "text": "咳哈哈哈哈~", "src": "assets/audio/nailong_laugh.mp3" }
```

- `text` 是播放时配着的台词文字，`src` 是音频相对站点根目录的路径，必须指向 `assets/audio/` 下已存在的文件；同一文件中的 `src` 不能重复。
- 音频由主仓库提供，不走投稿区。新增语音先把文件放进 `assets/audio/`，再在角色的语音文件中登记。
- 语音不单独成区：在页面空白处点右键有几率随机播放当前角色的一条语音，桌宠说话也从这批记录里取台词和音频。角色没有登记语音时，右键彩蛋回落到 `assets/audio/nailong_laugh.mp3`。

### 桌宠：`data/pet.json`

```json
{
  "sheet": "assets/pet/naifrog-sheet.webp",
  "frameWidth": 192,
  "frameHeight": 208,
  "columns": 8,
  "rows": 10,
  "size": 104,
  "animations": [
    { "id": "idle", "row": 0, "durations": [280, 110, 110, 140, 140, 320] },
    { "id": "walk-right", "row": 1, "durations": [120, 120, 120, 120, 120, 120, 120, 220] },
    { "id": "fear", "row": 9, "durations": [110, 110, 110, 110, 110, 110, 110, 130] }
  ]
}
```

雪碧图按 petdex 规格排列：8 列、每帧 192×208，一行一个动作，逐帧给出停留毫秒数。10 行依次是 idle、walk-right、walk-left、talk、cheer、sleep、wait、run、review、fear；`grab` 复用第 4 行（cheer）。

- `sheet` 指向 `assets/` 下已存在的图片；`frameWidth`、`frameHeight`、`columns`、`rows` 是正整数；`animations` 非空，`id` 用小写 slug 且不重复，必须有 `idle`，`row` 小于 `rows`，帧数不超过 `columns`。`size` 是显示高度，取 24–400 像素。
- 走路朝向由 `walk-right` / `walk-left` 两行素材提供，不做镜像翻转；呼吸、迈步摆动和落地挤压由 CSS 叠加。
- 桌宠说话取当前角色 `voice.json` 里的随机一条，台词和音频都不另外维护。
- 雪碧图取自 [`timerring/codex-pet-naiwa`](https://github.com/timerring/codex-pet-naiwa)（MIT），转成 WebP 后放进 `assets/pet/`；属主仓库资源，不走社区 Fork 图片链路。
- 缺少 `data/pet.json`、缺 `idle` 或用户关掉桌宠时，页面不显示桌宠；关闭状态记在 `localStorage` 的 `nai-pet-off`，由顶栏「桌宠」按钮唤出。

### 标签：`tags.json`

```json
{
  "smile": { "0": "轻松绷住", "1": "憋笑", "2": "大笑" },
  "age limit": { "0": "老少咸宜", "1": "朋友整活", "2": "重口" },
  "artistic merit": { "0": "下里巴人", "1": "日常", "2": "阳春白雪" }
}
```

每个顶层键是一个标签维度，维度内的数字键是本地序号。维度名和标签文字不能为空；序号是非负整数，同一维度内的标签文字不能重复。

`tags` 支持两种写法：

- 数组：按 `tags.json` 的维度书写顺序填写，每个维度恰有一个值，值为该维度已定义的整数序号或 `null`。例如 `[2, null, 1]` 表示“大笑、年龄限制未知、日常”。
- 对象：使用维度名作为键，值可为已定义的整数序号、标签文字或 `null`。允许省略未知维度，例如 `{ "smile": "大笑", "artistic merit": 1 }`。

新增或重命名维度时，在 `data/tag-translations.json` 中补齐该维度非空的 `en`、`zh` 显示名。例如：

```json
{
  "smile": { "en": "Smile strength", "zh": "笑容强度" }
}
```

调整维度顺序会改变数组标签的位置；修改已有序号会改变它的含义。两种改动都要同步迁移受影响的条目。

### 图片 URL

社区原图保存在贡献者公开 Fork 的 `image` 分支，数据记录固定到上传图片的 40 位 commit SHA。支持以下等价格式（替换所有尖括号内容）：

```text
<owner>/<commit>/assets/memes/laugh.png
https://github.com/<owner>/NaiLoong/blob/<commit>/assets/memes/laugh.png
https://github.com/<owner>/NaiLoong/raw/<commit>/assets/memes/laugh.png
https://raw.githubusercontent.com/<owner>/NaiLoong/<commit>/assets/memes/laugh.png
```

不能使用 `blob/image/...` 等分支地址、Issue 附件地址或其他图床。已有的本地 `assets/placeholders/` 文件作为占位资源保留。

同一图片 URL 在数据集中只能出现一次；紧凑、blob 与 RAW 写法归一后也算重复，owner 和 commit 大小写不影响归一结果，文件路径保留大小写。单张原图不超过 **5 MB**，建议小于 2 MB；视频仅收录转换为 GIF 的极短片段。

## 新增角色或分类

1. 为角色建立 `data/<role-id>/`，添加分类数组文件和 `tags.json`；空分类写 `[]`。
2. 在 manifest 登记角色及分类，新维度同时补齐中英文显示名。
3. 运行数据校验，在本地检查角色切换、分类、搜索和筛选。

给已有角色加分类，只需新增分类文件并更新该角色的 `subcategories`。角色和分类都由数据生成，不需要在前端写死。

## 自动化

| 工作流 | 触发条件 | 作用 |
| :--- | :--- | :--- |
| `pr-check.yml`（Data Linter） | PR 或手动运行 | 运行本地检查中的四条命令。 |
| `meme-hash.yml`（Meme Image Hash Check） | 在投稿评论创建、编辑或删除，PR，定时或手动时运行 | 下载图片，检查 5 MB 上限和 SHA-256 重复，更新投稿状态；网络临时错误最多重试 4 次；每天北京时间 02:00 归档已入库哈希。 |
| `generate-previews.yml`（Generate Meme Previews） | 合并到 `main` 的 PR | 为新增或替换的图片生成 WebP，写入主仓库 `preview` 分支。 |
| `deploy.yml` | `main` 更新或手动运行 | 四条检查全部通过后触发 Cloudflare Pages 的 `main` 部署；从非 `main` 分支手动运行只执行检查，不部署。 |

Cloudflare Pages 使用 Git 集成读取仓库，但须关闭自动生产部署和所有预览分支部署；GitHub Actions 检查通过后请求绑定 `main` 的 Deploy Hook。仓库只需配置 Secret `CLOUDFLARE_DEPLOY_HOOK_URL`，不保存 Cloudflare API Token。Deploy Hook URL 仅能触发其绑定项目和分支的部署；若泄露，应在 Cloudflare 删除并重新创建 Hook，再更新仓库 Secret。

`validate_data.py` 只检查 URL 结构和数据中的重复 URL，不下载图片。图片下载、体积检查和内容去重由独立的哈希工作流执行。哈希工作流和预览图工作流使用主仓库脚本，不执行 PR 分支代码。`data_editor.py`、浏览器差异扫描和本地 HTTP 服务只使用 Python 标准库，写入前调用同一套 `validate_data()`，并在失败时恢复本次数据修改。

`hash.txt` 每行保存一个已归档的 SHA-256。尚未归档的已入库哈希和待处理图片哈希保存在 Actions Cache；哈希成功写入 `hash.txt` 后会从 `ingested` 临时记录中清除，并移除已入库评论记录中冗余的哈希数组。缓存恢复或初始化失败时不会保存新缓存；业务步骤失败时仍保存已经完成的状态释放或入库变更，避免旧认领永久卡住。只有整项任务成功时才删除旧缓存；这些状态由工作流维护。

哈希检查把已入库哈希命中与既有条目的来源 URL 更换分开处理：只要 PR 删除了旧 URL、加入了同一图片内容的新固定 commit URL，哈希不因索引变化而阻断；新增加的重复条目仍会失败。检查会下载被移除的旧 URL，按哈希逐一抵消同内容的新引用；旧图片无法下载时仍会失败，需要恢复来源后重试。预占位的优先级为 PR 高于未被 PR 认领的评论；PR 对 PR、评论对评论继续按先到先得。PR 接管评论图片时，机器人从评论中移除被接管的图片链接，保留说明和其他图片，并把缓存预占位转给 PR；PR 撤回图片或未合并关闭时恢复图片链接和评论预占位，合并后补回普通附件链接供追溯。评论 API 更新失败时，接管意图保存在缓存中，后续运行会继续处理。

PR 图片检查读取事件中的固定 head commit，按 base 和 head 各自 manifest 的 `subcategories[].file` 识别分类文件；语音、桌宠、标签等其他 JSON 不参与图片哈希检查，分类文件的空 URL 仍会报错并显示文件名和条目序号。文件读取或解析失败会使检查失败。PR 描述可以使用投稿评论的完整 GitHub 链接，一次认领多条评论；旧缓存和旧 PR 仍兼容 `MEME-CLAIM-...` 口令。使用链接时，PR 新增图片的哈希必须恰好等于所有被认领评论图片哈希的并集。未合并关闭 PR 会解除所有评论认领：仍存在的 Issue 原投稿恢复为待处理，已删除的评论记录和占位一并清理；纯 PR 图片，不在评论区的占位释放，重新打开PR后再检查。删除未认领评论会立即释放占位；删除已认领评论会暂时保留占位，直到对应 PR 合并或关闭。待处理评论换图或清空图片会回收旧占位，临时下载失败则保留原占位等待重试。哈希检查机器人会在 PR 评论中更新角色、分类、表情条目、标题、标签、图片来源 URL、标签定义等变更摘要，并注明检查的 head commit。

Issue 投稿入库后，机器人将 Markdown 图片改成普通原图链接（HTML 图片也转成链接），然后按“已解决”折叠评论，保留说明和附件地址。归档操作可以通过重新运行对应合并事件重试，不删除评论。

生成的预览图保留透明度，最长边不超过 300 像素，文件严格小于 10 KiB。GIF 使用首帧。路径为：

```text
previews/<role-id>/<category-id>/<fork-owner>/<image-commit>/<原图路径>.webp
```

owner 与 commit 使用小写，原图路径保留完整文件名和扩展名，例如 `laugh.gif.webp`。前端优先加载此路径，缺失时尝试旧的 `laugh.webp` 路径，以兼容已有预览；列表不会回退下载原图。预览任务使用 `queue: max` 排队。

## 提交 PR

从最新 `main` 建立工作分支，说明改了什么以及如何验证。数据迁移请说明受影响的角色和条目；页面改动请附截图。修改规则时同步更新实现、测试和相关指南。

## 常见问题

### 为什么检查通过了，图片却打不开？

数据校验不联网检查文件。确认 Fork 公开、固定 commit 和路径正确；如果是新投稿，再查看哈希检查的下载结果。

### 新记录合并后，列表仍显示占位图怎么办？

查看 **Generate Meme Previews** 是否成功，再检查 `preview` 分支中的文件路径是否与角色、分类、图片来源一致。原图可用时，可重新运行失败的预览图任务。

### 预览图会自动补齐历史条目吗？

不会。自动化只处理合并 PR 中新增或替换的图片。历史条目需要按上述尺寸、格式和路径规则生成预览图，再提交到主仓库 `preview` 分支。

### 可以直接修改 `hash.txt` 或清空缓存解决重复报错吗？

先确认图片是否已入库或被其他投稿认领，再修正 PR 或投稿。`hash.txt` 保存已归档结果，缓存还保存待处理状态；删除它们会丢失去重记录。

### 哈希任务提示 `cache write denied` 或 `token has no writable scopes` 怎么办？

检查对应 job 的 `cache-mode: write` 和 `actions: write` 权限配置，修复后重新运行任务。

### Issue 附件下载返回 404，应该改数据 URL 吗？

先通过 GitHub API 重新读取评论的 `body_html`，获取有效的签名附件链接；对该图片链接的请求不附加 Bearer Token。仍失败时，请投稿者重新上传附件。分类文件始终使用 Fork 中的固定 commit 图片 URL。
