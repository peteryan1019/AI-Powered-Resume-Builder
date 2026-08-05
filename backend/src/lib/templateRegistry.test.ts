import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadResumeTemplate } from "./templateRegistry.js";

const TEMPLATE_IDS = ["signal", "evergreen", "atelier"];

const assetsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../assets",
);

describe("resume templates", () => {
  it.each(TEMPLATE_IDS)("loads the %s skeleton", async (id) => {
    const template = (await loadResumeTemplate(id)) as Record<string, unknown>;
    expect(template["header"]).toBeTruthy();
    expect(Array.isArray(template["sections"])).toBe(true);
  });

  it.each(TEMPLATE_IDS)("ships a PDF generator for %s", (id) => {
    // resolveGeneratorPath() in resumeAI1.ts spawns exactly this file, so a
    // registered template without a generator would fail only at build time.
    expect(existsSync(path.join(assetsDir, "templates", id, "create_resume_pdf.py"))).toBe(true);
  });

  it("gives every template the same section contract", async () => {
    const shapes = await Promise.all(
      TEMPLATE_IDS.map(async (id) => {
        const t = (await loadResumeTemplate(id)) as { sections: { id: string; type: string }[] };
        return t.sections.map((s) => `${s.id}:${s.type}`).join("|");
      }),
    );
    // The AI is handed one of these skeletons and told to fill it. If the
    // section ids or types diverged, output valid for one template would be
    // wrong for another.
    expect(new Set(shapes).size).toBe(1);
  });

  it("rejects an unknown template id", async () => {
    await expect(loadResumeTemplate("nope")).rejects.toThrow(/Unknown resume template/);
  });
});
