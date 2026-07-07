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
      pdfPath: '/assets/Peter_Yan_Resume_Thales.pdf',
      highlight: 'Best for broad applications and quick tailoring.'
    },
    {
      id: 'signal',
      title: 'Signal',
      description: 'Compact spacing and sharper section contrast for technical roles that skim fast.',
      pdfPath: '/assets/Peter_Yan_Resume_Thales.pdf',
      highlight: 'Designed to spotlight bullets and metrics.'
    },
    {
      id: 'atelier',
      title: 'Atelier',
      description: 'A polished, editorial layout that gives experience sections more breathing room.',
      pdfPath: '/assets/Peter_Yan_Resume_Thales.pdf',
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

  private resolveInitialTemplateId(): string {
    if (typeof window === 'undefined') {
      return this.templates[0].id;
    }

    const storedId = window.localStorage.getItem(STORAGE_KEY);
    const validTemplate = this.templates.find((template) => template.id === storedId);

    if (validTemplate) {
      return validTemplate.id;
    }

    this.persistTemplateId(this.templates[0].id);
    return this.templates[0].id;
  }

  private persistTemplateId(templateId: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, templateId);
  }
}
