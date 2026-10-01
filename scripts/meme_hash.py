#!/usr/bin/env python3
"""GitHub Actions automation for meme image hashes and issue claim statuses."""

from __future__ import annotations

import base64
import copy
import datetime
import hashlib
import html
import json
import os
import re
import secrets
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen

try:
    from .validate_data import _validate_url
except ImportError:
    from validate_data import _validate_url


ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "lin-alg/NaiLoong")
API_ROOT = "https://api.github.com"
STATE_PATH = ".cache/meme-hash/state.json"
ISSUE_NUMBER = 1
MAX_IMAGE_BYTES = 5 * 1024 * 1024
HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")
CLAIM_PATTERN = re.compile(r"\bMEME-CLAIM-[0-9a-f]{24}\b")
MARKDOWN_IMAGE_PATTERN = re.compile(
    r"!\[[^\]]*\]\(\s*(?:<([^>]+)>|(https?://[^\s)>]+))[^)]*\)",
    re.IGNORECASE,
)
HTML_IMAGE_PATTERN = re.compile(r"<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']", re.IGNORECASE)
STATUS_START = "<!-- nai-meme-hash-status:start -->"
STATUS_END = "<!-- nai-meme-hash-status:end -->"
STATUS_BLOCK_PATTERN = re.compile(
    re.escape(STATUS_START) + r".*?" + re.escape(STATUS_END) + r"\r?\n?", re.DOTALL
)
ATTACHMENT_HOSTS = {
    "github.com",
    "user-images.githubusercontent.com",
    "private-user-images.githubusercontent.com",
}
IMAGE_SIGNATURES = (
    b"\x89PNG\r\n\x1a\n",
    b"\xff\xd8\xff",
    b"GIF87a",
    b"GIF89a",
    b"BM",
    b"II*\x00",
    b"MM\x00*",
    b"RIFF",
    b"\x00\x00\x01\x00",
)


class BotError(RuntimeError):
    pass


class ImageTooLargeError(BotError):
    pass


class GitHubAPIError(BotError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def empty_state():
    return {
        "version": 1,
        "ingested": [],
        "reserved": {},
        "comments": {},
        "pull_requests": {},
    }


def normalize_state(value):
    state = value if isinstance(value, dict) else empty_state()
    state.setdefault("version", 1)
    state.setdefault("ingested", [])
    state.setdefault("reserved", {})
    state.setdefault("comments", {})
    state.setdefault("pull_requests", {})
    if not isinstance(state["ingested"], list):
        state["ingested"] = []
    if not isinstance(state["reserved"], dict):
        state["reserved"] = {}
    if not isinstance(state["comments"], dict):
        state["comments"] = {}
    if not isinstance(state["pull_requests"], dict):
        state["pull_requests"] = {}
    return state


def parse_hash_file(text: str) -> set[str]:
    hashes = set()
    for line_number, line in enumerate(text.splitlines(), 1):
        value = line.strip().lower()
        if not value:
            continue
        if not HASH_PATTERN.fullmatch(value):
            raise BotError(f"hash.txt line {line_number} is not a SHA-256 digest")
        hashes.add(value)
    return hashes


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def find_duplicates(hashes, known_hashes):
    seen = set(known_hashes)
    duplicates = []
    for index, digest in enumerate(hashes, 1):
        if digest in seen:
            duplicates.append((index, digest))
        else:
            seen.add(digest)
    return duplicates


def parse_issue_image_urls(body: str) -> list[str]:
    body = html.unescape(body or "")
    matches = re.compile(
        MARKDOWN_IMAGE_PATTERN.pattern + "|" + HTML_IMAGE_PATTERN.pattern,
        re.IGNORECASE,
    )
    return [next(group for group in match.groups() if group) for match in matches.finditer(body)]


def is_supported_image(data: bytes, content_type: str) -> bool:
    if data.startswith(b"RIFF"):
        return data[8:12] == b"WEBP"
    if any(data.startswith(signature) for signature in IMAGE_SIGNATURES if signature != b"RIFF"):
        return True
    if content_type.split(";", 1)[0].strip().lower() == "image/svg+xml":
        return b"<svg" in data[:8192].lower()
    return False


def validate_image_payload(data: bytes, content_type: str) -> None:
    if len(data) > MAX_IMAGE_BYTES:
        raise ImageTooLargeError("Image exceeds the 5 MB limit")
    if not is_supported_image(data, content_type):
        raise BotError("The attached file is not a supported image")


def added_canonical_urls(base_urls, head_urls):
    """Return URL occurrences added by a PR, preserving duplicate occurrences."""
    base_counts = Counter(base_urls)
    seen_counts = Counter()
    additions = []
    for url in head_urls:
        seen_counts[url] += 1
        if seen_counts[url] > base_counts[url]:
            additions.append(url)
    return additions


def github_image_url(url: str) -> str | None:
    errors = []
    canonical = _validate_url(url, "image URL", ROOT, errors)
    if errors:
        raise BotError(errors[0])
    if canonical.startswith("assets/placeholders/"):
        return None

    path_clean = urlsplit(canonical).path.lstrip("/")
    parts = path_clean.split("/")
    default_repo = REPOSITORY.split("/")[-1]

    # 适配: <Github用户名>/<40位commit>/assets/memes/xxx.gif
    if (
        len(parts) >= 3
        and len(parts[1]) == 40
        and all(c in "0123456789abcdefABCDEF" for c in parts[1])
    ):
        owner = parts[0]
        commit = parts[1]
        repo = default_repo
        file_path = "/".join(parts[2:])
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{file_path}"

    # 适配完整 GitHub 链接: owner/repo/raw(或blob)/commit/path
    if len(parts) >= 5 and parts[2] in {"raw", "blob"}:
        owner, repo = parts[0], parts[1]
        commit = parts[3]
        file_path = "/".join(parts[4:])
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{file_path}"

    # 适配标准的 raw 链接: owner/repo/commit/path
    if len(parts) >= 4:
        owner, repo, commit = parts[0], parts[1], parts[2]
        file_path = "/".join(parts[3:])
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{file_path}"

    raise BotError(f"无法解析图片 URL 格式: {canonical}")


class GitHub:
    def __init__(self):
        self.token = os.environ.get("GITHUB_TOKEN")
        if not self.token:
            raise BotError("GITHUB_TOKEN is required")
        self.repository = os.environ.get("GITHUB_REPOSITORY", REPOSITORY)

    def request(self, method: str, path: str, payload=None, accept=None):
        url = API_ROOT + path
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            url,
            data=body,
            method=method,
            headers={
                "Accept": accept or "application/vnd.github+json",
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "User-Agent": "NaiLoong-meme-hash-bot",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                data = response.read()
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise GitHubAPIError(exc.code, f"GitHub API {method} {path}: {detail}") from exc
        except URLError as exc:
            raise BotError(f"GitHub API request failed: {exc}") from exc
        if not data:
            return {}
        try:
            return json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BotError(f"GitHub API returned invalid JSON for {path}") from exc

    def get_optional(self, path: str):
        try:
            return self.request("GET", path)
        except GitHubAPIError as exc:
            if exc.status == 404:
                return None
            raise

    def read_contents(self, path: str, ref: str):
        quoted_path = quote(path, safe="/")
        query = urlencode({"ref": ref})
        item = self.get_optional(f"/repos/{self.repository}/contents/{quoted_path}?{query}")
        if item is None:
            return None, None
        if item.get("encoding") != "base64":
            raise BotError(f"GitHub Contents API did not return base64 content for {path}")
        text = base64.b64decode(item.get("content", "")).decode("utf-8")
        return text, item.get("sha")

    def read_content_item(self, path: str, ref: str):
        quoted_path = quote(path, safe="/")
        query = urlencode({"ref": ref})
        return self.get_optional(f"/repos/{self.repository}/contents/{quoted_path}?{query}")

    def write_contents(self, path: str, branch: str, text: str, message: str, sha=None):
        payload = {
            "message": message,
            "content": base64.b64encode(text.encode("utf-8")).decode("ascii"),
            "branch": branch,
        }
        if sha:
            payload["sha"] = sha
        quoted_path = quote(path, safe="/")
        return self.request("PUT", f"/repos/{self.repository}/contents/{quoted_path}", payload)

    def write_binary_contents(self, path: str, branch: str, content: bytes, message: str, sha=None):
        payload = {
            "message": message,
            "content": base64.b64encode(content).decode("ascii"),
            "branch": branch,
        }
        if sha:
            payload["sha"] = sha
        quoted_path = quote(path, safe="/")
        return self.request("PUT", f"/repos/{self.repository}/contents/{quoted_path}", payload)

    def get_ref(self, ref: str):
        return self.get_optional(f"/repos/{self.repository}/git/ref/{quote(ref, safe='/')}")

    def create_ref(self, ref: str, sha: str):
        return self.request(
            "POST",
            f"/repos/{self.repository}/git/refs",
            {"ref": f"refs/{ref}", "sha": sha},
        )

    def load_state(self):
        state_path = ROOT / STATE_PATH
        if not state_path.is_file():
            return empty_state(), None
        try:
            return normalize_state(json.loads(state_path.read_text(encoding="utf-8"))), None
        except (OSError, json.JSONDecodeError) as exc:
            raise BotError(f"{STATE_PATH} is invalid JSON") from exc

    def mutate_state(self, mutator):
        current, _ = self.load_state()
        updated = copy.deepcopy(current)
        outcome = mutator(updated)
        if updated != current:
            state_path = ROOT / STATE_PATH
            state_path.parent.mkdir(parents=True, exist_ok=True)
            state_path.write_text(
                json.dumps(updated, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
                encoding="utf-8",
            )
        return outcome

    def list_meme_caches(self):
        caches = []
        page = 1
        while True:
            result = self.request(
                "GET",
                f"/repos/{self.repository}/actions/caches?per_page=100&page={page}",
            )
            items = result.get("actions_caches", [])
            caches.extend(items)
            if len(items) < 100:
                return caches
            page += 1

    def delete_cache(self, cache_id):
        self.request("DELETE", f"/repos/{self.repository}/actions/caches/{cache_id}")

    def cleanup_meme_caches(self, current_key):
        prefix = os.environ.get("MEME_HASH_CACHE_PREFIX", "meme-hash-state-")
        for item in self.list_meme_caches():
            key = item.get("key", "")
            if not key.startswith(prefix) or key == current_key:
                continue
            try:
                self.delete_cache(item["id"])
            except GitHubAPIError as exc:
                print(f"::warning::Could not delete old hash cache {item.get('id')}: {exc}")

    def main_hashes(self):
        text, _ = self.read_contents("hash.txt", "main")
        return parse_hash_file(text or "")

    def get_issue_comments(self, issue_number):
        return self.paginated(f"/repos/{self.repository}/issues/{issue_number}/comments")

    def get_pr_files(self, number):
        return self.paginated(f"/repos/{self.repository}/pulls/{number}/files")

    def paginated(self, path):
        records = []
        page = 1
        while True:
            separator = "&" if "?" in path else "?"
            items = self.request("GET", f"{path}{separator}per_page=100&page={page}")
            if not items:
                return records
            records.extend(items)
            if len(items) < 100:
                return records
            page += 1

    def pr_file_json(self, repository, path, ref):
        encoded_path = quote(path, safe="/")
        query = urlencode({"ref": ref})
        endpoint = f"/repos/{repository}/contents/{encoded_path}?{query}"
        try:
            item = self.request("GET", endpoint)
        except GitHubAPIError as exc:
            if exc.status == 404:
                return []
            raise
        if item.get("encoding") != "base64":
            raise BotError(f"Could not read PR file as base64: {path}")
        try:
            parsed = json.loads(base64.b64decode(item.get("content", "")))
        except (ValueError, json.JSONDecodeError) as exc:
            raise BotError(f"PR file is invalid JSON: {path}") from exc
        if not isinstance(parsed, list):
            return []
        return [entry for entry in parsed if isinstance(entry, dict)]

    def read_blob_json(self, blob_sha):
        if not blob_sha:
            return []
        item = self.request("GET", f"/repos/{self.repository}/git/blobs/{blob_sha}")
        if item.get("encoding") != "base64":
            raise BotError(f"Could not read PR file blob as base64: {blob_sha}")
        try:
            parsed = json.loads(base64.b64decode(item.get("content", "")))
        except (ValueError, json.JSONDecodeError) as exc:
            raise BotError(f"PR file blob is invalid JSON: {blob_sha}") from exc
        if not isinstance(parsed, list):
            return []
        return [entry for entry in parsed if isinstance(entry, dict)]

    def issue_comment(self, issue_number, body):
        return self.request(
            "POST",
            f"/repos/{self.repository}/issues/{issue_number}/comments",
            {"body": body},
        )

    def edit_issue_comment(self, comment_id, body):
        return self.request(
            "PATCH",
            f"/repos/{self.repository}/issues/comments/{comment_id}",
            {"body": body},
        )

    def get_issue_comment(self, comment_id):
        return self.request(
            "GET",
            f"/repos/{self.repository}/issues/comments/{comment_id}",
            accept="application/vnd.github.full+json",
        )

    def find_marked_comment(self, issue_number, marker):
        for comment in self.get_issue_comments(issue_number):
            if marker in (comment.get("body") or ""):
                return comment
        return None

    def upsert_marked_comment(self, issue_number, marker, body, comment_id=None):
        full_body = f"{marker}\n{body}"
        if comment_id:
            try:
                return self.edit_issue_comment(comment_id, full_body)
            except GitHubAPIError as exc:
                if exc.status != 404:
                    raise
        existing = self.find_marked_comment(issue_number, marker)
        if existing:
            return self.edit_issue_comment(existing["id"], full_body)
        return self.issue_comment(issue_number, full_body)

    def minimize_comment(self, node_id):
        query = (
            "mutation($id: ID!) { minimizeComment(input: {subjectId: $id, "
            "classifier: SPAM}) { minimizedComment { isMinimized } } }"
        )
        try:
            response = self.request("POST", "/graphql", {"query": query, "variables": {"id": node_id}})
            if response.get("errors"):
                print(f"::warning::Could not minimize duplicate issue comment: {response['errors']}")
        except GitHubAPIError as exc:
            print(f"::warning::Could not minimize duplicate issue comment: {exc}")

    def pr_status_comment(self, number, body, comment_id=None):
        marker = f"<!-- nai-meme-hash-pr:{number} -->"
        return self.upsert_marked_comment(number, marker, body, comment_id)


def fetch_image_bytes(url: str, attachment=False) -> bytes:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    if attachment:
        if host not in ATTACHMENT_HOSTS:
            raise BotError(f"Unsupported issue image host: {host or '(missing)'}")
        if host == "github.com" and not parsed.path.startswith("/user-attachments/assets/"):
            raise BotError("Issue images must be uploaded as GitHub comment attachments")
    elif host != "raw.githubusercontent.com":
        raise BotError("Fork images must be fetched from raw.githubusercontent.com")

    headers = {"User-Agent": "NaiLoong-meme-hash-bot", "Accept": "image/*"}
    if not attachment:
        token = os.environ.get("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
    request = Request(url, headers=headers)
    try:
        with urlopen(request, timeout=25) as response:
            final = urlsplit(response.geturl())
            final_host = (final.hostname or "").lower()
            allowed = ATTACHMENT_HOSTS if attachment else {"raw.githubusercontent.com", "objects.githubusercontent.com"}
            if final.scheme != "https" or final_host not in allowed:
                raise BotError("GitHub image request redirected to an unsupported host")
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > MAX_IMAGE_BYTES:
                raise ImageTooLargeError("Image exceeds the 5 MB limit")
            data = response.read(MAX_IMAGE_BYTES + 1)
            content_type = response.headers.get("Content-Type", "")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise BotError(f"Could not download image from {url}: {exc}") from exc
    validate_image_payload(data, content_type)
    return data


def hash_attachment_urls(urls):
    hashes = []
    for url in urls:
        data = fetch_image_bytes(url, attachment=True)
        hashes.append(sha256_bytes(data))
    return hashes


def hash_fork_urls(urls):
    hashes = []
    for url in urls:
        raw_url = github_image_url(url)
        if raw_url is None:
            continue
        data = fetch_image_bytes(raw_url)
        hashes.append(sha256_bytes(data))
    return hashes


def canonical_urls_from_entries(entries):
    urls = []
    for entry in entries:
        value = entry.get("url")
        if not isinstance(value, str):
            continue
        errors = []
        canonical = _validate_url(value, "PR image URL", ROOT, errors)
        if errors:
            raise BotError(errors[0])
        if canonical.startswith("assets/placeholders/"):
            continue
        urls.append(canonical)
    return urls


def new_data_urls(github: GitHub, pull_request):
    number = pull_request["number"]
    base = pull_request["base"]
    head = pull_request["head"]
    head_repo = (head.get("repo") or {}).get("full_name")
    if not head_repo:
        raise BotError("The PR head repository is unavailable")
    files = github.get_pr_files(number)
    additions = []
    for item in files:
        filename = item.get("filename", "")
        if not filename.startswith("data/") or not filename.endswith(".json"):
            continue
        if PurePosixPath(filename).name in {"manifest.json", "tags.json", "tag-translations.json"}:
            continue
        base_filename = item.get("previous_filename", filename)
        base_entries = github.pr_file_json(REPOSITORY, base_filename, base["sha"])
        if item.get("status") == "removed":
            head_entries = []
        else:
            try:
                head_raw = subprocess.check_output(["git", "show", f"FETCH_HEAD:{filename}"]).decode("utf-8")
                head_entries = [e for e in json.loads(head_raw) if isinstance(e, dict)]
            except Exception as exc:
                print(f"::warning::读取 PR JSON 文件失败: {exc}")
                head_entries = []
        old_urls = canonical_urls_from_entries(base_entries)
        new_urls_in_head = canonical_urls_from_entries(head_entries)
        additions.extend(added_canonical_urls(old_urls, new_urls_in_head))
    return additions


def hash_text(github: GitHub):
    text, _ = github.read_contents("hash.txt", "main")
    return parse_hash_file(text or "")


def issue_status_body(status, hashes=None, claim_code=None, pr_number=None):
    if status == "unprocessed":
        return (
            "[ ⚪ 未处理 ]\n\n"
            f"认领口令：`{claim_code}`\n"
            "处理者请在 PR 描述中原样填写此口令；一个 PR 需包含该评论中的全部图片。"
        )
    if status == "processing":
        return f"[ 🟡 处理中 ]\n\n已由 [PR #{pr_number}](https://github.com/{REPOSITORY}/pull/{pr_number}) 认领。"
    if status == "ingested":
        link = f"\n\n已由 [PR #{pr_number}](https://github.com/{REPOSITORY}/pull/{pr_number}) 合并入库。" if pr_number else ""
        return f"[ 🟢 已入库 ]{link}"
    if status == "oversize":
        return "[ 🔴 图片过大 ]\n\n单张图片严格不能超过 5 MB；请压缩图片后编辑这条评论。"
    duplicate_text = ", ".join(f"第 {index} 张（SHA256 `{digest[:12]}…`）" for index, digest in hashes or [])
    return (
        "[ 🔴 重复图片 ]\n"
        f"发现重复图片：{duplicate_text}。没有图片被占位。请编辑这条评论，移除重复图片后重新提交。"
    )


def strip_status_block(body: str) -> str:
    return STATUS_BLOCK_PATTERN.sub("", body or "", count=1).lstrip("\r\n")


def comment_status(body: str) -> str | None:
    match = STATUS_BLOCK_PATTERN.match(body or "")
    if not match:
        return None
    block = match.group(0)
    for status, label in (
        ("ingested", "[ 🟢 已入库 ]"),
        ("processing", "[ 🟡 处理中 ]"),
        ("unprocessed", "[ ⚪ 未处理 ]"),
        ("oversize", "[ 🔴 图片过大 ]"),
    ):
        if label in block:
            return status
    return "duplicate" if "[ 🔴 重复图片 ]" in block else None


def issue_comment_reply(github: GitHub, comment_id, state, status, hashes=None):
    record = state.get("comments", {}).get(str(comment_id), {})
    current = github.get_issue_comment(comment_id)
    original_body = strip_status_block(current.get("body", ""))
    status_text = issue_status_body(
        status,
        hashes,
        record.get("claim_code"),
        record.get("pr_number"),
    )
    return github.edit_issue_comment(
        comment_id,
        f"{STATUS_START}\n{status_text}\n{STATUS_END}\n\n{original_body}",
    )


def handle_issue_comment(github: GitHub, event):
    issue = event.get("issue") or {}
    comment = event.get("comment") or {}
    if issue.get("number") != ISSUE_NUMBER or issue.get("pull_request"):
        return
    if (comment.get("user") or {}).get("type") == "Bot":
        return
    if event.get("action") == "edited" and (event.get("sender") or {}).get("type") == "Bot":
        return

    full_comment = github.get_issue_comment(comment["id"])
    comment_body = full_comment.get("body", comment.get("body", ""))
    html_body = full_comment.get("body_html") or ""
    urls = parse_issue_image_urls(html_body or comment_body)
    current_status = comment_status(comment_body)
    if not urls and current_status is None:
        return
    initial_state, _ = github.load_state()
    previous = initial_state["comments"].get(str(comment["id"]), {})
    if previous.get("status") == "processing" or current_status in {"processing", "ingested"}:
        print(f"Issue comment {comment['id']} is already claimed or ingested; leaving its status unchanged.")
        return
    if not urls:
        if previous:
            comment_id = str(comment["id"])

            def release_empty_comment(state):
                old = state["comments"].get(comment_id)
                if not old or old.get("status") == "processing":
                    return
                for digest, reservation in list(state["reserved"].items()):
                    if reservation.get("comment_id") == comment_id:
                        reservation["pr_number"] = None
                old["status"] = "unprocessed"
                old["pr_number"] = None

            github.mutate_state(release_empty_comment)
            github.edit_issue_comment(comment["id"], strip_status_block(comment.get("body", "")))
        return
    try:
        hashes = hash_attachment_urls(urls)
    except ImageTooLargeError as exc:
        comment_id = str(comment["id"])

        def release_oversize_comment(state):
            existing = state["comments"].get(comment_id)
            if existing:
                existing["status"] = "unprocessed"
                existing["pr_number"] = None

        github.mutate_state(release_oversize_comment)
        issue_comment_reply(
            github,
            comment["id"],
            _current_state(github),
            "oversize",
        )
        print(f"::warning::{exc}")
        return
    except BotError as exc:
        comment_id = str(comment["id"])

        def release_invalid_comment(state):
            existing = state["comments"].get(comment_id)
            if not existing or existing.get("status") == "processing":
                return
            for digest, reservation in list(state["reserved"].items()):
                if reservation.get("comment_id") == comment_id:
                    reservation["pr_number"] = None
            existing["status"] = "unprocessed"
            existing["pr_number"] = None

        github.mutate_state(release_invalid_comment)
        current = github.get_issue_comment(comment["id"])
        original_body = strip_status_block(current.get("body", ""))
        github.edit_issue_comment(
            comment["id"],
            f"{STATUS_START}\n[ ⚪ 未处理 ]\n机器人暂时无法处理图片：{exc}。未占用任何哈希，请检查图片后编辑评论。\n{STATUS_END}\n\n{original_body}",
        )
        print(f"::warning::{exc}")
        return

    comment_id = str(comment["id"])
    claim_code = f"MEME-CLAIM-{secrets.token_hex(12)}"
    result = {}

    def update(state):
        result.clear()
        known_main = hash_text(github)
        existing = state["comments"].get(comment_id, {})
        if existing.get("pr_number"):
            result["status"] = "processing"
            return

        own_hashes = set(existing.get("hashes", []))
        known = known_main | set(state["ingested"])
        known.update(
            digest
            for digest, reservation in state["reserved"].items()
            if reservation.get("comment_id") != comment_id
        )
        duplicates = find_duplicates(hashes, known)
        for digest in own_hashes:
            reservation = state["reserved"].get(digest, {})
            if reservation.get("comment_id") == comment_id:
                reservation["pr_number"] = None

        if duplicates:
            state["comments"][comment_id] = {
                "hashes": [],
                "claim_code": None,
                "status": "duplicate",
            }
            result.update(status="duplicate", duplicates=duplicates)
            return

        code = existing.get("claim_code") or claim_code
        state["comments"][comment_id] = {
            "hashes": sorted(set(hashes)),
            "claim_code": code,
            "status": "unprocessed",
            "pr_number": None,
        }
        for digest in set(hashes):
            state["reserved"][digest] = {
                "kind": "issue_comment",
                "comment_id": comment_id,
                "claim_code": code,
                "pr_number": None,
            }
        result.update(status="unprocessed", duplicates=[])

    github.mutate_state(update)
    if result.get("status") == "processing":
        return
    status = result["status"]
    issue_comment_reply(github, comment["id"], _current_state(github), status, result.get("duplicates"))
    if status == "duplicate" and len(urls) == 1 and comment.get("node_id"):
        github.issue_comment(
            ISSUE_NUMBER,
            "这条评论中的图片与已入库或已认领的图片重复，机器人已折叠原评论。"
            "请移除重复图片后编辑评论或重新投稿。",
        )
        github.minimize_comment(comment["node_id"])


def _current_state(github):
    state, _ = github.load_state()
    return state


def find_claim_comment(state, claim_code):
    matches = [
        (comment_id, record)
        for comment_id, record in state["comments"].items()
        if record.get("claim_code") == claim_code
    ]
    if len(matches) != 1:
        return None, None
    return matches[0]


def pr_duplicate_errors(hashes, state, main_hashes, number, allowed_comment_id=None):
    known = set(main_hashes) | set(state["ingested"])
    result = []
    seen = set()
    for index, digest in enumerate(hashes, 1):
        if digest in known:
            result.append((index, digest, "already ingested"))
            continue
        if digest in seen:
            result.append((index, digest, "repeated in this PR"))
        else:
            seen.add(digest)

    pr_key = str(number)
    for index, digest in enumerate(hashes, 1):
        reservation = state["reserved"].get(digest)
        if not reservation:
            continue
        if str(reservation.get("pr_number")) == pr_key:
            continue
        if allowed_comment_id and reservation.get("comment_id") == allowed_comment_id:
            continue
        result.append((index, digest, "reserved by another submission"))
    return result


def duplicate_pr_message(duplicates):
    detail = "; ".join(
        f"image {index} `{digest[:12]}…` ({reason})"
        for index, digest, reason in duplicates
    )
    return (
        "[ ❌ Image hash check failed ]\n\n"
        f"Duplicate or reserved images found: {detail}. No new hashes were reserved. "
        "Remove or replace the repeated image, then update this PR."
    )


def process_pull_request(github: GitHub, pull_request):
    number = int(pull_request["number"])
    if (pull_request.get("base") or {}).get("ref") != "main":
        print(f"PR #{number} does not target main; hash check is skipped.")
        return
    try:
        subprocess.run(
            ["git", "fetch", "--depth=1", "origin", f"pull/{number}/head"],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as exc:
        raise BotError(f"无法拉取 PR #{number} 的 Git 数据: {exc.stderr.decode()}")
    urls = new_data_urls(github, pull_request)
    claim_matches = CLAIM_PATTERN.findall(pull_request.get("body") or "")
    if not urls and not claim_matches:
        state, _ = github.load_state()
        if str(number) not in state["pull_requests"]:
            print(f"PR #{number} does not add meme image URLs; hash check has nothing to reserve.")
            return
    hashes = hash_fork_urls(urls)
    claim_code = claim_matches[0] if len(set(claim_matches)) == 1 else None
    if len(set(claim_matches)) > 1:
        raise BotError("PR description contains more than one claim code")
    result = {}

    def update(state):
        result.clear()
        main_hashes = hash_text(github)
        pr_key = str(number)
        previous = state["pull_requests"].get(pr_key, {})
        previous_comment_id = previous.get("issue_comment_id")

        def release_previous():
            if previous_comment_id:
                result["released_comment_id"] = str(previous_comment_id)
            for digest, reservation in list(state["reserved"].items()):
                if str(reservation.get("pr_number")) != pr_key:
                    continue
                if reservation.get("comment_id"):
                    reservation["pr_number"] = None
                else:
                    reservation["pr_number"] = None
            if previous_comment_id:
                old_comment = state["comments"].get(str(previous_comment_id))
                if old_comment and old_comment.get("pr_number") == number:
                    old_comment["pr_number"] = None
                    old_comment["status"] = "unprocessed"
            state["pull_requests"].pop(pr_key, None)

        if previous_comment_id and not claim_code:
            release_previous()
            result.update(ok=False, reason="Keep the issue claim code in the PR description.")
            return

        issue_comment_id = None
        if claim_code:
            issue_comment_id, issue_record = find_claim_comment(state, claim_code)
            print(f"::notice::[DEBUG] urls = {urls}")
            print(f"::notice::[DEBUG] PR hashes = {hashes}")
            print(f"::notice::[DEBUG] Issue expected hashes = {issue_record.get('hashes', []) if issue_record else 'None (未找到认领记录)'}")
            if issue_record is None:
                release_previous()
                result.update(ok=False, reason="The issue claim code is unknown or expired.")
                return
            if issue_record.get("status") == "ingested":
                release_previous()
                result.update(ok=False, reason="This issue submission is already merged.")
                return
            if issue_record.get("pr_number") not in (None, number):
                release_previous()
                result.update(ok=False, reason="This issue submission is already claimed by another PR.")
                return
            if set(hashes) != set(issue_record.get("hashes", [])):
                release_previous()
                result.update(
                    ok=False,
                    reason="The PR image hashes must exactly match all images in the claimed issue comment.",
                )
                return

        duplicates = pr_duplicate_errors(
            hashes, state, main_hashes, number, str(issue_comment_id) if issue_comment_id else None
        )
        if duplicates:
            release_previous()
            result.update(ok=False, duplicates=duplicates)
            return

        current_hashes = set(hashes)
        for digest, reservation in list(state["reserved"].items()):
            if str(reservation.get("pr_number")) == pr_key and digest not in current_hashes:
                if reservation.get("comment_id"):
                    reservation["pr_number"] = None
                else:
                    reservation["pr_number"] = None

        for digest in current_hashes:
            reservation = state["reserved"].get(digest)
            if reservation and issue_comment_id and reservation.get("comment_id") == str(issue_comment_id):
                reservation["pr_number"] = number
            else:
                state["reserved"][digest] = {
                    "kind": "pull_request",
                    "pr_number": number,
                    "claim_code": claim_code,
                    "comment_id": str(issue_comment_id) if issue_comment_id else None,
                }

        if not current_hashes and not issue_comment_id:
            state["pull_requests"].pop(pr_key, None)
            result.update(ok=True, issue_comment_id=None)
            return

        state["pull_requests"][pr_key] = {
            "hashes": sorted(current_hashes),
            "issue_comment_id": str(issue_comment_id) if issue_comment_id else None,
            "claim_code": claim_code,
        }
        if issue_comment_id:
            issue_record = state["comments"][str(issue_comment_id)]
            issue_record["status"] = "processing"
            issue_record["pr_number"] = number
        result.update(ok=True, issue_comment_id=issue_comment_id)

    github.mutate_state(update)
    state = _current_state(github)
    if not result.get("ok"):
        message = result.get("reason") or duplicate_pr_message(result.get("duplicates", []))
        github.pr_status_comment(number, message)
        if result.get("released_comment_id"):
            issue_state = _current_state(github)
            issue_comment_reply(
                github,
                result["released_comment_id"],
                issue_state,
                "unprocessed",
            )
        raise BotError(message)

    if result.get("issue_comment_id"):
        issue_state = _current_state(github)
        issue_comment_reply(
            github,
            result["issue_comment_id"],
            issue_state,
            "processing",
        )
    print(f"Image hash check passed for PR #{number} ({len(set(hashes))} new image(s)).")


def close_pull_request(github: GitHub, pull_request):
    number = int(pull_request["number"])
    merged = bool(pull_request.get("merged"))
    result = {}

    def update(state):
        result.clear()
        pr_key = str(number)
        record = state["pull_requests"].get(pr_key)
        if not record:
            result["found"] = False
            return

        comment_id = record.get("issue_comment_id")
        hashes = set(record.get("hashes", []))
        for digest in hashes:
            reservation = state["reserved"].get(digest)
            if not reservation or str(reservation.get("pr_number")) != pr_key:
                continue
            if merged:
                state["ingested"] = sorted(set(state["ingested"]) | {digest})
                state["reserved"].pop(digest, None)
            elif reservation.get("comment_id"):
                reservation["pr_number"] = None
            else:
                reservation["pr_number"] = None

        if comment_id and str(comment_id) in state["comments"]:
            issue_record = state["comments"][str(comment_id)]
            issue_record["status"] = "ingested" if merged else "unprocessed"
            issue_record["pr_number"] = number if merged else None
        state["pull_requests"].pop(pr_key, None)
        result.update(found=True, comment_id=comment_id, hashes=sorted(hashes))

    github.mutate_state(update)
    if result.get("comment_id"):
        issue_state = _current_state(github)
        status = "ingested" if merged else "unprocessed"
        issue_comment_reply(github, result["comment_id"], issue_state, status)
    if result.get("found"):
        if merged:
            print(f"Moved {len(result['hashes'])} image hash(es) to the ingested cache for PR #{number}.")
        else:
            print(f"Released unmerged image reservations for PR #{number}.")


def release_pull_request_state(github: GitHub, number: int):
    result = {}

    def update(state):
        record = state["pull_requests"].pop(str(number), None)
        if not record:
            return
        result["comment_id"] = record.get("issue_comment_id")
        for digest, reservation in list(state["reserved"].items()):
            if str(reservation.get("pr_number")) != str(number):
                continue
            if reservation.get("comment_id"):
                reservation["pr_number"] = None
            else:
                reservation["pr_number"] = None
        if result.get("comment_id"):
            comment = state["comments"].get(str(result["comment_id"]))
            if comment:
                comment["status"] = "unprocessed"
                comment["pr_number"] = None

    github.mutate_state(update)
    return result.get("comment_id")


def archive_ingested_hashes(github: GitHub):
    state, _ = github.load_state()
    batch = set(state["ingested"])
    if not batch:
        print("No newly ingested hashes to archive.")
        return

    for attempt in range(12):
        current_text, sha = github.read_contents("hash.txt", "main")
        current_text = current_text or ""
        current = parse_hash_file(current_text)
        additions = sorted(batch - current)
        if additions:
            prefix = current_text.rstrip("\r\n")
            new_text = (prefix + "\n" if prefix else "") + "\n".join(additions) + "\n"
            try:
                github.write_contents(
                    "hash.txt",
                    "main",
                    new_text,
                    "chore: archive meme hashes ("
                    f"{datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat()})",
                    sha,
                )
                print(f"Archived {len(additions)} image hash(es) in one main-branch commit.")
                break
            except GitHubAPIError as exc:
                if exc.status != 409 or attempt == 11:
                    raise
                time.sleep(min(0.25 * (attempt + 1), 2))
        else:
            print("All ingested hashes are already present in hash.txt.")
            break
    else:
        raise BotError("Could not archive hashes after repeated main-branch conflicts")

    def clear_archived(state):
        remaining = set(state["ingested"]) - batch
        if remaining == set(state["ingested"]):
            return None
        state["ingested"] = sorted(remaining)
        return True

    github.mutate_state(clear_archived)


def handle_event(github: GitHub, event_name: str, event):
    if event_name == "issue_comment":
        handle_issue_comment(github, event)
        return
    if event_name == "pull_request_target":
        pull_request = event.get("pull_request") or {}
        action = event.get("action")
        if action == "closed":
            close_pull_request(github, pull_request)
        elif action in {"opened", "reopened", "synchronize", "edited", "ready_for_review"}:
            try:
                process_pull_request(github, pull_request)
            except ImageTooLargeError as exc:
                number = int(pull_request["number"])
                comment_id = release_pull_request_state(github, number)
                github.pr_status_comment(
                    number,
                    "[ ❌ 图片过大 ]\n\n"
                    f"{exc}。单张图片严格不能超过 5 MB；请压缩图片后更新 PR。",
                )
                if comment_id:
                    issue_comment_reply(github, comment_id, _current_state(github), "unprocessed")
                raise
        return
    if event_name in {"schedule", "workflow_dispatch"}:
        archive_ingested_hashes(github)
        return
    raise BotError(f"Unsupported event: {event_name}")


def main(argv=None):
    argv = argv or sys.argv[1:]
    if len(argv) != 1:
        print("Usage: python scripts/meme_hash.py <event|init-cache|cleanup-cache>", file=sys.stderr)
        return 2
    if argv[0] == "init-cache":
        state_path = ROOT / STATE_PATH
        state_path.parent.mkdir(parents=True, exist_ok=True)
        if not state_path.is_file():
            state_path.write_text(
                json.dumps(empty_state(), ensure_ascii=False, sort_keys=True, indent=2) + "\n",
                encoding="utf-8",
            )
        return 0
    if argv[0] == "cleanup-cache":
        GitHub().cleanup_meme_caches(os.environ.get("MEME_HASH_CACHE_KEY", ""))
        return 0
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        print("GITHUB_EVENT_PATH is required", file=sys.stderr)
        return 2
    try:
        with open(event_path, "r", encoding="utf-8") as event_file:
            event = json.load(event_file)
        handle_event(GitHub(), argv[0], event)
        return 0
    except BotError as exc:
        print(f"::error::{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
