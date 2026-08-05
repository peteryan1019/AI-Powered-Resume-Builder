import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import {
  ResumeService,
  type EntriesSection,
  type OrganizationEntriesSection,
  type ResumeBullet,
  type EditableResumeResponse,
} from '../../services/resume.service';
import { ResumeLivePreview } from './resume-live-preview';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { finalize, switchMap, tap } from 'rxjs';

@Component({
  selector: 'app-resume-editor-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ResumeLivePreview],
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
                <input
                  type="text"
                  [(ngModel)]="loadedResume.content.jobPostTitle"
                  [attr.data-editor-id]="'job-post-title'"
                />
              </label>
            </article>

            <article class="panel">
              <h2>Header</h2>

              <label>
                Name
                <input
                  type="text"
                  [(ngModel)]="loadedResume.content.header.name.text"
                  [attr.data-editor-id]="loadedResume.content.header.name.id"
                  (focus)="highlightElement(loadedResume.content.header.name.id)"
                  (blur)="clearHighlight()"
                />
              </label>

              <h3>Contact information</h3>

              <div
                class="contact-row"
                *ngFor="let part of loadedResume.content.header.contact.parts"
              >
                <label>
                  {{ displayId(part.id) }}
                  <input
                    type="text"
                    [(ngModel)]="part.text"
                    [attr.data-editor-id]="part.id"
                    (focus)="highlightElement(part.id)"
                    (blur)="clearHighlight()"
                  />
                </label>

                <label *ngIf="part.href !== undefined">
                  Link
                  <input
                    type="text"
                    [(ngModel)]="part.href"
                    [attr.data-editor-id]="part.id"
                    (focus)="highlightElement(part.id)"
                    (blur)="clearHighlight()"
                  />
                </label>
              </div>
            </article>

            @for (section of loadedResume.content.sections; track section.id) {
              <article class="panel section-panel">
                <label>
                  Section title
                  <input
                    type="text"
                    [(ngModel)]="section.title"
                    [attr.data-editor-id]="section.id"
                    (focus)="highlightElement(section.id)"
                    (blur)="clearHighlight()"
                  />
                </label>

                @switch (section.type) {
                  @case ('bullets') {
                    <div
                      class="item-card"
                      *ngFor="let bullet of section.bullets; let bulletIndex = index"
                    >
                      <button
                        type="button"
                        class="reorder-button move-up"
                        [disabled]="bulletIndex === 0"
                        (click)="moveItem(section.bullets, bulletIndex, -1)"
                        aria-label="Move bullet up"
                        title="Move bullet up"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>

                      <button
                        type="button"
                        class="reorder-button move-down"
                        [disabled]="bulletIndex === section.bullets.length - 1"
                        (click)="moveItem(section.bullets, bulletIndex, 1)"
                        aria-label="Move bullet down"
                        title="Move bullet down"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>

                      <button
                        type="button"
                        class="delete-button"
                        (click)="deleteBullet(section.bullets, bulletIndex)"
                        aria-label="Delete bullet"
                        title="Delete bullet"
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>

                      <label *ngIf="bullet.label !== undefined">
                        Label
                        <input
                          type="text"
                          [(ngModel)]="bullet.label"
                          [attr.data-editor-id]="bullet.id"
                          (focus)="highlightElement(bullet.id)"
                          (blur)="clearHighlight()"
                        />
                      </label>

                      <label>
                        Text
                        <textarea
                          rows="3"
                          [(ngModel)]="bullet.text"
                          [attr.data-editor-id]="bullet.id"
                          (focus)="highlightElement(bullet.id)"
                          (blur)="clearHighlight()"
                        ></textarea>
                      </label>

                      <label *ngIf="bullet.url !== undefined">
                        URL
                        <input
                          type="text"
                          [(ngModel)]="bullet.url"
                          [attr.data-editor-id]="bullet.id"
                          (focus)="highlightElement(bullet.id)"
                          (blur)="clearHighlight()"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      class="add-button"
                      (click)="addBullet(section.bullets, true)"
                    >
                      + Add bullet
                    </button>
                  }

                  @case ('entries') {
                    <div
                      class="entry-card"
                      *ngFor="let entry of section.entries; let entryIndex = index"
                    >
                      <button
                        type="button"
                        class="reorder-button move-up"
                        [disabled]="entryIndex === 0"
                        (click)="moveItem(section.entries, entryIndex, -1)"
                        aria-label="Move entry up"
                        title="Move entry up"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>

                      <button
                        type="button"
                        class="reorder-button move-down"
                        [disabled]="entryIndex === section.entries.length - 1"
                        (click)="moveItem(section.entries, entryIndex, 1)"
                        aria-label="Move entry down"
                        title="Move entry down"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>

                      <button
                        type="button"
                        class="delete-button"
                        (click)="deleteEntry(section.entries, entryIndex)"
                        aria-label="Delete entry"
                        title="Delete entry"
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>

                      <label>
                        Heading
                        <input
                          type="text"
                          [(ngModel)]="entry.heading"
                          [attr.data-editor-id]="entry.id"
                          (focus)="highlightElement(entry.id)"
                          (blur)="clearHighlight()"
                        />
                      </label>

                      <div class="two-columns">
                        <label>
                          Meta
                          <input
                            type="text"
                            [(ngModel)]="entry.meta"
                            [attr.data-editor-id]="entry.id"
                            (focus)="highlightElement(entry.id)"
                            (blur)="clearHighlight()"
                          />
                        </label>

                        <label>
                          Date
                          <input
                            type="text"
                            [(ngModel)]="entry.date"
                            [attr.data-editor-id]="entry.id"
                            (focus)="highlightElement(entry.id)"
                            (blur)="clearHighlight()"
                          />
                        </label>
                      </div>

                      <div
                        class="item-card"
                        *ngFor="let bullet of entry.bullets; let bulletIndex = index"
                      >
                        <button
                          type="button"
                          class="reorder-button move-up"
                          [disabled]="bulletIndex === 0"
                          (click)="moveItem(entry.bullets, bulletIndex, -1)"
                          aria-label="Move bullet up"
                          title="Move bullet up"
                        >
                          <span aria-hidden="true">↑</span>
                        </button>

                        <button
                          type="button"
                          class="reorder-button move-down"
                          [disabled]="bulletIndex === entry.bullets.length - 1"
                          (click)="moveItem(entry.bullets, bulletIndex, 1)"
                          aria-label="Move bullet down"
                          title="Move bullet down"
                        >
                          <span aria-hidden="true">↓</span>
                        </button>

                        <button
                          type="button"
                          class="delete-button"
                          (click)="deleteBullet(entry.bullets, bulletIndex)"
                          aria-label="Delete bullet"
                          title="Delete bullet"
                        >
                          <span aria-hidden="true">🗑</span>
                        </button>

                        <label>
                          Bullet
                          <textarea
                            rows="3"
                            [(ngModel)]="bullet.text"
                            [attr.data-editor-id]="bullet.id"
                            (focus)="highlightElement(bullet.id)"
                            (blur)="clearHighlight()"
                          ></textarea>
                        </label>
                      </div>

                      <button
                        type="button"
                        class="add-button compact"
                        (click)="addBullet(entry.bullets)"
                      >
                        + Add bullet
                      </button>
                    </div>

                    <button type="button" class="add-button" (click)="addStandardEntry(section)">
                      + Add entry
                    </button>
                  }

                  @case ('org_entries') {
                    <div
                      class="entry-card"
                      *ngFor="let entry of section.entries; let entryIndex = index"
                    >
                      <button
                        type="button"
                        class="reorder-button move-up"
                        [disabled]="entryIndex === 0"
                        (click)="moveItem(section.entries, entryIndex, -1)"
                        aria-label="Move experience up"
                        title="Move experience up"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>

                      <button
                        type="button"
                        class="reorder-button move-down"
                        [disabled]="entryIndex === section.entries.length - 1"
                        (click)="moveItem(section.entries, entryIndex, 1)"
                        aria-label="Move experience down"
                        title="Move experience down"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>

                      <button
                        type="button"
                        class="delete-button"
                        (click)="deleteEntry(section.entries, entryIndex)"
                        aria-label="Delete experience"
                        title="Delete experience"
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>

                      <div class="two-columns">
                        <label>
                          Organization
                          <input
                            type="text"
                            [(ngModel)]="entry.org"
                            [attr.data-editor-id]="entry.id"
                            (focus)="highlightElement(entry.id)"
                            (blur)="clearHighlight()"
                          />
                        </label>

                        <label>
                          Role
                          <input
                            type="text"
                            [(ngModel)]="entry.role"
                            [attr.data-editor-id]="entry.id"
                            (focus)="highlightElement(entry.id)"
                            (blur)="clearHighlight()"
                          />
                        </label>

                        <label>
                          Location
                          <input
                            type="text"
                            [(ngModel)]="entry.location"
                            [attr.data-editor-id]="entry.id"
                            (focus)="highlightElement(entry.id)"
                            (blur)="clearHighlight()"
                          />
                        </label>

                        <label>
                          Date
                          <input
                            type="text"
                            [(ngModel)]="entry.date"
                            [attr.data-editor-id]="entry.id"
                            (focus)="highlightElement(entry.id)"
                            (blur)="clearHighlight()"
                          />
                        </label>
                      </div>

                      <div
                        class="item-card"
                        *ngFor="let bullet of entry.bullets; let bulletIndex = index"
                      >
                        <button
                          type="button"
                          class="reorder-button move-up"
                          [disabled]="bulletIndex === 0"
                          (click)="moveItem(entry.bullets, bulletIndex, -1)"
                          aria-label="Move bullet up"
                          title="Move bullet up"
                        >
                          <span aria-hidden="true">↑</span>
                        </button>

                        <button
                          type="button"
                          class="reorder-button move-down"
                          [disabled]="bulletIndex === entry.bullets.length - 1"
                          (click)="moveItem(entry.bullets, bulletIndex, 1)"
                          aria-label="Move bullet down"
                          title="Move bullet down"
                        >
                          <span aria-hidden="true">↓</span>
                        </button>

                        <button
                          type="button"
                          class="delete-button"
                          (click)="deleteBullet(entry.bullets, bulletIndex)"
                          aria-label="Delete bullet"
                          title="Delete bullet"
                        >
                          <span aria-hidden="true">🗑</span>
                        </button>

                        <label>
                          Bullet
                          <textarea
                            rows="3"
                            [(ngModel)]="bullet.text"
                            [attr.data-editor-id]="bullet.id"
                            (focus)="highlightElement(bullet.id)"
                            (blur)="clearHighlight()"
                          ></textarea>
                        </label>
                      </div>

                      <button
                        type="button"
                        class="add-button compact"
                        (click)="addBullet(entry.bullets)"
                      >
                        + Add bullet
                      </button>
                    </div>

                    <button
                      type="button"
                      class="add-button"
                      (click)="addOrganizationEntry(section)"
                    >
                      + Add experience
                    </button>
                  }

                  @case ('education') {
                    <label>
                      School
                      <input
                        type="text"
                        [(ngModel)]="section.school.text"
                        [attr.data-editor-id]="section.school.id"
                        (focus)="highlightElement(section.school.id)"
                        (blur)="clearHighlight()"
                      />
                    </label>

                    <div
                      class="item-card"
                      *ngFor="let bullet of section.bullets; let bulletIndex = index"
                    >
                      <button
                        type="button"
                        class="reorder-button move-up"
                        [disabled]="bulletIndex === 0"
                        (click)="moveItem(section.bullets, bulletIndex, -1)"
                        aria-label="Move bullet up"
                        title="Move bullet up"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>

                      <button
                        type="button"
                        class="reorder-button move-down"
                        [disabled]="bulletIndex === section.bullets.length - 1"
                        (click)="moveItem(section.bullets, bulletIndex, 1)"
                        aria-label="Move bullet down"
                        title="Move bullet down"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>

                      <button
                        type="button"
                        class="delete-button"
                        (click)="deleteBullet(section.bullets, bulletIndex)"
                        aria-label="Delete bullet"
                        title="Delete bullet"
                      >
                        <span aria-hidden="true">🗑</span>
                      </button>

                      <label>
                        Bullet
                        <textarea
                          rows="3"
                          [(ngModel)]="bullet.text"
                          [attr.data-editor-id]="bullet.id"
                          (focus)="highlightElement(bullet.id)"
                          (blur)="clearHighlight()"
                        ></textarea>
                      </label>
                    </div>

                    <button type="button" class="add-button" (click)="addBullet(section.bullets)">
                      + Add bullet
                    </button>
                  }
                }
              </article>
            }
          </div>
        </main>

        <aside class="preview-panel">
          <h2>Resume preview</h2>

          <app-resume-live-preview
            [content]="loadedResume.content"
            [templateId]="loadedResume.templateId"
            [activeElementId]="activeElementId()"
            (elementSelected)="focusEditorElement($event)"
          ></app-resume-live-preview>
        </aside>
      </div>
    </section>
  `,
  styles: [
    `
      .editor-page {
        max-width: 120rem;
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
        position: relative;
        display: grid;
        gap: 0.8rem;
        padding: 1rem;
        padding-right: 8rem;
        border-radius: 0.75rem;
        background: rgba(255, 255, 255, 0.04);
      }

      .entry-card {
        margin-top: 0.75rem;
      }

      .item-card {
        margin-top: 0.5rem;
      }

      .add-button,
      .reorder-button,
      .delete-button {
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        transition:
          transform 0.16s ease,
          background 0.16s ease;
      }

      .add-button {
        justify-self: start;
        padding: 0.6rem 0.9rem;
        border: 1px solid rgba(122, 97, 255, 0.55);
        border-radius: 0.65rem;
        background: rgba(122, 97, 255, 0.16);
      }

      .add-button.compact {
        padding: 0.48rem 0.75rem;
        font-size: 0.84rem;
      }

      .add-button:hover {
        background: rgba(122, 97, 255, 0.3);
        transform: translateY(-1px);
      }

      .delete-button {
        position: absolute;
        top: 0.7rem;
        right: 0.7rem;
        display: grid;
        width: 2rem;
        height: 2rem;
        padding: 0;
        place-items: center;
        border: 1px solid rgba(255, 124, 124, 0.38);
        border-radius: 50%;
        background: rgba(255, 92, 92, 0.12);
        color: #ffb3b3;
        font-size: 1.25rem;
        line-height: 1;
      }

      .reorder-button {
        position: absolute;
        top: 0.7rem;
        display: grid;
        width: 2rem;
        height: 2rem;
        padding: 0;
        place-items: center;
        border: 1px solid rgba(122, 97, 255, 0.48);
        border-radius: 50%;
        background: rgba(122, 97, 255, 0.14);
        color: #d9d2ff;
        font-size: 1.1rem;
        line-height: 1;
      }

      .reorder-button.move-up {
        right: 5.3rem;
      }

      .reorder-button.move-down {
        right: 3rem;
      }

      .reorder-button:hover:not(:disabled) {
        background: rgba(122, 97, 255, 0.32);
        transform: translateY(-1px);
      }

      .reorder-button:disabled {
        cursor: not-allowed;
        opacity: 0.28;
      }

      .delete-button:hover {
        background: rgba(255, 92, 92, 0.28);
        transform: scale(1.04);
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
          minmax(22rem, 0.75fr)
          minmax(42rem, 1.25fr);
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

      .preview-panel app-resume-live-preview {
        display: block;
        width: 100%;
        max-height: calc(100vh - 10rem);
        overflow: auto;
        border-radius: 0.5rem;
        background: white;
      }

      @media (max-width: 1100px) {
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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
  readonly activeElementId = signal<string | null>(null);

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

  private createBullet(includeLabel = false, includeUrl = false): ResumeBullet {
    return {
      id: `bullet-${crypto.randomUUID()}`,
      text: '',
      ...(includeLabel ? { label: '' } : {}),
      ...(includeUrl ? { url: '' } : {}),
    };
  }

  addBullet(bullets: ResumeBullet[], includeLabel = false): void {
    const includeUrl = bullets.some((bullet) => bullet.url !== undefined);

    bullets.push(this.createBullet(includeLabel, includeUrl));
    this.scheduleAutoSave();
  }

  deleteBullet(bullets: ResumeBullet[], bulletIndex: number): void {
    const confirmed = window.confirm('Are you sure you want to delete this bullet?');

    if (!confirmed) {
      return;
    }

    bullets.splice(bulletIndex, 1);
    this.scheduleAutoSave();
  }

  addStandardEntry(section: EntriesSection): void {
    section.entries.push({
      id: `entry-${crypto.randomUUID()}`,
      heading: '',
      meta: '',
      date: '',
      bullets: [this.createBullet()],
    });

    this.scheduleAutoSave();
  }

  highlightElement(id: string): void {
    this.activeElementId.set(id);
  }

  clearHighlight(): void {
    this.activeElementId.set(null);
  }

  addOrganizationEntry(section: OrganizationEntriesSection): void {
    section.entries.push({
      id: `organization-entry-${crypto.randomUUID()}`,
      org: '',
      role: '',
      location: '',
      date: '',
      bullets: [this.createBullet()],
    });

    this.scheduleAutoSave();
  }

  deleteEntry<T>(entries: T[], entryIndex: number): void {
    const confirmed = window.confirm(
      'Delete this entire entry? This will also delete its bullets.',
    );

    if (!confirmed) {
      return;
    }

    entries.splice(entryIndex, 1);
    this.scheduleAutoSave();
  }

  moveItem<T>(items: T[], currentIndex: number, direction: -1 | 1): void {
    const destinationIndex = currentIndex + direction;

    if (destinationIndex < 0 || destinationIndex >= items.length) {
      return;
    }

    items.splice(destinationIndex, 0, ...items.splice(currentIndex, 1));

    this.scheduleAutoSave();
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

    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.performSave();
    }, 1500);
  }

  focusEditorElement(id: string): void {
    const matches = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[data-editor-id]'),
    ).filter((candidate) => candidate.dataset['editorId'] === id);

    const control = matches.find((candidate) => candidate.tagName === 'TEXTAREA') ?? matches[0];

    if (!control) {
      return;
    }

    this.highlightElement(id);

    control.scrollIntoView({ behavior: 'smooth', block: 'center' });

    control.focus({ preventScroll: true });
  }

  ngOnDestroy(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
  }
}
