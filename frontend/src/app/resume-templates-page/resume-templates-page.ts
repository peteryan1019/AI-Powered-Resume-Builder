import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-resume-templates-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resume-templates-page.html',
  styleUrl: './resume-templates-page.scss'
})
export class ResumeTemplatesPage {
  templates: Array<{ title: string; description: string; pdfPath: string; safeUrl?: SafeResourceUrl }> = [
    {
      title: 'Template 1',
      description: 'Classic layout for technical and professional roles.',
      pdfPath: '/assets/Peter_Yan_Resume_Thales.pdf'
    },
    {
      title: 'Template 2',
      description: 'A second placeholder version using the same PDF for now.',
      pdfPath: '/assets/Peter_Yan_Resume_Thales.pdf'
    },
    {
      title: 'Template 3',
      description: 'Another placeholder template entry.',
      pdfPath: '/assets/Peter_Yan_Resume_Thales.pdf'
    }
  ];

  constructor(private sanitizer: DomSanitizer) {
    this.templates = this.templates.map(t => ({ ...t, safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(t.pdfPath) }));
  }
}