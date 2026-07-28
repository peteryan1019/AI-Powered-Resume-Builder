import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

// currentDirectory:
// project-resumebuilder/backend/src/lib
//
// ../../../assets:
// project-resumebuilder/assets
const jsonpath = path.resolve(currentDirectory, "../../../assets",);

const TEMPLATE_FILES: Record<string, string> = {
  signal: path.join(
    jsonpath,
    "templates/signal/signal.json",
  ),

  evergreen: path.join(
    jsonpath,
    "templates/evergreen/evergreen.json",
  ),

  atelier: path.join(
    jsonpath,
    "templates/atelier/atelier.json",
  ),
};

export async function loadResumeTemplate(templateId: string,): Promise<Record<string, unknown>> {
  const templatePath = TEMPLATE_FILES[templateId];

  if (!templatePath) {
    throw new Error(`Unknown resume template: ${templateId}`);
  }

  const templateContents = await readFile(templatePath, "utf8",);

  return JSON.parse(templateContents) as Record<string, unknown>;
}