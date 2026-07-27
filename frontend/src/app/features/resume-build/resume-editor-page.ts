import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { ResumeService, type EditableResumeResponse } from '../../services/resume.service';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { finalize, switchMap, tap } from 'rxjs';

@Component({
  selector: 'app-resume-editor-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="editor-page">
      <header class="editor-header">
        <div>
          <a routerLink="/my-resumes">← Back to my resumes</a>
          <h1>Edit resume</h1>
        </div>

        <button
          type="button"
          class="save-button"
          [disabled]="saving() || !resume()"
          (click)="saveResume()"
        >
          {{ saving() ? 'Saving and regenerating…' : 'Save and refresh preview' }}
        </button>
      </header>

      <p *ngIf="loading()">Loading resume…</p>

      <p class="error" *ngIf="errorMessage()">
        {{ errorMessage() }}
      </p>

      <p class="success" *ngIf="successMessage()">
        {{ successMessage() }}
      </p>

      <div class="editor-workspace" *ngIf="resume() as loadedResume">
        <main class="editing-panel">
          <div class="editor-content" (input)="scheduleAutoSave()">
            <article class="panel">
              <h2>Resume details</h2>

              <label>
                Job-post title
                <input type="text" [(ngModel)]="loadedResume.content.jobPostTitle" />
              </label>
            </article>

            <article class="panel">
              <h2>Header</h2>

              <label>
                Name
                <input type="text" [(ngModel)]="loadedResume.content.header.name.text" />
              </label>

              <h3>Contact information</h3>

              <div
                class="contact-row"
                *ngFor="let part of loadedResume.content.header.contact.parts"
              >
                <label>
                  {{ displayId(part.id) }}
                  <input type="text" [(ngModel)]="part.text" />
                </label>

                <label *ngIf="part.href !== undefined">
                  Link
                  <input type="text" [(ngModel)]="part.href" />
                </label>
              </div>
            </article>

            @for (section of loadedResume.content.sections; track section.id) {
              <article class="panel section-panel">
                <label>
                  Section title
                  <input type="text" [(ngModel)]="section.title" />
                </label>

                @switch (section.type) {
                  @case ('bullets') {
                    <div class="item-card" *ngFor="let bullet of section.bullets">
                      <label *ngIf="bullet.label !== undefined">
                        Label
                        <input type="text" [(ngModel)]="bullet.label" />
                      </label>

                      <label>
                        Text
                        <textarea rows="3" [(ngModel)]="bullet.text"></textarea>
                      </label>

                      <label *ngIf="bullet.url !== undefined">
                        URL
                        <input type="text" [(ngModel)]="bullet.url" />
                      </label>
                    </div>
                  }

                  @case ('entries') {
                    <div class="entry-card" *ngFor="let entry of section.entries">
                      <label>
                        Heading
                        <input type="text" [(ngModel)]="entry.heading" />
                      </label>

                      <div class="two-columns">
                        <label>
                          Meta
                          <input type="text" [(ngModel)]="entry.meta" />
                        </label>

                        <label>
                          Date
                          <input type="text" [(ngModel)]="entry.date" />
                        </label>
                      </div>

                      <div class="item-card" *ngFor="let bullet of entry.bullets">
                        <label>
                          Bullet
                          <textarea rows="3" [(ngModel)]="bullet.text"></textarea>
                        </label>
                      </div>
                    </div>
                  }

                  @case ('org_entries') {
                    <div class="entry-card" *ngFor="let entry of section.entries">
                      <div class="two-columns">
                        <label>
                          Organization
                          <input type="text" [(ngModel)]="entry.org" />
                        </label>

                        <label>
                          Role
                          <input type="text" [(ngModel)]="entry.role" />
                        </label>

                        <label>
                          Location
                          <input type="text" [(ngModel)]="entry.location" />
                        </label>

                        <label>
                          Date
                          <input type="text" [(ngModel)]="entry.date" />
                        </label>
                      </div>

                      <div class="item-card" *ngFor="let bullet of entry.bullets">
                        <label>
                          Bullet
                          <textarea rows="3" [(ngModel)]="bullet.text"></textarea>
                        </label>
                      </div>
                    </div>
                  }

                  @case ('education') {
                    <label>
                      School
                      <input type="text" [(ngModel)]="section.school.text" />
                    </label>

                    <div class="item-card" *ngFor="let bullet of section.bullets">
                      <label>
                        Bullet
                        <textarea rows="3" [(ngModel)]="bullet.text"></textarea>
                      </label>
                    </div>
                  }
                }
              </article>
            }
          </div>
        </main>

        <aside class="preview-panel">
          <h2>Resume preview</h2>

          <iframe
            *ngIf="pdfURL() as trustedPdfUrl"
            [src]="trustedPdfUrl"
            title="Resume PDF preview"
          ></iframe>
        </aside>
      </div>
    </section>
  `,
  styles: [
    `
      .editor-page {
        max-width: 95rem;
        margin: 0 auto;
        padding: 3rem 1.5rem;
        color: #f4f6ff;
      }

      .editor-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 2rem;
      }

      h1 {
        margin: 0.75rem 0 0;
      }

      h2,
      h3 {
        margin-top: 0;
      }

      a {
        color: #b7a9ff;
      }

      .editor-content {
        display: grid;
        gap: 1.25rem;
      }

      .panel {
        display: grid;
        gap: 1rem;
        padding: 1.25rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
        background: rgba(13, 16, 39, 0.75);
      }

      .section-panel {
        border-color: rgba(122, 97, 255, 0.3);
      }

      .entry-card,
      .item-card {
        display: grid;
        gap: 0.8rem;
        padding: 1rem;
        border-radius: 0.75rem;
        background: rgba(255, 255, 255, 0.04);
      }

      .entry-card {
        margin-top: 0.75rem;
      }

      .item-card {
        margin-top: 0.5rem;
      }

      .two-columns,
      .contact-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }

      label {
        display: grid;
        gap: 0.4rem;
        color: rgba(244, 246, 255, 0.72);
        font-size: 0.85rem;
        font-weight: 600;
      }

      input,
      textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 0.7rem 0.8rem;
        border: 1px solid rgba(255, 255, 255, 0.13);
        border-radius: 0.55rem;
        color: #f4f6ff;
        background: rgba(255, 255, 255, 0.06);
        font: inherit;
      }

      textarea {
        resize: vertical;
      }

      input:focus,
      textarea:focus {
        outline: 2px solid rgba(122, 97, 255, 0.6);
        border-color: transparent;
      }

      .save-button {
        padding: 0.75rem 1.3rem;
        border: 0;
        border-radius: 0.7rem;
        color: white;
        background: linear-gradient(135deg, #7a61ff, #4285f4);
        font-weight: 700;
        cursor: pointer;
      }

      .save-button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .error {
        color: #ff9d9d;
      }

      .success {
        color: #74e6bd;
      }

      @media (max-width: 650px) {
        .editor-header {
          align-items: stretch;
          flex-direction: column;
        }

        .two-columns,
        .contact-row {
          grid-template-columns: 1fr;
        }
      }

      .editor-workspace {
        display: grid;
        grid-template-columns:
          minmax(0, 1fr)
          minmax(26rem, 0.9fr);
        align-items: start;
        gap: 1.5rem;
      }

      .editing-panel,
      .preview-panel {
        padding: 1.25rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
        background: rgba(13, 16, 39, 0.75);
      }

      .preview-panel {
        position: sticky;
        top: 1rem;
      }

      .preview-panel iframe {
        display: block;
        width: 100%;
        height: calc(100vh - 10rem);
        min-height: 40rem;
        border: 0;
        border-radius: 0.5rem;
        background: white;
      }

      @media (max-width: 900px) {
        .editor-workspace {
          grid-template-columns: 1fr;
        }

        .preview-panel {
          position: static;
        }
      }
    `,
  ],
})
export class ResumeEditorPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly resumeService = inject(ResumeService);
  private readonly sanitizer = inject(DomSanitizer);

  private userId: string | null = null;
  private resumeId: string | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private save = false;

  readonly dirty = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly pdfURL = signal<SafeResourceUrl | null>(null);
  readonly resume = signal<EditableResumeResponse['resume'] | null>(null);

  ngOnInit(): void {
    this.userId = this.auth.user()?.id ?? null;
    this.resumeId = this.route.snapshot.paramMap.get('resumeId');

    if (!this.userId || !this.resumeId) {
      this.loading.set(false);
      this.errorMessage.set('Unable to identify this resume.');
      return;
    }

    this.refreshPdfPreview();

    this.resumeService.getResumeForEditing(this.userId, this.resumeId).subscribe({
      next: ({ resume }) => {
        if (typeof resume.content.jobPostTitle !== 'string') {
          resume.content.jobPostTitle = resume.title ?? '';
        }

        this.resume.set(resume);
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.errorMessage.set(error?.error?.error ?? 'Unable to load this resume.');
      },
    });
  }

  private performSave(): void {
    const currentResume = this.resume();

    if (!this.userId || !this.resumeId || !currentResume) {
      return;
    }

    if (this.saving()) {
      this.save = true;
      return;
    }

    const userId = this.userId;
    const resumeId = this.resumeId;
    let contentSaved = false;

    this.saving.set(true);
    this.dirty.set(false);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.resumeService
      .updateResume(userId, resumeId, currentResume.content)
      .pipe(
        tap(({ resume }) => {
          contentSaved = true;
          this.resume.set(resume);
        }),
        switchMap(() => this.resumeService.regenerateResume(userId, resumeId)),
        finalize(() => {
          this.saving.set(false);

          if (this.save) {
            this.save = false;
            this.performSave();
          }
        }),
      )
      .subscribe({
        next: () => {
          this.refreshPdfPreview();
          this.successMessage.set('Changes saved and preview refreshed.');
        },
        error: (error) => {
          const fallback = contentSaved
            ? 'Changes were saved, but the PDF could not be regenerated.'
            : 'Unable to save this resume.';

          this.errorMessage.set(error?.error?.error ?? fallback);
        },
      });
  }

  saveResume(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    this.dirty.set(true);
    this.performSave();
  }

  private refreshPdfPreview(): void {
    if (!this.userId || !this.resumeId) {
      return;
    }

    const rawpdfURL =
      this.resumeService.getPdfUrl(this.userId, this.resumeId) +
      `?version=${Date.now()}` +
      `#toolbar=0&navpanes=0&view=FitH`;

    this.pdfURL.set(this.sanitizer.bypassSecurityTrustResourceUrl(rawpdfURL));
  }

  displayId(id: string): string {
    return id
      .replace(/^contact-/, '')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  scheduleAutoSave(): void {
    this.dirty.set(true);
    this.successMessage.set(null);

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {this.autoSaveTimer = null; this.performSave();}, 1500);
  }

  ngOnDestroy(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
  }
}
