import contextlib
import io
import json
import random
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

import check as similarity


def pattern(seed=1):
    generator = random.Random(seed)
    image = Image.new("RGB", (240, 180), "white")
    draw = ImageDraw.Draw(image)
    for _ in range(35):
        x, y = generator.randrange(210), generator.randrange(150)
        color = tuple(generator.randrange(256) for _ in range(3))
        draw.rectangle((x, y, x + 30, y + 30), fill=color)
    return image


class SimilarityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.previews = self.root / "previews"
        self.candidates = self.root / "new memes"
        self.previews.mkdir()
        self.candidates.mkdir()

    def save_pair(self):
        original = pattern()
        reference = self.previews / "existing.webp"
        original.resize((180, 135)).save(reference, quality=60)
        candidate = self.candidates / "新表情 & 1.png"
        original.save(candidate)
        return candidate, reference

    def test_compressed_resized_copy_is_flagged_but_different_picture_is_not(self):
        candidate, reference = self.save_pair()
        unrelated = self.candidates / "different.png"
        pattern(912).save(unrelated)
        result = similarity.scan(self.candidates, self.previews)
        by_name = {Path(item["path"]).name: item for item in result["results"]}
        self.assertEqual(result["matched_count"], 1)
        self.assertEqual(by_name[unrelated.name]["match_count"], 0)
        match = by_name[candidate.name]["matches"][0]
        self.assertEqual(match["path"], str(reference))
        self.assertLessEqual(match["phash_distance"], 14)
        self.assertLessEqual(match["dhash_distance"], 12)

    def test_or_rule_threshold_edges_top_candidates_and_total_count(self):
        library = [(Path("p-only"), (0, (1 << 64) - 1)),
                   (Path("d-only"), ((1 << 64) - 1, 0)),
                   (Path("both"), (0, 0)), (Path("outside"), (7, 7))]
        count, matches = similarity.find_matches((0, 0), library, 0, 0, 1)
        self.assertEqual(count, 3)
        self.assertEqual(matches[0]["path"], "both")
        self.assertEqual(similarity.distance(0, (1 << 64) - 1), 64)
        self.assertEqual(similarity.find_matches((0, 0), library[-1:], 3, 0, 1)[0], 1)
        self.assertEqual(similarity.find_matches((0, 0), library[-1:], 2, 2, 1)[0], 0)

    def test_transparency_uses_white_matte_and_gif_uses_first_frame(self):
        transparent = pattern().convert("RGBA")
        ImageDraw.Draw(transparent).rectangle((0, 0, 90, 60), fill=(10, 90, 150, 0))
        source = self.candidates / "transparent.png"
        transparent.save(source)
        matte = Image.new("RGBA", transparent.size, "white")
        flattened = Image.alpha_composite(matte, transparent).convert("RGB")
        reference = self.previews / "flat.png"
        flattened.save(reference)
        self.assertEqual(similarity.image_hashes(source), similarity.image_hashes(reference))

        animation = self.candidates / "animated.gif"
        first = pattern().quantize()
        first.save(animation, save_all=True, append_images=[pattern(9).quantize()], duration=100, loop=0)
        first_path = self.previews / "first.png"
        first.convert("RGB").save(first_path)
        self.assertEqual(similarity.image_hashes(animation), similarity.image_hashes(first_path))

    def test_exif_orientation_is_applied(self):
        source = self.candidates / "rotated.jpg"
        exif = Image.Exif()
        exif[274] = 6
        pattern().save(source, exif=exif)
        expected = self.previews / "upright.png"
        with Image.open(source) as image:
            ImageOps.exif_transpose(image).save(expected)
        self.assertEqual(similarity.image_hashes(source), similarity.image_hashes(expected))

    def test_recursive_report_and_markers_preserve_originals_and_refresh_stale_marks(self):
        candidate, reference = self.save_pair()
        nested = self.candidates / "subfolder"
        nested.mkdir()
        candidate = candidate.rename(nested / candidate.name)
        before = candidate.read_bytes(), reference.read_bytes()
        result = similarity.scan(self.candidates, self.previews)
        report = similarity.write_results(result)
        mark = Path(str(candidate) + similarity.MARKER_SUFFIX)
        self.assertTrue(mark.read_text(encoding="utf-8").startswith(similarity.MARKER_HEADER))
        self.assertIn(str(report), mark.read_text(encoding="utf-8"))
        document = report.read_text(encoding="utf-8")
        self.assertIn("data:image/png;base64,", document)
        self.assertIn("新表情 &amp; 1.png", document)
        self.assertIn("%26", document)
        self.assertEqual(json.loads(report.with_suffix(".json").read_text(encoding="utf-8")), result)
        self.assertEqual((candidate.read_bytes(), reference.read_bytes()), before)

        # Report snapshots must not become input images on subsequent runs.
        result2 = similarity.scan(self.candidates, self.previews)
        self.assertEqual(result2["candidate_count"], 1)
        pattern(912).save(candidate)
        result3 = similarity.scan(self.candidates, self.previews)
        report3 = similarity.write_results(result3)
        self.assertFalse(mark.exists())
        self.assertTrue(report.exists())
        self.assertNotEqual(report, report3)

    def test_unreadable_images_are_reported_and_keep_previous_marks(self):
        candidate, _ = self.save_pair()
        similarity.write_results(similarity.scan(self.candidates, self.previews))
        mark = Path(str(candidate) + similarity.MARKER_SUFFIX)
        candidate.write_bytes(b"broken image")
        (self.previews / "broken.webp").write_bytes(b"broken preview")
        result = similarity.scan(self.candidates, self.previews)
        self.assertEqual(len(result["errors"]), 2)
        self.assertEqual(result["candidate_count"], 1)
        self.assertEqual(result["results"], [])
        result["errors"][0]["error"] += " <script>alert(1)</script>"
        report = similarity.write_results(result)
        document = report.read_text(encoding="utf-8")
        self.assertIn("本次筛查不完整", document)
        self.assertIn("&lt;script&gt;", document)
        self.assertNotIn("<script>", document)
        self.assertTrue(mark.exists())
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(similarity.main([str(self.candidates), "--previews", str(self.previews)]), 2)

    def test_user_sidecar_collision_is_preserved(self):
        candidate, _ = self.save_pair()
        marker = Path(str(candidate) + similarity.MARKER_SUFFIX)
        marker.write_text("用户自己的备注", encoding="utf-8")
        result = similarity.scan(self.candidates, self.previews)
        with self.assertRaisesRegex(ValueError, "占用"):
            similarity.write_results(result)
        self.assertEqual(marker.read_text(encoding="utf-8"), "用户自己的备注")
        self.assertFalse((self.candidates / similarity.REPORT_DIR).exists())

    def test_unreadable_reference_does_not_remove_previous_marks(self):
        candidate, reference = self.save_pair()
        similarity.write_results(similarity.scan(self.candidates, self.previews))
        marker = Path(str(candidate) + similarity.MARKER_SUFFIX)
        reference.write_bytes(b"broken reference")
        pattern(912).save(self.previews / "different.png")
        result = similarity.scan(self.candidates, self.previews)
        self.assertEqual(result["matched_count"], 0)
        self.assertEqual(len(result["errors"]), 1)
        similarity.write_results(result)
        self.assertTrue(marker.exists())

    def test_missing_empty_overlapping_directories_and_bad_options(self):
        with self.assertRaisesRegex(ValueError, "不存在"):
            similarity.scan(self.root / "missing", self.previews)
        with self.assertRaisesRegex(ValueError, "分开"):
            similarity.scan(self.root, self.previews)
        with self.assertRaisesRegex(ValueError, "没有可读取"):
            similarity.scan(self.candidates, self.previews)
        self.save_pair()
        for options in ({"phash_threshold": -1}, {"dhash_threshold": 65}, {"max_matches": 0}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                similarity.scan(self.candidates, self.previews, **options)
        for candidate in self.candidates.iterdir():
            candidate.unlink()
        with self.assertRaisesRegex(ValueError, "没有支持"):
            similarity.scan(self.candidates, self.previews)

    def test_source_links_encode_paths_and_do_not_guess_legacy_extensions(self):
        path = self.previews / "role" / "category" / "owner" / ("a" * 40) / "assets" / "a b&c.gif.webp"
        url = similarity.original_url(path, self.previews)
        self.assertEqual(url, "https://github.com/owner/NaiLoong/blob/" + "a" * 40 + "/assets/a%20b%26c.gif")
        self.assertIsNone(similarity.original_url(path.with_name("old.webp"), self.previews))
        self.assertIsNone(similarity.original_url(self.previews / "flat.webp", self.previews))


if __name__ == "__main__":
    unittest.main()
