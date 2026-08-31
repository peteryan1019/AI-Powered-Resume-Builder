import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

// Python interpreter used for PDF generation. Defaults to the project venv
// (backend/.venv), which is where reportlab is installed. Override with the
// PYTHON_BIN env var in other environments.
const PYTHON_BIN = process.env.PYTHON_BIN ?? path.resolve(".venv/bin/python3");

/**
 * How much of the page the rendered content actually covers.
 *
 * Every generator already computes this while auto-fitting to one page and
 * prints it as JSON on stdout; this is that payload, narrowed to the fields
 * the pipeline uses.
 */
export interface ResumeFillReport {
  /** Share of the page height covered by content, 0-100. */
  fillPercent: number;
  /** Blank band above the content, in points. */
  topMarginPt: number;
  /** Blank band below the content, in points. */
  bottomMarginPt: number;
  /** Body font size the auto-fit settled on, in points. */
  fontSizeUsed: number;
  fitsOnePage: boolean;
  sectionsRendered: number;
}

export function resolveGeneratorPath(templateId: string): string {
  switch (templateId) {
    case "signal":
      return path.resolve("../assets/templates/signal/create_resume_pdf.py");
    case "evergreen":
      return path.resolve("../assets/templates/evergreen/create_resume_pdf.py");
    case "atelier":
      return path.resolve("../assets/templates/atelier/create_resume_pdf.py");
    default:
      throw new Error(`Unsupported template: ${templateId}`);
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Turns the generator's stdout into a fill report.
 *
 * Returns null rather than throwing on anything unexpected: the fill report only
 * informs the reviewing AI's length budget, so a generator whose output cannot
 * be parsed must still be allowed to produce a resume.
 */
export function parseFillReport(stdout: string): ResumeFillReport | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const diagnostics = parsed as Record<string, unknown>;

  const pageHeight = asNumber(diagnostics.page_height);
  const topMargin = asNumber(diagnostics.top_margin);
  const bottomMargin = asNumber(diagnostics.bottom_margin);

  if (pageHeight === null || pageHeight <= 0) return null;
  if (topMargin === null || bottomMargin === null) return null;

  const covered = pageHeight - topMargin - bottomMargin;
  const fillPercent = Math.max(0, Math.min(100, (covered / pageHeight) * 100));

  return {
    fillPercent: Math.round(fillPercent),
    topMarginPt: topMargin,
    bottomMarginPt: bottomMargin,
    fontSizeUsed: asNumber(diagnostics.font_size_used) ?? 0,
    fitsOnePage: diagnostics.fits_one_page === true,
    sectionsRendered: asNumber(diagnostics.sections_rendered) ?? 0,
  };
}

/**
 * Target share of the page the finished resume should cover. Below this the
 * templates' auto-fit has to convert the leftover height into top and bottom
 * margins, which is what makes a short resume read as an empty one.
 */
export const TARGET_FILL_PERCENT = 90;

/**
 * Turns the draft's measured page coverage into an instruction the model can
 * act on. Without a measurement there is no block at all, so the review behaves
 * as it did before the trial render existed.
 */
export function buildFillBudgetBlock(fill: ResumeFillReport | null): string {
  if (!fill) return "";

  const blankPt = Math.round(fill.topMarginPt + fill.bottomMarginPt);

  if (fill.fillPercent >= TARGET_FILL_PERCENT) {
    return `MEASURED PAGE COVERAGE OF THE DRAFT.

The draft has been rendered in the chosen template. It covers ${fill.fillPercent}% of the
page, which meets the ${TARGET_FILL_PERCENT}% target. Keep the revision at approximately this
length. Do not shorten it below the target: if you delete something, replace it
with stronger supported material from the verified profile.`;
  }

  const shortfall = TARGET_FILL_PERCENT - fill.fillPercent;

  return `MEASURED PAGE COVERAGE OF THE DRAFT — ACTION REQUIRED.

The draft has been rendered in the chosen template. It covers only
${fill.fillPercent}% of the page and leaves ${blankPt} points of the sheet blank, against a
${TARGET_FILL_PERCENT}% target. It is roughly ${shortfall} percentage points short, so the printed
resume currently looks unfinished.

This is a real measurement of the draft you are reviewing, not an estimate.

Your revision must close that gap. Work through the verified profile and find
relevant material the draft left out or over-compressed:

  - accomplishments the draft dropped from an entry it kept;
  - distinct accomplishments the draft merged into one bullet;
  - entries covering a posting requirement no retained entry demonstrates;
  - supporting evidence for a requirement currently shown only weakly.

Then add them. Expanding a retained entry from one bullet to its full supported
detail is usually the largest and safest gain available.

Two constraints override the target, and both are absolute:

  - Never invent, pad, stretch, or transfer a fact to gain length. A truthful
    short resume beats a full one containing a single unsupported claim.
  - Never add material that is genuinely irrelevant to this posting.

If, after a genuine search of the entire verified profile, there is truly not
enough relevant supported material to reach the target, return the strongest
resume the profile allows and accept the shorter page. Only reach that
conclusion after the search, never instead of it.`;
}

interface RenderedResume {
  pdf: Uint8Array<ArrayBuffer>;
  /** null when the generator's diagnostics could not be read. */
  fill: ResumeFillReport | null;
}

/**
 * Runs a template's generator over `content` and returns both the PDF bytes and
 * the generator's own report on how full the page came out.
 */
export async function renderResume(
  content: unknown,
  templateId: string,
): Promise<RenderedResume> {
  const generatorPath = resolveGeneratorPath(templateId);
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);

  try {
    const pythonProcess = spawn(PYTHON_BIN, [generatorPath, outputPath]);

    // Both streams must be drained. The diagnostics are small, but an unread
    // pipe would eventually stall the child.
    let stdout = "";
    let stderr = "";
    pythonProcess.stdout.setEncoding("utf8");
    pythonProcess.stderr.setEncoding("utf8");
    pythonProcess.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    pythonProcess.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    pythonProcess.stdin.end(JSON.stringify(content));

    const [exitCode] = (await once(pythonProcess, "close")) as [number];

    if (exitCode !== 0) {
      if (stderr.trim()) {
        console.error(
          `[resumeRender] ${templateId} generator failed:`,
          stderr.trim().slice(-800),
        );
      }
      throw new Error("PDF generation failed.");
    }

    const fileBuffer = await readFile(outputPath);
    return { pdf: Uint8Array.from(fileBuffer), fill: parseFillReport(stdout) };
  } finally {
    await unlink(outputPath).catch(() => undefined);
  }
}

/**
 * Renders `content` purely to find out how much of the page it fills, discarding
 * the PDF. Used between the drafting and reviewing AI stages so the reviewer can
 * be told how much room the draft left unused.
 *
 * Never throws: an unmeasurable draft simply gets reviewed without a length
 * budget, which is how the pipeline behaved before the measurement existed.
 */
export async function measureResumeFill(
  content: unknown,
  templateId: string,
): Promise<ResumeFillReport | null> {
  try {
    const { fill } = await renderResume(content, templateId);
    return fill;
  } catch (error: unknown) {
    console.warn(
      `[resumeRender] Could not measure draft fill for ${templateId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
