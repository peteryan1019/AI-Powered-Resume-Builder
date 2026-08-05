import { TestBed } from '@angular/core/testing';
import { ResumeTemplateService } from './resume-template.service';

describe('ResumeTemplateService', () => {
  let service: ResumeTemplateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ResumeTemplateService);
  });

  it('offers exactly the three templates the backend can render', () => {
    // These ids are the contract with the backend: resolveGeneratorPath() and
    // templateRegistry both key off them, and the POST /resumes validator
    // rejects anything else.
    expect(service.templates.map((t) => t.id).sort()).toEqual([
      'atelier',
      'evergreen',
      'signal',
    ]);
  });

  it('gives every template its own preview file', () => {
    // All three previews once pointed at the same PDF, which made the picker
    // show an identical layout for every option.
    const paths = service.templates.map((t) => t.pdfPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('describes every template with a title, blurb and highlight', () => {
    for (const template of service.templates) {
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
      expect(template.highlight.length).toBeGreaterThan(0);
    }
  });

  it('starts on a template that actually exists', () => {
    const ids = service.templates.map((t) => t.id);
    expect(ids).toContain(service.selectedTemplateId());
  });

  it('selects a known template', () => {
    service.selectTemplate('atelier');
    expect(service.selectedTemplateId()).toBe('atelier');
    expect(service.selectedTemplate().title).toBe('Atelier');
  });

  it('ignores an unknown template id', () => {
    service.selectTemplate('signal');
    service.selectTemplate('not-a-real-template');
    expect(service.selectedTemplateId()).toBe('signal');
  });

  it('works when localStorage is unavailable', () => {
    // Server-side rendering and privacy-restricted browsers both hit this path.
    expect(service.selectedTemplateId()).toBeTruthy();
    expect(() => service.selectTemplate('evergreen')).not.toThrow();
  });
});
