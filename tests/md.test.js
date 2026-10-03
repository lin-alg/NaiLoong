const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = {};
vm.runInNewContext(fs.readFileSync("assets/js/md.js", "utf8"), context);
const MD = context.MD;

const KNOWN_DOCS = { "docs/github-beginner-guide.md": "github-beginner-guide" };
const OPTS = {
  base: "docs/",
  resolveDoc: (path) => KNOWN_DOCS[path] || null,
  repoUrl: "https://github.com/lin-alg/NaiLoong"
};

// 标题与 GitHub 风格锚点（去标点、空格转连字符、CJK 保留、重名加序号）
let html = MD.render("## 二. 安装 Git 并创建 Fork");
assert.ok(html.includes('<h2 id="二-安装-git-并创建-fork">二. 安装 Git 并创建 Fork</h2>'));

html = MD.render("### 再次投稿怎么操作？");
assert.ok(html.includes('id="再次投稿怎么操作"'));

html = MD.render("## 常见问题 / FAQ");
assert.ok(html.includes('id="常见问题--faq"'));

html = MD.render("## 重复\n\n## 重复");
assert.ok(html.includes('id="重复"'));
assert.ok(html.includes('id="重复-1"'));

// 段落换行合并、粗体、行内代码
html = MD.render("第一行\n第二行\n\n**加粗** 和 `code`");
assert.ok(html.includes("<p>第一行 第二行</p>"));
assert.ok(html.includes("<strong>加粗</strong>"));
assert.ok(html.includes("<code>code</code>"));

// 原始 HTML 一律转义，代码块内容也转义（防注入）
html = MD.render("正文 <b>粗</b>\n\n```html\n<script>alert(1)</script>\n```");
assert.ok(html.includes("&lt;b&gt;粗&lt;/b&gt;"));
assert.ok(!html.includes("<b>粗</b>"));
assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
assert.ok(!html.includes("<script>"));
assert.ok(html.includes('<pre><code class="language-html">'));

// 表格：表头、对齐、行内代码单元格
html = MD.render("| 状态 | 含义 |\n| :--- | ---: |\n| `a` | b |");
assert.ok(html.includes(">状态</th>"));
assert.ok(html.includes('><code>a</code></td>'));
assert.ok(html.includes('style="text-align:right"'));

// 列表：无序、有序与缩进嵌套
html = MD.render("- a\n  - b\n  - c\n- d");
assert.ok(html.includes("<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>"));
html = MD.render("1. 一\n2. 二");
assert.ok(html.includes("<ol><li>一</li><li>二</li></ol>"));

// 引用块（可含图片，图片相对路径按文档目录补全）
html = MD.render("> 说明\n> ![截图](images/a.png)", OPTS);
assert.ok(html.includes("<blockquote>"));
assert.ok(html.includes('src="docs/images/a.png"'));

// 图片与链接
html = MD.render("![alt](https://example.com/x.png)", OPTS);
assert.ok(html.includes('src="https://example.com/x.png"'));

html = MD.render("[教程](github-beginner-guide.md)", OPTS);
assert.ok(html.includes('href="#/github-beginner-guide"'));

html = MD.render("[修订](github-beginner-guide.md#修订已有表情)", OPTS);
assert.ok(html.includes('href="#/github-beginner-guide/修订已有表情"'));

html = MD.render("[未登记](other.md)", OPTS);
assert.ok(html.includes('href="https://github.com/lin-alg/NaiLoong/blob/main/docs/other.md"'));
assert.ok(html.includes('target="_blank"'));

html = MD.render("[外链](https://github.com/lin-alg/NaiLoong/issues/1)");
assert.ok(html.includes('href="https://github.com/lin-alg/NaiLoong/issues/1"'));
assert.ok(html.includes('target="_blank"'));

html = MD.render("[页内](#二-安装-git-并创建-fork)", OPTS);
assert.ok(html.includes('href="#二-安装-git-并创建-fork"'));

// <url> 自动链接
html = MD.render("打开 <http://localhost:8080> 预览");
assert.ok(html.includes('<a href="http://localhost:8080" target="_blank" rel="noopener noreferrer">http://localhost:8080</a>'));

// 分割线
html = MD.render("上文\n\n---\n\n下文");
assert.ok(html.includes("<hr>"));

// joinPath：相对路径与 ../ 归一
assert.strictEqual(MD.joinPath("docs/", "images/a.png"), "docs/images/a.png");
assert.strictEqual(MD.joinPath("docs/", "../CONTRIBUTING.md"), "CONTRIBUTING.md");
assert.strictEqual(MD.joinPath("", "docs/a.md"), "docs/a.md");

// 真实文档冒烟测试：四篇站内文档都要能渲染，且不残留未解析的围栏
for (const file of [
  "docs/github-beginner-guide.md",
  "docs/meme-submissions.md",
  "docs/project-maintainers-guide.md",
  "CONTRIBUTING.md"
]) {
  const src = fs.readFileSync(file, "utf8");
  const out = MD.render(src, {
    base: file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "",
    resolveDoc: (path) => KNOWN_DOCS[path] || null,
    repoUrl: "https://github.com/lin-alg/NaiLoong"
  });
  assert.ok(out.length > 100, file + " 输出过短");
  assert.ok(!out.includes("```"), file + " 残留未解析的代码围栏");
  assert.ok(!/<(script|style|iframe)/i.test(out), file + " 输出了危险标签");
}

console.log("markdown renderer passed");
