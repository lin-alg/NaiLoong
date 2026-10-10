# 🍼🐲 NaiLoong · 奶-hub

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapull.com)
[![Data Linter](https://img.shields.io/badge/CI-Data%20Linter-blue?logo=github)](https://github.com/lin-alg/NaiLoong/actions/workflows/pr-check.yml)
[![Static Site](https://img.shields.io/badge/Static-SPA%20%2B%20zero%20build-8dd6ff?logo=github)](./index.html)
[![Repo Size](https://img.shields.io/github/repo-size/lin-alg/NaiLoong?color=blue)](https://github.com/lin-alg/NaiLoong)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/lin-alg/NaiLoong)

奶-hub 是一个奶科生物表情包网站，旨在帮助新手入门 GitHub 的使用。

## 快速开始

- **只分享表情：** 在[投稿区](https://github.com/lin-alg/NaiLoong/issues/1)的评论中上传图片。
- **想入门 GitHub 并合并表情到网站：** 阅读[GitHub 新手投稿教程](docs/github-beginner-guide.md)。
- **想改进项目：** 阅读[项目结构与开发指南](docs/project-maintainers-guide.md)。
- **贡献入口：** 查看[贡献指南](CONTRIBUTING.md)。

## 网站功能

- 按角色和分类浏览表情。
- 搜索框可搜索标题/标签。
- 列表展示使用预览图，点击卡片查看原图。
- 在卡片或原图上右键，可下载原图、复制图片 URL 或复制为 Markdown。
- 点击语音气泡收听角色语音。
- 右下角有一只奶蛙桌宠：可以拖着走、点它会说一句话，不用时可以关掉。
- 支持深色、浅色、跟随系统三种配色，以及奶蛙主题。

## 项目结构

```text
NaiLoong/
├── index.html                       # 页面框架
├── assets/
│   ├── audio/                       # 角色语音
│   ├── css/                         # 页面样式
│   ├── js/                          # 页面逻辑
│   ├── pet/                         # 桌宠动作素材
│   └── placeholders/                # 占位图片
├── data/
│   ├── manifest.json                # 角色和分类目录
│   ├── pet.json                     # 桌宠动作表
│   ├── tag-translations.json        # 标签名的翻译文件
│   └── <role-id>/                   # 角色数据
├── docs/                            # 贡献与开发指南
├── scripts/                         # 供 Github Actions 使用的 python 脚本
├── tests/                           # 自动化测试
├── .github/workflows/               # GitHub Actions
├── CONTRIBUTING.md                  # 贡献入口
└── LICENSE                          # MIT 许可证
```

## 本地预览

这是一个无需构建的静态网站。在仓库根目录运行：

```bash
python -m http.server 8080
```

然后在浏览器访问 <http://localhost:8080>。不要直接打开 `index.html`，否则可能有CORS问题。

## 常见问题

### 投稿区评论上传图片后会马上出现在网站上吗？

不会。投稿区评论需要有人整理然后发 PR ，通过检查后由维护者合并。

### 如何反馈项目问题？

网站问题和项目建议请[创建反馈 Issue](https://github.com/lin-alg/NaiLoong/issues/new?template=project_feedback.md)。

### 项目中的图片可以随意使用吗？

• 代码部分： 本项目的所有源代码均基于 MIT 许可证 开源，您可以自由修改、分发和商用，仅需注明来源。
• 图片部分： 
本仓库所引用的所有图片为社区共有，如需在商业项目中使用，需征得原作者的同意。
本仓库自带的图片可随意使用，仅需注明来源。

## Star 历史

<a href="https://www.star-history.com/?repos=lin-alg%2Fnailoong&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=lin-alg/nailoong&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=lin-alg/nailoong&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=lin-alg/nailoong&type=date&legend=top-left" />
 </picture>
</a>