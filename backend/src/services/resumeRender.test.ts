import { describe, expect, it } from "vitest";
import {
  buildFillBudgetBlock,
  parseFillReport,
  resolveGeneratorPath,
  TARGET_FILL_PERCENT,
  type ResumeFillReport,
} from "./resumeRender.js";

// Captured verbatim from `python3 create_resume_pdf.py out.pdf < fixtures/sample_resume.json`
// for the atelier template — the 12-bullet fixture that renders 42% blank. Kept
// as a literal so a change to the generator's stdout contract fails here rather
// than silently disabling the reviewer's length budget.
const ATELIER_FIXTURE_STDOUT = JSON.stringify({
  bottom_y: 167.55,
  element_boxes: { "header-name": [46.0, 600.0, 520.0, 21.0] },
  sections_rendered: 4,
  fits_one_page: true,
  font_size_used: 10.0,
  font_scale: 1.0,
  gap_scale: 1.9,
  top_margin: 165.0,
  bottom_margin: 165.1,
  page_height: 792.0,
});

describe("parseFillReport", () => {
  it("turns the generator's two blank bands into a fill percentage", () => {
    const report = parseFillReport(ATELIER_FIXTURE_STDOUT);

    // 792 - 165.0 - 165.1 = 461.9 covered, i.e. 58% of the sheet.
    expect(report).not.toBeNull();
    expect(report?.fillPercent).toBe(58);
    expect(report?.topMarginPt).toBe(165.0);
    expect(report?.bottomMarginPt).toBe(165.1);
    expect(report?.fontSizeUsed).toBe(10.0);
    expect(report?.fitsOnePage).toBe(true);
    expect(report?.sectionsRendered).toBe(4);
  });

  it("tolerates trailing whitespace from the subprocess", () => {
    expect(parseFillReport(`${ATELIER_FIXTURE_STDOUT}\n`)?.fillPercent).toBe(58);
  });

  // Every rejection path must yield null, never throw: the fill report only
  // tunes the review prompt, so an unreadable one must not fail a build.
  it.each([
    ["empty output", ""],
    ["non-JSON output", "Traceback (most recent call last):"],
    ["a JSON array", "[1, 2, 3]"],
    ["JSON null", "null"],
    ["a missing page height", JSON.stringify({ top_margin: 5, bottom_margin: 5 })],
    ["a zero page height", JSON.stringify({ page_height: 0, top_margin: 5, bottom_margin: 5 })],
    ["a missing margin", JSON.stringify({ page_height: 792, top_margin: 5 })],
    ["a non-numeric margin", JSON.stringify({ page_height: 792, top_margin: "5", bottom_margin: 5 })],
  ])("returns null for %s", (_label, stdout) => {
    expect(parseFillReport(stdout)).toBeNull();
  });

  it("clamps a nonsensical overflowing measurement into range", () => {
    const report = parseFillReport(
      JSON.stringify({ page_height: 792, top_margin: -500, bottom_margin: -500 }),
    );
    expect(report?.fillPercent).toBe(100);
  });
});

function reportAt(fillPercent: number): ResumeFillReport {
  const blank = Math.round(((100 - fillPercent) / 100) * 792);
  return {
    fillPercent,
    topMarginPt: blank / 2,
    bottomMarginPt: blank / 2,
    fontSizeUsed: 10,
    fitsOnePage: true,
    sectionsRendered: 4,
  };
}

describe("buildFillBudgetBlock", () => {
  it("emits nothing when the draft could not be measured", () => {
    // No measurement must leave the review prompt exactly as it was before the
    // trial render existed, rather than injecting an empty or bogus budget.
    expect(buildFillBudgetBlock(null)).toBe("");
  });

  it("tells the reviewer to close the gap on an under-filled draft", () => {
    const block = buildFillBudgetBlock(reportAt(58));

    expect(block).toContain("ACTION REQUIRED");
    expect(block).toContain("58% of the page");
    expect(block).toContain(`${TARGET_FILL_PERCENT}% target`);
    expect(block).toContain("32 percentage points short");
    expect(block).toContain("333 points of the sheet blank");
  });

  it("forbids padding even while demanding more length", () => {
    // The whole risk of this feature is trading an empty resume for a false one.
    const block = buildFillBudgetBlock(reportAt(58));

    expect(block).toContain("Never invent, pad, stretch, or transfer a fact");
    expect(block).toContain("Never add material that is genuinely irrelevant");
  });

  it("tells the reviewer to hold length when the draft already fills the page", () => {
    const block = buildFillBudgetBlock(reportAt(94));

    expect(block).not.toContain("ACTION REQUIRED");
    expect(block).toContain("It covers 94%");
    expect(block).toContain("Do not shorten it below the target");
  });

  it("treats a draft exactly at the target as meeting it", () => {
    expect(buildFillBudgetBlock(reportAt(TARGET_FILL_PERCENT))).not.toContain(
      "ACTION REQUIRED",
    );
  });
});

describe("resolveGeneratorPath", () => {
  it.each(["signal", "evergreen", "atelier"])("resolves %s", (templateId) => {
    expect(resolveGeneratorPath(templateId)).toContain(
      `templates/${templateId}/create_resume_pdf.py`,
    );
  });

  it("rejects an unknown template", () => {
    expect(() => resolveGeneratorPath("nope")).toThrow("Unsupported template");
  });
});
