import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { Prisma, User } from "../../generated/prisma/client.js";
import prisma from "../lib/prisma.js";
import {
  WORKFLOW_VERSION,
  type BuildInput,
  type NewProjectInput,
  type RecommendationDecision,
  type ResumeWorkflowResumeInput,
} from "../resume-workflow/contracts.js";
import {
  getBuildDraft,
  getWorkflowTopology,
} from "../resume-workflow/graph.js";
import {
  enqueueBuildResume,
  enqueueBuildStart,
} from "../resume-workflow/queue.js";
import {
  buildEventsKey,
  acquireBuildLock,
  createBuildRecord,
  getBuildInput,
  getBuildMetadata,
  getRedis,
  getReviewProjection,
  readBuildEvents,
  patchBuildMetadata,
  putResumeCommand,
  releaseBuildLock,
} from "../resume-workflow/redis.js";
import { renderResume } from "../services/resumeRender.js";
import { getExportedProfile } from "../services/profileExportJSON.js";
import type { JobPostSource } from "../services/jobPost.js";

const router = Router();
const MIN_JOB_DESCRIPTION_LENGTH = 40;
const MAX_JOB_DESCRIPTION_LENGTH = 30_000;
const MAX_SPECIFICATION_LENGTH = 2_000;
const SSE_MAX_LIFETIME_MS = 10 * 60 * 1_000;
const SUPPORTED_TEMPLATES = new Set(["signal", "evergreen", "atelier"]);

function authenticatedOwner(req: Request, res: Response): User | null {
  if (!req.user) {
    res.status(401).json({ error: "Please log in." });
    return null;
  }
  const user = req.user as User;
  if (user.id !== req.params.userId) {
    res.status(403).json({ error: "You cannot access this resume build." });
    return null;
  }
  return user;
}

function parseBuildSource(body: Record<string, unknown>): JobPostSource {
  const url = typeof body.URL === "string" ? body.URL.trim() : "";
  const text =
    typeof body.jobDescription === "string" ? body.jobDescription.trim() : "";
  if (url && text)
    throw new Error("Send either a job post URL or pasted text, not both.");
  if (text) {
    if (text.length < MIN_JOB_DESCRIPTION_LENGTH) {
      throw new Error(
        "That job description looks too short. Paste the full posting text.",
      );
    }
    if (text.length > MAX_JOB_DESCRIPTION_LENGTH) {
      throw new Error(
        "That job description is too long. Paste only the posting itself.",
      );
    }
    return { kind: "text", text };
  }
  if (!url) throw new Error("Please enter a job posting URL or description.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Please enter a valid job posting URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("The job posting URL must use HTTP or HTTPS.");
  }
  return { kind: "url", url: parsed.toString() };
}

function parseTemplate(body: Record<string, unknown>): string {
  const templateId =
    typeof body.templateId === "string"
      ? body.templateId.trim().toLowerCase()
      : "";
  if (!SUPPORTED_TEMPLATES.has(templateId)) {
    throw new Error(
      templateId
        ? `Unsupported template: ${templateId}`
        : "Please select a valid template.",
    );
  }
  return templateId;
}

async function startBuild(
  user: User,
  jobPost: JobPostSource,
  templateId: string,
) {
  const buildId = randomUUID();
  const input: BuildInput = {
    workflowVersion: WORKFLOW_VERSION,
    buildId,
    userId: user.id,
    jobPost,
    templateId,
    createdAt: new Date().toISOString(),
  };
  await createBuildRecord(input);
  try {
    await enqueueBuildStart(buildId);
  } catch (error) {
    await patchBuildMetadata(buildId, {
      status: "error",
      errorCode: "queue_unavailable",
      errorMessage: "The resume queue is temporarily unavailable.",
    });
    throw error;
  }
  return buildId;
}

// The UI draws its workflow diagram from this, so the picture is generated
// from the compiled graph the worker actually runs rather than a hand-kept
// copy that can silently drift out of date. Declared before the /:buildId
// routes purely for readability -- "workflow-graph" sits one segment shallower
// than "/:buildId/review", so the two cannot collide.
router.get(
  "/:userId/resumes/workflow-graph",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;
    try {
      return res.json(await getWorkflowTopology());
    } catch (error) {
      console.error("[resume-workflow] could not read the graph topology", error);
      return res
        .status(503)
        .json({ error: "The workflow graph is unavailable right now." });
    }
  },
);

// The result page shows the run trace beside the finished resume, because a
// fast build leaves no time to read it while it is happening. Resumes carry the
// buildId they came from, which is the key the event stream is stored under.
router.get(
  "/:userId/resumes/:resumeId/trace",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;
    const resume = await prisma.resume.findFirst({
      where: { id: req.params.resumeId as string, userId: user.id },
      select: { buildId: true },
    });
    if (!resume) return res.status(404).json({ error: "Resume not found." });
    if (!resume.buildId) return res.json({ buildId: null, events: [] });

    const events = (await readBuildEvents(resume.buildId)).filter(
      (event) => event.type === "node_start" || event.type === "node_end",
    );
    return res.json({ buildId: resume.buildId, events });
  },
);

router.post("/:userId/resumes", async (req: Request, res: Response) => {
  const user = authenticatedOwner(req, res);
  if (!user) return;
  try {
    const body =
      typeof req.body === "object" && req.body
        ? (req.body as Record<string, unknown>)
        : {};
    const buildId = await startBuild(
      user,
      parseBuildSource(body),
      parseTemplate(body),
    );
    return res.status(201).json({ jobId: buildId, buildId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start the build.";
    const isInputError =
      message.startsWith("Please") ||
      message.startsWith("Send") ||
      message.startsWith("That") ||
      message.startsWith("Unsupported");
    if (!isInputError) console.error("[resume-build start]", error);
    return res.status(isInputError ? 400 : 503).json({
      error: isInputError
        ? message
        : "Unable to queue the resume build right now.",
    });
  }
});

router.post(
  "/:userId/resumes/:buildId/retry",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;
    const previous = await getBuildMetadata(req.params.buildId as string);
    const input = await getBuildInput(req.params.buildId as string);
    if (!previous || !input || previous.userId !== user.id) {
      return res.status(404).json({ error: "Build not found or expired." });
    }
    if (previous.status !== "error") {
      return res
        .status(409)
        .json({ error: "Only failed builds can be regenerated." });
    }
    try {
      const buildId = await startBuild(user, input.jobPost, input.templateId);
      return res.status(201).json({ jobId: buildId, buildId });
    } catch (error) {
      console.error("[resume-build retry]", error);
      return res
        .status(503)
        .json({ error: "Unable to queue the resume build right now." });
    }
  },
);

router.get(
  "/:userId/resumes/:buildId/review",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;
    const metadata = await getBuildMetadata(req.params.buildId as string);
    if (!metadata || metadata.userId !== user.id)
      return res.status(404).json({ error: "Build not found or expired." });
    if (metadata.status !== "awaiting_feedback") {
      return res
        .status(409)
        .json({ error: "This build is not waiting for feedback." });
    }
    const review = await getReviewProjection(metadata.buildId);
    if (!review)
      return res.status(404).json({ error: "Coach feedback has expired." });
    return res.json({ review });
  },
);

// The coach asks you to accept or reject changes to a resume you would
// otherwise never see. Render the in-flight draft on demand so the review panel
// can show the actual document the recommendations apply to. Rendering costs a
// Python process (~250ms), so this is deliberately not called on every poll.
router.get(
  "/:userId/resumes/:buildId/draft.pdf",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;
    const buildId = req.params.buildId as string;
    const metadata = await getBuildMetadata(buildId);
    if (!metadata || metadata.userId !== user.id)
      return res.status(404).json({ error: "Build not found or expired." });

    const draft = await getBuildDraft(buildId);
    if (!draft)
      return res.status(404).json({ error: "This build has no draft yet." });

    try {
      const { pdf } = await renderResume(draft, metadata.templateId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'inline; filename="draft.pdf"');
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      return res.send(Buffer.from(pdf));
    } catch (error) {
      console.error(`[resume-draft ${buildId}] could not render`, error);
      return res
        .status(503)
        .json({ error: "The draft preview is unavailable right now." });
    }
  },
);

function cleanOptionalString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function validateNewProject(value: unknown): NewProjectInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Enter the new project's details.");
  }
  const raw = value as Record<string, unknown>;
  const name = cleanOptionalString(raw.name, 200);
  const description = cleanOptionalString(raw.description, 5_000);
  if (!name || !description)
    throw new Error("A new project needs a name and description.");
  const url = cleanOptionalString(raw.url, 1_000);
  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("The project URL is invalid.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("The project URL must use HTTP or HTTPS.");
    }
  }
  return {
    name,
    description,
    ...(url ? { url } : {}),
    ...(cleanOptionalString(raw.startDate, 30)
      ? { startDate: cleanOptionalString(raw.startDate, 30)! }
      : {}),
    ...(cleanOptionalString(raw.endDate, 30)
      ? { endDate: cleanOptionalString(raw.endDate, 30)! }
      : {}),
    current: raw.current === true,
  };
}

function validateDecisions(
  value: unknown,
  recommendationIds: string[],
): RecommendationDecision[] {
  if (!Array.isArray(value))
    throw new Error("Submit one decision for every recommendation.");
  const allowed = new Set(recommendationIds);
  const seen = new Set<string>();
  const decisions = value.map((raw): RecommendationDecision => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      throw new Error("A feedback decision is invalid.");
    const item = raw as Record<string, unknown>;
    const recommendationId =
      typeof item.recommendationId === "string" ? item.recommendationId : "";
    if (!allowed.has(recommendationId) || seen.has(recommendationId))
      throw new Error("A feedback decision is missing or duplicated.");
    seen.add(recommendationId);
    if (item.decision !== "accept" && item.decision !== "reject")
      throw new Error("Choose accept or reject for every recommendation.");
    if (item.decision === "reject")
      return { recommendationId, decision: "reject" };
    const existingProjectSourceId = cleanOptionalString(
      item.existingProjectSourceId,
      100,
    );
    const hasNewProject =
      item.newProject !== undefined && item.newProject !== null;
    if (existingProjectSourceId && hasNewProject)
      throw new Error("Choose an existing project or add a new one, not both.");
    return {
      recommendationId,
      decision: "accept",
      ...(cleanOptionalString(item.specification, MAX_SPECIFICATION_LENGTH)
        ? {
            specification: cleanOptionalString(
              item.specification,
              MAX_SPECIFICATION_LENGTH,
            )!,
          }
        : {}),
      ...(existingProjectSourceId ? { existingProjectSourceId } : {}),
      ...(hasNewProject
        ? { newProject: validateNewProject(item.newProject) }
        : {}),
    };
  });
  if (seen.size !== allowed.size)
    throw new Error("Submit one decision for every recommendation.");
  return decisions;
}

async function validateExistingProject(
  userId: string,
  sourceId: string,
): Promise<void> {
  const project = await prisma.profileInstance.findFirst({
    where: { id: sourceId, section: { type: "PROJECTS", profile: { userId } } },
    select: { id: true },
  });
  if (!project) throw new Error("The selected project is not in your profile.");
}

async function persistNewProject(
  userId: string,
  buildId: string,
  decision: RecommendationDecision,
): Promise<void> {
  if (!decision.newProject) return;
  const sourceBuildKey = `${buildId}:${decision.recommendationId}`;
  const existing = await prisma.profileInstance.findUnique({
    where: { sourceBuildKey },
    select: { id: true },
  });
  if (existing) return;

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw new Error("Save your profile before adding a project.");
  let section = await prisma.profileSection.findFirst({
    where: { profileId: profile.id, type: "PROJECTS" },
    orderBy: { order: "asc" },
  });
  if (!section) {
    const last = await prisma.profileSection.findFirst({
      where: { profileId: profile.id },
      orderBy: { order: "desc" },
    });
    section = await prisma.profileSection.create({
      data: {
        profileId: profile.id,
        type: "PROJECTS",
        label: "Projects",
        order: last ? last.order + 1 : 0,
      },
    });
  }
  const lastProject = await prisma.profileInstance.findFirst({
    where: { sectionId: section.id },
    orderBy: { order: "desc" },
  });
  await prisma.profileInstance.create({
    data: {
      sourceBuildKey,
      sectionId: section.id,
      order: lastProject ? lastProject.order + 1 : 0,
      data: decision.newProject as unknown as Prisma.InputJsonObject,
    },
  });
}

router.post(
  "/:userId/resumes/:buildId/decisions",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;
    const buildId = req.params.buildId as string;
    const lockToken = await acquireBuildLock(buildId, "feedback");
    if (!lockToken) {
      return res
        .status(409)
        .json({
          error: "This feedback submission is already being processed.",
        });
    }
    try {
      const metadata = await getBuildMetadata(buildId);
      if (!metadata || metadata.userId !== user.id)
        return res.status(404).json({ error: "Build not found or expired." });
      if (metadata.status !== "awaiting_feedback")
        return res
          .status(409)
          .json({
            error: "This review was already submitted or is no longer active.",
          });
      const review = await getReviewProjection(buildId);
      if (!review)
        return res.status(404).json({ error: "Coach feedback has expired." });
      const reviewId =
        typeof req.body?.reviewId === "string" ? req.body.reviewId : "";
      if (reviewId !== review.reviewId)
        return res
          .status(409)
          .json({ error: "This feedback belongs to an older coach review." });
      const decisions = validateDecisions(
        req.body?.decisions,
        review.recommendations.map((item) => item.id),
      );

      for (const decision of decisions) {
        const recommendation = review.recommendations.find(
          (item) => item.id === decision.recommendationId,
        )!;
        if (
          recommendation.category !== "PROJECT_SELECTION" &&
          (decision.existingProjectSourceId || decision.newProject)
        ) {
          throw new Error(
            "Project details can only answer a project recommendation.",
          );
        }
        if (
          decision.decision === "accept" &&
          recommendation.category === "PROJECT_SELECTION" &&
          recommendation.requiresUserInput &&
          !decision.existingProjectSourceId &&
          !decision.newProject
        ) {
          throw new Error("Choose an existing project or enter a new project.");
        }
        if (decision.existingProjectSourceId)
          await validateExistingProject(
            user.id,
            decision.existingProjectSourceId,
          );
        await persistNewProject(user.id, buildId, decision);
      }
      const refreshedProfile = await getExportedProfile(user);
      const command: ResumeWorkflowResumeInput = {
        reviewId,
        decisions,
        refreshedProfile,
      };
      await putResumeCommand(buildId, command);
      await patchBuildMetadata(buildId, { status: "revising" });
      try {
        await enqueueBuildResume(buildId, reviewId);
      } catch (error) {
        await patchBuildMetadata(buildId, { status: "awaiting_feedback" });
        throw error;
      }
      return res.status(202).json({ buildId, status: "queued" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit feedback.";
      const status = /queue|ECONN|connect/i.test(message) ? 503 : 400;
      if (status === 503) console.error("[resume-build decisions]", error);
      return res
        .status(status)
        .json({
          error:
            status === 503
              ? "Unable to queue the revision right now."
              : message,
        });
    } finally {
      await releaseBuildLock(buildId, "feedback", lockToken).catch((error) =>
        console.error(
          `[resume-build ${buildId}] failed to release feedback lock`,
          error,
        ),
      );
    }
  },
);

router.get(
  "/:userId/resumes/:buildId/events",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;
    const buildId = req.params.buildId as string;
    const metadata = await getBuildMetadata(buildId);
    if (!metadata || metadata.userId !== user.id)
      return res.status(404).json({ error: "Build not found or expired." });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let closed = false;
    req.on("close", () => {
      closed = true;
    });
    const deadline = Date.now() + SSE_MAX_LIFETIME_MS;
    const queryCursor =
      typeof req.query.after === "string" ? req.query.after : "";
    let cursor =
      typeof req.headers["last-event-id"] === "string"
        ? req.headers["last-event-id"]
        : /^\d+-\d+$/.test(queryCursor)
          ? queryCursor
          : "0-0";
    const streamKey = buildEventsKey(buildId);
    const client = getRedis().duplicate();

    try {
      while (!closed && Date.now() < deadline) {
        const result = (await client.xread(
          "COUNT",
          50,
          "BLOCK",
          15_000,
          "STREAMS",
          streamKey,
          cursor,
        )) as Array<[string, Array<[string, string[]]>]> | null;
        if (!result) {
          res.write(": heartbeat\n\n");
          continue;
        }
        for (const [, entries] of result) {
          for (const [id, fields] of entries) {
            cursor = id;
            const values: Record<string, string> = {};
            for (let index = 0; index < fields.length; index += 2) {
              values[fields[index] ?? ""] = fields[index + 1] ?? "";
            }
            const eventType = values.type ?? "state";
            // A reconnect after feedback was submitted replays the stream from
            // an earlier id. Do not make that browser pause again on an obsolete
            // review; its resume job is already running (or finished).
            //
            // Read the status HERE rather than trusting the snapshot taken when
            // this connection opened. A browser that connects at build start --
            // the normal case -- captured status "queued", and would then drop
            // the live review_ready it has been waiting minutes for.
            if (eventType === "review_ready") {
              const current = await getBuildMetadata(buildId);
              if (current?.status !== "awaiting_feedback") continue;
            }
            res.write(`id: ${id}\n`);
            res.write(`event: ${eventType}\n`);
            res.write(`data: ${values.data ?? "{}"}\n\n`);
            if (
              [
                "review_ready",
                "complete",
                "job_post_unreadable",
                "build_error",
              ].includes(eventType)
            ) {
              return res.end();
            }
          }
        }
      }
      return res.end();
    } catch (error) {
      console.error(`[resume-events ${buildId}]`, error);
      if (!closed) {
        res.write("event: build_error\n");
        res.write(
          `data: ${JSON.stringify({ message: "Live progress is temporarily unavailable.", canRegenerate: false })}\n\n`,
        );
        return res.end();
      }
    } finally {
      client.disconnect();
    }
  },
);

export default router;
