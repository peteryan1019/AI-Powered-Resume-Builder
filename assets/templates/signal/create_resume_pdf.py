# -*- coding: utf-8 -*-
"""Generate a one-page resume PDF that matches Peter_Yan_Resume_Thales.pdf.

The reference PDF was produced from a Calibri/Word document, so this generator
renders with Carlito (the metric-compatible libre clone of Calibri, bundled in
./fonts) and reproduces the reference's exact geometry, colors, spacing and
hyperlinks. All measurements below were sampled directly from the reference PDF.
"""
from __future__ import annotations

import os
from typing import Dict, List, Optional, Tuple
import argparse
import json
import sys
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import getAscentDescent, registerFontFamily, stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

PAGE_W, PAGE_H = letter  # 612 x 792 pt

# -----------------------------------------------------------------------------
# Geometry (points) — sampled from Peter_Yan_Resume_Thales.pdf
# -----------------------------------------------------------------------------
LEFT = 18.0                       # 0.25 in
RIGHT = 18.0
RIGHT_EDGE = PAGE_W - RIGHT       # 594
CONTENT_W = PAGE_W - LEFT - RIGHT  # 576
BULLET_X = 24.0                   # bullet glyph x
BULLET_TEXT_X = 36.0              # text / hanging-indent x
# Bullet text may flow a hair past the rule edge, exactly as the reference PDF
# does (its longest bullet reaches x ~= 595.5). 561.5 reproduces every one of
# the reference's line breaks with Carlito's metrics.
BULLET_MAX_W = 561.5

START_BASELINE = 761.79           # reference name baseline (a full, one-page resume)

# Vertical rhythm (at body size 11pt). Gaps are classed rigid vs flexible:
# rigid gaps keep the reference rhythm; flexible gaps stretch to fill a short page.
LINE = 13.43                      # single line advance            (rigid)
NAME_TO_CONTACT = 15.68           # name -> contact line           (rigid)
SECTION_GAP_FIRST = 29.05         # contact -> first section title (flexible)
SECTION_GAP = 28.0                # previous content -> next title (flexible)
TITLE_TO_CONTENT = 16.68          # title -> first content         (rigid part)
BLOCK_SPACE = 10.0                # space before each entry/block  (flexible)
RULE_DROP = 5.7                   # title baseline -> divider rule
RULE_WIDTH = 1.0

# Vertical balancing: when the content is shorter than a full page, stretch the
# flexible gaps (capped) and then split the remaining blank equally top/bottom so
# the page looks balanced instead of top-loaded. When it is too tall, shrink the
# font. MIN_MARGIN is the smallest top/bottom blank we allow (a full reference
# resume sits at ~14pt, so this floor must stay there to avoid shrinking it).
MIN_MARGIN = 14.0
GAP_SCALE_MAX = 2.2               # cap on flexible-gap stretch
GAP_FILL_FRACTION = 0.5          # share of leftover space spent on gaps vs margins
FONT_SCALES = (1.0, 0.97, 0.94, 0.91, 0.88, 0.85)

# Font sizes
NAME_SIZE = 20.0
TITLE_SIZE = 12.0
BODY_SIZE = 11.0

# Colors (sampled from the reference PDF)
BLACK = (0.0, 0.0, 0.0)
ACCENT = (0.1216, 0.2196, 0.3922)        # #1F3864  name + section titles
CONTACT_GRAY = (0.2667, 0.2667, 0.2667)  # #444444  contact text + dates
META_GRAY = (0.40, 0.40, 0.40)           # #666666  italic meta (tech / location)
LINK = (0.0667, 0.3333, 0.8)             # #1155CC  hyperlinks

# Inline separators between heading parts
SEP_HEADING = "  •  "        # bold title  •  meta  •  date
SEP_ROLE = " • "             # role • location • date
SEP_CONTACT = " • "          # phone • email • ...
BULLET_GLYPH = "•"

# -----------------------------------------------------------------------------
# Fonts: Carlito (metric-compatible Calibri). Falls back to Helvetica if the
# bundled fonts are unavailable so the script never hard-fails.
# -----------------------------------------------------------------------------
_FONT_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "fonts",
    )
)


def _register_fonts() -> Tuple[str, str, str, str]:
    faces = {
        "Calibri": "Carlito-Regular.ttf",
        "Calibri-Bold": "Carlito-Bold.ttf",
        "Calibri-Italic": "Carlito-Italic.ttf",
        "Calibri-BoldItalic": "Carlito-BoldItalic.ttf",
    }
    try:
        for name, filename in faces.items():
            pdfmetrics.registerFont(TTFont(name, os.path.join(_FONT_DIR, filename)))
        registerFontFamily(
            "Calibri", normal="Calibri", bold="Calibri-Bold",
            italic="Calibri-Italic", boldItalic="Calibri-BoldItalic",
        )
        return "Calibri", "Calibri-Bold", "Calibri-Italic", "Calibri-BoldItalic"
    except Exception:
        return ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique",
                "Helvetica-BoldOblique")


FONT, FONT_BOLD, FONT_ITALIC, FONT_BOLDIT = _register_fonts()

# -----------------------------------------------------------------------------
# Resume data model
# Use these IDs as the contract between your AI/API layer and the PDF generator.
# apply_text_updates() rewrites any {"id": ..., "text": ...} (or "label") node.
# -----------------------------------------------------------------------------
RESUME_DATA2 = {'jobPostTitle': 'Backend Engineer',
 'header': {'name': {'id': 'header-name', 'text': 'Dana Okafor'},
            'contact': {'id': 'header-contact-line',
                        'parts': [{'id': 'contact-phone', 'text': '647-555-0142'},
                                  {'id': 'contact-email',
                                   'text': 'dana@example.com',
                                   'href': 'mailto:dana@example.com'},
                                  {'id': 'contact-linkedin',
                                   'text': 'LinkedIn',
                                   'href': 'https://linkedin.com/in/danaokafor'},
                                  {'id': 'contact-github',
                                   'text': 'GitHub',
                                   'href': 'https://github.com/danaokafor'}]}},
 'sections': [{'id': 'section-technical-skills',
               'title': 'TECHNICAL SKILLS',
               'type': 'bullets',
               'bullets': [{'id': 'skill-lang',
                            'label': 'Languages:',
                            'text': 'Python, Go, TypeScript, SQL, Bash.'},
                           {'id': 'skill-infra',
                            'label': 'Infrastructure:',
                            'text': 'Docker, Kubernetes, Terraform, AWS, GitHub Actions.'},
                           {'id': 'skill-data',
                            'label': 'Data:',
                            'text': 'PostgreSQL, Redis, Kafka, Spark.'}]},
              {'id': 'section-projects',
               'title': 'PROJECTS',
               'type': 'entries',
               'entries': [{'id': 'proj-fraud',
                            'heading': 'Real-Time Fraud Detection Pipeline',
                            'meta': 'Python, Kafka, Spark Streaming, XGBoost',
                            'date': 'Mar 2025',
                            'bullets': [{'id': 'b-fraud-1',
                                         'text': 'Built a streaming pipeline ingesting 50,000 '
                                                 'transactions per minute with sub-second fraud '
                                                 'flagging.'},
                                        {'id': 'b-fraud-2',
                                         'text': 'Reduced false-positive alerts by 38% through '
                                                 'velocity and geolocation features.'}]},
                           {'id': 'proj-scheduler',
                            'heading': 'Course Scheduler REST API',
                            'meta': 'Python, FastAPI, PostgreSQL, Redis',
                            'date': 'Sep - Dec 2024',
                            'bullets': [{'id': 'b-sched-1',
                                         'text': 'Designed a REST API resolving timetable '
                                                 'conflicts across 500+ course sections.'},
                                        {'id': 'b-sched-2',
                                         'label': 'Source:',
                                         'text': '',
                                         'url': 'https://github.com/danaokafor/scheduler'}]}]},
              {'id': 'section-professional-experiences',
               'title': 'PROFESSIONAL EXPERIENCE',
               'type': 'org_entries',
               'entries': [{'id': 'exp-shopify',
                            'org': 'Shopify',
                            'role': 'Software Engineer Intern',
                            'location': 'Toronto, Ontario',
                            'date': 'May - Aug 2025',
                            'bullets': [{'id': 'b-shop-1',
                                         'text': 'Deployed a demand-forecasting service to '
                                                 'production for 10,000 merchants, improving '
                                                 'accuracy by 22%.'},
                                        {'id': 'b-shop-2',
                                         'text': 'Migrated batch training to Kubernetes, cutting '
                                                 'retraining time from 9 hours to 2.'}]},
                           {'id': 'exp-epoch',
                            'org': 'Epoch Media Group',
                            'role': 'Data Engineer Intern',
                            'location': '',
                            'date': 'Sep - Dec 2024',
                            'bullets': [{'id': 'b-epoch-1',
                                         'text': 'Built ETL pipelines in Python, SQL and Bash '
                                                 'curating marketing data across 12 sources.'}]}]},
              {'id': 'section-education',
               'title': 'EDUCATION',
               'type': 'education',
               'entries': [{'id': 'education-uoft',
                            'school': {'id': 'education-school',
                                       'text': 'University of Toronto Scarborough'},
                            'bullets': [{'id': 'edu-degree',
                                         'text': 'Bachelor of Science in Computer Science, CGPA '
                                                 '3.71/4.0, expected 2027.'},
                                        {'id': 'edu-honors',
                                         'text': "Dean's List 2023, 2024, 2025."}]}]}]}


######################################### Fake Resume Data ########################################

# RESUME_DATA = {
#     "header": {
#         "name": {"id": "header-name", "text": "Lena Vasquez"},
#         "contact": {
#             "id": "header-contact-line",
#             "parts": [
#                 {"id": "contact-phone", "text": "415-802-6643"},
#                 {"id": "contact-email", "text": "lena.vasquez@berkeley.edu",
#                  "href": "mailto:lena.vasquez@berkeley.edu"},
#                 {"id": "contact-website", "text": "Portfolio",
#                  "href": "https://lenavasquez.dev/"},
#                 {"id": "contact-linkedin", "text": "LinkedIn",
#                  "href": "https://www.linkedin.com/in/lena-vasquez/"},
#                 {"id": "contact-github", "text": "GitHub",
#                  "href": "https://github.com/lenavasquez"},
#             ],
#         },
#     },
#     "sections": [
#         {
#             "id": "section-technical-skills",
#             "title": "TECHNICAL SKILLS",
#             "type": "bullets",
#             "bullets": [
#                 {"id": "bullet-skills-programming", "label": "Programming & Query:", "text": "Python, R, SQL, Scala, TypeScript, Bash."},
#                 {"id": "bullet-skills-ml-data", "label": "ML, Data & Pipelines:", "text": "PyTorch, TensorFlow, scikit-learn, Apache Spark, dbt, Airflow, Pandas, NumPy."},
#                 {"id": "bullet-skills-cloud-mlops", "label": "Cloud & MLOps:", "text": "AWS (SageMaker, Lambda, S3, Redshift), Docker, Kubernetes, MLflow, Terraform, CI/CD."},
#             ],
#         },
#         {
#             "id": "section-projects",
#             "title": "PROJECTS",
#             "type": "entries",
#             "entries": [
#                 {
#                     "id": "entry-project-fraud-detection",
#                     "heading": "Real-Time Fraud Detection Pipeline",
#                     "meta": "Python, Apache Kafka, Spark Streaming, XGBoost",
#                     "date": "Mar 2025",
#                     "bullets": [
#                         {"id": "bullet-project-fraud-detection-01", "text": "Built a streaming pipeline ingesting 50K+ transactions/min through Kafka and scoring them with an XGBoost model for sub-second fraud flagging."},
#                         {"id": "bullet-project-fraud-detection-02", "text": "Reduced false-positive alerts by 38% by engineering velocity and geolocation features and tuning the decision threshold on a held-out validation set."},
#                     ],
#                 },
#                 {
#                     "id": "entry-project-book-recsys",
#                     "heading": "Recommendation Engine for Indie Bookstore",
#                     "meta": "Python, PyTorch, FastAPI, PostgreSQL",
#                     "date": "Sep – Dec 2024",
#                     "bullets": [
#                         {"id": "bullet-project-book-recsys-01", "text": "Trained a collaborative-filtering model on 200K+ purchase records to generate personalized book recommendations."},
#                         {"id": "bullet-project-book-recsys-02", "text": "Served predictions through a FastAPI microservice backed by PostgreSQL, with Redis caching for hot queries."},
#                         {"id": "bullet-project-book-recsys-03", "text": "Demo link:", "url": "https://shelfmate-demo.fly.dev/"},
#                     ],
#                 },
#                 {
#                     "id": "entry-project-llm-eval",
#                     "heading": "Open-Source LLM Evaluation Toolkit",
#                     "meta": "Python, Hugging Face, Pytest",
#                     "date": "Jan 2026",
#                     "bullets": [
#                         {"id": "bullet-project-llm-eval-01", "text": "Created a configurable harness to benchmark open-weight language models across accuracy, latency, and cost; reached 300+ stars on GitHub."},
#                     ],
#                 },
#             ],
#         },
#         {
#             "id": "section-professional-experiences",
#             "title": "PROFESSIONAL EXPERIENCES",
#             "type": "org_entries",
#             "entries": [
#                 {
#                     "id": "entry-exp-shopify",
#                     "org": "Shopify",
#                     "role": "Machine Learning Engineer Intern",
#                     "location": "Toronto, Ontario",
#                     "date": "May – Aug 2025",
#                     "bullets": [
#                         {"id": "bullet-exp-shopify-01", "text": "Deployed a demand-forecasting model to production serving 10K+ merchants, improving inventory recommendation accuracy by 22%."},
#                         {"id": "bullet-exp-shopify-02", "text": "Migrated batch training jobs to a Kubernetes-based workflow, cutting end-to-end retraining time from 9 hours to 2."},
#                         {"id": "bullet-exp-shopify-03", "text": "Partnered with product and data teams on a two-week Agile cadence to ship features behind controlled rollouts."},
#                     ],
#                 },
#                 {
#                     "id": "entry-exp-berkeley-research",
#                     "org": "University of California, Berkeley",
#                     "role": "Undergraduate Research Assistant",
#                     "location": "RISELab",
#                     "date": "Jan – Apr 2024",
#                     "bullets": [
#                         {"id": "bullet-exp-berkeley-research-01", "text": "Co-authored a workshop paper on distributed hyperparameter tuning and ran experiments across a 64-node Spark cluster."},
#                     ],
#                 },
#             ],
#         },
#         {
#             "id": "section-education",
#             "title": "EDUCATION",
#             "type": "education",
#             "school": {"id": "entry-education-berkeley-school", "text": "University of California, Berkeley"},
#             "bullets": [
#                 {"id": "bullet-education-degree", "text": "Bachelor of Arts in Data Science, GPA 3.82/4.0, Expected Graduation: May 2026."},
#                 {"id": "bullet-education-scholarship", "text": "Regents' and Chancellor's Scholar (top 2% of admitted class)."},
#                 {"id": "bullet-education-coursework", "text": "Relevant Coursework: Machine Learning, Distributed Systems, Databases, Convex Optimization, Statistical Inference, Algorithms."},
#             ],
#         },
#     ],
# }


def _s(value) -> str:
    """Coerce a possibly missing/None/non-string field to a stripped string."""
    return value.strip() if isinstance(value, str) else ""


def _clean_bullet(bullet: dict) -> Optional[dict]:
    """Drop a bullet's blank parts; return None when nothing is left to draw."""
    label, text, url = _s(bullet.get("label")), _s(bullet.get("text")), _s(bullet.get("url"))
    if not (label or text or url):
        return None
    cleaned = {"id": bullet.get("id", "")}
    if label:
        cleaned["label"] = label
    if text:
        cleaned["text"] = text
    if url:
        cleaned["url"] = url
    return cleaned


def _clean_bullets(bullets) -> List[dict]:
    return [b for b in (_clean_bullet(x) for x in (bullets or [])) if b]


def prune_resume_data(data: dict) -> dict:
    """Strip blank strings and empty containers so nothing renders as a gap.

    The JSON schema only guarantees that keys are *present*, never that they
    carry content: a section may legitimately arrive with `bullets: []` (the
    user has no such credential) and every required string may be "". Rendering
    those verbatim leaves orphan bullet glyphs, headings with no body, and
    section rules with nothing beneath them. Pruning up front — before any
    layout pass — means the empty parts consume no ink *and* no vertical space,
    and keeps the measure and draw passes in agreement.

    Content is never discarded: a block survives if any of its parts survive.
    """
    header = data.get("header") or {}
    contact = header.get("contact") or {}
    pruned_header = {
        "name": {
            "id": (header.get("name") or {}).get("id", ""),
            "text": _s((header.get("name") or {}).get("text")),
        },
        "contact": {
            "id": contact.get("id", ""),
            # A part with blank text would otherwise render as a stray " • ".
            "parts": [p for p in (contact.get("parts") or []) if _s(p.get("text"))],
        },
    }

    sections: List[dict] = []
    for section in data.get("sections") or []:
        kind = section.get("type")
        base = {
            "id": section.get("id", ""),
            "title": _s(section.get("title")),
            "type": kind,
        }

        if kind == "bullets":
            bullets = _clean_bullets(section.get("bullets"))
            if bullets:
                sections.append({**base, "bullets": bullets})

        elif kind == "entries":
            entries = []
            for entry in section.get("entries") or []:
                bullets = _clean_bullets(entry.get("bullets"))
                heading, meta, date = (
                    _s(entry.get("heading")), _s(entry.get("meta")), _s(entry.get("date")),
                )
                if heading or meta or date or bullets:
                    entries.append({
                        "id": entry.get("id", ""), "heading": heading,
                        "meta": meta, "date": date, "bullets": bullets,
                    })
            if entries:
                sections.append({**base, "entries": entries})

        elif kind == "org_entries":
            entries = []
            for entry in section.get("entries") or []:
                bullets = _clean_bullets(entry.get("bullets"))
                org, role, location, date = (
                    _s(entry.get("org")), _s(entry.get("role")),
                    _s(entry.get("location")), _s(entry.get("date")),
                )
                if org or role or location or date or bullets:
                    entries.append({
                        "id": entry.get("id", ""), "org": org, "role": role,
                        "location": location, "date": date, "bullets": bullets,
                    })
            if entries:
                sections.append({**base, "entries": entries})

        elif kind == "education":
            entries = []
            for entry in section.get("entries") or []:
                school = entry.get("school") or {}
                school_text = _s(school.get("text"))
                bullets = _clean_bullets(entry.get("bullets"))
                if school_text or bullets:
                    entries.append({
                        "id": entry.get("id", ""),
                        "school": {
                            "id": school.get("id", ""),
                            "text": school_text,
                        },
                        "bullets": bullets,
                    })
            if entries:
                sections.append({**base, "entries": entries})

        # An unrecognised section type has no renderer, so it is dropped.

    return {**data, "header": pruned_header, "sections": sections}


def apply_text_updates(data: dict, updates_by_id: Dict[str, str]) -> dict:
    """Mutate text/label fields whose id exists in updates_by_id (AI API output)."""
    def walk(obj):
        if isinstance(obj, dict):
            if obj.get("id") in updates_by_id:
                if "text" in obj:
                    obj["text"] = updates_by_id[obj["id"]]
                elif "label" in obj:
                    obj["label"] = updates_by_id[obj["id"]]
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for item in obj:
                walk(item)
    walk(data)
    return data


class ResumePDF:
    def __init__(self, output_path: Optional[str], font_scale: float = 1.0,
                 gap_scale: float = 1.0, start_baseline: float = START_BASELINE,
                 measure: bool = False):
        self.output_path = output_path
        self.font_scale = font_scale
        self.gap_scale = gap_scale
        self.measure = measure
        self.body = BODY_SIZE * font_scale
        self.title_sz = TITLE_SIZE * font_scale
        self.name_sz = NAME_SIZE * font_scale
        self.line = LINE * font_scale
        # In measure mode we only need the layout math, so no canvas is created.
        self.c = None if measure else Canvas(output_path, pagesize=letter)
        self.y = start_baseline
        self.overflow = False
        self.elements: Dict[str, Tuple[float, float, float, float]] = {}

    def _rigid(self, v):   # gap that keeps the reference rhythm
        return v * self.font_scale

    def _flex(self, v):    # gap that stretches to fill a short page
        return v * self.font_scale * self.gap_scale

    # -- low-level drawing ----------------------------------------------------
    def _text(self, x, y, text, font, size, color=BLACK):
        if self.measure:
            return
        self.c.setFont(font, size)
        self.c.setFillColorRGB(*color)
        self.c.drawString(x, y, text)

    def _underline(self, x, baseline, width):
        self.c.setStrokeColorRGB(*LINK)
        self.c.setLineWidth(0.6)
        self.c.line(x, baseline - 1.3, x + width, baseline - 1.3)

    def _link(self, href, x, baseline, width, size):
        self.c.linkURL(href, (x, baseline - 2, x + width, baseline + size * 0.78),
                       relative=0, thickness=0)

    def _inline(self, x, baseline, runs, center=False, box_id=None):
        """Draw styled runs on a single line. Each run: dict(text, font, size, color, href?)."""
        if self.measure or not runs:  # single lines don't advance self.y; nothing to measure
            return
        total = sum(stringWidth(r["text"], r["font"], r["size"]) for r in runs)
        start_x = (PAGE_W - total) / 2.0 if center else x
        cx = start_x
        for r in runs:
            w = stringWidth(r["text"], r["font"], r["size"])
            self._text(cx, baseline, r["text"], r["font"], r["size"], r.get("color", BLACK))
            if r.get("href"):
                self._underline(cx, baseline, w)
                self._link(r["href"], cx, baseline, w, r["size"])
            cx += w
        if box_id:
            self.elements[box_id] = (start_x, baseline, total, runs[0]["size"] * 1.2)
        return start_x, total

    # -- blocks ---------------------------------------------------------------
    def _section_title(self, section_id, title, first):
        self.y -= self._flex(SECTION_GAP_FIRST if first else SECTION_GAP)
        # A blank title must not leave the divider rule floating on its own; the
        # section's content still renders below.
        if self.measure or not title:
            return
        self._text(LEFT, self.y, title, FONT_BOLD, self.title_sz, ACCENT)
        rule_y = self.y - RULE_DROP * self.font_scale
        self.c.setStrokeColorRGB(*ACCENT)
        self.c.setLineWidth(RULE_WIDTH)
        self.c.line(LEFT, rule_y, RIGHT_EDGE, rule_y)
        self.elements[section_id] = (LEFT, self.y, CONTENT_W, self.title_sz)

    def _bullet_tokens(self, b):
        """Return a flat list of styled word-tokens for one bullet."""
        # label / text / url are independent: a bullet may carry any combination
        # (an if/elif chain here would silently swallow the url of a bullet that
        # also has a label). Blank parts contribute no tokens.
        toks: List[dict] = []
        for w in _s(b.get("label")).split():  # bold lead label
            toks.append({"text": w, "font": FONT_BOLD, "color": BLACK})
        for w in _s(b.get("text")).split():
            toks.append({"text": w, "font": FONT, "color": BLACK})
        url = _s(b.get("url"))
        if url:  # hyperlinked URL, kept whole by the wrapper
            toks.append({"text": url, "font": FONT, "color": LINK, "href": url})
        return toks

    def _bullet(self, bullet_id, tokens) -> bool:
        size = self.body
        if not tokens:  # nothing to say: draw no orphan glyph and consume no line
            return False
        # greedy word-wrap into lines (URLs stay whole)
        lines: List[List[dict]] = [[]]
        cur_w = 0.0
        for t in tokens:
            tw = stringWidth(t["text"], t["font"], size)
            if lines[-1]:
                sp = stringWidth(" ", t["font"], size)
                if cur_w + sp + tw > BULLET_MAX_W:
                    lines.append([t]); cur_w = tw; continue
                cur_w += sp + tw
                lines[-1].append(t)
            else:
                lines[-1].append(t); cur_w = tw

        top_y = self.y
        if not self.measure:
            self._text(BULLET_X, self.y, BULLET_GLYPH, FONT, size, BLACK)
            for li, line in enumerate(lines):
                by = self.y - li * self.line
                cx = BULLET_TEXT_X
                for idx, t in enumerate(line):
                    if idx > 0:
                        cx += stringWidth(" ", t["font"], size)
                    self._text(cx, by, t["text"], t["font"], size, t["color"])
                    tw = stringWidth(t["text"], t["font"], size)
                    if t.get("href"):
                        self._underline(cx, by, tw)
                        self._link(t["href"], cx, by, tw, size)
                    cx += tw
        self.y -= (len(lines) - 1) * self.line
        if not self.measure:
            self.elements[bullet_id] = (BULLET_TEXT_X, self.y, BULLET_MAX_W, top_y - self.y + size)
        return True

    def _joined(self, parts, sep) -> List[dict]:
        """Build one line's runs, separating only the parts that are non-blank.

        Blank parts are skipped without leaving a dangling separator (a blank
        leading part would otherwise render the line as " • Toronto • 2025").
        """
        runs: List[dict] = []
        for text, font, color in parts:
            if not text:
                continue
            if runs:
                runs.append({"text": sep, "font": FONT, "size": self.body, "color": BLACK})
            runs.append({"text": text, "font": font, "size": self.body, "color": color})
        return runs

    def _heading(self, entry_id, title, meta, date) -> bool:
        runs = self._joined([
            (_s(title), FONT_BOLD, BLACK),
            (_s(meta), FONT_ITALIC, META_GRAY),
            (_s(date), FONT, CONTACT_GRAY),
        ], SEP_HEADING)
        if not runs:
            return False
        self._inline(LEFT, self.y, runs, box_id=entry_id)
        return True

    def _role_line(self, role, location, date) -> bool:
        runs = self._joined([
            (_s(role), FONT, BLACK),
            (_s(location), FONT_ITALIC, META_GRAY),
            (_s(date), FONT, CONTACT_GRAY),
        ], SEP_ROLE)
        if not runs:
            return False
        self._inline(LEFT, self.y, runs)
        return True

    # -- document -------------------------------------------------------------
    def build(self, data: dict) -> Dict[str, object]:
        header = data.get("header") or {}
        name = header.get("name") or {}
        name_text = _s(name.get("text"))
        if not self.measure:
            self.c.setTitle(f"{name_text} Resume".strip())

        # Name (centered, accent). A blank name draws nothing and, so the page
        # keeps no reserved hole, consumes no line either.
        drawn = bool(name_text)
        if drawn:
            self._text((PAGE_W - stringWidth(name_text, FONT_BOLD, self.name_sz)) / 2.0,
                       self.y, name_text, FONT_BOLD, self.name_sz, ACCENT)
            self.elements[name.get("id", "")] = (LEFT, self.y, CONTENT_W, self.name_sz)

        # Contact line (centered, with hyperlinks). Blank parts were pruned, so
        # the separators never bracket an empty slot.
        contact = header.get("contact") or {}
        runs = []
        for part in contact.get("parts") or []:
            text = _s(part.get("text"))
            if not text:
                continue
            if runs:
                runs.append({"text": SEP_CONTACT, "font": FONT, "size": self.body, "color": CONTACT_GRAY})
            runs.append({"text": text, "font": FONT, "size": self.body,
                         "color": LINK if part.get("href") else CONTACT_GRAY,
                         "href": part.get("href")})
        if runs:
            if drawn:
                self.y -= self._rigid(NAME_TO_CONTACT)
            self._inline(0, self.y, runs, center=True, box_id=contact.get("id", ""))

        # Every block below advances self.y only once something has actually been
        # drawn, so a skipped part leaves no blank line behind it.
        for si, section in enumerate(data.get("sections") or []):
            self._section_title(section.get("id", ""), _s(section.get("title")), first=(si == 0))
            block = BLOCK_SPACE

            if section["type"] == "bullets":
                self.y -= self._rigid(TITLE_TO_CONTENT) + self._flex(block)
                drawn = False
                for b in section.get("bullets") or []:
                    if drawn:
                        self.y -= self.line
                    drawn = self._bullet(b.get("id", ""), self._bullet_tokens(b)) or drawn

            elif section["type"] == "entries":
                for ei, entry in enumerate(section.get("entries") or []):
                    self.y -= self._rigid(TITLE_TO_CONTENT if ei == 0 else LINE) + self._flex(block)
                    drawn = self._heading(entry.get("id", ""), entry.get("heading"),
                                          entry.get("meta"), entry.get("date"))
                    for b in entry.get("bullets") or []:
                        if drawn:
                            self.y -= self.line
                        drawn = self._bullet(b.get("id", ""), self._bullet_tokens(b)) or drawn

            elif section["type"] == "org_entries":
                for ei, entry in enumerate(section.get("entries") or []):
                    self.y -= self._rigid(TITLE_TO_CONTENT if ei == 0 else LINE) + self._flex(block)
                    org = _s(entry.get("org"))
                    drawn = bool(org)
                    if drawn:
                        self._text(LEFT, self.y, org, FONT_BOLD, self.body, BLACK)
                        self.elements[entry.get("id", "")] = (LEFT, self.y, CONTENT_W, self.body)
                    # Only claim the second line if the role line has content.
                    if any(_s(entry.get(k)) for k in ("role", "location", "date")):
                        if drawn:
                            self.y -= self.line
                        drawn = self._role_line(entry.get("role"), entry.get("location"),
                                                entry.get("date")) or drawn
                    for b in entry.get("bullets") or []:
                        if drawn:
                            self.y -= self.line
                        drawn = self._bullet(b.get("id", ""), self._bullet_tokens(b)) or drawn

            elif section["type"] == "education":
                for ei, entry in enumerate(section.get("entries") or []):
                    self.y -= (
                        self._rigid(TITLE_TO_CONTENT if ei == 0 else LINE)
                        + self._flex(block)
                    )
                    school = entry.get("school") or {}
                    school_text = _s(school.get("text"))
                    drawn = bool(school_text)
                    if drawn:
                        self._text(LEFT, self.y, school_text, FONT_BOLD, self.body, BLACK)
                        self.elements[school.get("id", "")] = (
                            LEFT, self.y, CONTENT_W, self.body,
                        )
                    for b in entry.get("bullets") or []:
                        if drawn:
                            self.y -= self.line
                        drawn = self._bullet(b.get("id", ""), self._bullet_tokens(b)) or drawn

        if not self.measure:
            self.c.showPage()
            self.c.save()
        return {
            "bottom_y": round(self.y, 2),
            "element_boxes": self.elements,
        }


def _content_span(data: dict, font_scale: float, gap_scale: float) -> float:
    """Lay the document out without drawing; return name->last-baseline height."""
    pdf = ResumePDF(None, font_scale=font_scale, gap_scale=gap_scale,
                    start_baseline=START_BASELINE, measure=True)
    pdf.build(data)
    return START_BASELINE - pdf.y


def _name_ascent(font_scale: float) -> float:
    return getAscentDescent(FONT_BOLD, NAME_SIZE * font_scale)[0]


def _body_descent(font_scale: float) -> float:
    return -getAscentDescent(FONT, BODY_SIZE * font_scale)[1]


def create_resume_pdf(output_path: str, RESUME_DATA: Optional[dict] = None, updates_by_id: Optional[Dict[str, str]] = None) -> Dict[str, object]:
    """Render the resume, auto-fitting and vertically balancing to the page.

    1. Pick the largest font scale whose content fits the page at natural spacing.
    2. If the content is short, stretch the flexible gaps (capped) toward filling.
    3. Center the content block so the leftover blank is split equally top/bottom.
    """
    import copy
    data = copy.deepcopy(RESUME_DATA2 if RESUME_DATA is None else RESUME_DATA )
    if updates_by_id:
        data = apply_text_updates(data, updates_by_id)
    # Prune before any layout pass so the measure and draw passes agree, and so
    # skipped parts cost no vertical space in the fit/balance calculation.
    data = prune_resume_data(data)

    usable = PAGE_H - 2 * MIN_MARGIN

    # 1) Largest font scale that fits.
    font_scale = FONT_SCALES[-1]
    for fs in FONT_SCALES:
        block = _name_ascent(fs) + _content_span(data, fs, 1.0) + _body_descent(fs)
        if block <= usable:
            font_scale = fs
            break

    top_pad, bot_pad = _name_ascent(font_scale), _body_descent(font_scale)

    # 2) Pour a fraction of the leftover space into the flexible gaps (capped) so a
    #    short resume breathes more between sections; the rest becomes margin.
    #    span(gap_scale) is linear, so measuring at 1.0 and 2.0 separates the rigid
    #    height from the per-unit flexible height.
    span1 = _content_span(data, font_scale, 1.0)
    flex_per_unit = max(0.0, _content_span(data, font_scale, 2.0) - span1)
    slack = usable - (top_pad + span1 + bot_pad)   # >= 0 unless the font had to shrink
    gap_scale = 1.0
    if slack > 0 and flex_per_unit > 0.5:
        gap_room = flex_per_unit * (GAP_SCALE_MAX - 1.0)
        gap_absorb = min(GAP_FILL_FRACTION * slack, gap_room)
        gap_scale = 1.0 + gap_absorb / flex_per_unit

    # 3) Center the final block: equal top/bottom blank => balanced page.
    span = _content_span(data, font_scale, gap_scale)
    block = top_pad + span + bot_pad
    top_blank = max(MIN_MARGIN, (PAGE_H - block) / 2.0)
    start_baseline = PAGE_H - top_blank - top_pad

    pdf = ResumePDF(output_path, font_scale=font_scale, gap_scale=gap_scale,
                    start_baseline=start_baseline)
    result = pdf.build(data)

    bottom_blank = PAGE_H - top_blank - block
    result.update({
        # Pruning makes an empty payload render as a clean but near-blank page,
        # which no longer looks like a failure. Report what actually survived so
        # the caller can decide whether the result is worth keeping.
        "sections_rendered": len(data["sections"]),
        "fits_one_page": block <= usable + 0.5,
        "font_size_used": round(BODY_SIZE * font_scale, 2),
        "font_scale": round(font_scale, 3),
        "gap_scale": round(gap_scale, 3),
        "top_margin": round(top_blank, 1),
        "bottom_margin": round(bottom_blank, 1),
    })
    if not result["fits_one_page"]:
        result["warning"] = "Content still overflows one page. Shorten or remove optional bullets."
    return result


if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(
        description="Generate a resume PDF."
    )
    parser.add_argument(
        "output_filename",
        help="Name or path of the PDF file to generate."
    )

    args = parser.parse_args()

    RESUME_DATA = json.load(sys.stdin)

    output_path = args.output_filename

    if not output_path.lower().endswith(".pdf"):
        output_path += ".pdf"

    if not os.path.isabs(output_path):
        output_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            output_path
        )

    print(create_resume_pdf(output_path,RESUME_DATA=RESUME_DATA))