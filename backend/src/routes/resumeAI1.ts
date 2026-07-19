import { Router, type Request, type Response } from "express";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import prisma from "../lib/prisma.js";
import { getExportedProfile } from "../services/profileExportJSON.js";
import { tailorResume } from "../services/test-gemini.js";
import { finalResume } from "../services/check-gemini.js"
import type { User } from "../../generated/prisma/client.js";



const router = Router();

// Python interpreter used for PDF generation. Defaults to the project venv
// (backend/.venv), which is where reportlab is installed. Override with the
// PYTHON_BIN env var in other environments.
const PYTHON_BIN =
  process.env.PYTHON_BIN ?? path.resolve(".venv/bin/python3");

// ---------------------------------------------------------------------------
// Build jobs
//
// The resume build streams its progress to the browser over Server-Sent Events
// (SSE). Because EventSource is GET-only and cannot carry a body, the user's
// inputs (job-post URL + template) are captured by the POST below and stashed
// here, keyed by a jobId. The GET /events stream then runs the pipeline using
// the stored inputs and emits one `state` event per stage.
// ---------------------------------------------------------------------------

type BuildState = "generating" | "checking" | "generating_pdf";

interface BuildJob {
  userId: string;
  url: string;
  templateId: string;
  status: "pending" | "running" | "done" | "error";
  resumeId?: string;
  createdAt: number;
}

const jobs = new Map<string, BuildJob>();

// Ten minutes is comfortably longer than a build; anything older is stale.
const JOB_TTL_MS = 10 * 60 * 1000;

function pruneStaleJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      jobs.delete(id);
    }
  }
}

// Human-readable labels + ordering for each stage the UI draws.
const STAGE_META: Record<BuildState, { label: string; step: number }> = {
  generating: { label: "Generating resume", step: 1 },
  checking: { label: "Checking content", step: 2 },
  generating_pdf: { label: "Generating PDF", step: 3 },
};
const STAGE_TOTAL = 3;

function resolveGeneratorPath(templateId: string): string {
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

/**
 * Runs the full resume pipeline, invoking `emit` before each stage so the
 * caller can stream progress. Returns the id of the persisted resume.
 */
async function runBuildPipeline(
  user: User,
  input: { url: string; templateId: string },
  emit: (state: BuildState) => void,
): Promise<string> {
  const { url, templateId } = input;

  const exportedProfile = await getExportedProfile(user);

  emit("generating");
  const tailoredResume = await tailorResume({
    userProfile: exportedProfile,
    URL: url,
    templateId,
  });

  emit("checking");
  const completeResume = await finalResume(tailoredResume, {
    userProfile: exportedProfile,
    URL: url,
    templateId,
  });

  emit("generating_pdf");
  const gPath = resolveGeneratorPath(templateId);
  const oPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);

  const pythonProcess = spawn(PYTHON_BIN, [gPath, oPath]);
  pythonProcess.stdin.end(JSON.stringify(completeResume));

  const [exitCode] = (await once(pythonProcess, "close")) as [number];
  if (exitCode !== 0) {
    throw new Error("PDF generation failed.");
  }

  const pdfData = await readFile(oPath);
  await unlink(oPath);

  const createdResume = await prisma.resume.create({
    data: {
      userId: user.id,
      templateId,
      URL: url,
      content: completeResume,
      pdfData,
    },
  });

  return createdResume.id;
}

// Kick off a build: validate inputs, register a pending job, hand back a jobId
// the client opens an SSE stream against.
router.post("/:userId/resumes", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { URL, templateId } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Please log in." });
    }

    const currentUser = req.user as User;
    // Prevent an authenticated user from building for another user.
    if (currentUser.id !== userId) {
      return res
        .status(403)
        .json({ error: "You cannot create a resume for this user." });
    }

    if (typeof URL !== "string" || !URL.trim()) {
      return res.status(400).json({ error: "Please enter a valid URL." });
    }

    if (typeof templateId !== "string" || !templateId.trim()) {
      return res.status(400).json({ error: "Please select a valid template" });
    }

    const t = templateId.trim().toLowerCase();
    if (t !== "signal" && t !== "evergreen" && t !== "atelier") {
      return res.status(400).json({ error: `Unsupported template: ${t}` });
    }

    pruneStaleJobs();

    const jobId = randomUUID();
    jobs.set(jobId, {
      userId: currentUser.id,
      url: URL.trim(),
      templateId: t,
      status: "pending",
      createdAt: Date.now(),
    });

    return res.status(201).json({ jobId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[POST /:userId/resumes] Failed to start build:", error);
    return res.status(500).json({
      error: "Unable to build the resume right now.",
      detail: message,
    });
  }
});

// SSE stream: runs the pipeline for a previously-registered job and emits a
// `state` event per stage, a final `complete` event carrying the resumeId, or
// an `error` event with a message.
router.get(
  "/:userId/resumes/:jobId/events",
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const jobId = String(req.params.jobId);

    if (!req.user) {
      return res.status(401).json({ error: "Please log in." });
    }
    const currentUser = req.user as User;
    if (currentUser.id !== userId) {
      return res
        .status(403)
        .json({ error: "You cannot access this build." });
    }

    const job = jobs.get(jobId);
    if (!job || job.userId !== currentUser.id) {
      return res.status(404).json({ error: "Build not found." });
    }

    // Open the SSE stream.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Idempotency guard: EventSource auto-reconnects on any drop. Only a
    // pending job may run — otherwise a reconnect would re-run the pipeline
    // (duplicate resume + double AI cost).
    if (job.status !== "pending") {
      send("error", { message: "This build has already been started." });
      return res.end();
    }

    job.status = "running";

    let clientGone = false;
    req.on("close", () => {
      clientGone = true;
    });

    try {
      const resumeId = await runBuildPipeline(
        currentUser,
        { url: job.url, templateId: job.templateId },
        (state) => {
          if (clientGone) return;
          const meta = STAGE_META[state];
          send("state", {
            state,
            label: meta.label,
            step: meta.step,
            total: STAGE_TOTAL,
          });
        },
      );

      job.status = "done";
      job.resumeId = resumeId;

      if (!clientGone) {
        send("complete", { resumeId });
      }
      return res.end();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[GET /:userId/resumes/:jobId/events] Build failed (job ${jobId}):`,
        error,
      );
      job.status = "error";
      if (!clientGone) {
        send("error", { message: "Unable to build the resume right now." });
      }
      return res.end();
    }
  },
);

router.get(
  "/:userId/resumes/:resumeId/pdf",
  async (req: Request, res: Response) => {
    const { userId, resumeId } = req.params;
    const currentUser = req.user as { id: string };

    if (currentUser.id !== userId) {
      return res.status(403).json({
        error: "You cannot access this resume.",
      });
    }

    const resume = await prisma.resume.findFirst({
      where: {
        id: resumeId,
        userId,
      },
      select: {
        pdfData: true,
      },
    });

    if (!resume?.pdfData) {
      return res.status(404).json({error: "PDF not found.",});
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="resume.pdf"',
    );

    return res.send(Buffer.from(resume.pdfData));
  },
);

export default router;