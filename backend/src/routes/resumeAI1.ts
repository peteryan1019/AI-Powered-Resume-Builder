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
        const { jobPostingUrl, templateId } = req.body;

        if (!req.user) {
            return res.status(401).json({
            error: "You must be logged in.",
            });
        }

        const currentUser = req.user as User;
        // Prevent an authenticated user from accessing another user's profile.
        if (currentUser.id !== userId) {
            return res.status(403).json({
            error: "You cannot create a resume for this user.",
            });
        }

        if (
            typeof jobPostingUrl !== "string" ||
            !jobPostingUrl.trim()
        ) {
            return res.status(400).json({
            error: "jobPostingUrl is required.",
            });
        }

        if (
            typeof templateId !== "string" ||
            !templateId.trim()
        ) {
            return res.status(400).json({
            error: "templateId is required.",
            });
        }

        const exportedProfile = await getExportedProfile(currentUser);

        const tailoredResume = await tailorResume({
            userProfile: exportedProfile,
            jobPostingUrl: jobPostingUrl.trim(),
            templateId: templateId.trim(),
        });

        const completeResume = await finalResume(tailoredResume, {
            userProfile: exportedProfile,
            jobPostingUrl: jobPostingUrl.trim(),
            templateId: templateId.trim(),
        }
        );

        console.log("JSON done");

        let gPath: string;

        const t = templateId.trim().toLowerCase();

        if(t=="signal"){
            gPath = path.resolve("../assets/templates/signal/create_resume_pdf.py");
        } else if(t=="evergreen") {
            gPath = path.resolve("../assets/templates/evergreen/create_resume_pdf.py");
        } else if(t=="atelier") {
            gPath = path.resolve("../assets/templates/atelier/create_resume_pdf.py");
        }  else {
            return res.status(400).json({
                error: `Unsupported template: ${t}`,
            });
        }

        console.log("Generator path:", gPath);

        const oPath = path.join(
        os.tmpdir(),
        `${randomUUID()}.pdf`,
        );

        console.log("Starting Python generator");

        const pythonProcess = spawn("python3", [
        gPath,
        oPath,
        ]);

        let pythonError = "";

        pythonProcess.stderr.on("data", (data) => {
        pythonError += data.toString();
        });

        pythonProcess.stdin.end(JSON.stringify(completeResume));

        const [exitCode] = await once(pythonProcess, "close");

        console.log("Python exit code:", exitCode);

        if (exitCode !== 0) {
        console.error("Python error:\n", pythonError);
        throw new Error("PDF generation failed.");
        }

        console.log("Python generation complete");

        const pdfData = await readFile(oPath);
        await unlink(oPath);

        const createdResume = await prisma.resume.create({
        data: {
            userId: currentUser.id,
            templateId: t,
            jobPostingUrl: jobPostingUrl.trim(),
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
      console.error("Failed to tailor resume:", error);

      const message =
        error instanceof Error
          ? error.message
          : "Failed to tailor resume.";

      return res.status(500).json({
        error: message,
      });
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
      return res.status(404).json({
        error: "PDF not found.",
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="resume.pdf"',
    );

    return res.send(Buffer.from(resume.pdfData));
  },
);

export default router;