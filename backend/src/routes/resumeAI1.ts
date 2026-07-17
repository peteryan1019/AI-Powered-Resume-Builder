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

router.post("/:userId/resumes", async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { URL, templateId } = req.body;

        if (!req.user) {
            return res.status(401).json({error: "Please log in.",});
        }

        const currentUser = req.user as User;
        // Prevent an authenticated user from accessing another user's profile.
        if (currentUser.id !== userId) {
            return res.status(403).json({error: "You cannot create a resume for this user.",});
        }

        if (typeof URL !== "string" || !URL.trim()) {
            return res.status(400).json({error: "Please enter a valid URL.",});
        }

        if(typeof templateId !== "string" || !templateId.trim()) {
            return res.status(400).json({error: "Please select a valid template",});
        }

        const exportedProfile = await getExportedProfile(currentUser);

        const tailoredResume = await tailorResume({userProfile: exportedProfile, URL: URL.trim(), templateId: templateId.trim(),});

        const completeResume = await finalResume(tailoredResume, {userProfile: exportedProfile, URL: URL.trim(), templateId: templateId.trim(),});

        let gPath: string;

        const t = templateId.trim().toLowerCase();

        if(t=="signal"){
            gPath = path.resolve("../assets/templates/signal/create_resume_pdf.py");
        } else if(t=="evergreen") {
            gPath = path.resolve("../assets/templates/evergreen/create_resume_pdf.py");
        } else if(t=="atelier") {
            gPath = path.resolve("../assets/templates/atelier/create_resume_pdf.py");
        }  else {
            return res.status(400).json({error: `Unsupported template: ${t}`,});
        }

        const oPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`,);

        const pythonProcess = spawn("python3", [gPath, oPath,]);

        pythonProcess.stdin.end(JSON.stringify(completeResume));

        const [exitCode] = await once(pythonProcess, "close");

        if (exitCode !== 0) {
        throw new Error("PDF generation failed.");
        }


        const pdfData = await readFile(oPath);
        await unlink(oPath);

        const createdResume = await prisma.resume.create({
        data: {
            userId: currentUser.id,
            templateId: t,
            URL: URL.trim(),
            content: completeResume,
            pdfData,
        },
        });

        const {
        pdfData: _storedPdf,
        ...resumeWithoutPdf
        } = createdResume;

        return res.status(201).json({
            resume: resumeWithoutPdf,
        });

    } catch (error: unknown) {
      return res.status(500).json({});
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