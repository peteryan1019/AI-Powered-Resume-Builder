# -*- coding: utf-8 -*-
"""Generate a one-page resume PDF in the "evergreen" style.

Consumes exactly the same JSON structure as the signal template (see
assets/templates/schema.json), so the AI layer and the backend need no
per-template branching — only the presentation differs.

Where signal is a dense, centred, navy-ruled sheet, evergreen is a calmer
left-aligned layout: generous margins, letterspaced section headings trailed by
a hairline, right-aligned dates on their own optical column, and an en-dash
bullet in a deep green accent.

Fonts come from the shared assets/fonts directory (Carlito, the metric-compatible
Calibri clone), falling back to Helvetica so the script never hard-fails.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List, Optional, Tuple

from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import getAscentDescent, registerFontFamily, stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

PAGE_W, PAGE_H = letter  # 612 x 792 pt

# -----------------------------------------------------------------------------
# Geometry (points)
# -----------------------------------------------------------------------------
LEFT = 46.0
RIGHT = 46.0
RIGHT_EDGE = PAGE_W - RIGHT        # 566
CONTENT_W = PAGE_W - LEFT - RIGHT  # 520

BULLET_X = LEFT + 2.0              # dash glyph x
BULLET_TEXT_X = LEFT + 14.0        # text / hanging-indent x
BULLET_MAX_W = CONTENT_W - 14.0

# Minimum breathing room between a left-aligned heading and a right-aligned date
# before the heading is wrapped instead of allowed to collide.
DATE_GUTTER = 14.0

START_BASELINE = 740.0

# Vertical rhythm at body size. Rigid gaps hold the design's proportions;
# flexible gaps stretch to fill a short page.
LINE = 12.60                # single line advance                   (rigid)
NAME_TO_CONTACT = 15.50     # name -> contact line                  (rigid)
CONTACT_TO_RULE = 9.50      # contact baseline -> header rule       (rigid)
SECTION_GAP_FIRST = 24.00   # header rule -> first section title    (flexible)
SECTION_GAP = 21.00         # previous content -> next title        (flexible)
TITLE_TO_CONTENT = 15.00    # section title -> first content        (rigid)
ENTRY_SPACE = 8.00          # space before each entry block         (flexible)
SUBLINE_GAP = 12.10         # heading -> role/meta line             (rigid)

# Vertical balancing (same strategy as signal): pick the largest font scale that
# fits, pour part of the leftover into the flexible gaps, then centre the block.
MIN_MARGIN = 34.0
GAP_SCALE_MAX = 1.9
GAP_FILL_FRACTION = 0.5
FONT_SCALES = (1.0, 0.97, 0.94, 0.91, 0.88, 0.85, 0.82)

# Font sizes
NAME_SIZE = 21.0
TITLE_SIZE = 9.8
BODY_SIZE = 10.5
CONTACT_SIZE = 9.6

# Letterspacing (tracking), in points at scale 1.0
NAME_TRACK = 0.6
TITLE_TRACK = 1.35

# Colors
INK = (0.129, 0.129, 0.129)        # #212121 body text
ACCENT = (0.086, 0.290, 0.226)     # #164A3A deep evergreen
MUTED = (0.420, 0.420, 0.420)      # #6B6B6B meta / dates
HAIRLINE = (0.780, 0.800, 0.784)   # #C7CCC8 section rule
LINK = (0.086, 0.353, 0.290)       # #165A4A links, tinted to the accent

SEP_CONTACT = "  ·  "
SEP_ROLE = "  ·  "
BULLET_GLYPH = "–"                 # en dash, in accent

# -----------------------------------------------------------------------------
# Fonts
# -----------------------------------------------------------------------------
_FONT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "fonts")
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
# Input normalisation
#
# The JSON schema guarantees only that keys are PRESENT, never that they carry
# content: a section may legitimately arrive with `bullets: []` because the user
# has no such credential, and every required string may be "". Pruning before
# any layout pass keeps empty parts from costing ink or vertical space, and
# keeps the measure and draw passes in agreement.
# -----------------------------------------------------------------------------
def _s(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _clean_bullet(bullet: dict) -> Optional[dict]:
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
    """Strip blank strings and empty containers. Content is never discarded:
    a block survives if any of its parts survive."""
    header = data.get("header") or {}
    contact = header.get("contact") or {}
    pruned_header = {
        "name": {
            "id": (header.get("name") or {}).get("id", ""),
            "text": _s((header.get("name") or {}).get("text")),
        },
        "contact": {
            "id": contact.get("id", ""),
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
    """Mutate text/label fields whose id exists in updates_by_id."""
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


# -----------------------------------------------------------------------------
# Renderer
# -----------------------------------------------------------------------------
def _tracked_width(text: str, font: str, size: float, tracking: float) -> float:
    return stringWidth(text, font, size) + tracking * max(0, len(text) - 1)


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
        self.contact_sz = CONTACT_SIZE * font_scale
        self.line = LINE * font_scale
        self.c = None if measure else Canvas(output_path, pagesize=letter)
        self.y = start_baseline
        self.elements: Dict[str, Tuple[float, float, float, float]] = {}

    def _rigid(self, v: float) -> float:
        return v * self.font_scale

    def _flex(self, v: float) -> float:
        return v * self.font_scale * self.gap_scale

    # -- low-level drawing ----------------------------------------------------
    def _text(self, x, y, text, font, size, color=INK):
        if self.measure:
            return
        self.c.setFont(font, size)
        self.c.setFillColorRGB(*color)
        self.c.drawString(x, y, text)

    def _tracked(self, x, y, text, font, size, color, tracking):
        """Draw letterspaced text, character by character."""
        if self.measure:
            return
        self.c.setFont(font, size)
        self.c.setFillColorRGB(*color)
        cx = x
        for ch in text:
            self.c.drawString(cx, y, ch)
            cx += stringWidth(ch, font, size) + tracking

    def _right(self, y, text, font, size, color=MUTED):
        if self.measure or not text:
            return
        self._text(RIGHT_EDGE - stringWidth(text, font, size), y, text, font, size, color)

    def _rule(self, x0, y, x1, color=HAIRLINE, width=0.6):
        if self.measure:
            return
        self.c.setStrokeColorRGB(*color)
        self.c.setLineWidth(width)
        self.c.line(x0, y, x1, y)

    def _underline(self, x, baseline, width):
        self.c.setStrokeColorRGB(*LINK)
        self.c.setLineWidth(0.5)
        self.c.line(x, baseline - 1.4, x + width, baseline - 1.4)

    def _link(self, href, x, baseline, width, size):
        self.c.linkURL(href, (x, baseline - 2, x + width, baseline + size * 0.78),
                       relative=0, thickness=0)

    def _inline(self, x, baseline, runs, box_id=None):
        """Draw styled runs on one line. Each run: dict(text, font, size, color, href?)."""
        if self.measure or not runs:
            return
        cx = x
        for r in runs:
            w = stringWidth(r["text"], r["font"], r["size"])
            self._text(cx, baseline, r["text"], r["font"], r["size"], r.get("color", INK))
            if r.get("href"):
                self._underline(cx, baseline, w)
                self._link(r["href"], cx, baseline, w, r["size"])
            cx += w
        if box_id:
            self.elements[box_id] = (x, baseline, cx - x, runs[0]["size"] * 1.2)

    def _joined(self, parts, sep, size) -> List[dict]:
        """Runs for one line, separating only the non-blank parts so a missing
        value never leaves a dangling separator."""
        runs: List[dict] = []
        for text, font, color in parts:
            if not text:
                continue
            if runs:
                runs.append({"text": sep, "font": FONT, "size": size, "color": HAIRLINE})
            runs.append({"text": text, "font": font, "size": size, "color": color})
        return runs

    # -- wrapping -------------------------------------------------------------
    def _wrap(self, tokens, max_w) -> List[List[dict]]:
        """Greedy word wrap. Tokens carry their own font; URLs stay whole."""
        size = self.body
        lines: List[List[dict]] = [[]]
        cur_w = 0.0
        for t in tokens:
            tw = stringWidth(t["text"], t["font"], size)
            if lines[-1]:
                sp = stringWidth(" ", t["font"], size)
                if cur_w + sp + tw > max_w:
                    lines.append([t])
                    cur_w = tw
                    continue
                cur_w += sp + tw
                lines[-1].append(t)
            else:
                lines[-1].append(t)
                cur_w = tw
        return lines

    def _draw_lines(self, lines, x, size):
        for li, line in enumerate(lines):
            by = self.y - li * self.line
            cx = x
            for idx, t in enumerate(line):
                if idx > 0:
                    cx += stringWidth(" ", t["font"], size)
                self._text(cx, by, t["text"], t["font"], size, t["color"])
                tw = stringWidth(t["text"], t["font"], size)
                if t.get("href"):
                    self._underline(cx, by, tw)
                    self._link(t["href"], cx, by, tw, size)
                cx += tw

    # -- blocks ---------------------------------------------------------------
    def _section_title(self, section_id, title, first):
        """Letterspaced heading with a hairline running out to the right margin —
        the main visual signature of this template."""
        self.y -= self._flex(SECTION_GAP_FIRST if first else SECTION_GAP)
        if self.measure or not title:
            return
        self._tracked(LEFT, self.y, title, FONT_BOLD, self.title_sz, ACCENT,
                      TITLE_TRACK * self.font_scale)
        w = _tracked_width(title, FONT_BOLD, self.title_sz, TITLE_TRACK * self.font_scale)
        rule_x = LEFT + w + 9.0
        if rule_x < RIGHT_EDGE:
            self._rule(rule_x, self.y + self.title_sz * 0.30, RIGHT_EDGE)
        self.elements[section_id] = (LEFT, self.y, CONTENT_W, self.title_sz)

    def _bullet_tokens(self, b) -> List[dict]:
        """label / text / url are independent; a bullet may carry any combination."""
        toks: List[dict] = []
        for w in _s(b.get("label")).split():
            toks.append({"text": w, "font": FONT_BOLD, "color": INK})
        for w in _s(b.get("text")).split():
            toks.append({"text": w, "font": FONT, "color": INK})
        url = _s(b.get("url"))
        if url:
            toks.append({"text": url, "font": FONT, "color": LINK, "href": url})
        return toks

    def _bullet(self, bullet_id, tokens) -> bool:
        if not tokens:
            return False
        lines = self._wrap(tokens, BULLET_MAX_W)
        top_y = self.y
        if not self.measure:
            self._text(BULLET_X, self.y, BULLET_GLYPH, FONT, self.body, ACCENT)
            self._draw_lines(lines, BULLET_TEXT_X, self.body)
        self.y -= (len(lines) - 1) * self.line
        if not self.measure:
            self.elements[bullet_id] = (
                BULLET_TEXT_X, self.y, BULLET_MAX_W, top_y - self.y + self.body,
            )
        return True

    def _title_with_date(self, box_id, title, title_font, date) -> bool:
        """Left title (wrapped if needed) with the date right-aligned on the
        first line. The heading is wrapped rather than allowed to collide."""
        title, date = _s(title), _s(date)
        if not (title or date):
            return False

        date_w = stringWidth(date, FONT, self.body) if date else 0.0
        avail = CONTENT_W - (date_w + DATE_GUTTER if date else 0.0)

        if title:
            toks = [{"text": w, "font": title_font, "color": INK} for w in title.split()]
            lines = self._wrap(toks, max(avail, 60.0))
            if not self.measure:
                self._draw_lines(lines, LEFT, self.body)
                self.elements[box_id] = (LEFT, self.y, CONTENT_W, self.body)
        else:
            lines = [[]]

        if date and not self.measure:
            self._right(self.y, date, FONT, self.body, MUTED)

        self.y -= (len(lines) - 1) * self.line
        return True

    # -- document -------------------------------------------------------------
    def build(self, data: dict) -> Dict[str, object]:
        header = data.get("header") or {}
        name = header.get("name") or {}
        name_text = _s(name.get("text"))
        if not self.measure:
            self.c.setTitle(f"{name_text} Resume".strip())

        drawn = bool(name_text)
        if drawn:
            self._tracked(LEFT, self.y, name_text, FONT_BOLD, self.name_sz, ACCENT,
                          NAME_TRACK * self.font_scale)
            self.elements[name.get("id", "")] = (LEFT, self.y, CONTENT_W, self.name_sz)

        contact = header.get("contact") or {}
        runs = []
        for part in contact.get("parts") or []:
            text = _s(part.get("text"))
            if not text:
                continue
            if runs:
                runs.append({"text": SEP_CONTACT, "font": FONT,
                             "size": self.contact_sz, "color": HAIRLINE})
            runs.append({"text": text, "font": FONT, "size": self.contact_sz,
                         "color": LINK if part.get("href") else MUTED,
                         "href": part.get("href")})
        if runs:
            if drawn:
                self.y -= self._rigid(NAME_TO_CONTACT)
            self._inline(LEFT, self.y, runs, box_id=contact.get("id", ""))
            drawn = True

        if drawn:
            self.y -= self._rigid(CONTACT_TO_RULE)
            self._rule(LEFT, self.y, RIGHT_EDGE, ACCENT, 1.1)

        for si, section in enumerate(data.get("sections") or []):
            self._section_title(section.get("id", ""), _s(section.get("title")),
                                first=(si == 0))

            if section["type"] == "bullets":
                self.y -= self._rigid(TITLE_TO_CONTENT)
                shown = False
                for b in section.get("bullets") or []:
                    if shown:
                        self.y -= self.line
                    shown = self._bullet(b.get("id", ""), self._bullet_tokens(b)) or shown

            elif section["type"] == "entries":
                for ei, entry in enumerate(section.get("entries") or []):
                    self.y -= (self._rigid(TITLE_TO_CONTENT) if ei == 0
                               else self._rigid(LINE) + self._flex(ENTRY_SPACE))
                    shown = self._title_with_date(entry.get("id", ""),
                                                  entry.get("heading"), FONT_BOLD,
                                                  entry.get("date"))
                    meta = _s(entry.get("meta"))
                    if meta:
                        if shown:
                            self.y -= self._rigid(SUBLINE_GAP)
                        self._inline(LEFT, self.y, [{
                            "text": meta, "font": FONT_ITALIC,
                            "size": self.body, "color": MUTED,
                        }])
                        shown = True
                    for b in entry.get("bullets") or []:
                        if shown:
                            self.y -= self.line
                        shown = self._bullet(b.get("id", ""), self._bullet_tokens(b)) or shown

            elif section["type"] == "org_entries":
                for ei, entry in enumerate(section.get("entries") or []):
                    self.y -= (self._rigid(TITLE_TO_CONTENT) if ei == 0
                               else self._rigid(LINE) + self._flex(ENTRY_SPACE))
                    shown = self._title_with_date(entry.get("id", ""),
                                                  entry.get("org"), FONT_BOLD,
                                                  entry.get("date"))
                    subline = self._joined([
                        (_s(entry.get("role")), FONT, INK),
                        (_s(entry.get("location")), FONT_ITALIC, MUTED),
                    ], SEP_ROLE, self.body)
                    if subline:
                        if shown:
                            self.y -= self._rigid(SUBLINE_GAP)
                        self._inline(LEFT, self.y, subline)
                        shown = True
                    for b in entry.get("bullets") or []:
                        if shown:
                            self.y -= self.line
                        shown = self._bullet(b.get("id", ""), self._bullet_tokens(b)) or shown

            elif section["type"] == "education":
                for ei, entry in enumerate(section.get("entries") or []):
                    self.y -= (self._rigid(TITLE_TO_CONTENT) if ei == 0
                               else self._rigid(LINE) + self._flex(ENTRY_SPACE))
                    school = entry.get("school") or {}
                    school_text = _s(school.get("text"))
                    shown = bool(school_text)
                    if shown:
                        self._text(LEFT, self.y, school_text, FONT_BOLD, self.body, INK)
                        self.elements[school.get("id", "")] = (
                            LEFT, self.y, CONTENT_W, self.body,
                        )
                    for b in entry.get("bullets") or []:
                        if shown:
                            self.y -= self.line
                        shown = self._bullet(b.get("id", ""), self._bullet_tokens(b)) or shown

        if not self.measure:
            self.c.showPage()
            self.c.save()
        return {"bottom_y": round(self.y, 2), "element_boxes": self.elements}


# -----------------------------------------------------------------------------
# Auto-fit
# -----------------------------------------------------------------------------
def _content_span(data: dict, font_scale: float, gap_scale: float) -> float:
    pdf = ResumePDF(None, font_scale=font_scale, gap_scale=gap_scale,
                    start_baseline=START_BASELINE, measure=True)
    pdf.build(data)
    return START_BASELINE - pdf.y


def _name_ascent(font_scale: float) -> float:
    return getAscentDescent(FONT_BOLD, NAME_SIZE * font_scale)[0]


def _body_descent(font_scale: float) -> float:
    return -getAscentDescent(FONT, BODY_SIZE * font_scale)[1]


def create_resume_pdf(output_path: str, RESUME_DATA: Optional[dict] = None,
                      updates_by_id: Optional[Dict[str, str]] = None) -> Dict[str, object]:
    """Render the resume, auto-fitting and vertically balancing to one page."""
    import copy

    if RESUME_DATA is None:
        raise ValueError(
            "evergreen requires resume data; pass RESUME_DATA or pipe JSON on stdin."
        )

    data = copy.deepcopy(RESUME_DATA)
    if updates_by_id:
        data = apply_text_updates(data, updates_by_id)
    # Prune before any layout pass so measure and draw agree, and so skipped
    # parts cost no vertical space in the fit calculation.
    data = prune_resume_data(data)

    usable = PAGE_H - 2 * MIN_MARGIN

    font_scale = FONT_SCALES[-1]
    for fs in FONT_SCALES:
        block = _name_ascent(fs) + _content_span(data, fs, 1.0) + _body_descent(fs)
        if block <= usable:
            font_scale = fs
            break

    top_pad, bot_pad = _name_ascent(font_scale), _body_descent(font_scale)

    span1 = _content_span(data, font_scale, 1.0)
    flex_per_unit = max(0.0, _content_span(data, font_scale, 2.0) - span1)
    slack = usable - (top_pad + span1 + bot_pad)
    gap_scale = 1.0
    if slack > 0 and flex_per_unit > 0.5:
        gap_room = flex_per_unit * (GAP_SCALE_MAX - 1.0)
        gap_absorb = min(GAP_FILL_FRACTION * slack, gap_room)
        gap_scale = 1.0 + gap_absorb / flex_per_unit

    span = _content_span(data, font_scale, gap_scale)
    block = top_pad + span + bot_pad
    top_blank = max(MIN_MARGIN, (PAGE_H - block) / 2.0)
    start_baseline = PAGE_H - top_blank - top_pad

    pdf = ResumePDF(output_path, font_scale=font_scale, gap_scale=gap_scale,
                    start_baseline=start_baseline)
    result = pdf.build(data)

    bottom_blank = PAGE_H - top_blank - block
    result.update({
        "sections_rendered": len(data["sections"]),
        "fits_one_page": block <= usable + 0.5,
        "font_size_used": round(BODY_SIZE * font_scale, 2),
        "font_scale": round(font_scale, 3),
        "gap_scale": round(gap_scale, 3),
        "top_margin": round(top_blank, 1),
        "bottom_margin": round(bottom_blank, 1),
        # Lets a caller convert the two blank bands into a fill ratio
        # without assuming a paper size.
        "page_height": round(PAGE_H, 1),
    })
    if not result["fits_one_page"]:
        result["warning"] = "Content still overflows one page. Shorten or remove optional bullets."
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate an evergreen resume PDF.")
    parser.add_argument("output_filename",
                        help="Name or path of the PDF file to generate.")
    args = parser.parse_args()

    RESUME_DATA = json.load(sys.stdin)

    output_path = args.output_filename
    if not output_path.lower().endswith(".pdf"):
        output_path += ".pdf"
    if not os.path.isabs(output_path):
        output_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), output_path
        )

    print(json.dumps(create_resume_pdf(output_path, RESUME_DATA=RESUME_DATA)))
