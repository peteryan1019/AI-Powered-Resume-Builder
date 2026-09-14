# -*- coding: utf-8 -*-
"""Smoke tests for the resume PDF generators.

Every template consumes the same JSON structure (schema.json) and must survive
the same inputs, so each test runs against all of them. Uses only the standard
library plus reportlab, so it needs nothing beyond what the backend image
already installs.

    python3 -m unittest discover -s assets/templates -p "test_*.py" -v
"""
from __future__ import annotations

import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = ["signal", "evergreen", "atelier"]


def load_generator(template: str):
    path = os.path.join(HERE, template, "create_resume_pdf.py")
    spec = importlib.util.spec_from_file_location(f"gen_{template}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture(name: str) -> dict:
    with open(os.path.join(HERE, "fixtures", name), encoding="utf-8") as handle:
        return json.load(handle)


GENERATORS = {t: load_generator(t) for t in TEMPLATES}
SAMPLE = fixture("sample_resume.json")


class TestFontsResolve(unittest.TestCase):
    """Carlito must be found, or output silently falls back to Helvetica and the
    carefully measured layout metrics no longer hold."""

    def test_every_template_resolves_carlito(self):
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                self.assertEqual(gen.FONT, "Calibri", f"{name} fell back to {gen.FONT}")
                self.assertEqual(gen.FONT_BOLD, "Calibri-Bold")


class TestRendersSample(unittest.TestCase):
    def test_produces_a_valid_one_page_pdf(self):
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                with tempfile.TemporaryDirectory() as tmp:
                    out = os.path.join(tmp, "resume.pdf")
                    result = gen.create_resume_pdf(out, RESUME_DATA=copy.deepcopy(SAMPLE))

                    self.assertTrue(os.path.exists(out))
                    with open(out, "rb") as handle:
                        head = handle.read(5)
                    self.assertEqual(head, b"%PDF-", "output is not a PDF")
                    self.assertGreater(os.path.getsize(out), 1000)

                    self.assertTrue(result["fits_one_page"], f"{name} overflowed one page")
                    self.assertEqual(result["sections_rendered"], 4)
                    self.assertGreaterEqual(result["font_size_used"], 8.0)
                    self.assertGreaterEqual(result["top_margin"], 0)
                    self.assertEqual(result["page_width"], 612)
                    self.assertEqual(result["page_height"], 792)
                    # Every visible bullet must retain its stable editor ID and
                    # measured bounds; positions drive the external PDF controls.
                    for section in SAMPLE["sections"]:
                        bullets = section.get("bullets", []) if section["type"] == "bullets" else [
                            b for entry in section["entries"] for b in entry["bullets"]
                        ]
                        for bullet in bullets:
                            box = result["element_boxes"][bullet["id"]]
                            self.assertEqual(len(box), 4)
                            self.assertGreater(box[3], 0)
                            self.assertGreaterEqual(box[1], 0)

    def test_margins_are_balanced(self):
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                with tempfile.TemporaryDirectory() as tmp:
                    r = gen.create_resume_pdf(
                        os.path.join(tmp, "r.pdf"), RESUME_DATA=copy.deepcopy(SAMPLE)
                    )
                    self.assertAlmostEqual(r["top_margin"], r["bottom_margin"], delta=1.0)


class TestPruning(unittest.TestCase):
    """The schema guarantees keys exist, never that they hold content. Blank
    strings and empty arrays must be dropped rather than drawn."""

    def test_empty_section_is_dropped(self):
        data = copy.deepcopy(SAMPLE)
        data["sections"][0]["bullets"] = []
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                pruned = gen.prune_resume_data(copy.deepcopy(data))
                ids = [s["id"] for s in pruned["sections"]]
                self.assertNotIn("section-technical-skills", ids)
                self.assertEqual(len(pruned["sections"]), 3)

    def test_blank_bullet_is_dropped(self):
        data = copy.deepcopy(SAMPLE)
        data["sections"][0]["bullets"].append({"id": "blank", "text": "   "})
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                pruned = gen.prune_resume_data(copy.deepcopy(data))
                bullet_ids = [b["id"] for b in pruned["sections"][0]["bullets"]]
                self.assertNotIn("blank", bullet_ids)

    def test_blank_contact_part_is_dropped(self):
        data = copy.deepcopy(SAMPLE)
        data["header"]["contact"]["parts"].insert(1, {"id": "blank", "text": ""})
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                pruned = gen.prune_resume_data(copy.deepcopy(data))
                ids = [p["id"] for p in pruned["header"]["contact"]["parts"]]
                self.assertNotIn("blank", ids)

    def test_content_is_never_silently_lost(self):
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                pruned = gen.prune_resume_data(copy.deepcopy(SAMPLE))
                self.assertEqual(len(pruned["sections"]), 4)
                self.assertEqual(len(pruned["sections"][1]["entries"]), 2)
                self.assertEqual(len(pruned["sections"][2]["entries"]), 2)

    def test_bullet_keeps_label_and_url_together(self):
        # An if/elif chain here once dropped the url of any bullet that also had
        # a label, losing the link entirely.
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                cleaned = gen._clean_bullet(
                    {"id": "x", "label": "Source:", "text": "", "url": "https://example.com"}
                )
                self.assertEqual(cleaned["label"], "Source:")
                self.assertEqual(cleaned["url"], "https://example.com")
                self.assertNotIn("text", cleaned)


class TestDegenerateInput(unittest.TestCase):
    """Schema-valid but empty payloads must render, not crash."""

    def test_all_blank_payload_renders(self):
        data = {
            "jobPostTitle": "",
            "header": {
                "name": {"id": "n", "text": ""},
                "contact": {"id": "c", "parts": [{"id": "p", "text": ""}]},
            },
            "sections": [
                {"id": "s1", "title": "", "type": "bullets", "bullets": [{"id": "b", "text": ""}]}
            ],
        }
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                with tempfile.TemporaryDirectory() as tmp:
                    r = gen.create_resume_pdf(
                        os.path.join(tmp, "r.pdf"), RESUME_DATA=copy.deepcopy(data)
                    )
                    self.assertEqual(r["sections_rendered"], 0)
                    self.assertTrue(r["fits_one_page"])

    def test_no_sections_renders(self):
        data = copy.deepcopy(SAMPLE)
        data["sections"] = []
        for name, gen in GENERATORS.items():
            with self.subTest(template=name):
                with tempfile.TemporaryDirectory() as tmp:
                    r = gen.create_resume_pdf(
                        os.path.join(tmp, "r.pdf"), RESUME_DATA=copy.deepcopy(data)
                    )
                    self.assertEqual(r["sections_rendered"], 0)


class TestCommandLineInterface(unittest.TestCase):
    """The backend spawns these as subprocesses with JSON on stdin, so the CLI
    contract matters as much as the function."""

    def test_reads_stdin_and_exits_zero(self):
        for name in TEMPLATES:
            with self.subTest(template=name):
                with tempfile.TemporaryDirectory() as tmp:
                    out = os.path.join(tmp, "cli.pdf")
                    proc = subprocess.run(
                        [sys.executable, os.path.join(HERE, name, "create_resume_pdf.py"), out],
                        input=json.dumps(SAMPLE),
                        capture_output=True,
                        text=True,
                        timeout=90,
                    )
                    self.assertEqual(proc.returncode, 0, proc.stderr[-600:])
                    self.assertTrue(os.path.exists(out))
                    self.assertIn("fits_one_page", proc.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
