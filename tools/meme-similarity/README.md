# 本地相似表情筛查

上传图片前，用本工具将一批新表情与主仓库 `preview` 分支的预览图比较，标出疑似相似图片，再人工决定是否收录。

## 准备预览图库

安装 Git 和 Python 3.9+，在本地仓库根目录执行。这里的 `upstream` 必须指向 `https://github.com/lin-alg/NaiLoong.git`；首次配置见[新手教程](../../docs/github-beginner-guide.md#三-克隆-fork-仓库并同步主仓库)。

```bash
git fetch upstream preview
git worktree add --detach ../NaiLoong-preview upstream/preview
python -m pip install -r tools/meme-similarity/requirements.txt
```

`fetch` 下载主仓库的 `preview` 分支；`worktree` 将下载的版本展开到旁边的 `NaiLoong-preview` 文件夹。`--detach` 表示只查看这个版本，无需创建本地工作分支。当前仓库继续使用 `main` 或投稿分支。预览图库只用于本地比对，无需推送到 Fork。

Pillow 是这个独立工具用于读取图片的 Python 依赖；网站和数据编辑器无需安装它。

## 筛查本地文件夹

将本次新表情放到一个单独的文件夹。下面的 `../待投稿表情` 要替换成你的实际路径，路径含空格时保留引号；Windows 也可写成 `"D:/图片/待投稿表情"`。

```bash
python tools/meme-similarity/check.py "../待投稿表情" --previews "../NaiLoong-preview/previews"
```

工具递归读取 PNG、JPEG、GIF、WebP、BMP、TIFF，比较每张新图与预览文件夹内的全部图片，不按角色或分类限制。目录与文件的符号链接不参与扫描。比对全程离线。

结果写入新图文件夹：

- 疑似相似的 `meme.gif` 旁出现 `meme.gif.疑似相似.txt`，列出候选路径和距离。
- `_相似图筛查/<本次运行编号>/report.html` 并排显示新图与最接近的已有图。双击打开，图片已嵌入，可离线查看。已有预览符合当前路径规范时，还会提供固定 commit 的原图链接，方便联网核对完整动图。
- 同目录 `report.json` 保存本次参数、命中总数、展示的候选和读取失败信息。

原图片的名称与内容保持不变。人工复核后，自行删除不准备收录的新图，将保留的原图复制到 `image` 分支的 `assets/memes/`。报告和标记文件不随图片上传；仓库已将它们加入 `.gitignore`。

## 调整筛查范围

默认使用 64 位 pHash 与 64 位 dHash，**pHash 距离 ≤ 14 或 dHash 距离 ≤ 12** 就标记。距离是两个哈希中不同的位数，范围 0–64，越小表示画面结构越接近，不是相似度百分比。默认值用于较宽的初筛，仍需用实际表情人工复核。

想进一步扩大范围，并为每张图多展示一些候选：

```bash
python tools/meme-similarity/check.py "../待投稿表情" --previews "../NaiLoong-preview/previews" --phash-threshold 18 --dhash-threshold 16 --max-matches 10
```

| 参数 | 默认值 | 含义 |
| :--- | :--- | :--- |
| `--previews` | 必填 | 已展开的预览图片目录，通常是 `NaiLoong-preview/previews`。 |
| `--phash-threshold` | `14` | pHash 最大汉明距离，0–64；调大时标记更多图片。 |
| `--dhash-threshold` | `12` | dHash 最大汉明距离，0–64；调大时标记更多图片。 |
| `--max-matches` | `5` | 每张新图展示的候选数，必须为正整数；始终比较全部预览，命中总数另行保留。 |

候选先按两个距离中较小的值排序，再按两者之和排序。pHash 使用 32×32 灰度图的低频 8×8 DCT 系数与中位数生成哈希；dHash 比较 9×8 灰度图的水平相邻像素。两者都先校正 EXIF 方向，将透明区域合成到白底。GIF 和其他动画格式只取首帧，与现有预览生成方式一致。

请核对文字、动作和使用含义。相同构图可能误报；裁剪、加边、镜像、不同首帧可能漏检。预览尚未生成的历史条目不在图库中；这次新图之间的互相重复也需要自行检查。这个工具提供收录建议，GitHub 上的 SHA-256 内容重复检查仍按原规则执行。

## 再次筛查与排错

预览工作目录已经存在时，先确认没有修改，再更新到最新版本；无需重复 `worktree add`：

```bash
git fetch upstream preview
git -C ../NaiLoong-preview status
git -C ../NaiLoong-preview merge --ff-only upstream/preview
```

重新运行筛查命令即可。每次会生成一份新报告，刷新本工具生成的同名标记，并清理已不再命中的旧标记；如果新图读取失败，就保留该图的旧标记，如果预览读取失败，就保留尚未重新命中的旧标记。以最新报告为准，失败处理好后重跑。历史报告保留，可自行删除 `_相似图筛查/`。

| 情况 | 处理 |
| :--- | :--- |
| 没有可读取的预览图 | 确认 `--previews` 指向下载目录内的 `previews`，并更新主仓库预览；工具会停止。 |
| 文件读取失败 | 报告显示“本次筛查不完整”，修复或移开损坏文件后重跑，不能将其当作没有重复。 |
| 标记文件名被占用 | 将自己的同名备注移开再重跑；工具只刷新带有本工具标识的标记文件。 |
| `worktree add` 提示目录已存在 | 用上面的更新命令；如果目录并非工作目录，换一个尚不存在的路径并同步修改命令。 |
| 只想严格筛查 | 调低两个阈值；即使都设为 0，也只是感知哈希相同，不能证明原文件完全相同。 |

退出码：`0` 为完成（包含发现相似图的情况）；`1` 为配置、目录或写入错误；`2` 为已生成报告但部分图片读取失败。

如果要移除专用预览工作目录，先确认里面没有需保留的改动，再从主工作目录运行 `git worktree remove ../NaiLoong-preview`。这只移除本地工作目录。

## 验证工具

安装上述 Pillow 依赖后，在仓库根目录运行：

```bash
python -m unittest discover -s tools/meme-similarity -p "test_*.py" -v
```

测试使用临时生成的图片，覆盖压缩缩放、不同图片、透明底、EXIF 方向、动图首帧、阈值、损坏文件和重复运行；不请求网络。
