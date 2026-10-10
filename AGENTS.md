# AGENTS.md

## 项目目标

奶-hub 有两个同等重要的目标：维护一个由社区贡献者的公开 Fork 提供图片、由主仓库数据记录汇总展示的分布式表情包站；以及让 GitHub 新手能够通过一次真实投稿学会 Fork、分支、commit 和 Pull Request。文档、校验规则和工作流应同时服务这两个目标。

## 协作边界

- 开始工作前阅读 [README.md](README.md)、[CONTRIBUTING.md](CONTRIBUTING.md) 和当前任务对应的 `docs/` 指南。
- 网站是零构建静态站点。未经明确需要，不要引入前端框架、包管理器、构建步骤或运行时依赖。
- 角色、分类和表情由 `data/` 驱动；不要为了新增角色或分类而在 `assets/js/app.js` 或 `index.html` 写死数据。
- 低门槛表情投稿走共享 Issue 评论区；网站/项目建议与问题反馈走普通 Issue；GitHub 新手通过 Fork、工作分支和 JSON PR 投稿；项目代码改动保持范围聚焦。
- 共享投稿 Issue 固定为 `https://github.com/lin-alg/NaiLoong/issues/1`，GitHub 标签名称为「贡献表情」。仅投稿者直接在评论中上传图片；整理投稿的贡献者或维护者再将图片转存到自己的公开 `image` 分支。
- 社区图片放在贡献者自己的公开 Fork 的 `image` 分支。不要把该分支合并进主仓库，也不要建议贡献者删除或私有化承载本站图片的 Fork。
- 修订既有数据时优先修改原条目；不得丢失已记录的来源信息。相同 URL 不重复新增。
- 图片若被版权所有者指出存在问题，删除主仓库对应图片链接，并通知承载图片的 Fork 所有者处理。
- 不在数据、文档、日志或 workflow 中加入密码、访问令牌或其他凭据。

## 术语

- **角色（role）**：`data/manifest.json` 中的一项，例如 `naiwa`（奶蛙）；其 `id` 对应 `data/<role-id>/` 目录。
- **分类（category）**：角色下的一种内容类型，由 manifest 的 `subcategories` 项描述，含分类 ID、名称和数据文件路径。
- **分类文件（category file）**：`animated.json` 或 `static.json` 的统称；每个分类文件是表情条目数组。
- **表情条目（meme entry）**：分类文件中的一个对象，包含 `title`、`url` 和 `tags`。
- **标签维度（tag dimension）**：`tags.json` 的一个顶层键，例如 `smile`、`age limit`、`artistic merit`。
- **维度内标签序号（local tag index）**：某一标签维度对象中的数字键，例如 `smile` 下的 `"2"` 表示该维度的“大笑”。序号只在所属维度内有意义。
- **标签数组位置（tag array position）**：表情条目 `tags` 数组中的位置；从 0 开始，依次对应 `tags.json` 顶层维度的书写顺序。 
- **标签维度显示名（tag dimension display name）**：`data/tag-translations.json` 为一个标签维度提供的中英文名称；筛选逻辑使用维度键，界面展示中文名称。
- **本地 Fork 图片 URL**：贡献者公开 Fork 内 `NaiLoong/blob/<image-commit-sha>/<path>` 的 GitHub 文件地址。URL 固定到上传图片时的 40 位 commit SHA；Fork 必须持续公开和保留。
- **紧凑图片 URL**：分类文件也可写成 `<fork-owner>/<image-commit-sha>/<path>`；前端和校验器会将它补成同一文件的 GitHub blob 地址。它不能省略 Fork 所有者、40 位 commit SHA 或文件路径。
- **GitHub RAW 图片 URL**：同一 Fork、仓库和图片 commit 的 RAW 视图地址，包括 `github.com/.../raw/<commit-sha>/...` 和 `raw.githubusercontent.com/.../<commit-sha>/...` 两种形式；校验和重复检测时归一到对应 blob 文件地址。
- **占位资源**：`assets/placeholders/` 下随主仓库维护的演示和 fallback 图片，不是社区投稿的外部图片来源。

## 目录职责

- `index.html`：网站主页面骨架、导航和文案。
- `docs.html`：站内文档阅读器页面，搭配 `assets/js/docs.js` 与 `assets/css/docs.css`；把 `docs/` 和 `CONTRIBUTING.md` 渲染成网页。
- `assets/css/`：设计参考 `github-design-system-analysis.md`。
- `assets/js/app.js`：加载 manifest 和数据，渲染页面、路由和交互。
- `assets/js/search.js`：标签定义解析、搜索和筛选语义。
- `assets/js/ghimg.js`：GitHub 图片链接转换、代理探测和失败回退。
- `assets/js/md.js`：零依赖 Markdown 渲染器，供 `docs.html` 使用；先整体转义 HTML 再解析语法，标题锚点与 GitHub 一致。
- `assets/placeholders/`：仓库自带的占位和兜底图片。
- `preview` 分支的 `previews/`：主仓库 Action 生成的轻量 WebP 预览图；不在 `main` 的数据 PR 中提交。
- `data/manifest.json`：角色和分类目录。
- `data/tag-translations.json`：标签维度的中英文显示名；不在前端代码中硬编码维度译名。
- `data/<role-id>/`：该角色的分类文件、`tags.json` 和可选的 `voice.json`。
- `assets/audio/`：主仓库提供的角色语音音频，由 `data/<role-id>/voice.json` 登记。
- `assets/pet/`：桌宠雪碧图，取自 `timerring/codex-pet-naiwa`（MIT）的奶蛙素材并按 petdex 规格排列；属主仓库资源，不走社区 Fork 图片链路。
- `data/pet.json`：桌宠的动作到素材映射和显示尺寸；缺文件或缺 `idle` 时页面不渲染桌宠。
- `assets/js/pet.js`：零依赖网页桌宠，负责动作状态机、拖拽甩抛物理和说话气泡。
- `hash.txt`：主分支已归档图片的 SHA-256 哈希，每行一个哈希值；不写图片 URL 或键值。
- `.github/ISSUE_TEMPLATE/`：网站或项目建议、问题反馈模板及共享投稿 Issue 入口。
- `.github/workflows/`：PR 测试/数据校验和 GitHub Pages 部署。
- `scripts/validate_data.py`：数据契约、标签语义、图片 URL 格式和重复 URL 校验。
- `scripts/meme_hash.py`：Issue 评论图片和 PR 图片的哈希缓存、状态联动及每日归档逻辑。
- `scripts/data_editor.py`：从 manifest 和 tags.json 自动发现数据结构的本地 Tkinter 编辑器。
- `scripts/generate_previews.py`：合并 PR 后下载新增原图并生成预览 WebP。
- `tests/`：数据校验器、标签解析、图片 URL 转换和 Markdown 渲染测试；Python 测试使用标准库，Node 测试使用内置断言，不引入第三方依赖。
- `docs/`：按参与方式区分的贡献指南。
- `CONTRIBUTING.md`：三类参与者的文档导航。

## 数据契约

- `data/manifest.json` 是非空数组。每个角色含唯一、非空 `id` 和非空 `name`，至少有一个分类。角色和分类 ID 使用小写英文、数字及连字符；角色目录名与角色 ID 相同。
- `subcategories[].file` 是相对 `data/` 的 `.json` 分类文件路径，必须位于对应角色目录下。分类 ID 在同一角色内唯一，分类名称非空。
- 每个分类文件是 JSON 数组；数组中每一项是对象，包含非空 `title`、非空 `url` 和 `tags`。
- `tags.json` 是有序 JSON 对象。顶层键为标签维度，维度值是“维度内标签序号 → 标签文字”的对象。维度书写顺序决定 `tags` 数组位置；维度内部的整数序号不做跨维度展平。
- `tags` 数组必须恰有一个元素对应每个标签维度，按维度顺序填写非负本地整数序号；未知维度使用 JSON `null`。例如 `[2, null, 0]` 表示第一维取本地序号 2、第二维未知、第三维取本地序号 0。
- `tags` 也允许对象写法 `{ "维度名": 本地整数序号或标签文字或 null }`，适合强调维度名或只记录部分维度。未知维度名和未定义的序号/标签文字均无效。
- 当前项目的常规分类为 `animated`（动图）和 `static`（静态图）；数据结构不在校验器中硬编码只允许这两个分类。极短视频应转换成 GIF；较长视频不收录。
- 角色语音由可选的 `data/<role-id>/voice.json` 驱动：数组每项含非空 `text` 和 `src`，`src` 必须指向 `assets/audio/` 下已存在的文件，同一文件内 `src` 不重复。语音不单列成页面区域，只在页面右键彩蛋和桌宠说话时随机取一条播放；角色无语音时彩蛋回落到 `EASTER_EGG.fallbackSrc`。不在 `app.js` 或 `index.html` 写死音频列表。
- 新投稿 `url` 必须指向贡献者公开 Fork 中图片上传 commit 的 `NaiLoong/blob/<40位commit-sha>/<path>`、紧凑格式 `<fork-owner>/<40位commit-sha>/<path>` 或同一文件的 GitHub RAW URL。校验器把等价地址归一后检查重复。禁止使用会随分支后续提交改变内容的 `image` 分支 URL。校验器只校验 URL 结构，不联网请求图片；本地 `assets/placeholders/` 下已存在的占位资源例外保留。
- 桌宠由可选的 `data/pet.json` 驱动：`sheet` 指向 `assets/` 下已存在的雪碧图；`frameWidth`、`frameHeight`、`columns`、`rows` 为正整数；`animations` 是非空数组，每项含唯一小写 `id`、小于 `rows` 的 `row` 和逐帧 `durations`（每项 1–3000 毫秒，帧数不超过 `columns`），必须包含 `idle`；`size` 可选，取值 24–400 像素。桌宠的台词和音频复用当前角色的 `voice.json`，不在 `pet.js` 中写死素材或台词。
- 校验器拒绝数据集中重复的图片 URL，包含同一文件的 blob 与 RAW 地址。图片内容是否重复由人工审核判断。
- 哈希去重使用主分支 `hash.txt` 和 GitHub Actions Cache 中的已入库缓存、预占位缓存。缓存使用共同前缀加时间戳后缀；workflow concurrency 串行化读写，任务完成后保存新缓存并删除旧缓存，失败时保留旧缓存以便下次恢复。预占位代表仍有效的待处理图片，保留在缓存中继续顺延，不写入主分支；每日归档任务才批量追加已入库哈希到 `hash.txt`，写入成功后清理 `ingested` 临时记录。待处理评论换图或清空时回收旧占位；删除未认领评论时释放占位；已认领评论删除后保留占位并标记为已删除，直到对应 PR 合并或关闭；未合并关闭 PR 时保留仍存在的 Issue 投稿占位并解除认领，纯 PR 占位释放供重新检查。
- 单张投稿图片严格小于或等于 5 MB；鼓励压到 2 MB 以下。数据校验器本身不下载 Fork 图片；`meme-hash.yml` 会在受信任的主仓库 workflow 中下载新增 PR 图片和 Issue 附件来执行 5 MB 检查。
- 投稿认领优先使用 Issue 评论完整链接 `https://github.com/lin-alg/NaiLoong/issues/1#issuecomment-<id>`；一个 PR 可以包含多条链接，PR 图片必须覆盖所有被认领评论的全部图片。已存在的 `MEME-CLAIM-...` 口令仍需兼容。
- 数据编辑器允许新增、修改和删除角色与分类；标签管理仅允许重命名标签维度、修改该维度的中英文翻译和新增标签维度，不提供删除标签或修改标签值的操作。新增标签维度时，编辑器会为该角色所有分类中的已有条目补入 `null`；这些限制只属于编辑器界面，不在校验器层面做硬性约束。
- 修改维度顺序或已有维度内标签序号时，同步核查并迁移受影响条目。数组标签从来不表示展平序号；不得重新引入展平解释。
- 修改数据规则时同步更新校验器、测试、项目开发指南的数据规范和相关投稿指南。

## 校验与开发

在仓库根目录运行：

```bash
python scripts/validate_data.py
python -m unittest discover -s tests -v
node tests/search.test.js
node tests/ghimg.test.js
node tests/md.test.js
python -m http.server 8080
```

前五条是 PR CI 和部署前检查；最后一条用于浏览器预览，访问 `http://localhost:8080`。校验器和测试只使用 Python 标准库与 Node 内置断言，不请求网络。

修改校验规则时增加有效和无效输入测试。修改标签解析时，测试本地序号、`null`、对象写法、筛选和展示；修改图片规则时测试 image 分支 commit URL 结构、RAW 错误分支、重复 URL 和 5 MB 限制，且不以真实网络可用性为测试条件。用户可见 UI 改动在本地预览。

## 工作流约定

- `.github/workflows/pr-check.yml` 在所有 Pull Request 上执行校验器单元测试和全仓库数据检查。
- `.github/workflows/deploy.yml` 仅在 `main` 更新或手动触发；测试和数据校验成功后才部署 GitHub Pages。
- `.github/workflows/meme-hash.yml` 使用 `issue_comment` 的创建、编辑和删除事件处理 Issue 图片，使用 `pull_request_target` 处理可信主仓库脚本下的 PR 哈希检查和合并回收，并在每日北京时间 2:00 批量归档 `hash.txt`。
- `.github/workflows/generate-previews.yml` 只在合并到 `main` 的 PR 关闭事件中运行，从合并后的数据记录下载新增或替换的原图，生成保留透明度的预览 WebP 并写入主仓库 `preview` 分支。
- `meme-hash.yml` 不检出或执行 PR 分支代码；只用 GitHub API 读取 PR 文件和公开图片，避免 fork PR 获得主仓库写入逻辑的执行权。哈希状态使用 Actions Cache，所有读写由 workflow concurrency 串行保护；图片网络下载对临时网络错误最多重试 4 次并使用指数退避；每日归档另外使用 concurrency 锁。
- 数据校验器对 PR 图片 URL 不做联网探测；只检查 Fork URL 结构和仓库内重复 URL。`meme-hash.yml` 的哈希和体积 job 是单独的受信任主仓库 workflow；主仓库的占位资源例外。
- 预览图路径为 `previews/<role-id>/<category-id>/<fork-owner>/<image-commit>/<原图路径>.webp`，owner 与 commit 小写，原图路径保留原文件名及扩展名（例如 `laugh.gif.webp`）；最长边不超过 300 像素且严格小于 10 KiB。前端兼容旧的无原扩展名预览路径，列表只加载预览图，点击卡片时在弹窗中加载原始 `url`，下载按钮和图片右键菜单也使用原始 `url`，PNG/GIF 透明度保留。
- Issue 投稿入库后不删除评论：Markdown 图片去掉感叹号成为普通链接，HTML 图片转为普通链接，再用 `RESOLVED` 折叠；保留说明和原始附件地址供追溯与人工找回。
- 手动部署不能绕过检查。面向 fork PR 的 job 不得获得部署凭据。
- 检查失败应修复数据、代码或测试，不要缩小触发范围、跳过失败步骤或接受违背数据契约的格式。

## 文档约定

- `README.md` 面向初次访问项目的人，介绍用途、功能和参与入口；完整数据规范集中放在项目开发指南，不在首页重复。
- `CONTRIBUTING.md` 只帮助读者选择参与方式；`docs/meme-submissions.md` 面向评论上传者，`docs/github-beginner-guide.md` 面向通过 Fork 和 PR 投稿的新手，`docs/project-maintainers-guide.md` 面向修改项目的贡献者。`github-design-system-analysis.md` 只提供本站前端样式参考。
- 对贡献者的说明只包含可直接执行的流程、规则和必要背景，不记录维护者之间的讨论过程、内部决策对话或未完成的实现计划。
- 内部取舍、维护者约定和面向代理的提示集中保存在本文件；不要混入贡献者指南或设计参考。
- 从读者第一次操作的视角复核：正文按完成任务的顺序组织，只保留必经步骤；分支清理、再次投稿、错误处理等支线问题放在同一文档的 FAQ。删掉不能帮助该读者行动的重复解释和泛泛表述。
- 新手指南直接写 Git 命令、命令作用和操作顺序，不用外部教程链接代替流程。
- 低门槛投稿、GitHub 新手 PR、项目代码贡献是三个独立入口，互相链接但不混成一个流程。
- 命令示例应可按顺序执行，标明哪些名称要替换；不要建议 `--force`、`reset --hard` 作为日常修复方式。
- 截图占位使用明确说明截图主题的引用块，便于维护者补图和复核。
- 纯文档改动检查相对链接、标题锚点、示例格式、命令顺序及与实现的一致性，无需运行无关的全量测试；优先修改现有文档，不为拆分内容随意增删文件。
- `LICENSE` 的 MIT 许可不代表社区图片自动采用 MIT 许可。

## 待维护者确认

以下规则仍需维护者以后明确或操作；不影响当前指南按已确定约定执行。

1. **归档方案尚未落地。** 维护者计划定期归档图片；频率、归档范围、校验和、恢复流程及外部服务是否允许这些图片仍待定义。归档落地前，贡献者 Fork 必须保持公开且不删除。
2. **授权反馈的处置范围。** 目前确定的操作是移除主仓库对应 URL 并通知 Fork 所有者处理；通知渠道、响应时限、争议处理和作者署名格式尚未规定。Issue 模板只需用一句话告知此处理方式。
3. **5 MB 限制执行范围。** 文档把 5 MB 作为严格上限；`meme-hash.yml` 会在受信任的主仓库 workflow 中下载新增 PR 图片和 Issue 附件执行检查，但 `validate_data.py` 本身不下载外部图片。若将来扩大机器检查范围，须评估安全、网络依赖、超时和外部 GitHub 限流。
4. **标签质量的人工处理流程。** CI 验证标签维度和本地值有效；标签是否合适由 PR 贡献者拟定并由维护者审核。错误时可请求贡献者修改，或经审核直接编辑 PR 分支；低门槛 Issue 投稿者不负责填写数字标签。
5. **远程图片失效治理。** 校验器不联网检查 Fork 文件是否仍存在。贡献者删除或私有化 Fork 会导致资源失效；定期归档计划的监测和恢复责任尚待确定。
6. **GitHub UI 教程维护。** Fork、分支创建、文件上传和 PR 界面可能变化；由维护者定期检查文字和截图是否仍与当前 GitHub 界面一致。
