import { Injectable, computed, signal } from '@angular/core';

export interface ResumeTemplate {
  id: string;
  title: string;
  description: string;
  pdfPath: string;
  highlight: string;
}

const STORAGE_KEY = 'tailr.selectedTemplateId';

@Injectable({ providedIn: 'root' })
export class ResumeTemplateService {
  readonly templates: ResumeTemplate[] = [
    {
      id: 'evergreen',
      title: 'Evergreen',
      description: 'A clean, balanced resume for cross-functional roles and general applications.',
      pdfPath: '/assets/resume_evergreen.pdf',
      highlight: 'Best for broad applications and quick tailoring.'
    },
    {
      id: 'signal',
      title: 'Signal',
      description: 'Compact spacing and sharper section contrast for technical roles that skim fast.',
      pdfPath: '/assets/resume_signal.pdf',
      highlight: 'Designed to spotlight bullets and metrics.'
    },
    {
      id: 'atelier',
      title: 'Atelier',
      description: 'A polished, editorial layout that gives experience sections more breathing room.',
      pdfPath: '/assets/resume_atelier.pdf',
      highlight: 'Good when you want the page to feel more distinctive.'
    }
  ];

  private readonly selectedTemplateIdSignal = signal<string>(this.resolveInitialTemplateId());

  readonly selectedTemplateId = this.selectedTemplateIdSignal.asReadonly();
  readonly selectedTemplate = computed(
    () => this.templates.find((template) => template.id === this.selectedTemplateIdSignal()) ?? this.templates[0]
  );

  selectTemplate(templateId: string): void {
    const validTemplate = this.templates.find((template) => template.id === templateId);
    if (!validTemplate) {
      return;
    }

    this.selectedTemplateIdSignal.set(validTemplate.id);
    this.persistTemplateId(validTemplate.id);
  }

  // localStorage is missing under server-side rendering, and reading it throws
  // outright in privacy-restricted browsers (Safari private mode), so template
  // selection must never depend on it being there.
  private storage(): Storage | null {
    try {
      return typeof window === 'undefined' ? null : window.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private resolveInitialTemplateId(): string {
    const storage = this.storage();
    if (!storage) {
      return this.templates[0].id;
    }

    let storedId: string | null = null;
    try {
      storedId = storage.getItem(STORAGE_KEY);
    } catch {
      return this.templates[0].id;
    }

    const validTemplate = this.templates.find((template) => template.id === storedId);

    if (validTemplate) {
      return validTemplate.id;
    }

    this.persistTemplateId(this.templates[0].id);
    return this.templates[0].id;
  }

  private persistTemplateId(templateId: string): void {
    const storage = this.storage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEY, templateId);
    } catch {
      // A full or locked-down store must not break template selection.
    }
  }
}
