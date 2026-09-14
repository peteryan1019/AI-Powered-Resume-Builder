import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ResumeEditorPage } from './resume-editor-page';
import type { ResumeContent } from '../../services/resume.service';

function content(): ResumeContent {
  return { jobPostTitle: 'Engineer', header: { name: { id: 'name', text: 'Dana' }, contact: { id: 'contact', parts: [] } },
    sections: ['a', 'b', 'c'].map(id => ({ id, title: id, type: 'bullets', bullets: [{ id: id + '-bullet', text: 'Original' }] })) };
}

describe('Resume PDF editor', () => {
  let fixture: ComponentFixture<ResumeEditorPage>;
  let editor: ResumeEditorPage;
  let http: HttpTestingController;
  const url = '/api/users/user/resumes/resume';
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ResumeEditorPage], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    fixture = TestBed.createComponent(ResumeEditorPage);
    editor = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    Object.assign(editor, { userId: 'user', resumeId: 'resume' });
    editor.resume.set({ id: 'resume', templateId: 'signal', title: 'Engineer', content: content() });
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  function finishSave(saved: ResumeContent): void {
    http.expectOne(url + '/regenerate').flush({ resume: { id: 'resume', title: saved.jobPostTitle }, preview: { pdfBase64: 'PDF', layout: null, content: saved } });
  }

  it('preserves typing during a save and serializes the next save', () => {
    const first = structuredClone(editor.resume()!.content);
    editor.saveResume();
    const request = http.expectOne(url);
    editor.resume()!.content.header.name.text = 'Newer typing';
    editor.saveResume();
    expect(request.request.body.content.header.name.text).toBe('Dana');
    request.flush({ resume: { ...editor.resume(), content: first } });
    expect(editor.resume()!.content.header.name.text).toBe('Newer typing');
    finishSave(first);
    const next = http.expectOne(url);
    expect(next.request.body.content.header.name.text).toBe('Newer typing');
    next.flush({ resume: editor.resume() });
    finishSave(editor.resume()!.content);
    expect(editor.pdfPreview()!.content.header.name.text).toBe('Newer typing');
    expect(editor.saving()).toBe(false);
  });
  it('retains unsaved changes after a failed save', () => {
    editor.saveResume();
    http.expectOne(url).flush({ error: 'Unavailable' }, { status: 500, statusText: 'Error' });
    expect(editor.dirty()).toBe(true);
    expect(editor.errorMessage()).toBe('Unavailable');
    expect(editor.resume()!.content.header.name.text).toBe('Dana');
  });
  it('moves an entire section to the end, then before another section', () => {
    editor.reorderSection({ sectionId: 'a', beforeSectionId: null });
    expect(editor.resume()!.content.sections.map(s => s.id)).toEqual(['b', 'c', 'a']);
    editor.reorderSection({ sectionId: 'a', beforeSectionId: 'b' });
    expect(editor.resume()!.content.sections.map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(editor.dirty()).toBe(true);
  });
  it('ignores a drop at the existing position or an unknown target', () => {
    editor.reorderSection({ sectionId: 'a', beforeSectionId: 'b' });
    editor.reorderSection({ sectionId: 'a', beforeSectionId: 'missing' });
    expect(editor.dirty()).toBe(false);
    expect(editor.resume()!.content.sections.map(s => s.id)).toEqual(['a', 'b', 'c']);
  });
  it('does not launch a queued save after leaving the editor', () => {
    editor.saveResume();
    const pending = http.expectOne(url);
    editor.saveResume();
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    http.expectNone(url + '/regenerate');
    http.expectNone(url);
  });
});
