# 项目结构与开发指南

本文供修改前端、数据规则、脚本、测试、GitHub Actions 或文档的贡献者使用。网站是零构建的静态站点，直接由 GitHub Pages 发布。

## 从哪里改

| 要修改的内容 | 文件 |
| :--- | :--- |
| 页面结构和文案 | `index.html` |
| 布局、主题和样式 | `assets/css/style.css`；参照[前端样式参考](../github-design-system-analysis.md) |
| 站内文档页和 Markdown 渲染 | `docs.html`、`assets/js/docs.js`、`assets/js/md.js`、`assets/css/docs.css` |
| 数据加载、路由、分页和页面交互 | `assets/js/app.js` |
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

PR 和部署工作流会运行以下检查：

```bash
python scripts/validate_data.py
python -m unittest discover -s tests -v
node tests/search.test.js
node tests/ghimg.test.js
node tests/md.test.js
```

数据、脚本或页面逻辑改动请运行相关检查；只改文档时，检查链接、示例和操作顺序即可。上述检查使用 Python 标准库和 Node 内置断言，不请求网络。数据投稿者还可以运行 `python scripts/data_editor.py data` 打开本地编辑器；它使用 Python 自带 Tkinter，不需要安装第三方包。编辑器会从 manifest 和各角色的 tags.json 自动发现结构，支持角色、分类的管理，以及标签维度的新增、重命名和中英文翻译修改；标签删除和值序号修改不在编辑器中提供。

## 数据如何变成页面

`app.js` 从 `data/manifest.json` 读取角色和分类，再加载各分类文件及该角色的 `tags.json`。`search.js` 解析标签，建立搜索和筛选索引；维度显示名来自 `data/tag-translations.json`。

列表根据条目的 `url` 推导主仓库 `preview` 分支中的 WebP 地址。点击卡片、按下载按钮或在卡片和原图上右键时才使用原图；右键菜单提供下载原图、复制图片 URL 和复制为 Markdown。`ghimg.js` 负责 GitHub 图片地址转换和请求失败后的回退。

## 数据规范

### 角色和分类：`data/manifest.json`

```json
[
  {
    "id": "naiwa",
    "name": "奶蛙",
    "icon": "🍼🐸",
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

- `text` 是气泡上显示的文字，`src` 是音频相对站点根目录的路径，必须指向 `assets/audio/` 下已存在的文件；同一文件中的 `src` 不能重复。
- 音频由主仓库提供，不走投稿区。新增语音先把文件放进 `assets/audio/`，再在角色的语音文件中登记。
- 网站在表情库上方的语音区渲染当前角色的语音，点击气泡播放；页面右键随机播放的也是这批语音。角色没有登记语音时，语音区自动隐藏。

### 桌宠：`data/pet.json`

```json
{
  "sheet": "assets/pet/naifrog-sheet.webp",
  "frameWidth": 192,
  "frameHeight": 208,
  "columns": 8,
  "rows": 9,
  "size": 104,
  "animations": [
    { "id": "idle", "row": 0, "durations": [280, 110, 110, 140, 140, 320] },
    { "id": "walk-right", "row": 1, "durations": [120, 120, 120, 120, 120, 120, 120, 220] }
  ]
}
```

雪碧图按 petdex 规格排列：8 列、每帧 192×208，一行一个动作，逐帧给出停留毫秒数。9 行依次是 idle、walk-right、walk-left、talk、cheer、sleep、wait、run、review；`grab` 复用第 4 行（cheer）。

- `sheet` 指向 `assets/` 下已存在的图片；`frameWidth`、`frameHeight`、`columns`、`rows` 是正整数；`animations` 非空，`id` 用小写 slug 且不重复，必须有 `idle`，`row` 小于 `rows`，帧数不超过 `columns`。`size` 是显示高度，取 24–400 像素。
- 走路朝向由 `walk-right` / `walk-left` 两行素材提供，不做镜像翻转；呼吸、迈步摆动和落地挤压由 CSS 叠加。
- 桌宠说话取当前角色 `voice.json` 里的随机一条，台词和音频都不另外维护。
- 雪碧图取自 [`timerring/codex-pet-naiwa`](https://github.com/timerring/codex-pet-naiwa)（MIT），转成 WebP 后放进 `assets/pet/`；属主仓库资源，不走社区 Fork 图片链路。
- 缺少 `data/pet.json`、缺 `idle` 或用户关掉桌宠时，页面不显示桌宠；关闭状态记在 `localStorage` 的 `nai-pet-off`，由顶栏「🐾 桌宠」按钮唤出。

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
| `deploy.yml` | `main` 更新或手动运行 | 四条检查全部通过后发布 GitHub Pages。 |

`validate_data.py` 只检查 URL 结构和数据中的重复 URL，不下载图片。图片下载、体积检查和内容去重由独立的哈希工作流执行。哈希工作流和预览图工作流使用主仓库脚本，不执行 PR 分支代码。`data_editor.py` 只使用 Python 标准库和 Tkinter，保存记录前会调用同一套 `validate_data()`。

`hash.txt` 每行保存一个已归档的 SHA-256。尚未归档的已入库哈希和待处理图片哈希保存在 Actions Cache；哈希成功写入 `hash.txt` 后会从 `ingested` 临时记录中清除，并移除已入库评论记录中冗余的哈希数组。缓存恢复或初始化失败时不会保存新缓存；业务步骤失败时仍保存已经完成的状态释放或入库变更，避免旧认领永久卡住。只有整项任务成功时才删除旧缓存；这些状态由工作流维护。

PR 图片检查读取事件中的固定 head commit，文件读取或解析失败会使检查失败。PR 描述可以使用投稿评论的完整 GitHub 链接，一次认领多条评论；旧缓存和旧 PR 仍兼容 `MEME-CLAIM-...` 口令。使用链接时，PR 新增图片的哈希必须恰好等于所有被认领评论图片哈希的并集。未合并关闭 PR 会解除所有评论认领：仍存在的 Issue 原投稿恢复为待处理，已删除的评论记录和占位一并清理；纯 PR 图片，不在评论区的占位释放，重新打开PR后再检查。删除未认领评论会立即释放占位；删除已认领评论会暂时保留占位，直到对应 PR 合并或关闭。待处理评论换图或清空图片会回收旧占位，临时下载失败则保留原占位等待重试。

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
