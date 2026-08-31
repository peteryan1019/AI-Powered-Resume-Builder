import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import prisma from "../lib/prisma.js";
import { getExportedProfile } from "../services/profileExportJSON.js";
import { createStepTimer } from "../lib/timing.js";
import { tailorResume } from "../services/test-gemini.js";
import { finalResume } from "../services/check-gemini.js";
import { AiModelUnavailableError } from "../services/geminiRetry.js";
import { measureResumeFill, renderResume } from "../services/resumeRender.js";
import {
  isJobPostUnreadable,
  JobPostUnreadableError,
  PASTED_JOB_POST_TITLE,
  type JobPostSource,
} from "../services/jobPost.js";
import type { User } from "../../generated/prisma/client.js";

const router = Router();

// ---------------------------------------------------------------------------
// Build jobs
//
// The resume build streams its progress to the browser over Server-Sent Events
// (SSE). Because EventSource is GET-only and cannot carry a body, the user's
// inputs (the job post + template) are captured by the POST below and stashed
// here, keyed by a jobId. The GET /events stream then runs the pipeline using
// the stored inputs and emits one `state` event per stage.
//
// The job post is either a URL the generating AI fetches itself or the raw
// description text the user pasted after that fetch came back empty.
// ---------------------------------------------------------------------------

type BuildState = "generating" | "checking" | "generating_pdf";

interface BuildJob {
  userId: string;
  jobPost: JobPostSource;
  templateId: string;
  status: "pending" | "running" | "done" | "error";
  resumeId?: string;
  createdAt: number;
}

// Guards against a paste that is clearly not a job description, and against one
// large enough to bloat both AI prompts.
const MIN_JOB_DESCRIPTION_LENGTH = 40;
const MAX_JOB_DESCRIPTION_LENGTH = 30_000;

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

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Runs the full resume pipeline, invoking `emit` before each stage so the
 * caller can stream progress. Returns the id of the persisted resume.
 *
 * Throws `JobPostUnreadableError` when the generating AI reports it could not
 * see any of the posting's content, before the checking AI or the PDF stage
 * runs — the caller turns that into a prompt to paste the description instead.
 */
async function runBuildPipeline(
  user: User,
  input: { jobPost: JobPostSource; templateId: string; jobId: string },
  emit: (state: BuildState) => void,
): Promise<string> {
  const { jobPost, templateId, jobId } = input;

  // Builds run concurrently, so every timing line carries a short job id to
  // keep interleaved console output attributable to one build.
  const timer = createStepTimer(`[resume-build ${jobId.slice(0, 8)}]`);

  try {
    const exportedProfile = await timer.step("load profile", () =>
      getExportedProfile(user),
    );

    emit("generating");
    const tailoredResume = await timer.step("ai tailor", () =>
      tailorResume({
        userProfile: exportedProfile,
        jobPost,
        templateId,
      }),
    );

    // The generating AI saw nothing to tailor to. Stop here rather than spend
    // the review + render stages on a resume built from the profile alone.
    if (isJobPostUnreadable(tailoredResume)) {
      if (jobPost.kind === "url") {
        throw new JobPostUnreadableError();
      }

      // Only the URL path can legitimately raise this. The pasted description is
      // already in the prompt, so asking for it again would loop — treat it as a
      // bad generation and let the normal error path offer a regenerate.
      throw new Error(
        "The AI reported it could not read the pasted job description.",
      );
    }

    // Render the draft purely to find out how much of the page it covers. The
    // reviewing AI is told to fill the page, which it cannot act on without
    // knowing how much room the draft actually left unused. The throwaway PDF
    // costs one local subprocess and no AI spend; a failed measurement returns
    // null and the review simply runs without a length budget.
    const draftFill = await timer.step("measure draft fill", () =>
      measureResumeFill(tailoredResume, templateId),
    );

    if (draftFill) {
      console.log(
        `[resume-build ${jobId.slice(0, 8)}] draft fills ${draftFill.fillPercent}% ` +
          `of the page (${draftFill.sectionsRendered} sections, ` +
          `${draftFill.topMarginPt}pt top / ${draftFill.bottomMarginPt}pt bottom blank)`,
      );
    }

    emit("checking");
    const completeResume = await timer.step("ai review", () =>
      finalResume(
        tailoredResume,
        {
          userProfile: exportedProfile,
          jobPost,
          templateId,
        },
        draftFill,
        `[resume-build ${jobId.slice(0, 8)}]`,
      ),
    );

    emit("generating_pdf");
    const { pdf: pdfData, fill: finalFill } = await timer.step(
      "render pdf",
      () => renderResume(completeResume, templateId),
    );

    if (finalFill) {
      console.log(
        `[resume-build ${jobId.slice(0, 8)}] final resume fills ` +
          `${finalFill.fillPercent}% of the page`,
      );
    }

    // Title the resume after the job post. The AI emits `jobPostTitle` per the
    // schema; fall back to the posting hostname (or a generic label when the
    // description was pasted and there is no URL) if it's missing/blank.
    const rawTitle = (completeResume as Record<string, unknown>).jobPostTitle;
    const title =
      typeof rawTitle === "string" && rawTitle.trim()
        ? rawTitle.trim()
        : jobPost.kind === "url"
          ? hostnameOf(jobPost.url)
          : PASTED_JOB_POST_TITLE;

    const createdResume = await timer.step("save resume", () =>
      prisma.resume.create({
        data: {
          userId: user.id,
          title,
          templateId,
          // Pasted-description builds have no posting URL to record.
          URL: jobPost.kind === "url" ? jobPost.url : "",
          content: completeResume,
          pdfData,
        },
      }),
    );

    return createdResume.id;
  } finally {
    // Runs on the failure path too, so a broken build still prints its total.
    timer.done();
  }
}

// Kick off a build: validate inputs, register a pending job, hand back a jobId
// the client opens an SSE stream against. The posting comes in as either `URL`
// (the normal path) or `jobDescription` (the paste fallback) — never both.
router.post("/:userId/resumes", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { URL, templateId, jobDescription } = req.body;

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

    const hasUrl = typeof URL === "string" && URL.trim() !== "";
    const hasDescription =
      typeof jobDescription === "string" && jobDescription.trim() !== "";

    if (hasUrl && hasDescription) {
      return res.status(400).json({
        error: "Send either a job post URL or a pasted description, not both.",
      });
    }

    if (!hasUrl && !hasDescription) {
      return res
        .status(400)
        .json({ error: "Please enter a valid URL." });
    }

    let jobPost: JobPostSource;

    if (hasDescription) {
      const text = (jobDescription as string).trim();

      if (text.length < MIN_JOB_DESCRIPTION_LENGTH) {
        return res.status(400).json({
          error:
            "That job description looks too short. Paste the full posting text.",
        });
      }

      if (text.length > MAX_JOB_DESCRIPTION_LENGTH) {
        return res.status(400).json({
          error:
            "That job description is too long. Paste just the posting itself.",
        });
      }

      jobPost = { kind: "text", text };
    } else {
      jobPost = { kind: "url", url: (URL as string).trim() };
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
      jobPost,
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

router.post(
  "/:userId/resumes/:jobId/retry",
  async (req: Request, res: Response) => {
    try {
      const { userId, jobId } = req.params;

      if (typeof userId !== "string" || typeof jobId !== "string") {
        return res.status(400).json({ error: "Invalid build details." });
      }

      if (!req.user) {
        return res.status(401).json({ error: "Please log in." });
      }

      const currentUser = req.user as User;
      if (currentUser.id !== userId) {
        return res
          .status(403)
          .json({ error: "You cannot retry this resume build." });
      }

      const previousJob = jobs.get(jobId);
      if (!previousJob || previousJob.userId !== currentUser.id) {
        return res.status(404).json({ error: "Build not found." });
      }

      if (previousJob.status !== "error") {
        return res
          .status(409)
          .json({ error: "Only failed resume builds can be regenerated." });
      }

      pruneStaleJobs();

      const newJobId = randomUUID();
      jobs.set(newJobId, {
        userId: currentUser.id,
        jobPost: previousJob.jobPost,
        templateId: previousJob.templateId,
        status: "pending",
        createdAt: Date.now(),
      });

      return res.status(201).json({ jobId: newJobId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[POST /:userId/resumes/:jobId/retry] Failed:", error);
      return res.status(500).json({
        error: "Unable to regenerate the resume right now.",
        detail: message,
      });
    }
  },
);

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
      return res.status(403).json({ error: "You cannot access this build." });
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
        { jobPost: job.jobPost, templateId: job.templateId, jobId },
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

      // The AI could not see the posting. Not a failure to retry — the user has
      // to supply the description, so send the client to the paste screen with
      // the context it needs to start the second build.
      if (error instanceof JobPostUnreadableError) {
        console.warn(
          `[GET /:userId/resumes/:jobId/events] Job post unreadable (job ${jobId}).`,
        );
        job.status = "error";
        if (!clientGone) {
          send("job_post_unreadable", {
            message:
              "We could not read that job posting. Paste the job description and we will tailor from that instead.",
            url: job.jobPost.kind === "url" ? job.jobPost.url : "",
            templateId: job.templateId,
          });
        }
        return res.end();
      }

      console.error(
        `[GET /:userId/resumes/:jobId/events] Build failed (job ${jobId}):`,
        error,
      );
      job.status = "error";
      if (!clientGone) {
        const isAiUnavailable = error instanceof AiModelUnavailableError;
        send("build_error", {
          message: isAiUnavailable
            ? error.reason === "server_error"
              ? "The AI model is temporarily unavailable. We tried 3 times, but the service kept returning server errors."
              : "The AI model did not return a valid resume structure. We tried 3 times, but the response still did not match the required schema."
            : "Unable to build the resume right now.",
          canRegenerate: true,
        });
      }
      return res.end();
    }
  },
);

// List the current user's previously-generated resumes (metadata only — the
// pdf bytes are fetched per-resume via the /pdf endpoint below, e.g. for
// thumbnails on the "My resumes" page).
router.get("/:userId/resumes", async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!req.user) {
    return res.status(401).json({ error: "Please log in." });
  }
  const currentUser = req.user as User;
  if (currentUser.id !== userId) {
    return res.status(403).json({ error: "You cannot access these resumes." });
  }

  try {
    const resumes = await prisma.resume.findMany({
      where: { userId: currentUser.id },
      select: {
        id: true,
        title: true,
        templateId: true,
        URL: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({ resumes });
  } catch (error: unknown) {

    const message = error instanceof Error ? error.message : "Unknown error";
   
    return res.status(500).json({error: "Unable to load your resumes right now.", detail: message});
  }
});

// Retrieve one resume's editable JSON content.
router.get(
  "/:userId/resumes/:resumeId/edit",
  async (req: Request, res: Response) => {
    const { userId, resumeId } = req.params;

    if (typeof userId !== "string" || typeof resumeId !== "string") {
      return res.status(400).json({error: "Invalid resume details."});
    }

    if (!req.user) {
      return res.status(401).json({ error: "Please log in." });
    }

    const currentUser = req.user as User;

    if (currentUser.id !== userId) {
      return res.status(403).json({error: "You cannot access this resume."});
    }

    try {
      const resume = await prisma.resume.findFirst({
        where: {
          id: resumeId,
          userId: currentUser.id,
        },
        select: {
          id: true,
          title: true,
          templateId: true,
          content: true,
        }
      });

      if (!resume) {
        return res.status(404).json({error: "Resume not found."});
      }

      return res.status(200).json({ resume });
    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : "Unknown error";

      return res.status(500).json({error: "Unable to load this resume right now.", detail: message});
    }
  },
);

router.patch(
  "/:userId/resumes/:resumeId",
  async (req: Request, res: Response) => {
    const { userId, resumeId } = req.params;

    if (typeof userId !== "string" || typeof resumeId !== "string") {
      return res.status(400).json({error: "Invalid resume details."});
    }

    if (!req.user) {
      return res.status(401).json({error: "Please log in."});
    }

    const currentUser = req.user as User;

    if (currentUser.id !== userId) {
      return res.status(403).json({error: "You cannot edit this resume."});
    }

    const { content } = req.body;

    if (!content || typeof content !== "object" || Array.isArray(content)) {
      return res.status(400).json({error: "Valid resume content is required."});
    }

    try {
      const existingResume = await prisma.resume.findFirst({
        where: {
          id: resumeId,
          userId: currentUser.id,
        },
        select: {
          id: true,
        }
      });

      if(!existingResume) {
        return res.status(404).json({error: "Resume not found."});
      }

      const updatedResume = await prisma.resume.update({
        where: {
          id: existingResume.id,
        },
        data: {
          content,
        },
        select: {
          id: true,
          title: true,
          templateId: true,
          content: true,
        }
      });

      return res.status(200).json({resume: updatedResume});
    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : "Unknown error";

      return res.status(500).json({error: "Unable to save this resume right now.", detail: message});
    }
  },
);

router.post(
  "/:userId/resumes/:resumeId/regenerate",
  async (req: Request, res: Response) => {
    const { userId, resumeId } = req.params;

    if (typeof userId !== "string" || typeof resumeId !== "string") {
      return res.status(400).json({error: "Invalid resume details."});
    }

    if (!req.user) {
      return res.status(401).json({error: "Please log in."});
    }

    const currentUser = req.user as User;

    if (currentUser.id !== userId) {
      return res.status(403).json({error: "You cannot regenerate this resume."});
    }

    try {
      const resume = await prisma.resume.findFirst({
        where: {
          id: resumeId,
          userId: currentUser.id,
        },
        select: {
          id: true,
          templateId: true,
          URL: true,
          content: true,
        },
      });

      if (!resume) {
        return res.status(404).json({error: "Resume not found."});
      }

      const { pdf: pdfData } = await renderResume(
        resume.content,
        resume.templateId,
      );
      const content = resume.content as Record<string, unknown>;
      const rawTitle = content.jobPostTitle;

      const title =
        typeof rawTitle === "string" && rawTitle.trim()
          ? rawTitle.trim()
          : resume.URL
            ? hostnameOf(resume.URL)
            : PASTED_JOB_POST_TITLE;

      const updatedResume = await prisma.resume.update({
        where: {
          id: resume.id,
        },
        data: {
          title,
          pdfData,
        },
        select: {
          id: true,
          title: true,
          templateId: true,
          updatedAt: true,
        }
      });

      return res.status(200).json({resume: updatedResume});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";

      return res.status(500).json({error: "Unable to regenerate this resume.", detail: message});
    }
  },
);

router.get(
  "/:userId/resumes/:resumeId/pdf",
  async (req: Request, res: Response) => {
    const { userId, resumeId } = req.params;
    const currentUser = req.user as { id: string };

    if (!req.user) {
      return res.status(401).json({ error: "Please log in." });
    }

    if (typeof userId !== "string" || typeof resumeId !== "string") {
      return res.status(400).json({ error: "Invalid resume details." });
    }

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
      return res.status(404).json({ error: "PDF not found." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="resume.pdf"');
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.send(Buffer.from(resume.pdfData));
  },
);

router.delete(
  "/:userId/resumes/:resumeId",
  async (req: Request, res: Response) => {
    const { userId, resumeId } = req.params;

    if(typeof userId !== "string" || typeof resumeId !== "string") {
      return res.status(400).json({error: "Invalid resume details."});
    }

    if (!req.user) {
      return res.status(401).json({error: "Please log in."});
    }

    const currentUser = req.user as User;

    if (currentUser.id !== userId) {
      return res.status(403).json({error: "You cannot delete this resume."});
    }

    try {
      const result = await prisma.resume.deleteMany({
        where: {
          id: resumeId,
          userId: currentUser.id,
        }
      });

      if (result.count === 0) {
        return res.status(404).json({error: "Resume not found."});
      }

      return res.status(204).send();
    } catch (error: unknown) {
      return res.status(500).json({error: "Unable to delete this resume."});
    }
  },
);

export default router;
