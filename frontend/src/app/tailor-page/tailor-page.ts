import { CommonModule } from '@angular/common';
import { Component, computed, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../features/auth/auth.service';
import { PaymentService } from '../features/payments/payment.service';
import { ResumeTemplateService } from '../features/template-selection/resume-template.service';
import {
  ResumeService,
  type CreatedResume,
} from '../services/resume.service';

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
  private readonly auth = inject(AuthService);
  private readonly resumeService = inject(ResumeService);
  private readonly changeDetector = inject(ChangeDetectorRef);

  building = false;
  createdResume: CreatedResume | null = null;

  readonly templates = this.templateLibrary.templates;

  readonly selectedTemplate = computed(() =>
    this.templateLibrary.selectedTemplate(),
  );

  jobPostUrl = '';
  buildMessage: string | null = null;

  selectTemplate(templateId: string): void {
    this.templateLibrary.selectTemplate(templateId);

    this.buildMessage =
      `Using ${this.selectedTemplate().title} for the next build.`;
  }

  openSelectedTemplate(): void {
    window.open(
      this.selectedTemplate().pdfPath,
      '_blank',
      'noopener',
    );
  }

  openCreatedResume(): void {
    const userId = this.auth.user()?.id;

    if (!this.createdResume || !userId) {
      return;
    }

    const pdfUrl = this.resumeService.getPdfUrl(
      userId,
      this.createdResume.id,
    );

    window.open(
      pdfUrl,
      '_blank',
      'noopener',
    );
  }

  startCheckout(action: string, returnTo: string): void {
    this.payment.startCheckout(action, returnTo).subscribe();
  }

  buildResume(): void {
    const jobUrl = this.jobPostUrl.trim();

    if (!jobUrl) {
      this.buildMessage =
        'Add a job post URL before building.';
      return;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(jobUrl);
    } catch {
      this.buildMessage =
        'That job post URL does not look valid yet.';
      return;
    }

    const userId = this.auth.user()?.id;

    if (!userId) {
      this.buildMessage =
        'Please sign in again before building.';
      return;
    }

    const template = this.selectedTemplate();

    this.building = true;
    this.createdResume = null;

    this.buildMessage =
      `Building ${template.title} for ${parsedUrl.hostname}...`;

    this.resumeService
      .createResume(userId, {
        jobPostingUrl: jobUrl,
        templateId: template.id,
      })
      .subscribe({
        next: ({ resume }) => {
          this.building = false;
          this.createdResume = resume;

          this.buildMessage =
            `${template.title} was successfully created.`;

          this.changeDetector.detectChanges();

          console.log('Created resume:', resume);
        },
        error: (error) => {
          this.building = false;

          this.buildMessage =
            error?.error?.error ??
            'Unable to build the resume right now.';

          this.changeDetector.detectChanges();

          console.error('Resume build failed:', error);
        },
        });
  }
}