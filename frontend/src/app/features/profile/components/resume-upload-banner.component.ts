// frontend/src/app/features/profile/components/resume-upload-banner.component.ts

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-resume-upload-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="upload-banner"
      [class.parsing]="isParsing"
      (dragover)="$event.preventDefault()"
      (drop)="onDrop($event)"
    >
      <div class="upload-icon">
        <i class="ti" [class.ti-file-upload]="!isParsing" [class.ti-loader-2]="isParsing"
           [class.spin]="isParsing"></i>
      </div>
      <div class="upload-text">
        <ng-container *ngIf="!isParsing">
          <h3 *ngIf="!resumeFileName">Import from resume</h3>
          <h3 *ngIf="resumeFileName">Resume uploaded: {{ resumeFileName }}</h3>
          <p>Upload a PDF or DOCX and AI will auto-fill your profile.</p>
        </ng-container>
        <ng-container *ngIf="isParsing">
          <h3>Parsing your resume…</h3>
          <p>AI is reading your resume and filling in your profile. This takes about 10 seconds.</p>
        </ng-container>
      </div>
      <label class="upload-btn" *ngIf="!isParsing">
        {{ resumeFileName ? 'Replace' : 'Upload resume' }}
        <input type="file" accept=".pdf,.docx" (change)="onFileChange($event)" hidden />
      </label>
    </div>
  `,
  styleUrls: ['./resume-upload-banner.component.scss'],
})
export class ResumeUploadBannerComponent {
  @Input() resumeFileName: string | null = null;
  @Input() isParsing = false;
  @Output() fileSelected = new EventEmitter<File>();

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.fileSelected.emit(file);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.fileSelected.emit(file);
  }
}
