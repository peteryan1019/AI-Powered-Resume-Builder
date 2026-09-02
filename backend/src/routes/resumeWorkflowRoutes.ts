import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { Prisma, User } from "../../generated/prisma/client.js";
import prisma from "../lib/prisma.js";
import {
  WORKFLOW_VERSION,
  type BuildInput,
  type BuildStatus,
  type ProfileChangeInput,
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
  removeQueuedBuild,
} from "../resume-workflow/queue.js";
import {
  buildEventsKey,
  acquireBuildLock,
  createBuildRecord,
  getBuildInput,
  getBuildMetadata,
  getRedis,
  deleteBuild,
  getReviewProjection,
  listUserBuilds,
  readBuildEvents,
  patchBuildMetadata,
  putResumeCommand,
  releaseBuildLock,
} from "../resume-workflow/redis.js";
import { renderResume } from "../services/resumeRender.js";
import {
  PROFILE_SECTION_TYPES,
  SECTION_FIELDS,
  proposeProfileChanges,
  type ProfileSectionType,
} from "../services/profileAgent.js";
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

/** A short human label for what a build was tailored against. */
function jobPostLabel(input: BuildInput | null): string {
  if (!input) return "Job posting";
  if (input.jobPost.kind === "url") {
    try {
      return new URL(input.jobPost.url).hostname.replace(/^www\./, "");
    } catch {
      return input.jobPost.url.slice(0, 60);
    }
  }
  const text = input.jobPost.text.trim().replace(/\s+/g, " ");
  if (!text) return "Pasted description";
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * Sort order for the sessions list: what needs the user first, then what is
 * still working, then what broke, then what is finished. Recency only decides
 * ties, because a build waiting on feedback matters more than a newer one that
 * is merely running.
 */
function sessionRank(status: BuildStatus): number {
  if (status === "awaiting_feedback") return 0;
  if (status === "error") return 2;
  if (status === "done") return 3;
  return 1;
}

// Builds are otherwise reachable only by their own id, so closing the tab lost
// one -- including a build paused waiting for feedback, which cannot be
// restarted without abandoning the coaching rounds already spent on it.
router.get(
  "/:userId/resumes/sessions",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;

    const builds = await listUserBuilds(user.id);
    const finishedIds = builds
      .map((build) => build.resumeId)
      .filter((id): id is string => Boolean(id));
    const titles = new Map(
      (
        await prisma.resume.findMany({
          where: { id: { in: finishedIds }, userId: user.id },
          select: { id: true, title: true },
        })
      ).map((resume) => [resume.id, resume.title]),
    );

    const sessions = await Promise.all(
      builds.map(async (build) => {
        // Every build of a given posting shares a hostname, so the label alone
        // cannot tell six of them apart. A finished build has its resume title;
        // for one paused on feedback, read the posting title out of the draft.
        // Only for those: it is a checkpoint read, and they are the few rows
        // the user has to choose between.
        const waiting = build.status === "awaiting_feedback";
        const [input, review, draft] = await Promise.all([
          getBuildInput(build.buildId),
          waiting ? getReviewProjection(build.buildId) : Promise.resolve(null),
          waiting
            ? getBuildDraft(build.buildId).catch(() => null)
            : Promise.resolve(null),
        ]);
        const draftTitle =
          typeof (draft as Record<string, unknown> | null)?.jobPostTitle === "string"
            ? ((draft as Record<string, unknown>).jobPostTitle as string).trim()
            : "";
        return {
          buildId: build.buildId,
          status: build.status,
          createdAt: build.createdAt,
          templateId: build.templateId,
          jobPost: jobPostLabel(input),
          ...(draftTitle ? { title: draftTitle } : {}),
          ...(build.resumeId ? { resumeId: build.resumeId } : {}),
          ...(titles.get(build.resumeId ?? "")
            ? { title: titles.get(build.resumeId ?? "")! }
            : {}),
          ...(review ? { round: review.round, score: review.overallScore } : {}),
          ...(build.errorMessage ? { errorMessage: build.errorMessage } : {}),
        };
      }),
    );

    sessions.sort(
      (a, b) =>
        sessionRank(a.status) - sessionRank(b.status) ||
        b.createdAt.localeCompare(a.createdAt),
    );
    return res.json({ sessions });
  },
);

// Deleting a session discards the build: its state, its coaching history, and
// its LangGraph checkpoints. It deliberately leaves the resume a finished build
// produced, which lives in Postgres and is reachable from My resumes.
router.delete(
  "/:userId/resumes/:buildId/session",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;
    const buildId = req.params.buildId as string;
    const metadata = await getBuildMetadata(buildId);
    if (!metadata || metadata.userId !== user.id)
      return res.status(404).json({ error: "Build not found or already gone." });

    await removeQueuedBuild(buildId);
    const keysRemoved = await deleteBuild(user.id, buildId);
    return res.json({ deleted: true, keysRemoved });
  },
);

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

/** Section labels used when a section of that type does not exist yet. */
const SECTION_LABELS: Record<ProfileSectionType, string> = {
  WORK_EXPERIENCE: "Work Experience",
  EDUCATION: "Education",
  SKILLS: "Skills",
  PROJECTS: "Projects",
  CERTIFICATIONS: "Certifications",
  AWARDS: "Awards",
  LANGUAGES: "Languages",
  VOLUNTEER: "Volunteer",
};

/**
 * Validates one profile change the user confirmed. `data` may carry only the
 * fields that section type's form accepts: the user filled that form, so
 * anything else is not something they saw or approved. `skills` is allowed
 * alongside them because the form turns its `skillsRaw` text into an array
 * before emitting.
 */
function validateProfileChange(value: unknown): ProfileChangeInput {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("A profile change is invalid.");
  const raw = value as Record<string, unknown>;

  const mode = raw.mode === "update" ? "update" : "create";
  const sectionType =
    typeof raw.sectionType === "string" ? raw.sectionType : "";
  if (!PROFILE_SECTION_TYPES.includes(sectionType as ProfileSectionType))
    throw new Error("That profile section type does not exist.");
  const sourceId = cleanOptionalString(raw.sourceId, 100);
  if (mode === "update" && !sourceId)
    throw new Error("An edited profile entry must say which entry it is.");

  const allowed = new Set([
    ...SECTION_FIELDS[sectionType as ProfileSectionType],
    "skills",
  ]);
  const source = (raw.data ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (!allowed.has(key)) continue;
    if (typeof item === "boolean") {
      data[key] = item;
    } else if (Array.isArray(item)) {
      const list = item
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().slice(0, 200))
        .filter(Boolean);
      if (list.length) data[key] = list;
    } else {
      const text = cleanOptionalString(item, 5_000);
      if (text) data[key] = text;
    }
  }
  if (!Object.keys(data).length)
    throw new Error("That profile change has no details.");

  return {
    mode,
    sectionType,
    ...(mode === "update" && sourceId ? { sourceId } : {}),
    label: cleanOptionalString(raw.label, 200) ?? sectionType,
    data,
  };
}

function validateProfileChanges(value: unknown): ProfileChangeInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new Error("Profile changes must be a list.");
  if (value.length > 6)
    throw new Error("Too many profile changes in one submission.");
  return value.map(validateProfileChange);
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
    // A rejection keeps the reason the user typed: that is what the coach reads
    // on its next round. Anything they want added to their profile arrives
    // separately, as a confirmed profile addition.
    const specification = cleanOptionalString(
      item.specification,
      MAX_SPECIFICATION_LENGTH,
    );
    return {
      recommendationId,
      decision: item.decision,
      ...(specification ? { specification } : {}),
    };
  });
  if (seen.size !== allowed.size)
    throw new Error("Submit one decision for every recommendation.");
  return decisions;
}

async function applyProfileChange(
  userId: string,
  sourceBuildKey: string,
  change: ProfileChangeInput,
): Promise<void> {
  if (change.mode === "update") {
    // validateProfileChange guarantees this; narrowing it keeps the query typed.
    if (!change.sourceId)
      throw new Error("An edited profile entry must say which entry it is.");
    // Ownership is checked through the section's profile: a sourceId from
    // somebody else's profile must not be writable from here.
    const target = await prisma.profileInstance.findFirst({
      where: { id: change.sourceId, section: { profile: { userId } } },
      select: { id: true },
    });
    if (!target) throw new Error("That profile entry is not yours to edit.");
    await prisma.profileInstance.update({
      where: { id: target.id },
      data: { data: change.data as unknown as Prisma.InputJsonObject },
    });
    return;
  }

  // sourceBuildKey is unique, so a retried submission cannot duplicate an entry.
  const existing = await prisma.profileInstance.findUnique({
    where: { sourceBuildKey },
    select: { id: true },
  });
  if (existing) return;

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw new Error("Save your profile before adding to it.");

  const type = change.sectionType as ProfileSectionType;
  let section = await prisma.profileSection.findFirst({
    where: { profileId: profile.id, type: type as never },
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
        type: type as never,
        label: SECTION_LABELS[type],
        order: last ? last.order + 1 : 0,
      },
    });
  }

  const lastInstance = await prisma.profileInstance.findFirst({
    where: { sectionId: section.id },
    orderBy: { order: "desc" },
  });
  await prisma.profileInstance.create({
    data: {
      sourceBuildKey,
      sectionId: section.id,
      order: lastInstance ? lastInstance.order + 1 : 0,
      data: change.data as unknown as Prisma.InputJsonObject,
    },
  });
}

// The profile agent reads what the user typed while reviewing and notices when
// they have described something their profile does not list. It only proposes;
// the user confirms each one in the profile's own form before anything is
// written, which keeps every profile entry something they verified.
router.post(
  "/:userId/resumes/:buildId/profile-proposals",
  async (req: Request, res: Response) => {
    const user = authenticatedOwner(req, res);
    if (!user) return;
    const buildId = req.params.buildId as string;
    const metadata = await getBuildMetadata(buildId);
    if (!metadata || metadata.userId !== user.id)
      return res.status(404).json({ error: "Build not found or expired." });

    const rawNotes = Array.isArray(req.body?.notes) ? req.body.notes : [];
    const notes = rawNotes
      .slice(0, 8)
      .map((entry: unknown) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return {
          about: cleanOptionalString(item.about, 300) ?? "their resume",
          text: cleanOptionalString(item.text, MAX_SPECIFICATION_LENGTH) ?? "",
        };
      })
      .filter((note: { text: string }) => note.text);
    if (!notes.length) return res.json({ changes: [] });

    try {
      const profile = await getExportedProfile(user);
      const changes = await proposeProfileChanges({ notes, profile });
      // An edit needs the entry's data as it stands, so the form can open on
      // what is there today rather than on the fragment the agent extracted.
      const withCurrent = await Promise.all(
        changes.map(async (change) => {
          if (change.mode !== "update" || !change.sourceId) return change;
          const target = await prisma.profileInstance.findFirst({
            where: {
              id: change.sourceId,
              section: { profile: { userId: user.id } },
            },
            select: { data: true },
          });
          return { ...change, current: (target?.data ?? {}) as Record<string, unknown> };
        }),
      );
      return res.json({ changes: withCurrent });
    } catch (error) {
      // A failed suggestion must never block the submission it precedes.
      console.error(`[profile-agent ${buildId}]`, error);
      return res.json({ changes: [] });
    }
  },
);

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
      if (
        req.body?.nextStep !== "revise" &&
        req.body?.nextStep !== "finalize"
      ) {
        throw new Error("Choose whether to revise or finalize this version.");
      }
      const nextStep = req.body.nextStep as "revise" | "finalize";
      // Mirrors the disabled Finalize button. Finalizing renders the draft on
      // screen, so an accepted recommendation that has not been applied yet
      // would be silently thrown away.
      if (
        nextStep === "finalize" &&
        decisions.some((item) => item.decision === "accept")
      ) {
        throw new Error(
          "Accepted changes have not been applied yet. Choose Revise, or undo those approvals.",
        );
      }
      const note = cleanOptionalString(
        req.body?.note,
        MAX_SPECIFICATION_LENGTH,
      );
      // A passing draft has no recommendations, so the page offers a project
      // form of its own; it persists through the same idempotent key path.
      const profileChanges = validateProfileChanges(req.body?.profileChanges);

      for (const decision of decisions) {
        const recommendation = review.recommendations.find(
          (item) => item.id === decision.recommendationId,
        )!;
        if (
          decision.decision === "accept" &&
          recommendation.requiresUserInput &&
          !decision.specification
        ) {
          throw new Error(
            "This recommendation needs an answer before it can be applied.",
          );
        }
      }
      for (const [index, change] of profileChanges.entries()) {
        await applyProfileChange(
          user.id,
          `${buildId}:${reviewId}:${index}`,
          change,
        );
      }
      // Read the profile only after every write above, so an entry added in
      // this same submission is part of what the writer sees.
      const refreshedProfile = await getExportedProfile(user);
      const command: ResumeWorkflowResumeInput = {
        reviewId,
        decisions,
        refreshedProfile,
        nextStep,
        ...(note ? { note } : {}),
        ...(profileChanges.length ? { profileChanges } : {}),
      };
      await putResumeCommand(buildId, command);
      await patchBuildMetadata(buildId, {
        status: nextStep === "finalize" ? "generating_pdf" : "revising",
      });
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
