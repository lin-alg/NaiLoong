import json
import tempfile
import unittest
from pathlib import Path

from scripts.validate_data import validate_data


IMAGE_COMMIT = "a" * 40


class ValidateDataTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "data" / "naiwa").mkdir(parents=True)
        self.write_json(
            "data/manifest.json",
            [
                {
                    "id": "naiwa",
                    "name": "奶蛙",
                    "subcategories": [
                        {"id": "animated", "name": "动图", "file": "naiwa/animated.json"},
                        {"id": "static", "name": "静态图", "file": "naiwa/static.json"},
                    ],
                }
            ],
        )
        self.write_json(
            "data/naiwa/tags.json",
            {"smile": {"0": "憋笑", "1": "大笑"}, "safety": {"0": "安全"}},
        )
        self.write_json(
            "data/tag-translations.json",
            {
                "smile": {"en": "Smile strength", "zh": "笑容强度"},
                "safety": {"en": "Safety", "zh": "安全"},
            },
        )
        self.write_json(
            "data/naiwa/animated.json",
            [
                {
                    "title": "奶蛙大笑",
                    "tags": [1, 0],
                    "url": f"https://github.com/contributor/NaiLoong/blob/{IMAGE_COMMIT}/assets/memes/meme.png",
                }
            ],
        )
        self.write_json("data/naiwa/static.json", [])

    def write_json(self, relative_path, value):
        path = self.root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def test_accepts_manifest_entries_tags_and_fork_urls(self):
        self.assertEqual(validate_data(self.root), [])

    def test_accepts_dimension_local_ids_and_labels(self):
        entries = json.loads((self.root / "data/naiwa/animated.json").read_text(encoding="utf-8"))
        entries[0]["tags"] = {"smile": "大笑", "safety": 0}
        self.write_json("data/naiwa/animated.json", entries)

        self.assertEqual(validate_data(self.root), [])

    def test_accepts_unknown_dimension_as_null(self):
        entries = json.loads((self.root / "data/naiwa/animated.json").read_text(encoding="utf-8"))
        entries[0]["tags"] = [1, None]
        self.write_json("data/naiwa/animated.json", entries)

        self.assertEqual(validate_data(self.root), [])

    def test_rejects_undefined_dimension_local_tag(self):
        entries = json.loads((self.root / "data/naiwa/animated.json").read_text(encoding="utf-8"))
        entries[0]["tags"] = [1, 2]
        self.write_json("data/naiwa/animated.json", entries)

        errors = validate_data(self.root)
        self.assertTrue(any("tags value for 'safety'" in error for error in errors))

    def test_rejects_missing_manifest_file(self):
        manifest = json.loads((self.root / "data/manifest.json").read_text(encoding="utf-8"))
        manifest[0]["subcategories"][0]["file"] = "naiwa/missing.json"
        self.write_json("data/manifest.json", manifest)

        errors = validate_data(self.root)
        self.assertTrue(any("referenced file not found" in error for error in errors))

    def test_rejects_role_ids_that_are_not_url_safe_slugs(self):
        manifest = json.loads((self.root / "data/manifest.json").read_text(encoding="utf-8"))
        manifest[0]["id"] = "Nai Wa"
        self.write_json("data/manifest.json", manifest)

        errors = validate_data(self.root)
        self.assertTrue(any("id must use lowercase letters" in error for error in errors))

    def test_accepts_fork_image_url_without_network_check(self):
        entries = json.loads((self.root / "data/naiwa/animated.json").read_text(encoding="utf-8"))
        entries[0]["url"] = f"https://github.com/contributor/NaiLoong/blob/{IMAGE_COMMIT}/assets/memes/not-found.png"
        self.write_json("data/naiwa/animated.json", entries)

        errors = validate_data(self.root)
        self.assertEqual(errors, [])

    def test_accepts_compact_commit_image_url(self):
        entries = json.loads(
            (self.root / "data/naiwa/animated.json").read_text(encoding="utf-8")
        )
        entries[0]["url"] = f"contributor/{IMAGE_COMMIT}/assets/memes/meme.png"
        self.write_json("data/naiwa/animated.json", entries)

        self.assertEqual(validate_data(self.root), [])

    def test_rejects_equivalent_compact_and_full_urls_with_mixed_owner_case(self):
        entries = json.loads(
            (self.root / "data/naiwa/animated.json").read_text(encoding="utf-8")
        )
        entries[0]["url"] = f"MixedOwner/{IMAGE_COMMIT.upper()}/assets/memes/meme.png"
        entries.append({
            "title": "Same image", "tags": [0, None],
            "url": f"https://github.com/mixedowner/NaiLoong/blob/{IMAGE_COMMIT}/assets/memes/meme.png",
        })
        self.write_json("data/naiwa/animated.json", entries)
        self.assertTrue(any("图片链接重复" in error for error in validate_data(self.root)))

    def test_requires_bilingual_names_for_tag_dimensions(self):
        self.write_json(
            "data/tag-translations.json",
            {"smile": {"en": "Smile strength", "zh": "笑容强度"}},
        )

        errors = validate_data(self.root)
        self.assertTrue(any("missing bilingual name for dimension 'safety'" in error for error in errors))

    def test_accepts_github_raw_url_formats(self):
        urls = [
            f"https://github.com/contributor/NaiLoong/raw/{IMAGE_COMMIT}/assets/memes/meme.png",
            f"https://raw.githubusercontent.com/contributor/NaiLoong/{IMAGE_COMMIT}/assets/memes/meme.png",
        ]
        for url in urls:
            with self.subTest(url=url):
                entries = json.loads(
                    (self.root / "data/naiwa/animated.json").read_text(encoding="utf-8")
                )
                entries[0]["url"] = url
                self.write_json("data/naiwa/animated.json", entries)
                self.assertEqual(validate_data(self.root), [])

    def test_duplicate_blob_and_raw_urls_are_detected(self):
        entries = json.loads(
            (self.root / "data/naiwa/animated.json").read_text(encoding="utf-8")
        )
        entries.append(
            {
                "title": "同一图片的 RAW 地址",
                "tags": [0, None],
                "url": f"https://raw.githubusercontent.com/contributor/NaiLoong/{IMAGE_COMMIT}/assets/memes/meme.png",
            }
        )
        self.write_json("data/naiwa/animated.json", entries)

        errors = validate_data(self.root)
        self.assertTrue(any("图片链接重复" in error for error in errors))

    def test_rejects_tag_array_with_wrong_dimension_count(self):
        entries = json.loads((self.root / "data/naiwa/animated.json").read_text(encoding="utf-8"))
        entries[0]["tags"] = [1]
        self.write_json("data/naiwa/animated.json", entries)

        errors = validate_data(self.root)
        self.assertTrue(any("one value per tag dimension" in error for error in errors))

    def test_accepts_null_in_dimension_object(self):
        entries = json.loads((self.root / "data/naiwa/animated.json").read_text(encoding="utf-8"))
        entries[0]["tags"] = {"smile": 1, "safety": None}
        self.write_json("data/naiwa/animated.json", entries)

        self.assertEqual(validate_data(self.root), [])

    def test_rejects_non_fork_image_url(self):
        entries = json.loads((self.root / "data/naiwa/animated.json").read_text(encoding="utf-8"))
        entries[0]["url"] = "https://github.com/contributor/NaiLoong/blob/main/assets/meme.png"
        self.write_json("data/naiwa/animated.json", entries)

        errors = validate_data(self.root)
        self.assertTrue(any("commit SHA" in error for error in errors))

    def test_rejects_duplicate_image_urls(self):
        entries = json.loads((self.root / "data/naiwa/animated.json").read_text(encoding="utf-8"))
        entries.append(
            {
                "title": "重复图片",
                "tags": [0, None],
                "url": entries[0]["url"],
            }
        )
        self.write_json("data/naiwa/animated.json", entries)

        errors = validate_data(self.root)
        self.assertTrue(any("图片链接重复" in error for error in errors))

    def test_rejects_duplicate_json_keys(self):
        path = self.root / "data/naiwa/animated.json"
        path.write_text('[{"title":"first","title":"second","tags":[],"url":"https://example.com/meme.png"}]', encoding="utf-8")

        errors = validate_data(self.root)
        self.assertTrue(any("duplicate JSON key 'title'" in error for error in errors))

    def test_rejects_unreferenced_entry_files(self):
        self.write_json("data/naiwa/unused.json", [])

        errors = validate_data(self.root)
        self.assertTrue(any("entry file is not referenced by manifest" in error for error in errors))

    def write_audio(self, name):
        audio_dir = self.root / "assets" / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        (audio_dir / name).write_bytes(b"\x00")

    def set_manifest_voice(self, value):
        manifest = json.loads((self.root / "data/manifest.json").read_text(encoding="utf-8"))
        manifest[0]["voice"] = value
        self.write_json("data/manifest.json", manifest)

    def test_accepts_role_voice_file(self):
        self.write_audio("laugh.mp3")
        self.write_audio("dupu.mp3")
        self.set_manifest_voice("naiwa/voice.json")
        self.write_json(
            "data/naiwa/voice.json",
            [
                {"text": "咳哈哈哈哈~", "src": "assets/audio/laugh.mp3"},
                {"text": "嘟噗。", "src": "assets/audio/dupu.mp3"},
            ],
        )

        self.assertEqual(validate_data(self.root), [])

    def test_accepts_empty_voice_file(self):
        self.set_manifest_voice("naiwa/voice.json")
        self.write_json("data/naiwa/voice.json", [])

        self.assertEqual(validate_data(self.root), [])

    def test_rejects_voice_file_outside_role_directory(self):
        self.write_audio("laugh.mp3")
        self.set_manifest_voice("naidan/voice.json")
        self.write_json(
            "data/naidan/voice.json",
            [{"text": "安~迪~", "src": "assets/audio/laugh.mp3"}],
        )

        errors = validate_data(self.root)
        self.assertTrue(any("voice file must be inside data/naiwa/" in error for error in errors))

    def test_rejects_missing_voice_file(self):
        self.set_manifest_voice("naiwa/voice.json")

        errors = validate_data(self.root)
        self.assertTrue(any("voice file not found" in error for error in errors))

    def test_rejects_voice_entry_without_text(self):
        self.write_audio("laugh.mp3")
        self.set_manifest_voice("naiwa/voice.json")
        self.write_json(
            "data/naiwa/voice.json",
            [{"text": "   ", "src": "assets/audio/laugh.mp3"}],
        )

        errors = validate_data(self.root)
        self.assertTrue(any('"text" must be a non-empty string' in error for error in errors))

    def test_rejects_voice_src_outside_audio_directory(self):
        self.set_manifest_voice("naiwa/voice.json")
        self.write_json(
            "data/naiwa/voice.json",
            [{"text": "咳哈哈", "src": "assets/placeholders/laugh.mp3"}],
        )

        errors = validate_data(self.root)
        self.assertTrue(any('"src" must point inside assets/audio/' in error for error in errors))

    def test_rejects_voice_src_without_existing_audio_file(self):
        self.set_manifest_voice("naiwa/voice.json")
        self.write_json(
            "data/naiwa/voice.json",
            [{"text": "咳哈哈", "src": "assets/audio/missing.mp3"}],
        )

        errors = validate_data(self.root)
        self.assertTrue(any("audio file not found" in error for error in errors))

    def test_rejects_duplicate_voice_src(self):
        self.write_audio("laugh.mp3")
        self.set_manifest_voice("naiwa/voice.json")
        self.write_json(
            "data/naiwa/voice.json",
            [
                {"text": "咳哈哈", "src": "assets/audio/laugh.mp3"},
                {"text": "哈哈哈", "src": "assets/audio/laugh.mp3"},
            ],
        )

        errors = validate_data(self.root)
        self.assertTrue(any("duplicate voice src" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
