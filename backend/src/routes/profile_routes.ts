// backend/src/routes/profile.routes.ts

import { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import { buildHeaders, formatInstance } from '../lib/profileExport.js';

const router = Router();

// ─────────────────────────────────────────
// GET /api/profile/export
// Flattened shape for AI/tailor consumption. Must be defined before
// the plain GET '/' so it's not swallowed by any future '/:id' route.
// ─────────────────────────────────────────
router.get('/export', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            instances: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    const sections = (profile?.sections ?? []).flatMap((section) =>
      section.instances.map((instance) => formatInstance(section.type, instance))
    );

    return res.json({
      headers: buildHeaders(req.user!, profile),
      sections,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to export profile' });
  }
});

// ─────────────────────────────────────────
// GET /api/profile
// ─────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            instances: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    // name/email live on User, not Profile — the basic-info form shows
    // them read-only, so surface them alongside the profile here.
    const { name, email, avatarUrl } = req.user!;

    return res.json({ profile: profile ?? null, user: { name, email, avatarUrl } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ─────────────────────────────────────────
// PUT /api/profile
// Create or update basic info + links.
// ─────────────────────────────────────────
router.put('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { headline, phone, location, summary, linkedin, github, portfolio } = req.body;

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: { headline, phone, location, summary, linkedin, github, portfolio },
      create: { userId, headline, phone, location, summary, linkedin, github, portfolio },
    });

    return res.json({ profile });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save profile' });
  }
});

// ─────────────────────────────────────────
// POST /api/profile/sections
// ─────────────────────────────────────────
router.post('/sections', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { type, label } = req.body;

    const validTypes = [
      'WORK_EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS',
      'CERTIFICATIONS', 'AWARDS', 'LANGUAGES', 'VOLUNTEER',
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid section type' });
    }

    // Ensure profile exists
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Save basic info first.' });
    }

    const lastSection = await prisma.profileSection.findFirst({
      where: { profileId: profile.id },
      orderBy: { order: 'desc' },
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
    return res.status(500).json({ error: 'Failed to create section' });
  }
});

// ─────────────────────────────────────────
// DELETE /api/profile/sections/:sectionId
// ─────────────────────────────────────────
router.delete('/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sectionId } = req.params;

    const section = await prisma.profileSection.findFirst({
      where: { id: sectionId, profile: { userId } },
    });
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    await prisma.profileSection.delete({ where: { id: sectionId } });
    return res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete section' });
  }
});

// ─────────────────────────────────────────
// PUT /api/profile/sections/reorder
// NOTE: must be defined BEFORE /:sectionId routes
// ─────────────────────────────────────────
router.put('/sections/reorder', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sections } = req.body as { sections: { id: string; order: number }[] };

    await prisma.$transaction(
      sections.map(({ id, order }) =>
        prisma.profileSection.updateMany({
          where: { id, profile: { userId } },
          data: { order },
        })
      )
    );

    return res.json({ reordered: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to reorder sections' });
  }
});

// ─────────────────────────────────────────
// POST /api/profile/sections/:sectionId/instances
// ─────────────────────────────────────────
router.post('/sections/:sectionId/instances', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sectionId } = req.params;
    const { data } = req.body;

    const section = await prisma.profileSection.findFirst({
      where: { id: sectionId, profile: { userId } },
    });
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    const lastInstance = await prisma.profileInstance.findFirst({
      where: { sectionId },
      orderBy: { order: 'desc' },
    });

    const instance = await prisma.profileInstance.create({
      data: { sectionId, data, order: lastInstance ? lastInstance.order + 1 : 0 },
    });

    return res.status(201).json({ instance });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create instance' });
  }
});

// ─────────────────────────────────────────
// PUT /api/profile/sections/:sectionId/instances/:instanceId
// ─────────────────────────────────────────
router.put('/sections/:sectionId/instances/:instanceId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sectionId, instanceId } = req.params;
    const { data } = req.body;

    const instance = await prisma.profileInstance.findFirst({
      where: { id: instanceId, sectionId, section: { profile: { userId } } },
    });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const updated = await prisma.profileInstance.update({
      where: { id: instanceId },
      data: { data },
    });

    return res.json({ instance: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update instance' });
  }
});

// ─────────────────────────────────────────
// DELETE /api/profile/sections/:sectionId/instances/:instanceId
// ─────────────────────────────────────────
router.delete('/sections/:sectionId/instances/:instanceId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sectionId, instanceId } = req.params;

    const instance = await prisma.profileInstance.findFirst({
      where: { id: instanceId, sectionId, section: { profile: { userId } } },
    });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    await prisma.profileInstance.delete({ where: { id: instanceId } });
    return res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete instance' });
  }
});

export default router;