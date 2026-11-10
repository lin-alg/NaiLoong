#!/usr/bin/env python3
"""Compare local submissions with a checked-out previews/ directory, offline."""

from __future__ import annotations

import argparse
import base64
import html
import io
import json
import math
import os
import statistics
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}
REPORT_DIR = "_相似图筛查"
MARKER_SUFFIX = ".疑似相似.txt"
MARKER_HEADER = "NaiLoong 相似图筛查标记 v1\n"
COSINES = tuple(
    tuple(math.cos((2 * position + 1) * frequency * math.pi / 64) for position in range(32))
    for frequency in range(8)
)


def pillow():
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise ValueError(
            "缺少 Pillow。请先运行 python -m pip install -r tools/meme-similarity/requirements.txt"
        ) from exc
    return Image, ImageOps


def first_frame(path):
    """Use preview frame zero and EXIF orientation, then composite onto white."""
    Image, ImageOps = pillow()
    with Image.open(path) as source:
        source.seek(0)
        frame = ImageOps.exif_transpose(source).convert("RGBA")
        background = Image.new("RGBA", frame.size, "white")
        return Image.alpha_composite(background, frame).convert("RGB")


def image_hashes(path):
    """64-bit pHash (32x32 DCT, low 8x8 median) and horizontal 64-bit dHash."""
    Image, _ = pillow()
    gray = first_frame(path).convert("L")
    pixels = gray.resize((32, 32), Image.Resampling.LANCZOS).tobytes()
    # Separable DCT; only the low eight frequencies are needed. No NumPy/SciPy.
    rows = [
        [sum(pixels[y * 32 + x] * COSINES[u][x] for x in range(32)) for u in range(8)]
        for y in range(32)
    ]
    low = [
        sum(rows[y][u] * COSINES[v][y] for y in range(32))
        for v in range(8) for u in range(8)
    ]
    median = statistics.median(low)
    phash = sum(1 << index for index, value in enumerate(low) if value > median)
    small = gray.resize((9, 8), Image.Resampling.LANCZOS).tobytes()
    dhash = sum(
        1 << (y * 8 + x)
        for y in range(8) for x in range(8)
        if small[y * 9 + x + 1] > small[y * 9 + x]
    )
    return phash, dhash


def distance(left, right):
    # bin().count() also works on the project's minimum Python 3.9.
    return bin(left ^ right).count("1")


def find_matches(hashes, library, phash_threshold, dhash_threshold, max_matches):
    matches = []
    for path, reference in library:
        p_distance = distance(hashes[0], reference[0])
        d_distance = distance(hashes[1], reference[1])
        if p_distance <= phash_threshold or d_distance <= dhash_threshold:
            matches.append({"path": str(path), "phash_distance": p_distance, "dhash_distance": d_distance})
    matches.sort(key=lambda item: (
        min(item["phash_distance"], item["dhash_distance"]),
        item["phash_distance"] + item["dhash_distance"], item["path"],
    ))
    return len(matches), matches[:max_matches]


def walk_files(root):
    def fail(error):
        raise error

    for directory, folders, names in os.walk(root, onerror=fail, followlinks=False):
        folders[:] = sorted(
            name for name in folders
            if name not in {REPORT_DIR, ".git", "__pycache__"}
            and not (Path(directory) / name).is_symlink()
        )
        for name in sorted(names):
            path = Path(directory) / name
            if not path.is_symlink():
                yield path


def scan(candidate_dir, preview_dir, phash_threshold=14, dhash_threshold=12, max_matches=5):
    candidate_dir, preview_dir = Path(candidate_dir).resolve(), Path(preview_dir).resolve()
    for path in (candidate_dir, preview_dir):
        if not path.is_dir():
            raise ValueError(f"文件夹不存在：{path}")
    if (candidate_dir == preview_dir or candidate_dir in preview_dir.parents
            or preview_dir in candidate_dir.parents):
        raise ValueError("新图文件夹与预览图库必须分开，不能相同或互相包含。")
    if not 0 <= phash_threshold <= 64 or not 0 <= dhash_threshold <= 64 or max_matches < 1:
        raise ValueError("哈希阈值必须在 0 到 64 之间，候选数量必须大于 0。")
    Image, _ = pillow()
    result = {
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "algorithm": "64-bit pHash + 64-bit dHash; first frame; white alpha matte; OR",
        "candidate_dir": str(candidate_dir), "preview_dir": str(preview_dir),
        "phash_threshold": phash_threshold, "dhash_threshold": dhash_threshold,
        "max_matches": max_matches, "preview_count": 0, "results": [], "errors": [],
    }

    def read_hashes(path, kind):
        try:
            return image_hashes(path)
        except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
            result["errors"].append({"kind": kind, "path": str(path), "error": str(exc)})
            return None

    library = []
    for path in walk_files(preview_dir):
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        hashes = read_hashes(path, "预览图")
        if hashes is not None:
            library.append((path, hashes))
            if len(library) % 100 == 0:
                print(f"已读取 {len(library)} 张预览图…", flush=True)
    if not library:
        detail = f"；{len(result['errors'])} 个文件读取失败" if result["errors"] else ""
        raise ValueError(f"预览图库中没有可读取的图片：{preview_dir}{detail}。请确认传入的是 previews 文件夹。")
    result["preview_count"] = len(library)
    candidate_count = 0
    for path in walk_files(candidate_dir):
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        candidate_count += 1
        hashes = read_hashes(path, "新图")
        if hashes is None:
            continue
        count, matches = find_matches(hashes, library, phash_threshold, dhash_threshold, max_matches)
        result["results"].append({"path": str(path), "match_count": count, "matches": matches})
        if candidate_count % 100 == 0:
            print(f"已比对 {candidate_count} 张新图…", flush=True)
    if not candidate_count:
        raise ValueError(f"新图文件夹中没有支持的图片：{candidate_dir}")
    result["candidate_count"] = candidate_count
    result["matched_count"] = sum(bool(item["match_count"]) for item in result["results"])
    return result


def original_url(path, preview_dir):
    """Recover fixed original links only for the documented preview path format."""
    parts = Path(path).relative_to(preview_dir).parts
    if len(parts) < 5:
        return None
    _, _, owner, commit, *source = parts
    if len(commit) != 40 or any(char not in "0123456789abcdef" for char in commit.lower()):
        return None
    if not source[-1].endswith(".webp"):
        return None
    source[-1] = source[-1][:-5]
    if Path(source[-1]).suffix.lower() not in IMAGE_SUFFIXES:
        return None  # Legacy name.webp does not tell us the original extension.
    return "https://github.com/" + "/".join(quote(part, safe="") for part in [owner, "NaiLoong", "blob", commit, *source])


REPORT_STYLE = """
* { box-sizing: border-box; }
body { margin: 0; background: #f6f8fa; color: #1f2328; font: 16px/1.6 system-ui, sans-serif; }
main { max-width: 1200px; margin: auto; padding: 24px; }
h1 { font-size: 26px; } h2 { font-size: 20px; } h3 { font-size: 17px; }
a { color: #0969da; } a:focus-visible, summary:focus-visible { outline: 3px solid #0969da; outline-offset: 4px; }
p, figcaption, code, li { overflow-wrap: anywhere; }
article { background: white; border: 1px solid #d0d7de; border-radius: 8px; padding: 20px; margin: 24px 0; }
.comparison { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 24px; }
.matches { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 16px; }
figure { margin: 0; min-width: 0; } img { width: 100%; height: 240px; object-fit: contain; background: #f6f8fa; }
figcaption { font-size: 14px; } .notice { padding: 12px; background: #fff8c5; border: 1px solid #9a6700; }
.error { border-color: #cf222e; background: #ffebe9; } .muted { color: #59636e; }
summary { cursor: pointer; padding: 10px 0; } li { margin-bottom: 6px; }
@media (max-width: 640px) { main { padding: 12px; } article { padding: 12px; } .comparison { grid-template-columns: 1fr; } }
"""


def render_report(result):
    esc = html.escape
    thumbnails = {}

    def figure(path, caption, source_url=None):
        if path not in thumbnails:
            frame = first_frame(path)
            frame.thumbnail((300, 300))
            output = io.BytesIO()
            frame.save(output, format="PNG")
            thumbnails[path] = base64.b64encode(output.getvalue()).decode("ascii")
        link = esc(Path(path).as_uri(), quote=True)
        source = f' · <a href="{esc(source_url, quote=True)}">查看已有原图（联网）</a>' if source_url else ""
        return (
            f'<figure><img src="data:image/png;base64,{thumbnails[path]}" alt="{esc(caption, quote=True)}" loading="lazy">'
            f'<figcaption><strong>{esc(caption)}</strong><br><a href="{link}">{esc(path)}</a>{source}</figcaption></figure>'
        )

    sections = []
    for item in result["results"]:
        if not item["matches"]:
            continue
        matches = []
        for match in item["matches"]:
            p, d = match["phash_distance"], match["dhash_distance"]
            caption = f"已有图 · pHash {p}/64，dHash {d}/64"
            matches.append(figure(match["path"], caption, original_url(match["path"], result["preview_dir"])))
        relative = Path(item["path"]).relative_to(result["candidate_dir"]).as_posix()
        sections.append(
            f'<article><h2>疑似相似：{esc(relative)}</h2><p>命中 {item["match_count"]} 张已有图，'
            f'显示最接近的 {len(matches)} 张。</p><div class="comparison">'
            + figure(item["path"], "待投稿新图 · 首帧")
            + '<div class="matches">' + "".join(matches) + '</div></div></article>'
        )
    errors = ""
    if result["errors"]:
        rows = "".join(
            f'<li>{esc(item["kind"])}：{esc(item["path"])} — {esc(item["error"])}</li>'
            for item in result["errors"]
        )
        errors = f'<section class="notice error"><h2>本次筛查不完整</h2><p>以下文件读取失败，请处理后重跑。</p><ul>{rows}</ul></section>'
    unmatched = "".join(
        f'<li>{esc(str(Path(item["path"]).relative_to(result["candidate_dir"])))}</li>'
        for item in result["results"] if not item["match_count"]
    )
    return (
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<title>相似表情复核</title><style>{REPORT_STYLE}</style></head><body><main>'
        '<h1>相似表情复核</h1>'
        f'<p>读取 {result["preview_count"]} 张已有预览图，比对 {len(result["results"])} / {result["candidate_count"]} 张新图，'
        f'标出 {result["matched_count"]} 张疑似相似图片。</p>'
        f'<p class="muted">{esc(result["created_at"])}<br>预览图库：{esc(result["preview_dir"])}</p>'
        f'<p>筛查条件：pHash ≤ {result["phash_threshold"]} 或 dHash ≤ {result["dhash_threshold"]}。'
        '距离越小，画面越接近；不是相似度百分比。</p>'
        '<p class="notice">请人工核对文字、动作和使用含义，再决定是否收录。动图只比较首帧；'
        '裁剪、加边、镜像和首帧变化可能漏检。未命中也不保证没有相似图。报告只作提示。</p>'
        + errors + ("".join(sections) or '<p>本次没有发现疑似相似图片。</p>')
        + f'<details><summary>未命中的新图</summary><ul>{unmatched}</ul></details>'
        '<p>图片已嵌入报告，可离线查看。点击路径打开本地文件；查看已有原图需要联网。</p>'
        '</main></body></html>'
    )


def write_results(result):
    """Refresh only tool-owned sidecars; preserve all original image bytes/names."""
    root = Path(result["candidate_dir"])
    report_root = root / REPORT_DIR
    if report_root.is_symlink():
        raise ValueError(f"报告目录不能是符号链接：{report_root}")
    markers = {}
    for item in result["results"]:
        if item["match_count"]:
            markers[Path(item["path"] + MARKER_SUFFIX)] = item
    # Refuse name collisions before creating reports or touching existing marks.
    owned = []
    for path in walk_files(root):
        if path.name.endswith(MARKER_SUFFIX):
            try:
                is_owned = path.read_text(encoding="utf-8").startswith(MARKER_HEADER)
            except (UnicodeError, OSError):
                is_owned = False
            if is_owned:
                owned.append(path)
            elif path in markers:
                raise ValueError(f"标记文件名已被其他文件占用，请先移开该文件：{path}")
    for path in markers:
        if path.is_symlink():
            raise ValueError(f"标记文件不能是符号链接：{path}")
    # Render first so image read errors cannot leave stale marks half-updated.
    report_html = render_report(result)
    run_dir = report_root / (datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid4().hex[:8])
    run_dir.mkdir(parents=True)
    report_path = run_dir / "report.html"
    report_path.write_text(report_html, encoding="utf-8")
    (run_dir / "report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for path, item in markers.items():
        lines = [MARKER_HEADER.rstrip("\n"), "仅供人工复核，请核对后自行决定是否删除图片。", f"复核报告：{report_path}",
                 f"本次命中 {item['match_count']} 张已有图，以下为最接近的候选："]
        for match in item["matches"]:
            lines.append(f"pHash {match['phash_distance']}/64；dHash {match['dhash_distance']}/64：{match['path']}")
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    # Incomplete reads keep previous marks until a successful rescan.
    failed = {item["path"] for item in result["errors"] if item["kind"] == "新图"}
    preview_failed = any(item["kind"] == "预览图" for item in result["errors"])
    for path in owned:
        if not preview_failed and path not in markers and str(path)[:-len(MARKER_SUFFIX)] not in failed:
            path.unlink()
    return report_path


def main(argv=None):
    parser = argparse.ArgumentParser(description="用 pHash + dHash 筛查与已有预览相似的新表情；结果供人工复核。")
    parser.add_argument("folder", type=Path, help="本次新表情的本地文件夹，递归扫描")
    parser.add_argument("--previews", required=True, type=Path, help="主仓库 preview 分支展开后的 previews 文件夹")
    parser.add_argument("--phash-threshold", type=int, default=14, help="pHash 最大汉明距离，0–64，默认 14")
    parser.add_argument("--dhash-threshold", type=int, default=12, help="dHash 最大汉明距离，0–64，默认 12")
    parser.add_argument("--max-matches", type=int, default=5, help="每张新图最多展示的候选数，默认 5；始终比对全部预览")
    args = parser.parse_args(argv)
    try:
        result = scan(args.folder, args.previews, args.phash_threshold, args.dhash_threshold, args.max_matches)
        report = write_results(result)
    except (OSError, ValueError) as exc:
        print(f"筛查失败：{exc}", file=sys.stderr)
        return 1
    print(f"已比对 {len(result['results'])} 张新图 / {result['preview_count']} 张已有预览，标出 {result['matched_count']} 张疑似相似图片。")
    print(f"请在浏览器打开：{report}")
    if result["errors"]:
        print(f"有 {len(result['errors'])} 个文件读取失败，筛查不完整，详见报告。", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
