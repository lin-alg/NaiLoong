(function () {
  "use strict";

  // Each demo state represents the result of one operation. A new branch is
  // still at B until commit creates I/J; editing and push do not create commits.
  const initial = { synced: false, image: false, work: false, imageCommit: false, workCommit: false,
    imagePushed: false, workPushed: false, head: "main", files: "工作区干净", pr: false };
  const prepared = { ...initial, synced: true, mainPushed: true, previewFetched: true, previewReady: true, screened: true };
  const demo = (command, explanation, changes) => ({ command, explanation, ...changes });
  const steps = [
    {
      title: "准备 Fork 和本地仓库", time: "约 5 分钟",
      description: "先安装 Git，再在 GitHub 上 Fork 项目到自己的账号，最后 clone 到电脑。origin 是你的 Fork，upstream 是项目主仓库；它们是两个不同的远程仓库。下方演示可以逐个操作查看变化。",
      commands: `# 先在 GitHub 点击 Fork → Create fork，再替换下面的用户名\ngit clone https://github.com/<你的用户名>/NaiLoong.git\ncd NaiLoong\ngit remote add upstream https://github.com/lin-alg/NaiLoong.git\ngit remote -v\ngit config --global user.name "你的 GitHub 用户名"\ngit config --global user.email "你的 GitHub 邮箱"`,
      hint: "以下命令在 Git Bash 中执行。替换所有尖括号和署名示例；remote -v 应显示 origin 指向你的 Fork、upstream 指向 lin-alg/NaiLoong。",
      actions: [{ label: "安装 Git for Windows", href: "https://git-scm.com/downloads/win" }, { label: "打开项目并 Fork", href: "https://github.com/lin-alg/NaiLoong/fork" }],
      check: "电脑上已有 NaiLoong 文件夹，终端位于仓库根目录，两个远程地址都正确。",
      extra: "Fork 是你在 GitHub 上的仓库副本；clone 是下载到电脑。演示中的 A、B、I、J 是快照代号，实际 commit 使用哈希编号。",
      base: initial,
      operations: [demo("Fork → clone", "你的 Fork 和本地 main 从同一个版本 A 开始。clone 不会让你直接修改主仓库。", {}),
        demo("git remote add upstream …", "记住主仓库的地址，下一步才能 fetch 它的最新提交。添加远程地址不改变本地文件。", {})]
    },
    {
      title: "同步 main 到最新版本", time: "约 2 分钟",
      description: "从主仓库获取最新提交，再更新本地 main 和 Fork 的 main。这是本次投稿的起点；切分支前先确认工作区没有未提交的改动。",
      commands: `git status\ngit fetch upstream main\ngit switch main\ngit merge --ff-only upstream/main\ngit push origin main`,
      hint: "status 应显示工作区干净；fetch 只下载记录，merge --ff-only 才更新本地 main。若不能快进，查看文字指南 FAQ。",
      actions: [], check: "本地 main 和 origin/main 已同步，可以开始准备图片。",
      extra: "示意图用 B 表示主仓库更新后的版本。main 作为干净的起点，图片与本次 JSON 修改分别在自己的分支提交。",
      base: initial,
      operations: [demo("git fetch upstream main", "下载主仓库的 B。本地文件仍在 A；fetch 本身不会切分支或更新工作区。", {}),
        demo("git merge --ff-only upstream/main", "本地 main 快进到 B，工作区更新到这个版本。没有额外创建合并 commit。", { synced: true }),
        demo("git push origin main", "把本地 main 的更新推到自己的 Fork，origin/main 也来到 B。", { mainPushed: true })]
    },
    {
      title: "下载主仓库的预览图库", time: "约 2 分钟",
      description: "准备一个只放本次新图的文件夹，例如仓库旁边的“待投稿表情”。安装 Python 3.9+ 后，下载主仓库 preview 分支，并将它展开到独立工作目录，供下一步相似图比对。",
      commands: `git fetch upstream preview\ngit worktree add --detach ../NaiLoong-preview upstream/preview\npython -m pip install -r tools/meme-similarity/requirements.txt`,
      hint: "先安装 Python 并勾选 Add Python to PATH；Windows 可用 py 代替 python。worktree 会创建旁边的 NaiLoong-preview 文件夹，当前目录仍在 main。",
      actions: [{ label: "安装 Python", href: "https://www.python.org/downloads/" }],
      check: "../NaiLoong-preview/previews 中已有预览图，Pillow 安装完成；无需把 preview 推送到 Fork。",
      extra: "fetch 只下载主仓库记录；worktree 将预览版本 P 展开到另一个文件夹，--detach 表示无需创建工作分支。已有预览工作目录时，按文字指南 FAQ 更新，无需重复创建。Pillow 只供本地筛查图片使用。",
      base: { ...initial, synced: true, mainPushed: true },
      operations: [demo("git fetch upstream preview", "下载主仓库的预览版本 P。当前 main 仍在 B，Fork 没有新增 preview 分支。", { previewFetched: true }),
        demo("git worktree add --detach ../NaiLoong-preview upstream/preview", "将 P 的文件展开到旁边的预览工作目录。main 的代码与预览图现在可以同时读取。", { previewReady: true }),
        demo("python -m pip install -r tools/meme-similarity/requirements.txt", "安装读取图片用的 Pillow。这个操作不会创建 commit。", {})]
    },
    {
      title: "筛查相似图并人工复核", time: "约 3 分钟",
      description: "将本次原图放进单独的新图文件夹，用 pHash 和 dHash 与全部已有预览比较。工具会在疑似相似的新图旁写标记，并生成并排对照报告；核对后自行决定保留哪些图片。",
      commands: `# 将 ../待投稿表情 替换为你的实际新图文件夹，保留引号\npython tools/meme-similarity/check.py "../待投稿表情" --previews "../NaiLoong-preview/previews"`,
      hint: "运行后打开新图文件夹中 _相似图筛查/<本次运行编号>/report.html。疑似图旁有 *.疑似相似.txt；只将人工复核后保留的原图用于下一步。",
      actions: [{ label: "阈值调整与排错", href: "https://github.com/lin-alg/NaiLoong/blob/main/tools/meme-similarity/README.md" }],
      check: "已查看最新报告并核对文字、动作与含义；读取失败的文件已处理并重跑，准备好了要上传的原图。",
      extra: "默认 pHash 距离 ≤ 14 或 dHash 距离 ≤ 12 就标记，优先多找候选。动图只比首帧，裁剪等变化和缺失预览可能漏检。原图内容与文件名保持不变。整理评论时若决定排除部分图片，先请投稿者在未处理状态下编辑评论；认领 PR 仍须包含更新后评论的全部原图。",
      base: { ...prepared, screened: false },
      operations: [demo("python tools/meme-similarity/check.py …", "读取旁边的预览图库与指定的新图文件夹，离线比对全部预览。当前分支仍为 main。", {}),
        demo("打开 report.html → 人工判断", "并排核对已有图与新图，再决定是否收录。筛查没有创建图片 commit，也没有向 GitHub 推送。", { screened: true })]
    },
    {
      title: "准备图片专用 image 分支", time: "约 1 分钟",
      description: "首次投稿，从刚同步的 main 创建 image。它长期保存在自己的公开 Fork，专门承载原图。已有 image 时，展开下面的说明选择对应命令。",
      commands: `# 首次投稿，Fork 中还没有 image 时\ngit switch -c image`,
      hint: "switch -c 创建并切换分支。此时 image 与 main 指向相同的 B，没有产生新 commit。",
      actions: [], check: "git branch --show-current 输出 image，接下来只在这里放图片。",
      extra: "已有远程 image、本地还没有：先 git fetch origin，再 git switch --track origin/image。本地已有 image：git switch image，再 git pull --ff-only origin image。这个长期分支每次投稿都继续使用。",
      extraTitle: "已有 image 分支怎么做？",
      base: prepared,
      operations: [demo("当前：main", "先站在 main 的 B 上。分支名称是指向快照的指针。", {}),
        demo("git switch -c image", "新建 image 指针并把 HEAD 切到它。虚线是它接下来提交图片的路线；B 仍是共同起点。", { image: true, head: "image" })]
    },
    {
      title: "提交图片并推送到 Fork", time: "约 3 分钟",
      description: "在 assets/memes/ 放入筛查后保留的静态图片或 GIF，单张不超过 5 MB，建议小于 2 MB。整理投稿区评论时，仍须包含所认领评论的全部原图，保持原始内容。",
      commands: `# 将筛查后保留的原图复制到 assets/memes/，报告与标记不用复制\ngit add assets/memes/\ngit status\ngit commit -m "feat: 添加新表情图片"\ngit push -u origin image\ngit rev-parse HEAD\ngit switch main`,
      hint: "git status 确认暂存区只有图片。记下 rev-parse HEAD 输出的 40 位图片 commit SHA，最后切回 main。",
      actions: [], check: "图片已推到 origin/image，记下了图片 SHA，并且已经回到 main。",
      extra: "image 和承载图片的 Fork 请长期保留且保持公开。图片链接固定到上传 commit；后续新增图片不会改变已经提交的链接。image 不合并到主仓库。",
      base: { ...prepared, image: true, head: "image" },
      operations: [demo("复制图片到 assets/memes/", "图片先出现在工作区，历史里还没有新的圆点。", { files: "工作区：新增图片，尚未暂存" }),
        demo("git add assets/memes/", "把这次要提交的图片放进暂存区。add 选择内容，还没有保存快照。", { files: "暂存区：本次图片" }),
        demo('git commit -m "feat: 添加新表情图片"', "创建图片快照 I，image 指向 I。它目前只在电脑上；main 仍在 B。", { imageCommit: true, files: "工作区干净" }),
        demo("git push -u origin image", "把 I 上传到自己的 Fork。push 不创建新 commit，网站将从这个公开快照取原图。", { imagePushed: true }),
        demo("git switch main", "HEAD 回到 B。工作区切回 main 的文件，图片仍保存在 image 的 I 中，编辑器可以跨分支读取。", { head: "main" })]
    },
    {
      title: "创建投稿分支，整理 JSON", time: "约 5 分钟",
      description: "回到最新 main，创建这次的 meme/... 分支，再启动浏览器差异编辑器。扫描本地 image 的最近 N 个 commit，核对角色、分类、标题和标签后确认写入。",
      commands: `git fetch upstream main\ngit merge --ff-only upstream/main\ngit switch -c meme/naiwa-laugh\npython scripts/data_editor.py data`,
      hint: "meme/naiwa-laugh 是示例，后续命令也使用你替换的同一分支名。前面已安装 Python；Windows 可用 py 代替 python。",
      actions: [],
      check: "在 meme/... 分支完成差异复核，编辑器写入成功；git diff 可看到本次 JSON 改动。",
      extra: "默认扫描最近一个 image commit，多次上传可增大 N。删除图片默认只提醒。AI 标注可选：GIF 经 ffmpeg 转为 MP4；抽帧会去掉近似重复画面。密钥不保存，AI 建议需人工核对。",
      base: { ...prepared, image: true, imageCommit: true, imagePushed: true },
      operations: [demo("git switch -c meme/naiwa-laugh", "从 main 的 B 建立本次 JSON 分支，HEAD 切到它。它与 image 各自从基线出发。", { work: true, head: "work" }),
        demo("python scripts/data_editor.py data", "编辑器读取 image 的 I，生成固定到 I 的图片 URL。读取图片不会切换当前投稿分支。", {}),
        demo("复核条目 → 确认并写入数据", "写入并校验 JSON，它现在是工作区里的改动；直到下一步 commit 才会出现新快照。", { files: "工作区：已校验的 JSON 改动" })]
    },
    {
      title: "检查、提交并创建 PR", time: "约 4 分钟",
      description: "检查本次 JSON 差异，提交到 meme/... 分支并推到自己的 Fork。接着在 GitHub 请求维护者把这个分支合并到项目的 main。",
      commands: `python scripts/validate_data.py\npython -m unittest discover -s tests -v\ngit status\ngit add data/naiwa/animated.json\ngit diff --staged\ngit commit -m "feat: 添加奶蛙狂笑表情"\ngit push -u origin meme/naiwa-laugh`,
      hint: "替换数据路径和分支名；若改了多个分类文件，逐个加入暂存区。PR 目标：lin-alg/NaiLoong 的 main；来源：你的 Fork 的 meme/...。",
      actions: [{ label: "打开 GitHub PR 页面", href: "https://github.com/lin-alg/NaiLoong/compare" }],
      check: "Files changed 只有本次 JSON 修改，PR 已创建，等待检查和维护者审核。",
      extra: "整理投稿区时，把每条评论的完整链接放进 PR 描述，收录所认领评论的全部原图。检查报错就在同一工作分支修复、commit、push，原 PR 会自动更新。",
      base: { ...prepared, image: true, work: true, imageCommit: true, imagePushed: true, head: "work", files: "工作区：已校验的 JSON 改动" },
      operations: [demo("git add … → git diff --staged", "先看清这次要提交的 JSON，暂存区的内容才会进入下一个快照。", { files: "暂存区：本次 JSON" }),
        demo('git commit -m "feat: 添加奶蛙狂笑表情"', "创建 JSON 快照 J。记录指向 I 的图片 URL，J 自己只包含本次数据修改。", { workCommit: true, files: "工作区干净" }),
        demo("git push -u origin meme/naiwa-laugh", "将 J 推到你的 Fork。项目主仓库还没有收到这次修改。", { workPushed: true }),
        demo("Create pull request", "请求把 Fork 的 J 合并到项目 main。PR 此时等待检查和审核，创建 PR 不等于已经合并。", { pr: true })]
    }
  ];
  const $ = (id) => document.getElementById(id);
  let current = 0;
  let operation = 0;
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  function renderDemo() {
    const step = steps[current];
    const state = Object.assign({}, step.base, ...step.operations.slice(0, operation + 1));
    const action = step.operations[operation];
    const head = state.head === "work" ? "meme/naiwa-laugh" : state.head;
    $("demoHead").textContent = "HEAD → " + head;
    $("workingState").textContent = state.files;
    $("upstreamState").textContent = state.pr ? "main · B / PR 等待审核" : "main · B（示例最新版本）";
    if (state.previewFetched) $("upstreamState").textContent += " / preview · P";
    $("previewState").hidden = !state.previewFetched;
    $("previewState").textContent = state.previewReady
      ? "旁边的预览工作目录：../NaiLoong-preview · P" + (state.screened ? " · 已完成人工复核" : " · 供本地筛查使用")
      : "已下载 preview · P，等待展开为本地预览工作目录。";
    $("originState").textContent = "main · " + (state.mainPushed ? "B" : "A") +
      (state.imagePushed ? " / image · I" : "") + (state.workPushed ? " / meme/… · J" : "");
    document.querySelectorAll("[data-lane]").forEach((lane) => {
      const key = lane.dataset.lane;
      lane.classList.toggle("lane-active", key === state.head);
      lane.classList.toggle("lane-future", key !== "main" && !state[key]);
    });
    const width = Math.max(180, document.querySelector(".branch-plot").clientWidth);
    const x = (value) => Math.round(value / 520 * width);
    $("gitDiagram").setAttribute("viewBox", "0 0 " + width + " 222");
    const node = (position, y, label, caption, kind) => '<g class="commit-node node-' + kind + '"><circle cx="' + x(position) + '" cy="' + y + '" r="8"/><text x="' + x(position) + '" y="' + (y + 29) + '" text-anchor="middle">' + esc(label + (width >= 420 ? " · " + caption : "")) + '</text></g>';
    let graph = '<path class="branch-line main-line" d="M' + x(40) + ' 40H' + x(state.synced ? 140 : 40) + '"/>' + node(40, 40, "A", "初始版本", "main");
    if (state.synced) graph += node(140, 40, "B", "同步后", "main");
    if (state.image) graph += '<path class="branch-line image-line' + (!state.imageCommit ? ' pending-line' : '') + '" d="M' + x(140) + ' 40C' + x(200) + ' 40 ' + x(170) + ' 110 ' + x(230) + ' 110H' + x(330) + '"/>' +
      (state.imageCommit ? node(330, 110, "I", "图片快照", "image") : '<text x="' + x(320) + '" y="139" text-anchor="middle">仍指向 B</text>');
    if (state.work) graph += '<path class="branch-line work-line' + (!state.workCommit ? ' pending-line' : '') + '" d="M' + x(140) + ' 40C' + x(220) + ' 40 ' + x(170) + ' 180 ' + x(250) + ' 180H' + x(430) + '"/>' +
      (state.workCommit ? node(430, 180, "J", "JSON 快照", "work") : '<text x="' + x(380) + '" y="209" text-anchor="middle">仍指向 B</text>');
    $("gitDiagramContent").innerHTML = graph;
    $("gitDiagramDescription").textContent = action.explanation + " 当前分支 " + head + "。";
    $("demoCommand").textContent = action.command;
    $("demoExplanation").textContent = action.explanation;
    $("demoCounter").textContent = "操作 " + (operation + 1) + " / " + step.operations.length;
    $("demoPrevious").disabled = operation === 0;
    $("demoNext").textContent = operation === step.operations.length - 1 ? "重播本步 ↺" : "下个操作 →";
  }

  function render() {
    const step = steps[current];
    $("stepCounter").textContent = "STEP " + (current + 1) + " OF " + steps.length;
    $("lessonTitle").textContent = step.title;
    $("stepTime").textContent = step.time;
    $("stepDescription").textContent = step.description;
    $("commandText").textContent = step.commands;
    $("commandHint").textContent = step.hint;
    $("stepCheck").textContent = "完成后确认：" + step.check;
    $("terminalBlock").hidden = !step.commands;
    $("stepActions").innerHTML = step.actions.map((action) => '<a class="btn btn-secondary" href="' + action.href + '" target="_blank" rel="noopener noreferrer">' + action.label + ' ↗</a>').join("");
    $("lessonExtra").innerHTML = '<details><summary>' + esc(step.extraTitle || "这一步的补充说明") + '</summary><p>' + esc(step.extra) + '</p></details>';
    $("previousStep").disabled = current === 0;
    $("nextStep").textContent = current === steps.length - 1 ? "重新查看第 1 步 ↺" : "下一步 →";
    $("lessonProgress").style.width = ((current + 1) / steps.length * 100) + "%";
    document.querySelector(".lesson-progress").setAttribute("aria-valuenow", String(current + 1));
    document.querySelector(".lesson-progress").setAttribute("aria-valuemax", String(steps.length));
    $("stepNav").innerHTML = steps.map((value, index) => '<li><button type="button" data-step="' + index + '"' + (index === current ? ' aria-current="step"' : "") + '><span class="step-nav-number">' + (index + 1) + '</span><span class="step-nav-name">' + value.title + '</span></button></li>').join("");
    renderDemo();
  }

  function changeStep(value) {
    current = Math.max(0, Math.min(steps.length - 1, value));
    operation = 0;
    render();
    $("lessonTitle").focus({ preventScroll: true });
    $("lesson").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }

  async function copy() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(steps[current].commands);
      copied = true;
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = steps[current].commands;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      copied = document.execCommand("copy");
      area.remove();
      $("copyCommand").focus({ preventScroll: true });
    }
    const message = $("copyToast");
    message.textContent = copied ? "命令已复制，请替换示例名称后执行" : "复制失败，请手动选择命令复制";
    message.hidden = false;
    window.clearTimeout(copy.timer);
    copy.timer = window.setTimeout(() => { message.hidden = true; }, 2600);
  }

  document.addEventListener("DOMContentLoaded", () => {
    render();
    if (typeof ResizeObserver !== "undefined") {
      let lastWidth = 0;
      new ResizeObserver(([entry]) => {
        if (entry.contentRect.width !== lastWidth) {
          lastWidth = entry.contentRect.width;
          renderDemo();
        }
      }).observe(document.querySelector(".branch-plot"));
    }
    $("previousStep").addEventListener("click", () => changeStep(current - 1));
    $("nextStep").addEventListener("click", () => changeStep((current + 1) % steps.length));
    $("copyCommand").addEventListener("click", copy);
    $("demoPrevious").addEventListener("click", () => { operation = Math.max(0, operation - 1); renderDemo(); });
    $("demoNext").addEventListener("click", () => { operation = (operation + 1) % steps[current].operations.length; renderDemo(); });
    $("stepNav").addEventListener("click", (event) => {
      const button = event.target.closest("[data-step]");
      if (button) changeStep(Number(button.dataset.step));
    });
    document.addEventListener("keydown", (event) => {
      if (event.altKey && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        event.preventDefault();
        changeStep(current + (event.key === "ArrowRight" ? 1 : -1));
      }
    });
  });
})();
