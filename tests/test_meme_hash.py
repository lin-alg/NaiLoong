import unittest
from pathlib import Path
from unittest.mock import patch

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

            def pr_file_json(self, repository, path, ref):
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
            f"previews/naiwa/animated/contributor/{commit}/assets/memes/laugh.webp",
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


if __name__ == "__main__":
    unittest.main()
