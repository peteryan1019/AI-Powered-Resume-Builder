import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PaymentService } from '../features/payments/payment.service';
import { ResumeTemplateService } from '../features/template-selection/resume-template.service';

@Component({
  selector: 'app-tailor-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tailor-page.html',
  styleUrl: './tailor-page.scss',
})
export class TailorPage {
  private readonly payment = inject(PaymentService);
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

  startCheckout(action: string, returnTo: string): void {
    this.payment.startCheckout(action, returnTo).subscribe();
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
    this.buildMessage = `Preparing checkout for ${template.title} and ${parsedUrl.hostname}.`;
    this.payment.startCheckout('tailor_resume', '/tailor').subscribe({
      error: (error) => {
        this.buildMessage = error?.error?.error ?? 'Unable to start checkout right now.';
      },
    });
  }
}
