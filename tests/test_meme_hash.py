import base64
import copy
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from scripts import meme_hash

from scripts.generate_previews import (
    MAX_PREVIEW_BYTES,
    added_preview_entries,
    convert_to_preview,
    new_preview_entries,
    preview_relative_path,
)
from scripts.meme_hash import (
    added_canonical_urls,
    find_duplicates,
    normalize_state,
    parse_issue_image_urls,
    parse_hash_file,
    strip_status_block,
    validate_image_payload,
)


class MemeHashTests(unittest.TestCase):
    def test_new_preview_entries_reads_the_merged_tree(self):
        commit_a = "a" * 40
        commit_b = "b" * 40
        old_entry = {"title": "旧图", "url": f"contributor/{commit_a}/meme.gif"}
        new_entry = {"title": "新图", "url": f"contributor/{commit_b}/nested/meme.png"}

        class FakeGitHub:
            def read_contents(self, path, ref):
                if (path, ref) != ("data/manifest.json", "merge"):
                    raise AssertionError("unexpected manifest request")
                return (
                    '[{"id":"naiwa","subcategories":[{"id":"animated",'
                    '"file":"naiwa/animated.json"}]}]',
                    None,
                )

            def get_pr_files(self, number):
                if number != 12:
                    raise AssertionError("unexpected PR number")
                return [{"filename": "data/naiwa/animated.json", "status": "modified"}]

            def pr_file_json(self, repository, path, ref, allow_missing=False):
                if repository != "lin-alg/NaiLoong" or path != "data/naiwa/animated.json":
                    raise AssertionError("unexpected data request")
                if ref == "base":
                    return [old_entry]
                if ref != "merge":
                    raise AssertionError("unexpected merge ref")
                return [old_entry, new_entry]

        result = new_preview_entries(
            FakeGitHub(),
            {
                "number": 12,
                "base": {"ref": "main", "sha": "base"},
                "merge_commit_sha": "merge",
            },
        )
        self.assertEqual(result, [{"role": "naiwa", "category": "animated", "entry": new_entry}])

    def test_preview_path_preserves_role_category_and_source_tree(self):
        commit = "b" * 40
        self.assertEqual(
            preview_relative_path(
                "naiwa",
                "animated",
                f"contributor/{commit}/assets/memes/laugh.gif",
            ),
            f"previews/naiwa/animated/contributor/{commit}/assets/memes/laugh.gif.webp",
        )

    def test_preview_paths_distinguish_extensions_and_normalize_owner(self):
        commit = "A" * 40
        prefix = f"MixedOwner/{commit}/assets/memes/Laugh"
        png = preview_relative_path("naiwa", "static", prefix + ".png")
        gif = preview_relative_path("naiwa", "static", prefix + ".gif")
        self.assertNotEqual(png, gif)
        self.assertEqual(
            png,
            f"previews/naiwa/static/mixedowner/{commit.lower()}/assets/memes/Laugh.png.webp",
        )
        self.assertEqual(
            png,
            preview_relative_path(
                "naiwa", "static",
                f"https://github.com/MixedOwner/NaiLoong/blob/{commit}/assets/memes/Laugh.png",
            ),
        )

    def test_preview_path_decodes_source_filename_once(self):
        commit = "a" * 40
        self.assertEqual(
            preview_relative_path("naiwa", "static", f"contributor/{commit}/meme%20one%2Epng"),
            f"previews/naiwa/static/contributor/{commit}/meme one.png.webp",
        )

    def test_added_preview_entries_ignore_title_only_changes(self):
        commit_a = "a" * 40
        commit_b = "b" * 40
        base = [{"title": "旧标题", "url": f"contributor/{commit_a}/meme.gif"}]
        same_image = [{"title": "新标题", "url": f"contributor/{commit_a}/meme.gif"}]
        replacement = [{"title": "替换图片", "url": f"contributor/{commit_b}/meme.gif"}]
        self.assertEqual(added_preview_entries(base, same_image), [])
        self.assertEqual(added_preview_entries(base, replacement), replacement)

    def test_preview_converter_keeps_result_strictly_below_limit(self):
        calls = []

        def fake_convert(source_path: Path, output_path: Path, side: int, quality: int):
            calls.append((side, quality))
            output_path.write_bytes(b"x" * (MAX_PREVIEW_BYTES + 1 if side == 300 else 99))

        with patch("scripts.generate_previews._convert_once", side_effect=fake_convert):
            result = convert_to_preview(b"source")

        self.assertLess(len(result), MAX_PREVIEW_BYTES)
        self.assertEqual(calls[-1][0], 270)

    def test_parse_hash_file_accepts_blank_lines_and_rejects_bad_values(self):
        self.assertEqual(parse_hash_file("\n" + "a" * 64 + "\n"), {"a" * 64})
        with self.assertRaisesRegex(Exception, "line 1"):
            parse_hash_file("not-a-hash\n")

    def test_parse_issue_images_from_markdown_and_html(self):
        body = (
            "![one](https://github.com/user-attachments/assets/one)\n"
            '<img src="https://github.com/user-attachments/assets/two">\n'
            "![not-image](https://example.com/image.png)"
        )
        self.assertEqual(
            parse_issue_image_urls(body),
            [
                "https://github.com/user-attachments/assets/one",
                "https://github.com/user-attachments/assets/two",
                "https://example.com/image.png",
            ],
        )

    def test_parse_issue_images_preserves_markdown_then_html_order(self):
        body = '<img src="https://github.com/user-attachments/assets/two"> ![one](https://github.com/user-attachments/assets/one)'
        self.assertEqual(
            parse_issue_image_urls(body),
            [
                "https://github.com/user-attachments/assets/two",
                "https://github.com/user-attachments/assets/one",
            ],
        )

    def test_parse_issue_body_html_keeps_signed_private_image_url(self):
        signed = (
            "https://private-user-images.githubusercontent.com/1/2.png"
            "?jwt=eyJhbGciOiJIUzI1NiJ9&amp;expires=123"
        )
        self.assertEqual(parse_issue_image_urls(f'<p><img src="{signed}"></p>'), [
            signed.replace("&amp;", "&"),
        ])

    def test_find_duplicates_includes_known_and_repeated_hashes(self):
        digest_a = "a" * 64
        digest_b = "b" * 64
        self.assertEqual(
            find_duplicates([digest_a, digest_b, digest_b], {digest_a}),
            [(1, digest_a), (3, digest_b)],
        )

    def test_added_canonical_urls_only_returns_new_occurrences(self):
        old = ["a", "b", "b"]
        new = ["a", "b", "b", "c", "c"]
        self.assertEqual(added_canonical_urls(old, new), ["c", "c"])

    def test_added_canonical_urls_handles_empty_base(self):
        self.assertEqual(added_canonical_urls([], ["a", "b"]), ["a", "b"])

    def test_state_normalization_adds_cache_sections(self):
        state = normalize_state({"ingested": ["a" * 64]})
        self.assertEqual(state["ingested"], ["a" * 64])
        self.assertEqual(state["reserved"], {})
        self.assertEqual(state["comments"], {})
        self.assertEqual(state["pull_requests"], {})

    def test_status_block_replacement_preserves_comment_body(self):
        body = (
            "<!-- nai-meme-hash-status:start -->\n"
            "[ ⚪ 未处理 ]\n认领口令：MEME-CLAIM-abc\n"
            "<!-- nai-meme-hash-status:end -->\n\n"
            "投稿者的说明和图片链接"
        )
        self.assertEqual(strip_status_block(body), "投稿者的说明和图片链接")

    def test_image_payload_has_strict_five_mb_limit(self):
        with self.assertRaisesRegex(Exception, "5 MB"):
            validate_image_payload(b"x" * (5 * 1024 * 1024 + 1), "image/png")


class MemoryGitHub:
    def __init__(self, state=None, body=""):
        self.state = copy.deepcopy(state or meme_hash.empty_state())
        self.comment = {"id": 31, "node_id": "node-31", "body": body}
        self.calls = []

    def load_state(self):
        return copy.deepcopy(self.state), None

    def mutate_state(self, mutator):
        updated = copy.deepcopy(self.state)
        result = mutator(updated)
        self.state = updated
        return result

    def read_contents(self, path, ref):
        return "", None

    def get_issue_comment(self, comment_id):
        return dict(self.comment)

    def edit_issue_comment(self, comment_id, body):
        self.calls.append(("edit", comment_id, body))
        self.comment["body"] = body
        return dict(self.comment)

    def minimize_comment(self, node_id, classifier="SPAM"):
        self.calls.append(("minimize", node_id, classifier))

    def pr_status_comment(self, number, body, comment_id=None):
        self.calls.append(("pr-comment", number, body))


class HashLifecycleTests(unittest.TestCase):
    def submission_state(self, issue=True):
        digest = "a" * 64
        state = meme_hash.empty_state()
        state["pull_requests"]["7"] = {
            "hashes": [digest], "issue_comment_id": "31" if issue else None,
        }
        state["reserved"][digest] = {
            "pr_number": 7, "comment_id": "31" if issue else None,
        }
        if issue:
            state["comments"]["31"] = {
                "hashes": [digest], "status": "processing", "pr_number": 7,
                "claim_code": "MEME-CLAIM-" + "b" * 24,
            }
        return state, digest

    def comment_event(self):
        return {
            "issue": {"number": 1}, "action": "edited",
            "comment": {"id": 31, "user": {"type": "User"}},
        }

    def test_merged_comment_preserves_links_and_is_folded_after_edit(self):
        state, digest = self.submission_state()
        url = "https://github.com/user-attachments/assets/one"
        github = MemoryGitHub(state, f"Source note\n![original]({url})")
        meme_hash.close_pull_request(github, {"number": 7, "merged": True})
        self.assertEqual(github.state["ingested"], [digest])
        self.assertNotIn(digest, github.state["reserved"])
        self.assertIn(f"[original]({url})", github.comment["body"])
        self.assertIn("Source note", github.comment["body"])
        self.assertEqual(meme_hash.parse_issue_image_urls(github.comment["body"]), [])
        self.assertEqual([call[0] for call in github.calls], ["edit", "minimize"])
        self.assertEqual(github.calls[-1], ("minimize", "node-31", "RESOLVED"))
        meme_hash.close_pull_request(github, {"number": 7, "merged": True})
        self.assertEqual(github.state["ingested"], [digest])
        self.assertEqual(sum(call[0] == "edit" for call in github.calls), 1)

    def test_archive_converts_html_and_reference_images_without_losing_urls(self):
        url = "https://github.com/user-attachments/assets/html"
        original = f'<img width="120" alt="sample" src="{url}">\n![ref][upload]\n[upload]: {url}'
        archived = meme_hash.archive_comment_images(original)
        self.assertIn(url, archived)
        self.assertIn("[ref][upload]", archived)
        self.assertNotIn("<img", archived)
        self.assertEqual(meme_hash.parse_issue_image_urls(archived), [])
        self.assertEqual(meme_hash.archive_comment_images(archived), archived)

    def test_archive_retry_after_comment_api_failure(self):
        state, digest = self.submission_state()
        github = MemoryGitHub(state, "![original](https://github.com/user-attachments/assets/one)")
        edit = github.edit_issue_comment
        with patch.object(github, "edit_issue_comment", side_effect=meme_hash.GitHubAPIError(500, "retry")):
            with self.assertRaises(meme_hash.GitHubAPIError):
                meme_hash.close_pull_request(github, {"number": 7, "merged": True})
        self.assertEqual(github.state["ingested"], [digest])
        self.assertNotIn("7", github.state["pull_requests"])
        github.edit_issue_comment = edit
        meme_hash.close_pull_request(github, {"number": 7, "merged": True})
        self.assertEqual(github.calls[-1], ("minimize", "node-31", "RESOLVED"))

    def test_missing_comment_does_not_abort_merge(self):
        state, digest = self.submission_state()
        github = MemoryGitHub(state)
        with patch.object(github, "get_issue_comment", side_effect=meme_hash.GitHubAPIError(404, "deleted")):
            meme_hash.close_pull_request(github, {"number": 7, "merged": True})
        self.assertEqual(github.state["ingested"], [digest])
        self.assertEqual(github.calls, [])

    def test_unmerged_issue_pr_retains_pending_issue_reservation(self):
        state, digest = self.submission_state()
        github = MemoryGitHub(state)
        meme_hash.close_pull_request(github, {"number": 7, "merged": False})
        self.assertIsNone(github.state["reserved"][digest]["pr_number"])
        self.assertEqual(github.state["comments"]["31"]["status"], "unprocessed")
        self.assertEqual(meme_hash.pr_duplicate_errors([digest], github.state, set(), 8, "31"), [])

    def test_unmerged_direct_pr_releases_reservation(self):
        state, digest = self.submission_state(issue=False)
        github = MemoryGitHub(state)
        meme_hash.close_pull_request(github, {"number": 7, "merged": False})
        self.assertNotIn(digest, github.state["reserved"])
        self.assertEqual(meme_hash.pr_duplicate_errors([digest], github.state, set(), 7), [])

    def test_removed_comment_images_release_previous_hash_even_without_status_block(self):
        state, digest = self.submission_state()
        state["comments"]["31"].update(status="unprocessed", pr_number=None)
        state["reserved"][digest]["pr_number"] = None
        github = MemoryGitHub(state, "Only the source note remains")
        with patch.object(meme_hash, "hash_attachment_urls") as hashing:
            meme_hash.handle_issue_comment(github, self.comment_event())
        hashing.assert_not_called()
        self.assertNotIn(digest, github.state["reserved"])
        self.assertNotIn("31", github.state["comments"])
        self.assertEqual(github.comment["body"], "Only the source note remains")

    def test_replaced_comment_image_releases_old_hash(self):
        state, old_hash = self.submission_state()
        state["comments"]["31"].update(status="unprocessed", pr_number=None)
        state["reserved"][old_hash]["pr_number"] = None
        new_hash = "c" * 64
        github = MemoryGitHub(state, "![new](https://github.com/user-attachments/assets/new)")
        with patch.object(meme_hash, "hash_attachment_urls", return_value=[new_hash]):
            meme_hash.handle_issue_comment(github, self.comment_event())
        self.assertNotIn(old_hash, github.state["reserved"])
        self.assertIn(new_hash, github.state["reserved"])

    def test_fake_ingested_display_does_not_skip_hashing(self):
        body = (
            meme_hash.STATUS_START + "\n" + meme_hash.issue_status_body("ingested")
            + "\n" + meme_hash.STATUS_END
            + "\n![new](https://github.com/user-attachments/assets/new)"
        )
        github = MemoryGitHub(body=body)
        with patch.object(meme_hash, "hash_attachment_urls", return_value=["a" * 64]) as hashing:
            meme_hash.handle_issue_comment(github, self.comment_event())
        hashing.assert_called_once()
        self.assertEqual(github.state["comments"]["31"]["status"], "unprocessed")

    def test_five_image_limit_is_checked_before_downloading(self):
        github = MemoryGitHub(body="\n".join(
            f"![image](https://github.com/user-attachments/assets/{index})" for index in range(6)
        ))
        with patch.object(meme_hash, "hash_attachment_urls") as hashing:
            meme_hash.handle_issue_comment(github, self.comment_event())
        hashing.assert_not_called()
        self.assertEqual(github.state["reserved"], {})
        self.assertIn("at most 5", github.comment["body"])

    def test_oversize_replacement_clears_old_reservation(self):
        state, digest = self.submission_state()
        state["comments"]["31"].update(status="unprocessed", pr_number=None)
        state["reserved"][digest]["pr_number"] = None
        github = MemoryGitHub(state, "![large](https://github.com/user-attachments/assets/new)")
        with patch.object(meme_hash, "hash_attachment_urls", side_effect=meme_hash.ImageTooLargeError("5 MB")):
            meme_hash.handle_issue_comment(github, self.comment_event())
        self.assertNotIn(digest, github.state["reserved"])
        self.assertEqual(github.state["comments"]["31"]["hashes"], [])

    def test_temporary_download_error_preserves_previous_reservation(self):
        state, digest = self.submission_state()
        state["comments"]["31"].update(status="unprocessed", pr_number=None)
        state["reserved"][digest]["pr_number"] = None
        github = MemoryGitHub(state, "![image](https://github.com/user-attachments/assets/one)")
        with patch.object(meme_hash, "hash_attachment_urls", side_effect=meme_hash.BotError("network")):
            meme_hash.handle_issue_comment(github, self.comment_event())
        self.assertIn(digest, github.state["reserved"])


class PullRequestReadingTests(unittest.TestCase):
    def github(self):
        with patch.dict("os.environ", {"GITHUB_TOKEN": "test-token"}):
            return meme_hash.GitHub()

    def test_json_read_errors_are_not_empty_arrays(self):
        github = self.github()
        with patch.object(github, "request", side_effect=meme_hash.GitHubAPIError(404, "missing")):
            with self.assertRaises(meme_hash.GitHubAPIError):
                github.pr_file_json("contributor/NaiLoong", "data/naiwa/static.json", "a" * 40)
            self.assertEqual(github.pr_file_json(
                "contributor/NaiLoong", "data/naiwa/static.json", "a" * 40, allow_missing=True
            ), [])
        for value in ('{}', '[null]', '[{"url":"one","url":"two"}]', '['):
            with self.subTest(value=value), patch.object(github, "request", return_value={
                "encoding": "base64", "content": base64.b64encode(value.encode()).decode(),
            }):
                with self.assertRaises(meme_hash.BotError):
                    github.pr_file_json("contributor/NaiLoong", "data/naiwa/static.json", "a" * 40)

    def test_new_urls_are_read_from_fixed_head_sha(self):
        sha = "a" * 40
        url = f"contributor/{sha}/meme.png"
        github = Mock()
        github.get_pr_files.return_value = [{"filename": "data/naiwa/static.json", "status": "added"}]
        github.pr_file_json.side_effect = [[], [{"url": url}]]
        pr = {
            "number": 7, "base": {"sha": "b" * 40},
            "head": {"sha": sha, "repo": {"full_name": "contributor/NaiLoong"}},
        }
        self.assertEqual(meme_hash.new_data_urls(github, pr), [
            f"https://github.com/contributor/NaiLoong/blob/{sha}/meme.png"
        ])
        github.get_pr_files.assert_called_once_with(7, expected_head_sha=sha)
        self.assertEqual(github.pr_file_json.call_args_list[1].args[-1], sha)
        github.pr_file_json.side_effect = meme_hash.BotError("read failed")
        with self.assertRaisesRegex(meme_hash.BotError, "read failed"):
            meme_hash.new_data_urls(github, pr)

    def test_pr_head_changed_during_file_listing_fails(self):
        github = self.github()
        github.paginated = Mock(return_value=[])
        with patch.object(github, "request", side_effect=[
            {"head": {"sha": "a" * 40}}, {"head": {"sha": "b" * 40}},
        ]):
            with self.assertRaisesRegex(meme_hash.BotError, "changed while checking"):
                github.get_pr_files(7, expected_head_sha="a" * 40)

    def test_public_image_request_does_not_send_github_token(self):
        response = Mock()
        response.geturl.return_value = "https://raw.githubusercontent.com/contributor/NaiLoong/image/test.png"
        response.headers = {"Content-Type": "image/png"}
        response.read.return_value = b"\x89PNG\r\n\x1a\n"
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        with patch.dict("os.environ", {"GITHUB_TOKEN": "test-token"}), patch.object(
            meme_hash, "urlopen", return_value=response
        ) as download:
            meme_hash.fetch_image_bytes(response.geturl())
        request = download.call_args.args[0]
        self.assertIsNone(request.get_header("Authorization"))


if __name__ == "__main__":
    unittest.main()
