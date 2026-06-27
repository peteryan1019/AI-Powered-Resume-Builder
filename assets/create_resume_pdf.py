from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

PAGE_W, PAGE_H = letter
LEFT = 0.30 * inch
RIGHT = 0.30 * inch
TOP = 0.22 * inch
BOTTOM = 0.16 * inch
CONTENT_W = PAGE_W - LEFT - RIGHT

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_OBLIQUE = "Helvetica-Oblique"
BLACK = (0, 0, 0)
BLUE = (0.05, 0.17, 0.34)
LINK_BLUE = (0.0, 0.25, 0.75)
GRAY = (0.40, 0.40, 0.40)

# -----------------------------------------------------------------------------
# Resume data model
# Use these IDs as the contract between your AI/API layer and the PDF generator.
# The AI should output JSON with these exact keys, or arrays of entries/bullets
# where each item has a stable id.
# -----------------------------------------------------------------------------
RESUME_DATA = {'jobPostTitle': 'Backend Engineer',
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


def apply_text_updates(data: dict, updates_by_id: Dict[str, str]) -> dict:
    """Mutates text fields whose id exists in updates_by_id. Useful for AI API output."""
    def walk(obj):
        if isinstance(obj, dict):
            if obj.get("id") in updates_by_id and "text" in obj:
                obj["text"] = updates_by_id[obj["id"]]
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for item in obj:
                walk(item)
    walk(data)
    return data


def _wrap_text(text: str, font: str, size: float, max_width: float) -> List[str]:
    words = text.split()
    if not words:
        return [""]
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = current + " " + word
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


class ResumePDF:
    def __init__(self, output_path: str, font_size: float = 10.0, line_height: float = 12.2):
        self.output_path = output_path
        self.font_size = font_size
        self.line_height = line_height
        self.c = Canvas(output_path, pagesize=letter)
        self.c.setTitle("Peter Yan Resume")
        self.y = PAGE_H - TOP
        self.overflow = False
        self.elements: Dict[str, Tuple[float, float, float, float]] = {}

    def _text(self, x, y, text, font=FONT, size=None, color=BLACK):
        self.c.setFont(font, size or self.font_size)
        self.c.setFillColorRGB(*color)
        self.c.drawString(x, y, text)

    def _center(self, y, text, font=FONT_BOLD, size=16.2, color=BLUE):
        self.c.setFont(font, size)
        self.c.setFillColorRGB(*color)
        w = stringWidth(text, font, size)
        self.c.drawString((PAGE_W - w) / 2, y, text)

    def _section_title(self, section_id: str, title: str):
        self.y -= 8.0
        self._text(LEFT, self.y, title, FONT_BOLD, 11.2, BLUE)
        self.y -= 4.0
        self.c.setStrokeColorRGB(*BLUE)
        self.c.setLineWidth(0.75)
        self.c.line(LEFT, self.y, PAGE_W - RIGHT, self.y)
        self.c.setStrokeColorRGB(*BLACK)
        self.elements[section_id] = (LEFT, self.y, CONTENT_W, 12)
        self.y -= 14.0

    def _bullet(self, bullet_id: str, text: str, indent: float = 8.5):
        bullet_x = LEFT + 7.0
        text_x = LEFT + indent + 12.0
        max_w = CONTENT_W - indent - 12.0
        lines = _wrap_text(text, FONT, self.font_size, max_w)
        top_y = self.y
        self._text(bullet_x, self.y, "•", FONT_BOLD, self.font_size)
        for i, line in enumerate(lines):
            self._text(text_x, self.y - i * self.line_height, line, FONT, self.font_size)
        self.y -= len(lines) * self.line_height
        self.elements[bullet_id] = (text_x, self.y, max_w, top_y - self.y)

    def _run(self, x, y, text, font=FONT, size=None, color=BLACK):
        size = size or self.font_size
        self._text(x, y, text, font, size, color)
        return x + stringWidth(text, font, size)

    def _entry_heading(self, entry_id: str, title: str, meta: Optional[str], date: str):
        top_y = self.y
        x = LEFT
        x = self._run(x, self.y, title, FONT_BOLD)
        if meta:
            x = self._run(x, self.y, "  •  ", FONT_BOLD)
            x = self._run(x, self.y, meta, FONT_OBLIQUE, color=GRAY)
        if date:
            x = self._run(x, self.y, "  •  ", FONT_BOLD)
            x = self._run(x, self.y, date, FONT)
        self.y -= self.line_height
        self.elements[entry_id] = (LEFT, self.y, CONTENT_W, top_y - self.y)

    def _org_entry_heading(self, entry_id: str, org: str, role: str, location: str, date: str):
        self._text(LEFT, self.y, org, FONT_BOLD, self.font_size)
        self.y -= self.line_height
        top_y = self.y
        x = LEFT
        x = self._run(x, self.y, role, FONT)
        if location:
            x = self._run(x, self.y, " • ", FONT_BOLD)
            x = self._run(x, self.y, location, FONT_OBLIQUE, color=GRAY)
        if date:
            x = self._run(x, self.y, " • ", FONT_BOLD)
            x = self._run(x, self.y, date, FONT)
        self.y -= self.line_height
        self.elements[entry_id] = (LEFT, self.y, CONTENT_W, top_y - self.y)

    def build(self, data: dict) -> Dict[str, object]:
        header = data["header"]
        self._center(self.y, header["name"]["text"], FONT_BOLD, 16.2, BLUE)
        self.elements[header["name"]["id"]] = (LEFT, self.y, CONTENT_W, 15)
        self.y -= 19
        self._center(self.y, header["contact"]["text"], FONT, 10.0, BLACK)
        self.elements[header["contact"]["id"]] = (LEFT, self.y, CONTENT_W, 9)
        self.y -= 10

        for section in data["sections"]:
            self._section_title(section["id"], section["title"])
            if section["type"] == "bullets":
                for b in section["bullets"]:
                    self._bullet(b["id"], b["text"])
            elif section["type"] == "entries":
                for entry in section["entries"]:
                    self._entry_heading(entry["id"], entry["heading"], entry.get("meta"), entry.get("date", ""))
                    for b in entry.get("bullets", []):
                        self._bullet(b["id"], b["text"])
            elif section["type"] == "org_entries":
                for entry in section["entries"]:
                    self._org_entry_heading(entry["id"], entry["org"], entry["role"], entry.get("location", ""), entry.get("date", ""))
                    for b in entry.get("bullets", []):
                        self._bullet(b["id"], b["text"])
            elif section["type"] == "education":
                self._text(LEFT, self.y, section["school"]["text"], FONT_BOLD, self.font_size)
                self.elements[section["school"]["id"]] = (LEFT, self.y, CONTENT_W, self.line_height)
                self.y -= self.line_height
                for b in section["bullets"]:
                    self._bullet(b["id"], b["text"])
            self.y -= 1.0

        self.overflow = self.y < BOTTOM
        self.c.showPage()
        self.c.save()
        return {
            "fits_one_page": not self.overflow,
            "bottom_y": round(self.y, 2),
            "minimum_allowed_y": round(BOTTOM, 2),
            "element_boxes": self.elements,
        }


def create_resume_pdf(output_path: str, updates_by_id: Optional[Dict[str, str]] = None) -> Dict[str, object]:
    import copy
    data = copy.deepcopy(RESUME_DATA)
    if updates_by_id:
        data = apply_text_updates(data, updates_by_id)

    # Try normal size first, then slightly smaller fallback if needed.
    for font_size, line_height in [(10.0, 12.2), (9.7, 11.8), (9.4, 11.4), (9.1, 11.0)]:
        pdf = ResumePDF(output_path, font_size=font_size, line_height=line_height)
        result = pdf.build(data)
        if result["fits_one_page"]:
            result["font_size_used"] = font_size
            result["line_height_used"] = line_height
            return result
    result["warning"] = "Content still overflows one page. Shorten or remove optional bullets."
    return result


if __name__ == "__main__":
    result = create_resume_pdf("/mnt/data/Peter_Yan_resume_generated_reportlab.pdf")
    print(result)
