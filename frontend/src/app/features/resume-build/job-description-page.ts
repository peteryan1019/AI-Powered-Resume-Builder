import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { ResumeTemplateService } from '../template-selection/resume-template.service';
import { ResumeBuildService } from './resume-build.service';

/** Mirrors MIN_JOB_DESCRIPTION_LENGTH on the backend. */
const MIN_DESCRIPTION_LENGTH = 40;

/**
 * Fallback entry point for a build whose posting the AI could not read. The
 * build status page routes here on a `job_post_unreadable` event; pasting the
 * description starts a fresh build that skips retrieval entirely and feeds the
 * text straight to the generating AI. Everything after that stage is unchanged.
 */
@Component({
  selector: 'app-job-description-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="paste-page">
      <article class="paste-card">
        <p class="eyebrow">One quick step</p>
        <h1>Paste the job description.</h1>

        <p class="intro-copy">
          Drop the posting's text in below and we will tailor your resume from it — same build,
          same template, nothing else changes.
        </p>

        <p class="reason">
          <ng-container *ngIf="hostname()">
            Why: nothing readable came back from <strong>{{ hostname() }}</strong>.
          </ng-container>
          <ng-container *ngIf="!hostname()">
            Why: nothing readable came back from that posting.
          </ng-container>
          Many job boards block automated readers or keep postings behind a login.
        </p>

        <label class="field">
          <span>Job description</span>
          <textarea
            rows="14"
            [(ngModel)]="jobDescription"
            [disabled]="building()"
            placeholder="Paste the full posting: title, responsibilities, and required or preferred qualifications."
          ></textarea>
        </label>

        <p class="hint">
          {{ characterCount() }} characters — include the title, responsibilities, and
          qualifications so the tailoring has something to match.
        </p>

        <div class="action-row">
          <button
            type="button"
            class="primary-action"
            [disabled]="building()"
            (click)="build()"
          >
            {{ building() ? 'Building…' : 'Build from this description' }}
          </button>
          <a class="secondary-action" routerLink="/tailor">Try another URL</a>
        </div>

        <p class="status" *ngIf="message()">{{ message() }}</p>

        <p class="template-note">
          Template: <strong>{{ template().title }}</strong>
        </p>
      </article>
    </section>
  `,
  styles: [
    `
      .paste-page {
        display: grid;
        justify-content: center;
        padding: 2.5rem 0;
      }
      .paste-card {
        position: relative;
        width: 100%;
        max-width: 52rem;
        padding: 1.8rem;
        border-radius: 28px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: linear-gradient(180deg, rgba(16, 20, 52, 0.9), rgba(10, 12, 34, 0.8));
        backdrop-filter: blur(18px);
        box-shadow: 0 18px 50px rgba(3, 5, 15, 0.18);
        color: #f4f6ff;
        overflow: hidden;
      }
      .eyebrow {
        margin: 0 0 0.75rem;
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(244, 246, 255, 0.56);
      }
      h1 {
        margin: 0;
        font-size: clamp(1.9rem, 3.4vw, 2.8rem);
        line-height: 1.04;
        letter-spacing: -0.04em;
      }
      .intro-copy,
      .reason,
      .hint,
      .status,
      .template-note {
        color: rgba(244, 246, 255, 0.74);
        line-height: 1.6;
      }
      .intro-copy {
        max-width: 66ch;
        margin: 1rem 0 0;
      }
      /* The failure is context, not the message — keep it below the action. */
      .reason {
        max-width: 66ch;
        margin: 0.6rem 0 0;
        font-size: 0.85rem;
        color: rgba(244, 246, 255, 0.58);
      }
      .field {
        display: grid;
        gap: 0.45rem;
        margin-top: 1.4rem;
      }
      .field span {
        font-size: 0.85rem;
        font-weight: 700;
        color: rgba(244, 246, 255, 0.72);
      }
      .field textarea {
        padding: 0.85rem 1rem;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.06);
        color: #f4f6ff;
        font: inherit;
        line-height: 1.55;
        resize: vertical;
        outline: none;
      }
      .field textarea::placeholder {
        color: rgba(244, 246, 255, 0.38);
      }
      .field textarea:focus {
        border-color: rgba(168, 183, 255, 0.7);
        box-shadow: 0 0 0 4px rgba(88, 127, 255, 0.15);
      }
      .hint {
        margin: 0.55rem 0 0;
        font-size: 0.85rem;
      }
      .action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 1.4rem;
      }
      .primary-action,
      .secondary-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0.78rem 1rem;
        border-radius: 999px;
        font: inherit;
        font-weight: 800;
        text-decoration: none;
        cursor: pointer;
        transition:
          transform 160ms ease,
          opacity 160ms ease;
      }
      .primary-action:hover:not(:disabled),
      .secondary-action:hover {
        transform: translateY(-1px);
      }
      .primary-action {
        border: 0;
        color: #111827;
        background: linear-gradient(180deg, #ffffff, #eef3ff);
      }
      .primary-action:disabled {
        cursor: wait;
        opacity: 0.66;
      }
      .secondary-action {
        color: #f4f6ff;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.06);
      }
      .status {
        margin: 1rem 0 0;
      }
      .template-note {
        margin: 1.4rem 0 0;
        font-size: 0.85rem;
      }

      @media (max-width: 640px) {
        .paste-card {
          padding: 1.3rem;
        }
      }
    `,
  ],
})
export class JobDescriptionPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly templateLibrary = inject(ResumeTemplateService);
  private readonly resumeBuild = inject(ResumeBuildService);

  jobDescription = '';

  readonly building = signal(false);
  readonly message = signal<string | null>(null);
  private readonly templateId = signal<string | null>(null);
  private readonly sourceUrl = signal<string>('');

  /** The template the failed build used, falling back to the current selection. */
  readonly template = computed(() => {
    const id = this.templateId();
    return (
      this.templateLibrary.templates.find((t) => t.id === id) ??
      this.templateLibrary.selectedTemplate()
    );
  });

  readonly hostname = computed(() => {
    const url = this.sourceUrl();
    if (!url) return '';
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  });

  readonly characterCount = computed(() => this.jobDescription.trim().length);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.sourceUrl.set(params.get('url') ?? '');
    this.templateId.set(params.get('template'));
  }

  build(): void {
    if (this.building()) {
      return;
    }

    const description = this.jobDescription.trim();

    if (description.length < MIN_DESCRIPTION_LENGTH) {
      this.message.set('Paste the full job description before building.');
      return;
    }

    const userId = this.auth.user()?.id;

    if (!userId) {
      this.message.set('Please sign in again before building.');
      return;
    }

    this.building.set(true);
    this.message.set(`Building ${this.template().title} from your description...`);

    this.resumeBuild
      .startBuildFromDescription(userId, description, this.template().id)
      .subscribe({
        next: ({ jobId }) => {
          void this.router.navigate(['/tailor/build', jobId]);
        },
        error: (error) => {
          this.building.set(false);
          this.message.set(
            error?.error?.error ?? 'Unable to build the resume right now.',
          );
          console.error('Resume build from description failed:', error);
        },
      });
  }
}
