import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), render: vi.fn() }));
vi.mock('../lib/prisma.js', () => ({ default: { resume: { findFirst: mocks.findFirst, update: mocks.update } } }));
vi.mock('../services/resumeRender.js', () => ({ renderResume: mocks.render, measureResumeFill: vi.fn() }));
vi.mock('../services/test-gemini.js', () => ({ tailorResume: vi.fn() }));
vi.mock('../services/check-gemini.js', () => ({ finalResume: vi.fn() }));
vi.mock('../services/profileExportJSON.js', () => ({ getExportedProfile: vi.fn() }));
import router from './resumeAI1.js';

function app(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (userId) Object.assign(req, { user: { id: userId } }); next(); });
  app.use(router);
  return app;
}

describe('Saved PDF preview', () => {
  beforeEach(() => vi.resetAllMocks());
  it('returns the identical PDF bytes and positions from the render saved to the database', async () => {
    const content = { jobPostTitle: 'Engineer', sections: [] };
    const pdf = Uint8Array.from(Buffer.from('%PDF-same-bytes'));
    const layout = { pageWidth: 612, pageHeight: 792, fontSize: 10, elements: {} };
    mocks.findFirst.mockResolvedValue({ id: 'resume', templateId: 'atelier', content });
    mocks.render.mockResolvedValue({ pdf, layout });
    mocks.update.mockResolvedValue({ id: 'resume', title: 'Engineer' });
    const response = await request(app('owner')).post('/owner/resumes/resume/regenerate');
    expect(response.status).toBe(200);
    expect(mocks.findFirst.mock.calls[0]![0].where).toEqual({ id: 'resume', userId: 'owner' });
    expect(mocks.render).toHaveBeenCalledWith(content, 'atelier');
    const persisted = mocks.update.mock.calls[0]![0].data.pdfData;
    expect(Buffer.from(response.body.preview.pdfBase64, 'base64')).toEqual(Buffer.from(persisted));
    expect(response.body.preview.layout).toEqual(layout);
    expect(response.body.preview.content).toEqual(content);
    expect(response.headers['cache-control']).toContain('no-store');
  });
  it('requires authentication before generating or exposing resume data', async () => {
    expect((await request(app()).post('/owner/resumes/resume/regenerate')).status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it('rejects attempts to regenerate another user’s resume', async () => {
    expect((await request(app('other')).post('/owner/resumes/resume/regenerate')).status).toBe(403);
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
