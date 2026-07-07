import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { ResumeTemplate, ResumeTemplateService } from '../features/template-selection/resume-template.service';

@Component({
  selector: 'app-resume-templates-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resume-templates-page.html',
  styleUrl: './resume-templates-page.scss'
})
export class ResumeTemplatesPage {
  private readonly router = inject(Router);
  private readonly templateLibrary = inject(ResumeTemplateService);

  readonly selectedTemplateId = this.templateLibrary.selectedTemplateId;

  templates: Array<ResumeTemplate & { safeUrl?: SafeResourceUrl }> = this.templateLibrary.templates;

  constructor(private sanitizer: DomSanitizer) {
    this.templates = this.templateLibrary.templates.map((template) => ({
      ...template,
      safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(template.pdfPath)
    }));
  }

  selectTemplate(templateId: string): void {
    this.templateLibrary.selectTemplate(templateId);
    this.router.navigateByUrl('/tailor');
  }
}
