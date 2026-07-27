import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const schemaPath = path.resolve(
  currentDirectory,
  "../../../assets/templates/schema.json",
);

const schemaPath2 = path.resolve(
  currentDirectory,
  "../../../assets/profile/schema.json",
);

export async function loadResumeSchema(): Promise< Record<string, unknown>> {
  const schemaText = await readFile(schemaPath, "utf8");

  try {
    return JSON.parse(schemaText) as Record<string, unknown>;
  } catch {
    throw new Error("schema.json contains invalid JSON.");
  }
}

export async function loadProfileSchema(): Promise< Record<string, unknown>> {
  const schemaText = await readFile(schemaPath2, "utf-8");

  try {
    return JSON.parse(schemaText) as Record<string, unknown>;
  } catch {
    throw new Error("schema.json contains invalid JSON.");
  }
}