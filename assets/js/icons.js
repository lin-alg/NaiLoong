/* 站内 UI 图标。SVG 路径原样取自 Iconify 图标集：lucide 与 lucide-lab（ISC）、tabler（MIT），
   统一 24×24 视窗、stroke="currentColor"，因此颜色跟随文字色，尺寸由调用方给。
   静态 HTML 写 <span data-icon="lucide:search"></span>，脚本启动时 NaiIcons.hydrate() 填充；
   JS 拼 HTML 用 NaiIcons.svg(name, size)，多图标（如角色 icon 字段）用 NaiIcons.markup(value, size)。 */
(function () {
  "use strict";

  var VIEWBOX = "0 0 24 24";
  var DEFAULT_SIZE = 16;

  var REGISTRY = {
    "tabler:baby-bottle":
      "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M5 10h14m-7-8v2m0 0a5 5 0 0 1 5 5v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a5 5 0 0 1 5-5\"/>",
    "tabler:dragon":
      "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"M10.706 8.849L5 5.548L3 12l3.5-1.973L7 13l3.555-1.385\"/><path d=\"M15 9c0 3.5 4 3 4 7c0 3-3 5-5.5 5s-6-.5-6.5-5c2 2 6.592 3.043 7.5 1c1.094-2.461-4-3.459-4-6.5c0-2.062.5-2.5 1.8-3.2\"/><path d=\"M18 6a3 3 270 1 0-3 3h5l1-3z\"/><path d=\"M15 3H7l5 3\"/></g>",
    "lucide-lab:frog-face":
      "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"M6 7h.01\"/><circle cx=\"6\" cy=\"7\" r=\"4\"/><path d=\"M14.4 5.3a10 10 0 0 0-4.8 0\"/><circle cx=\"18\" cy=\"7\" r=\"4\"/><path d=\"M18 7h.01M22 13.5C22 16 17.5 18 12 18S2 16 2 13.5m8 .5h.01M14 14h.01\"/><path d=\"M3.1 9.75A7 7 0 0 0 2 13.5C2 18.2 6.5 22 12 22s10-3.8 10-8.5a7 7 0 0 0-1.1-3.75\"/></g>",
    "lucide:paw-print":
      "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><circle cx=\"11\" cy=\"4\" r=\"2\"/><circle cx=\"18\" cy=\"8\" r=\"2\"/><circle cx=\"20\" cy=\"16\" r=\"2\"/><path d=\"M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045q-.64-2.065-2.7-2.705A3.5 3.5 0 0 1 5.5 10Z\"/></g>",
    "lucide:dices":
      "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><rect width=\"12\" height=\"12\" x=\"2\" y=\"10\" rx=\"2\" ry=\"2\"/><path d=\"m17.92 14l3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6M6 18h.01M10 14h.01M15 6h.01M18 9h.01\"/></g>",
    "lucide:search":
      "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><path d=\"m21 21l-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/></g>",
    "lucide:circle-alert":
      "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 8v4m0 4h.01\"/></g>",
    "lucide:sun":
      "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41\"/></g>",
    "lucide:moon":
      "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\"/>",
    "lucide:sun-moon":
      "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M12 2v2m2.837 12.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715M16 12a4 4 0 0 0-4-4m7-3l-1.256 1.256M20 12h2\"/>",
    "lucide:arrow-left":
      "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"m12 19l-7-7l7-7m7 7H5\"/>",
    "lucide:arrow-up-right":
      "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M7 7h10v10M7 17L17 7\"/>",
    "lucide:egg-fried":
      "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><circle cx=\"11.5\" cy=\"12.5\" r=\"3.5\"/><path d=\"M3 8c0-3.5 2.5-6 6.5-6c5 0 4.83 3 7.5 5s5 2 5 6c0 4.5-2.5 6.5-7 6.5c-2.5 0-2.5 2.5-6 2.5s-7-2-7-5.5c0-3 1.5-3 1.5-5C3.5 10 3 9 3 8\"/></g>"
  };

  function has(name) {
    return Object.prototype.hasOwnProperty.call(REGISTRY, name);
  }

  function svg(name, size) {
    var body = REGISTRY[name];
    if (!body) return "";
    var px = Math.round(Number(size));
    if (!px || px < 8) px = DEFAULT_SIZE;
    return (
      '<svg class="icon" viewBox="' + VIEWBOX + '" width="' + px + '" height="' + px +
      '" fill="none" aria-hidden="true" focusable="false">' + body + "</svg>"
    );
  }

  // value 是空格或逗号分隔的图标名；未登记的名字直接忽略，不输出任何标记。
  function markup(value, size) {
    return String(value == null ? "" : value)
      .split(/[\s,]+/)
      .filter(has)
      .map(function (name) {
        return svg(name, size);
      })
      .join(" ");
  }

  function names() {
    return Object.keys(REGISTRY);
  }

  function hydrate(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll("[data-icon]"), function (node) {
      var html = markup(node.getAttribute("data-icon"), node.getAttribute("data-icon-size"));
      if (html) node.innerHTML = html;
    });
  }

  window.NaiIcons = { has: has, svg: svg, markup: markup, names: names, hydrate: hydrate };
})();
