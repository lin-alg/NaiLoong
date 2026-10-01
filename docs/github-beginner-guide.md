# GitHub 新手投稿教程

本教程带你把[投稿区评论里的图片](https://github.com/lin-alg/NaiLoong/issues/1)转存到自己的 Fork，并提交对应的数据 PR。评论投稿者不需要 Fork；需要完成转存和数据记录的人按本教程操作即可。

## 先理解这几个词

- **仓库（repository）**：项目文件所在的位置。
- **Fork**：把原仓库复制到自己的 GitHub 账号下。你只能直接推送到自己的 fork。
- **本地仓库**：电脑上的工作副本。
- **分支（branch）**：一条独立的改动线。`main` 是默认分支；每个任务使用自己的工作分支。
- **Commit**：把一组本地改动保存成一个有说明的版本。
- **Push**：把本地分支上传到 GitHub。
- **Pull Request（PR）**：请求把你 fork 的工作分支合并进原仓库。
- **origin**：通常指你自己的 fork；**upstream**：原仓库 `lin-alg/NaiLoong`。

## 常用命令速查

先看状态，再进行操作；这些命令都在 Git Bash 的仓库目录中运行：

| 命令 | 用途 |
| :--- | :--- |
| `git status` | 查看当前分支、未提交改动和冲突 |
| `git branch --list` | 查看本地分支；`git branch -a` 也显示远程分支 |
| `git switch main` | 切换到已有的 `main` 分支 |
| `git switch -c my-branch` | 创建并切换到新分支 |
| `git remote -v` | 查看 `origin` / `upstream` 地址 |
| `git fetch upstream` | 获取原仓库的最新记录，不改当前文件 |
| `git add <文件>` | 选择要放进下一次 commit 的文件 |
| `git diff` / `git diff --staged` | 查看未暂存 / 已暂存的改动 |
| `git commit -m "说明"` | 保存已暂存的改动 |
| `git push -u origin my-branch` | 首次上传分支并设置后续默认远程；以后可用 `git push` |
| `git pull --ff-only upstream main` | 获取并快进合并原仓库的 `main`；本地分叉时会停止而不是擅自覆盖 |
| `git log --oneline --graph --all` | 查看分支和提交历史 |

常见顺序是 `status → add → diff --staged → commit → push`。`fetch` 只获取远程信息；`pull` 会获取并尝试合并。不要使用 `git push --force` 来处理普通投稿问题。

## 1. 安装 Git 并 Fork

1. Windows 安装 Git for Windows，安装完成后从开始菜单打开 **Git Bash**。本地运行项目校验器还需要 Python 3.9 或更新版本；没有 Python 也可以先完成投稿，PR 上的 CI 会自动检查。
2. 登录 GitHub，打开本仓库并点右上角 **Fork → Create fork**。Fork 的所有者选自己的账号，并保持仓库为公开状态。
3. GitHub 上的仓库地址会是 `https://github.com/你的用户名/NaiLoong`。后面命令里的 `<你的用户名>` 要换成真实用户名，不要保留尖括号。

> 截图占位：GitHub 仓库右上角的 Fork 菜单与创建 Fork 页面。

## 2. 下载自己的 Fork 并设置远程地址

在 Git Bash 中运行：

```bash
git clone https://github.com/<你的用户名>/NaiLoong.git
cd NaiLoong
git remote add upstream https://github.com/lin-alg/NaiLoong.git
git remote -v
```

输出中 `origin` 应指向你的用户名，`upstream` 应指向 `lin-alg/NaiLoong`。如果提示 `upstream already exists`，不要重复添加，运行 `git remote -v` 检查现有地址即可。

首次提交前设置 Git 记录的署名（替换成你希望显示的名字和 GitHub 邮箱）：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的 GitHub 邮箱"
```

`git push` 首次认证时按 Git Credential Manager 打开的浏览器提示登录。不要把密码或访问令牌写进命令、文件或 Issue。

> 截图占位：Git Bash 中 `git remote -v` 的 origin 和 upstream 输出。

## 3. 更新本地 main

开始前确认工作区干净：

```bash
git status
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
```

此时先不要创建 JSON 工作分支；上传图片需要临时切换到 `image`，下一节会说明。若 `git merge --ff-only` 提示无法快进，先看[同步与冲突处理](#同步远程更改与解决冲突)，不要强行推送。

## 4. 从投稿评论下载图片并转存

第一类投稿者直接把图片上传在[共享投稿 Issue](https://github.com/lin-alg/NaiLoong/issues/1)的评论中。选中要整理的图片，打开原图并保存到电脑；评论附件链接只用于收集，不作为主站最终图片链接。

图片和 JSON 记录分开提交，主仓库只需要收到 JSON 变更。图片单张不得超过 5 MB，建议压缩到 2 MB 以下。统一把图片上传到你公开 Fork 的 `image` 分支：

```bash
git switch main
git switch -c image
mkdir -p assets/memes
cp "/c/Users/你的用户名/Downloads/meme.png" assets/memes/meme.png
git add assets/memes/meme.png
git diff --staged --stat
git commit -m "add meme image"
git push -u origin image
```

Git Bash 下 Windows 的 `C:\Users\名字\Downloads\文件.png` 对应 `/c/Users/名字/Downloads/文件.png`。如果 `image` 分支已存在，运行 `git switch image`，再运行 `git pull --ff-only origin image` 同步已有图片，不要再次创建分支。Fork 请一直保持公开，也不要删除；站点通过固定的图片 commit 读取图片。

上传后在 Git Bash 运行 `git rev-parse HEAD` 记下这次图片上传 commit 的 40 位 SHA，再打开 Fork 中的图片文件，将地址中的 `image` 分支替换为这个 SHA。链接形如：

```text
你的用户名/<图片commit SHA>/assets/memes/meme.png
```

`image` 分支只作为图床，**不对原仓库发 PR，也不合并回原仓库**。本站只接受这类 Fork 的图片链接，不使用其他图床。

> 截图占位：在自己的 Fork 中切换到 image 分支、上传图片并复制 blob 地址。

## 5. 新增表情记录

回到最新 `main`，创建独立的 JSON 工作分支：

```bash
git switch main
git fetch upstream
git merge --ff-only upstream/main
git push origin main
git switch -c meme/naiwa-laugh
```

### 认识表情数据和标签

- `data/manifest.json` 列出角色，以及每个角色有哪些分类文件。
- `data/naiwa/` 是奶蛙数据目录；`data/naidan/` 是奶蛋数据目录。
- `animated.json` 是动图分类文件，`static.json` 是静态图分类文件；`tags.json` 定义这个角色的标签维度和每个维度可选的值。
- 条目里的 `title` 是名称，`url` 是刚才复制的 Fork 图片链接，`tags` 按 `tags.json` 中维度的顺序为每个维度填写一个本地序号。

打开对应分类文件。奶蛙的动图是 `data/naiwa/animated.json`，静态图是 `data/naiwa/static.json`；奶蛋则把目录名改成 `naidan`。在 JSON 数组中新增一项：

```json
{
  "title": "奶蛙狂笑",
  "tags": [2, 0, 0],
  "url": "你的用户名/<图片commit SHA>/assets/memes/meme.png"
}
```

- `title` 简洁描述表情；不要为改善旧图而重复增加同一个条目。
- `tags` 按维度顺序填写本地序号，不要把所有标签展平成一串。例子中 `[2, 0, 0]` 表示 smile 维度选序号 2、age limit 选序号 0、artistic merit 选序号 0。暂时无法判断的维度写 `null`，如 `[2, null, 0]`；也可用对象写法 `{"smile": 2, "age limit": null, "artistic merit": 0}`。每个序号的文字含义查看该角色的 `tags.json`。标签不确定时可在 PR 中请维护者协助，维护者也可以直接修改 PR 分支中的标签。
- `url` 换成 `你的用户名/<40位commit SHA>/<文件路径>` 紧凑地址；也可使用完整的 GitHub blob/RAW 地址。打开图片所在 commit 或文件历史取得 SHA；只写地址，不要写 `![描述](地址)`。不要使用会随 `image` 分支后续提交改变内容的链接。
- JSON 数组中，前一项后面要有逗号，最后一项后面不能有逗号。保存后运行 `python scripts/validate_data.py`；也可以看[项目指南的本地检查](project-maintainers-guide.md#本地运行与检查)。

检查本次改动并提交：

```bash
git status
git diff
git add data/naiwa/animated.json
git diff --staged
git commit -m "add 奶蛙狂笑表情"
git push -u origin meme/naiwa-laugh
```

如果 GitHub 登录认证正常，推送后页面会显示 **Compare & pull request**。

> 截图占位：编辑 JSON 前后对比，以及 GitHub 上的 Compare & pull request 按钮。

## 6. 创建 Pull Request

1. 打开本仓库或你刚推送分支的 GitHub 页面，点 **Compare & pull request**。
2. 检查目标是原仓库 `lin-alg/NaiLoong` 的 `main`，来源是你 fork 的 `meme/...` 工作分支。不要选择 `image` 分支。
3. 标题写明新增或修订了什么；正文可说明角色、分类和图片来源。预览图由合并后的 workflow 生成，不需要在 PR 中填写。
4. 如果你是在处理投稿区评论中的图片，将评论顶部机器人生成的 `MEME-CLAIM-...` 口令原样复制到 PR 描述中。一个 PR 应完整处理该评论中的全部图片。
5. 看 **Data Linter** 和 **Meme Image Hash Check** 检查是否通过。失败时打开检查详情，按报错文件和条目序号修正，然后在同一分支继续 `add → commit → push`；PR 会自动更新。
6. 维护者审阅并合并后，预览图 workflow 会从你的固定 commit 原图生成轻量 WebP 并存入主仓库的 `preview` 分支，同时保留 PNG/GIF 透明度。网站卡片加载预览图，下载按钮仍获取你 Fork 中的原图；不要把 `preview` 分支或 `previews/` 目录加入投稿 PR。

> 截图占位：PR 的 base / compare 分支选择和 Data Linter 检查结果。

## 修订别人的表情

修订已有图片清晰度、标题或标签时，先在 `data/` 中搜索标题或图片 URL，找到对应的那条记录并修改它，不要再追加一条重复记录。

- 只改标题或标签：保留现有 `url`，只改对应 JSON 项。
- 替换图片：把新图放在自己的公开 `image` 分支，更新原条目的 `url`。不要改动原作者 fork，也不要把图片分支合并进主仓库。
- 保留记录中已有的来源信息；PR 说明为什么要改，并提供新旧图片对比。
- 从最新的原仓库 `main` 建立你自己的工作分支，通过 PR 提出修改。维护者会检查是否应采纳以及如何保留署名。

## 同步远程更改与解决冲突

多人改了同一条 JSON，或你的 fork 落后于原仓库时，Git 不能自动判断哪边内容正确，这就是冲突。先运行 `git status`，并确认自己的工作已 commit；不要在冲突文件上继续盲目编辑。

### 先同步原仓库

```bash
git fetch upstream
git switch meme/naiwa-laugh
git merge upstream/main
```

如果没有冲突，检查 `git status` 后运行 `git push`，PR 会更新。如果有冲突，Git 会列出文件。打开冲突文件，会看到类似标记：

```text
<<<<<<< HEAD
你当前分支上的版本
=======
原仓库 main 中的版本
>>>>>>> upstream/main
```

手工整理成最终想保留的内容，并删除 `<<<<<<<`、`=======`、`>>>>>>>` 标记。JSON 冲突要确认逗号、括号和数组位置正确；优先保留双方不同且有价值的表情记录，不要整段覆盖他人的新记录。保存后运行：

```bash
git status
python scripts/validate_data.py
git add data/naiwa/animated.json
git commit -m "merge upstream changes"
git push
```

合并冲突解决后需要一次 commit；如果你还没有开始解决且想放弃这次合并，可运行 `git merge --abort` 回到合并前状态。

### 本地有未提交的改动

先用 `git diff` 查看并保存自己的内容。可以先提交到工作分支，再同步 `upstream/main`。若改动暂时不适合提交，可暂存起来：

```bash
git stash push -m "meme work in progress"
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch meme/naiwa-laugh
git merge main
git stash pop
```

`stash pop` 也可能发生冲突，按上一节方式解决。不要用 `git reset --hard`、`git clean` 或强制推送来“清理”问题；这些命令可能丢失尚未保存的工作。

## 常见问题

| 现象 | 处理方法 |
| :--- | :--- |
| `git: 'switch' is not a git command` | Git 版本较旧。更新 Git for Windows；临时可把 `git switch -c 名称` 换成 `git checkout -b 名称`。 |
| `Author identity unknown` | 按“下载自己的 Fork”一节设置 `user.name` 和 `user.email`。 |
| `remote upstream already exists` | 先用 `git remote -v` 检查；若地址正确，不需要再添加。 |
| 推送时认证失败 | 浏览器完成 Git Credential Manager 登录；不要把 GitHub 密码当作 Git 密码。 |
| `git push` 拒绝更新分支 | 运行 `git fetch origin`，再运行 `git merge origin/meme/naiwa-laugh`（分支名换成当前分支）；有冲突时按上节解决，然后 `git push`。不要 force push。 |
| PR 检查报告 JSON 错误 | 查看报错文件和条目位置，重点检查逗号、引号和方括号。 |
| PR 检查报告标签无效 | 对照该角色的最新 `tags.json` 修正序号或标签文字。 |
| 图片 404 | 确认地址属于正确用户名、公开的 Fork、`image` 分支和文件路径，并确认 Fork 未删除或改为私有。 |
| 本地预览不加载数据 | 在仓库根目录启动 `python -m http.server 8080`，通过 `http://localhost:8080` 访问，不要直接用 `file://` 打开。 |

仍无法处理时，把 `git status` 和错误信息贴到投稿 Issue 或新开求助 Issue；发布前移除令牌、邮箱等私人信息。
