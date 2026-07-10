// backend/src/routes/profile.routes.ts

import { Router, type Request, type Response } from "express";
import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const router = Router();

// Temp: hardcode userId for testing before Prithvi's auth is ready.
// Replace with: const userId = req.user!.id;

// Profile.userId has a FK constraint against User.id, so the dev user
// must actually exist before any profile row can reference it.
router.use(async (_req: Request, _res: Response, next) => {
  const userId = (_req.user as any).id;
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: "dev-user@example.com", name: "Dev User" },
  });
  next();
});

// ─────────────────────────────────────────
// GET /api/profile
// ─────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: {
            instances: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    return res.json({ profile: profile ?? null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ─────────────────────────────────────────
// PUT /api/profile
// Create or update basic info + links.
// ─────────────────────────────────────────
router.put("/", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { headline, phone, location, summary, linkedin, github, portfolio } =
      req.body;

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: {
        headline,
        phone,
        location,
        summary,
        linkedin,
        github,
        portfolio,
      },
      create: {
        userId,
        headline,
        phone,
        location,
        summary,
        linkedin,
        github,
        portfolio,
      },
    });

    return res.json({ profile });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save profile" });
  }
});

// ─────────────────────────────────────────
// POST /api/profile/resume
// Store resume file URL after upload.
// AI parsing triggered async (Prithvi's side).
// ─────────────────────────────────────────
router.post("/resume", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { resumeUrl, resumeFileName } = req.body;

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: { resumeUrl, resumeFileName },
      create: { userId, resumeUrl, resumeFileName },
    });

    return res.json({
      profile,
      message: "Resume uploaded. Parsing in progress.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to upload resume" });
  }
});

// ─────────────────────────────────────────
// POST /api/profile/sections
// ─────────────────────────────────────────
router.post("/sections", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { type, label } = req.body;

    const validTypes = [
      "WORK_EXPERIENCE",
      "EDUCATION",
      "SKILLS",
      "PROJECTS",
      "CERTIFICATIONS",
      "AWARDS",
      "LANGUAGES",
      "VOLUNTEER",
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: "Invalid section type" });
    }

    // Ensure profile exists
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      return res
        .status(404)
        .json({ error: "Profile not found. Save basic info first." });
    }

    const lastSection = await prisma.profileSection.findFirst({
      where: { profileId: profile.id },
      orderBy: { order: "desc" },
    });

    const section = await prisma.profileSection.create({
      data: {
        profileId: profile.id,
        type,
        label,
        order: lastSection ? lastSection.order + 1 : 0,
      },
    });

    return res.status(201).json({ section });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create section" });
  }
});

// ─────────────────────────────────────────
// DELETE /api/profile/sections/:sectionId
// ─────────────────────────────────────────
router.delete("/sections/:sectionId", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { sectionId } = req.params;

    if (typeof sectionId !== "string") {
      return res.status(400).json({ error: "Missing section id" });
    }

    const section = await prisma.profileSection.findFirst({
      where: { id: sectionId, profile: { userId } },
    });
    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    await prisma.profileSection.delete({ where: { id: sectionId } });
    return res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete section" });
  }
});

// ─────────────────────────────────────────
// PUT /api/profile/sections/reorder
// NOTE: must be defined BEFORE /:sectionId routes
// ─────────────────────────────────────────
router.put("/sections/reorder", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { sections } = req.body as {
      sections: { id: string; order: number }[];
    };

    await prisma.$transaction(
      sections.map(({ id, order }) =>
        prisma.profileSection.updateMany({
          where: { id, profile: { userId } },
          data: { order },
        }),
      ),
    );

    return res.json({ reordered: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to reorder sections" });
  }
});

// ─────────────────────────────────────────
// POST /api/profile/sections/:sectionId/instances
// ─────────────────────────────────────────
router.post(
  "/sections/:sectionId/instances",
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { sectionId } = req.params;

      if (typeof sectionId !== "string") {
        return res.status(400).json({ error: "Missing section id" });
      }
      const { data } = req.body;

      const section = await prisma.profileSection.findFirst({
        where: { id: sectionId, profile: { userId } },
      });
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }

      const lastInstance = await prisma.profileInstance.findFirst({
        where: { sectionId },
        orderBy: { order: "desc" },
      });

      const instance = await prisma.profileInstance.create({
        data: {
          sectionId,
          data,
          order: lastInstance ? lastInstance.order + 1 : 0,
        },
      });

      return res.status(201).json({ instance });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to create instance" });
    }
  },
);

// ─────────────────────────────────────────
// PUT /api/profile/sections/:sectionId/instances/:instanceId
// ─────────────────────────────────────────
router.put(
  "/sections/:sectionId/instances/:instanceId",
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { sectionId, instanceId } = req.params;

      if (typeof sectionId !== "string" || typeof instanceId !== "string") {
        return res.status(400).json({ error: "Missing section or instance id" });
      }
      const { data } = req.body;

      const instance = await prisma.profileInstance.findFirst({
        where: { id: instanceId, sectionId, section: { profile: { userId } } },
      });
      if (!instance) {
        return res.status(404).json({ error: "Instance not found" });
      }

      const updated = await prisma.profileInstance.update({
        where: { id: instanceId },
        data: { data },
      });

      return res.json({ instance: updated });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to update instance" });
    }
  },
);

// ─────────────────────────────────────────
// DELETE /api/profile/sections/:sectionId/instances/:instanceId
// ─────────────────────────────────────────
router.delete(
  "/sections/:sectionId/instances/:instanceId",
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { sectionId, instanceId } = req.params;
      if (typeof sectionId !== "string" || typeof instanceId !== "string") {
        return res.status(400).json({ error: "Missing section or instance id" });
      }

      const instance = await prisma.profileInstance.findFirst({
        where: { id: instanceId, sectionId, section: { profile: { userId } } },
      });
      if (!instance) {
        return res.status(404).json({ error: "Instance not found" });
      }

      await prisma.profileInstance.delete({ where: { id: instanceId } });
      return res.json({ deleted: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to delete instance" });
    }
  },
);

export default router;
