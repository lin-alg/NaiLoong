#!/usr/bin/env python3
"""Generate small WebP previews for images from merged data PRs."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import tempfile
from collections import Counter
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

try:
    from .meme_hash import (
        BotError,
        GitHub,
        GitHubAPIError,
        REPOSITORY,
        fetch_image_bytes,
        github_image_url,
    )
    from .validate_data import _validate_url
except ImportError:
    from meme_hash import (
        BotError,
        GitHub,
        GitHubAPIError,
        REPOSITORY,
        fetch_image_bytes,
        github_image_url,
    )
    from validate_data import _validate_url


ROOT = Path(__file__).resolve().parents[1]
PREVIEW_BRANCH = os.environ.get("PREVIEW_BRANCH", "preview")
PREVIEW_ROOT = "previews"
MAX_PREVIEW_SIDE = 300
MAX_PREVIEW_BYTES = 10 * 1024
IMAGE_CONVERTER = os.environ.get("IMAGE_CONVERTER", "convert")


def _canonical_entry_url(value):
    errors = []
    canonical = _validate_url(value, "PR image URL", ROOT, errors)
    if errors or not canonical or canonical.startswith("assets/placeholders/"):
        return None
    return canonical


def added_preview_entries(base_entries, merged_entries):
    """Return entries whose image URL occurrence was added by the merged PR."""
    base_counts = Counter(
        canonical
        for entry in base_entries
        if isinstance(entry, dict)
        for canonical in [_canonical_entry_url(entry.get("url"))]
        if canonical
    )
    seen_counts = Counter()
    additions = []
    for entry in merged_entries:
        if not isinstance(entry, dict):
            continue
        canonical = _canonical_entry_url(entry.get("url"))
        if not canonical:
            continue
        seen_counts[canonical] += 1
        if seen_counts[canonical] > base_counts[canonical]:
            additions.append(entry)
    return additions


def _manifest_categories(github: GitHub, ref: str):
    text, _ = github.read_contents("data/manifest.json", ref)
    try:
        manifest = json.loads(text or "[]")
    except json.JSONDecodeError as exc:
        raise BotError("Merged manifest is invalid JSON") from exc

    result = {}
    for role in manifest if isinstance(manifest, list) else []:
        if not isinstance(role, dict):
            continue
        role_id = role.get("id")
        for category in role.get("subcategories", []):
            if not isinstance(category, dict):
                continue
            relative = category.get("file")
            if not isinstance(relative, str):
                continue
            path = PurePosixPath("data", relative).as_posix()
            result[path] = (role_id, category.get("id"))
    return result


def new_preview_entries(github: GitHub, pull_request):
    """Find new image records by comparing the base and merged repository trees."""
    base = pull_request.get("base") or {}
    base_sha = base.get("sha")
    merged_sha = pull_request.get("merge_commit_sha")
    if not base_sha or not merged_sha:
        raise BotError("The merged PR is missing base or merge commit SHA")

    categories = _manifest_categories(github, merged_sha)
    result = []
    for item in github.get_pr_files(int(pull_request["number"])):
        filename = PurePosixPath(item.get("filename", "")).as_posix()
        if not filename.startswith("data/") or not filename.endswith(".json"):
            continue
        if PurePosixPath(filename).name in {"manifest.json", "tags.json", "tag-translations.json"}:
            continue
        category = categories.get(filename)
        if not category or item.get("status") == "removed":
            continue

        previous_filename = PurePosixPath(item.get("previous_filename") or filename).as_posix()
        base_entries = github.pr_file_json(
            REPOSITORY, previous_filename, base_sha, allow_missing=item.get("status") == "added"
        )
        merged_entries = github.pr_file_json(REPOSITORY, filename, merged_sha)
        for entry in added_preview_entries(base_entries, merged_entries):
            result.append({"role": category[0], "category": category[1], "entry": entry})
    return result


def _source_parts(url: str):
    raw_url = github_image_url(url)
    if not raw_url:
        return None
    parts = urlsplit(raw_url).path.strip("/").split("/")
    if len(parts) < 4 or len(parts[2]) != 40 or not all(c in "0123456789abcdefABCDEF" for c in parts[2]):
        raise BotError(f"Image URL does not contain a commit SHA: {url}")
    if not parts[0] or not parts[1] or not parts[3:]:
        raise BotError(f"Image URL has no usable source path: {url}")
    return {
        "owner": parts[0].lower(),
        "commit": parts[2].lower(),
        "path": [unquote(part) for part in parts[3:]],
    }


def preview_relative_path(role_id: str, category_id: str, url: str) -> str:
    source = _source_parts(url)
    if not source:
        raise BotError(f"Cannot create a preview path for {url}")
    source_path = list(source["path"])
    filename = source_path.pop()
    preview_name = (filename or "image") + ".webp"
    return PurePosixPath(
        PREVIEW_ROOT,
        role_id,
        category_id,
        source["owner"],
        source["commit"],
        *source_path,
        preview_name,
    ).as_posix()


def _convert_once(source_path: Path, output_path: Path, side: int, quality: int):
    command = [
        IMAGE_CONVERTER,
        f"{source_path}[0]",
        "-auto-orient",
        "-thumbnail",
        f"{side}x{side}>",
        "-colorspace",
        "sRGB",
        "-strip",
        "-quality",
        str(quality),
        str(output_path),
    ]
    return subprocess.run(command, check=True, capture_output=True, text=True)


def convert_to_preview(data: bytes) -> bytes:
    """Convert an image's first frame to a transparent WebP below the byte limit."""
    sides = [
        MAX_PREVIEW_SIDE,
        270,
        240,
        210,
        180,
        150,
        120,
        96,
        72,
        64,
        48,
        32,
        24,
        16,
        8,
        4,
        2,
        1,
    ]
    qualities = [85, 75, 65, 55, 45, 35, 25, 15, 8, 3]
    last_error = None
    with tempfile.TemporaryDirectory(prefix="nailoong-preview-") as directory:
        source_path = Path(directory) / "source-image"
        output_path = Path(directory) / "preview.webp"
        source_path.write_bytes(data)
        for side in sides:
            for quality in qualities:
                try:
                    _convert_once(source_path, output_path, side, quality)
                    result = output_path.read_bytes()
                except (OSError, subprocess.CalledProcessError) as exc:
                    last_error = exc
                    continue
                if len(result) < MAX_PREVIEW_BYTES:
                    return result
        detail = f": {last_error}" if last_error else ""
        raise BotError(f"ImageMagick could not create a preview below 10 KiB{detail}")


def ensure_preview_branch(github: GitHub):
    ref_name = f"heads/{PREVIEW_BRANCH}"
    existing = github.get_ref(ref_name)
    if existing:
        return existing
    main_ref = github.get_ref("heads/main")
    if not main_ref or not main_ref.get("object", {}).get("sha"):
        raise BotError("The main branch ref is unavailable")
    try:
        return github.create_ref(ref_name, main_ref["object"]["sha"])
    except GitHubAPIError as exc:
        if exc.status != 422:
            raise
        return github.get_ref(ref_name)


def write_preview(github: GitHub, path: str, content: bytes):
    existing = github.read_content_item(path, PREVIEW_BRANCH)
    if existing and existing.get("encoding") == "base64":
        current = base64.b64decode((existing.get("content") or "").replace("\n", ""))
        if current == content:
            print(f"Preview already up to date: {path}")
            return
    github.write_binary_contents(
        path,
        PREVIEW_BRANCH,
        content,
        f"chore: add meme preview {PurePosixPath(path).name}",
        existing.get("sha") if existing else None,
    )
    print(f"Wrote preview: {path} ({len(content)} bytes)")


def process_pull_request(github: GitHub, pull_request):
    if not pull_request.get("merged") or (pull_request.get("base") or {}).get("ref") != "main":
        print("PR is not a merged PR targeting main; preview generation is skipped.")
        return

    entries = new_preview_entries(github, pull_request)
    if not entries:
        print("Merged PR has no new image entries; no previews to generate.")
        return

    ensure_preview_branch(github)
    for item in entries:
        entry = item["entry"]
        raw_url = github_image_url(entry.get("url"))
        if not raw_url:
            continue
        original = fetch_image_bytes(raw_url)
        preview = convert_to_preview(original)
        path = preview_relative_path(item["role"], item["category"], entry["url"])
        write_preview(github, path, preview)


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        raise BotError("GITHUB_EVENT_PATH is required")
    with open(event_path, "r", encoding="utf-8") as event_file:
        event = json.load(event_file)
    process_pull_request(GitHub(), event.get("pull_request") or {})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BotError as exc:
        print(f"::error::{exc}")
        raise SystemExit(1)
