import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ResumeTemplateService } from '../features/template-selection/resume-template.service';

@Component({
  selector: 'app-tailor-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './tailor-page.html',
  styleUrl: './tailor-page.scss',
})
export class TailorPage {
  private readonly templateLibrary = inject(ResumeTemplateService);

  readonly templates = this.templateLibrary.templates;
  readonly selectedTemplate = computed(() => this.templateLibrary.selectedTemplate());

  jobPostUrl = '';
  buildMessage: string | null = null;

  selectTemplate(templateId: string): void {
    this.templateLibrary.selectTemplate(templateId);
    this.buildMessage = `Using ${this.selectedTemplate().title} for the next build.`;
  }

  openSelectedTemplate(): void {
    window.open(this.selectedTemplate().pdfPath, '_blank', 'noopener');
  }

  buildResume(): void {
    const jobUrl = this.jobPostUrl.trim();

    if (!jobUrl) {
      this.buildMessage = 'Add a job post URL before building.';
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(jobUrl);
    } catch {
      this.buildMessage = 'That job post URL does not look valid yet.';
      return;
    }

    const template = this.selectedTemplate();
    this.buildMessage = `Ready to tailor ${template.title} for ${parsedUrl.hostname}. This is where the resume generation flow will start.`;
  }
}
