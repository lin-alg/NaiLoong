/*
 * 零依赖 Markdown 渲染器，供站内文档阅读器（docs.html）使用。
 *
 * 先整体转义 HTML，再解析 Markdown 语法，因此文档中的原始 HTML
 * 只会被当作文字展示，不存在注入风险。
 *
 * 覆盖本项目文档用到的语法：标题（带 GitHub 风格锚点 id）、段落、
 * 粗体/斜体、行内代码、围栏代码块、链接、图片、<url> 自动链接、
 * 管道表格、引用块、有序/无序列表（按缩进嵌套）、分割线。
 */
(function (global) {
  "use strict";

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 与 GitHub 一致的标题锚点：小写、去掉标点（保留中日韩文字、数字、下划线和连字符）、空格转连字符，重名加序号。
  function slugify(text, used) {
    const base = String(text)
      .trim()
      .toLowerCase()
      .replace(/&[a-z]+;/g, "")
      .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "")
      .replace(/ /g, "-");
    const ids = used || new Set();
    let slug = base || "section";
    let n = 1;
    while (ids.has(slug)) {
      slug = base + "-" + n;
      n += 1;
    }
    ids.add(slug);
    return slug;
  }

  // 把文档内的相对路径（含 ./ 和 ../）拼成相对站点根目录的路径。
  function joinPath(base, rel) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(rel)) return rel;
    const parts = (base + rel).split("/");
    const out = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return out.join("/");
  }

  // options: { base, resolveDoc, repoUrl }
  //   base: 文档所在目录（如 "docs/"），用于解析相对图片和链接
  //   resolveDoc: (path) => docId | null，把仓库内 md 路径映射为站内文档路由
  //   repoUrl: 仓库地址，未登记的 md 文件链接指向 GitHub blob 页
  function createRenderer(options) {
    const opts = options || {};
    const base = opts.base || "";
    const resolveDoc = typeof opts.resolveDoc === "function" ? opts.resolveDoc : () => null;
    const repoUrl = opts.repoUrl || "";

    function imageSrc(src) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(src)) return src;
      return joinPath(base, src);
    }

    function linkTarget(href) {
      if (href.charAt(0) === "#") return { href: href };
      if (/^(?:https?:|mailto:)/i.test(href)) return { href: href, external: true };
      const hashAt = href.indexOf("#");
      const path = hashAt === -1 ? href : href.slice(0, hashAt);
      const anchor = hashAt === -1 ? "" : href.slice(hashAt + 1);
      const resolved = joinPath(base, path);
      const docId = resolveDoc(resolved);
      if (docId) return { href: "#/" + docId + (anchor ? "/" + anchor : "") };
      if (/\.md$/i.test(resolved) && repoUrl) {
        return { href: repoUrl + "/blob/main/" + resolved, external: true };
      }
      return { href: resolved };
    }

    // 行内解析；输入的文本已经完成 HTML 转义。
    function inline(text) {
      const codes = [];
      let out = text.replace(/`([^`\n]+)`/g, (m, code) => {
        codes.push("<code>" + code + "</code>");
        return "\x00" + (codes.length - 1) + "\x00";
      });
      out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, alt, src) =>
        '<img src="' + imageSrc(src) + '" alt="' + alt + '" loading="lazy" decoding="async">'
      );
      out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, label, href) => {
        const target = linkTarget(href);
        return (
          '<a href="' + target.href + '"' +
          (target.external ? ' target="_blank" rel="noopener noreferrer"' : "") +
          ">" + label + "</a>"
        );
      });
      out = out.replace(/&lt;((?:https?:\/\/|mailto:)[^&\s]+)&gt;/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
      out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
      out = out.replace(/\x00(\d+)\x00/g, (m, i) => codes[Number(i)]);
      return out;
    }

    function renderList(items) {
      let html = "";
      const stack = [];
      for (const item of items) {
        while (stack.length && item.indent < stack[stack.length - 1].indent) {
          html += "</li>" + (stack.pop().ordered ? "</ol>" : "</ul>");
        }
        let top = stack[stack.length - 1];
        if (top && item.indent === top.indent && top.ordered !== item.ordered) {
          html += "</li>" + (stack.pop().ordered ? "</ol>" : "</ul>");
          top = stack[stack.length - 1];
        }
        if (!top || item.indent > top.indent) {
          html += item.ordered ? "<ol>" : "<ul>";
          stack.push({ indent: item.indent, ordered: item.ordered });
          html += "<li>";
        } else {
          html += "</li><li>";
        }
        html += inline(item.text);
      }
      while (stack.length) {
        html += "</li>" + (stack.pop().ordered ? "</ol>" : "</ul>");
      }
      return html;
    }

    function renderTable(headLine, alignLine, rowLines) {
      const splitRow = (line) =>
        line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      const heads = splitRow(headLine);
      const aligns = splitRow(alignLine).map((cell) => {
        const left = cell.charAt(0) === ":";
        const right = cell.charAt(cell.length - 1) === ":";
        return left && right ? "center" : right ? "right" : left ? "left" : "";
      });
      const alignAttr = (k) => (aligns[k] ? ' style="text-align:' + aligns[k] + '"' : "");
      let html = "<table><thead><tr>";
      html += heads.map((cell, k) => "<th" + alignAttr(k) + ">" + inline(cell) + "</th>").join("");
      html += "</tr></thead><tbody>";
      rowLines.forEach((line) => {
        const cells = splitRow(line);
        html += "<tr>" + cells.map((cell, k) => "<td" + alignAttr(k) + ">" + inline(cell) + "</td>").join("") + "</tr>";
      });
      html += "</tbody></table>";
      return html;
    }

    function isTableDelimiter(line) {
      return /^\|?[\s:|-]+\|?$/.test(line) && line.indexOf("-") !== -1;
    }

    const FENCE_RE = /^```([A-Za-z0-9_-]*)\s*$/;
    const HEADING_RE = /^(#{1,6})\s+(.*)$/;
    const HR_RE = /^(?:-{3,}|\*{3,})\s*$/;
    const QUOTE_RE = /^&gt;[ ]?(.*)$/;
    const LIST_RE = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
    const BLANK_RE = /^\s*$/;

    function blocks(lines, usedIds) {
      let html = "";
      let i = 0;
      const total = lines.length;

      while (i < total) {
        const line = lines[i];

        if (BLANK_RE.test(line)) {
          i += 1;
          continue;
        }

        const fence = FENCE_RE.exec(line);
        if (fence) {
          const buf = [];
          i += 1;
          while (i < total && !FENCE_RE.test(lines[i])) {
            buf.push(lines[i]);
            i += 1;
          }
          i += 1; // 跳过收尾的 ```；未闭合时到文末为止
          html += "<pre><code" +
            (fence[1] ? ' class="language-' + fence[1] + '"' : "") +
            ">" + buf.join("\n") + "</code></pre>\n";
          continue;
        }

        const heading = HEADING_RE.exec(line);
        if (heading) {
          const level = heading[1].length;
          const raw = heading[2].replace(/\s+#+\s*$/, "");
          const plain = raw.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*]/g, "");
          html += "<h" + level + ' id="' + slugify(plain, usedIds) + '">' + inline(raw) + "</h" + level + ">\n";
          i += 1;
          continue;
        }

        if (HR_RE.test(line)) {
          html += "<hr>\n";
          i += 1;
          continue;
        }

        if (QUOTE_RE.test(line)) {
          const inner = [];
          while (i < total) {
            const q = QUOTE_RE.exec(lines[i]);
            if (!q) break;
            inner.push(q[1]);
            i += 1;
          }
          html += "<blockquote>" + blocks(inner, usedIds) + "</blockquote>\n";
          continue;
        }

        if (line.indexOf("|") !== -1 && i + 1 < total && isTableDelimiter(lines[i + 1])) {
          const rows = [];
          const headLine = line;
          const alignLine = lines[i + 1];
          i += 2;
          while (i < total && !BLANK_RE.test(lines[i]) && lines[i].indexOf("|") !== -1) {
            rows.push(lines[i]);
            i += 1;
          }
          html += renderTable(headLine, alignLine, rows) + "\n";
          continue;
        }

        if (LIST_RE.test(line)) {
          const items = [];
          while (i < total) {
            const m = LIST_RE.exec(lines[i]);
            if (!m) break;
            items.push({
              indent: m[1].replace(/\t/g, "  ").length,
              ordered: !m[2],
              text: m[4]
            });
            i += 1;
          }
          html += renderList(items) + "\n";
          continue;
        }

        const para = [];
        while (
          i < total &&
          !BLANK_RE.test(lines[i]) &&
          !FENCE_RE.test(lines[i]) &&
          !HEADING_RE.test(lines[i]) &&
          !QUOTE_RE.test(lines[i]) &&
          !LIST_RE.test(lines[i]) &&
          !HR_RE.test(lines[i])
        ) {
          para.push(lines[i]);
          i += 1;
        }
        html += "<p>" + inline(para.join(" ")) + "</p>\n";
      }
      return html;
    }

    return { blocks: blocks };
  }

  function render(source, options) {
    const escaped = escapeHtml(String(source).replace(/\r\n?/g, "\n"));
    return createRenderer(options).blocks(escaped.split("\n"), new Set());
  }

  global.MD = { render: render, slugify: slugify, joinPath: joinPath };
})(typeof window !== "undefined" ? window : globalThis);
