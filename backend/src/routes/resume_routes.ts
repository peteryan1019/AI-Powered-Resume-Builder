import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src/routes -> repo root -> assets/
const PLACEHOLDER_PDF = path.resolve(__dirname, '../../../assets/code_generated_resume.pdf');

// The generation "finite-state automaton". Each state is emitted, then we wait
// `durationMs` before advancing. `done` lingers 1s, then a `complete` event
// tells the client to move on to the result page. No real generation yet.
const STEPS = [
  { state: 'generating', label: 'Generating resume', durationMs: 3000 },
  { state: 'checking', label: 'Checking content', durationMs: 3000 },
  { state: 'generating_pdf', label: 'Generating PDF', durationMs: 3000 },
  { state: 'done', label: 'Done', durationMs: 1000 },
] as const;

type JobState = (typeof STEPS)[number]['state'];

interface ResumeJob {
  id: string;
  userId: string;
  state: JobState;
  createdAt: number;
}

// In-memory job registry. Fine for the current placeholder flow; swap for a
// persistent store once real generation lands.
const jobs = new Map<string, ResumeJob>();

function ownsJob(req: Request, rawJobId?: string | string[]): ResumeJob | null {
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  if (!jobId) return null;
  const job = jobs.get(jobId);
  const userId = (req.user as any)?.id;
  if (!job || job.userId !== req.params.userId || job.userId !== userId) {
    return null;
  }
  return job;
}

// POST /api/users/:userId/resumes
// Kicks off a (placeholder) generation job and returns its id. The client then
// opens the SSE stream below to watch it progress.
router.post('/:userId/resumes', (req: Request, res: Response) => {
  const userId = (req.user as any)?.id;

  if (!userId || userId !== req.params.userId) {
    res.status(403).json({ error: 'Cannot start a resume build for another user.' });
    return;
  }

  const job: ResumeJob = {
    id: randomUUID(),
    userId,
    state: STEPS[0].state,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);

  res.status(201).json({ jobId: job.id });
});

// GET /api/users/:userId/resumes/:jobId/events
// Server-Sent Events stream that walks the job through the FSM.
router.get('/:userId/resumes/:jobId/events', (req: Request, res: Response) => {
  const job = ownsJob(req, req.params.jobId);

  if (!job) {
    res.status(404).json({ error: 'Resume build not found.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  req.on('close', () => {
    closed = true;
    if (timer) clearTimeout(timer);
  });

  const runStep = (index: number) => {
    if (closed) return;

    const step = STEPS[index];
    if (!step) return;
    job.state = step.state;
    send('state', {
      state: step.state,
      label: step.label,
      step: index + 1,
      total: STEPS.length,
    });

    timer = setTimeout(() => {
      if (closed) return;

      if (index + 1 < STEPS.length) {
        runStep(index + 1);
        return;
      }

      // Finished the final `done` state — hand the client the PDF location.
      send('complete', {
        pdfUrl: `/api/users/${job.userId}/resumes/${job.id}/pdf`,
      });
      res.end();
    }, step.durationMs);
  };

  runStep(0);
});

// GET /api/users/:userId/resumes/:jobId/pdf
// Serves the generated resume. Placeholder file for now.
router.get('/:userId/resumes/:jobId/pdf', (req: Request, res: Response) => {
  const job = ownsJob(req, req.params.jobId);

  if (!job) {
    res.status(404).json({ error: 'Resume build not found.' });
    return;
  }

  res.sendFile(PLACEHOLDER_PDF, (error) => {
    if (error && !res.headersSent) {
      res.status(500).json({ error: 'Failed to load the generated resume.' });
    }
  });
});

export default router;
