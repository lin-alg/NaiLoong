# 🍼🐲 NaiLoong · 奶-hub

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapull.com)
[![Data Linter](https://img.shields.io/badge/CI-Data%20Linter-blue?logo=github)](../../actions)
[![Static Site](https://img.shields.io/badge/Static-SPA%20%2B%20zero%20build-8dd6ff?logo=github)](./index.html)
[![Repo Size](https://img.shields.io/github/repo-size/lin-alg/NaiLoong?color=blue)](https://github.com/lin-alg/NaiLoong)

奶-hub 是一个集中展示奶科生物表情包的网站，也能帮助入门 GitHub 的使用。原始表情图片统一托管于贡献者 Fork 仓库的 `image` 分支，网站展示使用主仓库 `preview` 分支中的轻量预览图。

## 🧭 按你的兴趣开始

- **只想分享表情，不想碰 Git：** 去[置顶投稿区](https://github.com/lin-alg/NaiLoong/issues/1)，直接在评论里上传图片。
- **想练习 GitHub 流程并亲自提交：** 看[新手 GitHub 投稿教程](docs/github-beginner-guide.md)，从 Git Bash 的使用到发 PR 一步步完成。
- **想改进网站或项目本身：** 看[项目结构与开发指南](docs/project-maintainers-guide.md)，了解数据约定、项目结构和自动检查机制。
- **贡献规则入口：**[贡献指南](CONTRIBUTING.md)。

---

## ✨ 特性

- 卡片式表情墙，深色为主，可切跟随系统 / 浅色主题
- 角色侧边栏与分类 Tab 由 `data/manifest.json` 自动生成，加角色不用改代码
- 搜索按 <kbd>Enter</kbd> 执行，标题 + 标签一起匹配，`/` 键唤起搜索框，搜完自动滚到表情库
- 动图 / 静态图分页，每页 4 / 8 / 16 / 32 / 64 条可选，偏好会记在本地
- 标签按维度分组筛选，侧边栏与 Tab 的计数跟随搜索结果更新
- 图片懒加载；网站展示 `preview` 分支中的小尺寸 WebP，保留 PNG/GIF 透明度，下载按钮才访问 Fork 中的原图
- GitHub 图片自动探测直连 / gh-proxy 等代理的连通性，选能通的路走，失败逐路回退，最后才换兜底图
- PR 上 CI 运行数据校验、标签解析测试和重复 URL 检查

## 🗂️ 目录结构

```text
NaiLoong/
├── .github/
│   ├── workflows/
│   │   ├── pr-check.yml             # PR 数据校验与测试
│   │   ├── deploy.yml               # GitHub Pages 自动化发布
│   │   ├── meme-hash.yml            # 图片哈希去重、认领和归档
│   │   └── generate-previews.yml    # 合并 PR 后生成预览图
│   ├── ISSUE_TEMPLATE/
│   │   ├── config.yml               # 引导到投稿帖或项目反馈模板
│   │   └── project_feedback.md     # 网站问题与项目建议模板
│   └── pull_request_template.md     # 新手 PR 提交自检清单
├── data/                            # 数据
│   ├── manifest.json                # 全站角色总纲目录
│   ├── tag-translations.json        # 标签名翻译
│   └── <role-id>/                   # 每个角色一个目录
│       ├── animated.json            # 动图分类文件
│       ├── static.json              # 静态图分类文件
│       └── tags.json                # 标签维度与取值表
├── docs/                            # 按人群拆分的贡献与开发指南
├── scripts/validate_data.py         # 可本地运行的数据结构校验器
├── scripts/meme_hash.py              # 图片哈希缓存和投稿状态自动化
├── scripts/generate_previews.py      # 合并 PR 后生成轻量 WebP 预览图
├── tests/                            # 数据校验、标签解析、图片 URL 和哈希测试
├── hash.txt                          # 已归档图片的 SHA-256 哈希列表
├── assets/
│   ├── css/style.css                # GitHub 设计系统风格样式
│   ├── js/app.js                    # 核心驱动：动态渲染、路由与交互
│   ├── js/search.js                 # 毫秒级多维标签搜索器
│   ├── js/ghimg.js                  # GitHub 图片代理探测与逐路回退
│   ├── icons/                       # Favicon 等小图标
│   └── placeholders/                # 示例占位图（提交真实表情时会逐步替换）
├── index.html                       # 纯前端单页骨架 (SPA)
├── CONTRIBUTING.md                  # 贡献入口总览
├── AGENTS.md                        # AI/协作者开发约定与待确认事项
├── LICENSE                          # MIT 开源许可证
└── README.md                        # 你正在看的文档
```

## 🚀 本地预览

静态站，无需构建，起个本地服务器即可：

```bash
python -m http.server 8080
# 打开 http://localhost:8080
```

## 数据规范

### 1. 总纲 `data/manifest.json`

```json
[
  {
    "id": "naiwa",
    "name": "奶蛙",
    "icon": "🍼🐸",
    "subcategories": [
      { "id": "animated", "name": "动图", "file": "naiwa/animated.json" },
      { "id": "static", "name": "静态图", "file": "naiwa/static.json" }
    ]
  }
]
```

角色 `id` 与其 `data/<role-id>/` 目录名相同；角色 ID 和分类 ID 使用小写英文、数字和连字符，并在各自作用域内唯一。`subcategories[].file` 是相对 `data/` 的 JSON 数组文件路径。

### 2. 表情条目 `animated.json` / `static.json`

```json
[
  { "title": "奶蛙狂笑", "tags": [2, 0, 0], "url": "你的用户名/<图片commit SHA>/assets/memes/laugh.png" }
]
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `title` | string | 表情名称，必填 |
| `tags` | number[] 或 object | 数组按 `tags.json` 标签顺序逐维填写，可用 `null` 表示未知；也支持 `{ "smile": 2 }` 形式的对象 |
| `url` | string | 使用自己公开 Fork 的紧凑格式 `用户名/<图片commit SHA>/文件路径`，也可写完整 blob/RAW URL；必须固定到上传图片时的 commit，不使用会变化的 `image` 分支链接。合并后由 Action 按此地址生成预览图，投稿者不用填写预览地址 |

### 3. 标签表 `tags.json`

```json
{
  "smile": { "0": "轻松绷住", "1": "憋笑", "2": "大笑" },
  "age limit": { "0": "老少咸宜", "1": "朋友整活", "2": "重口" },
  "artistic merit": { "0": "下里巴人", "1": "日常", "2": "阳春白雪" }
}
```

`data/tag-translations.json` 为维度键提供中英文显示名；筛选逻辑继续使用 `tags.json` 的维度键，界面显示对应的中文名称。

数组中每个位置对应一个维度，维度顺序与 `tags.json` 一致；填该维度标签的本地序号，不要跨维度展平：

| 维度 | 序号 0 | 序号 1 | 序号 2 |
| :--- | :--- | :--- | :--- |
| `smile` | 轻松绷住 | 憋笑 | 大笑 |
| `age limit` | 老少咸宜 | 朋友整活 | 重口 |
| `artistic merit` | 下里巴人 | 日常 | 阳春白雪 |

所以 `"tags": [2, 0, 1]` = 大笑 + 老少咸宜 + 日常；`[2, null, 1]` 表示年龄限制暂未确定。维度内序号、标签名称都查看该角色自己的 `tags.json`。

维度内序号是非负整数；维度名和标签文字应非空且不能重复。修改维度或已有标签时，先检查同角色所有数据文件，避免旧序号改变含义。

### 4. 预览图与原图

合并到 `main` 的数据 PR 会触发 `Generate Meme Previews` workflow。Action 从合并后的数据中找出新增或替换的图片，读取贡献者 Fork 的固定 commit 原图，取 GIF 首帧或静态图，生成最长边不超过 300 像素且严格小于 10 KiB 的 WebP，并保留 PNG/GIF 的透明度，写入主仓库的 `preview` 分支。

预览分支的目录保持角色和分类层级，不扁平化文件名：

```text
previews/<role-id>/<category-id>/<fork-owner>/<image-commit>/<原图路径>.webp
```

网页卡片只加载这里的 WebP；卡片右上角的下载按钮仍然指向 `url` 中的原图。已有条目的预览图可由维护者按同一目录规则手动提交；自动化只处理之后合并的新 PR。

## 🤝 贡献与维护

- **只分享表情：**在[共享投稿 Issue 评论区](https://github.com/lin-alg/NaiLoong/issues/1)直接上传图片，不需要 Fork、Git 或 JSON。
- **自己提交表情：**跟随[GitHub 新手投稿教程](docs/github-beginner-guide.md)，包含 Fork、Git Bash、分支、PR、更新他人条目和冲突解决。
- **修改网站或数据系统：**查看[项目结构与开发指南](docs/project-maintainers-guide.md)。
- 本地检查：`python scripts/validate_data.py`、`python -m unittest discover -s tests -v`、`node tests/search.test.js` 和 `node tests/ghimg.test.js`。
- 前端风格参考：[github-design-system-analysis.md](./github-design-system-analysis.md)。

## 🗳️ 贡献者公约

- 投稿应符合社区规则并尊重内容来源
- 一个 PR 尽量只做一件事（一个角色 / 一类改动），方便 review

---

[![GitHub Pages](https://img.shields.io/badge/Status-Online-success?logo=github)](https://github.com)
[![Contributors](https://img.shields.io/github/contributors/lin-alg/NaiLoong?color=orange)](https://github.com)
[![Stars](https://img.shields.io/github/stars/lin-alg/NaiLoong?style=social)](https://github.com)
