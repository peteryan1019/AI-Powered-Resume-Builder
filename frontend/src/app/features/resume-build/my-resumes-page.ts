import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { AuthService } from '../auth/auth.service';
import { ResumeService, ResumeSummary } from '../../services/resume.service';

interface ResumeCard extends ResumeSummary {
  /** Sanitized PDF url used as the thumbnail iframe source. */
  thumbUrl: SafeResourceUrl;
  /** Raw PDF url used for the "open" link. */
  openUrl: string;
  /** Job-post title, falling back to the posting hostname. */
  displayTitle: string;
  hostname: string;
}

@Component({
  selector: 'app-my-resumes-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="resumes-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Your library</p>
          <h2 class="title">My resumes</h2>
        </div>
        <a class="primary-action" routerLink="/tailor">Build a new one</a>
      </header>

      <p class="state" *ngIf="loading()">Loading your resumes…</p>
      <p class="state error" *ngIf="errorMessage()">{{ errorMessage() }}</p>

      <div class="empty" *ngIf="!loading() && !errorMessage() && cards().length === 0">
        <p>You haven't generated any resumes yet.</p>
        <a class="primary-action" routerLink="/tailor">Tailor your first resume</a>
      </div>

      <div class="grid" *ngIf="cards().length > 0">
        <article class="card" *ngFor="let card of cards()">
          <a
            class="card-open"
            [href]="card.openUrl"
            target="_blank"
            rel="noopener"
          >
            <div class="thumb">
              <iframe
                [src]="card.thumbUrl"
                title="Resume preview"
                tabindex="-1"
                scrolling="no"
              ></iframe>

              <span class="thumb-overlay">Open</span>
            </div>

            <div class="card-meta">
              <strong class="card-title" [title]="card.displayTitle">
                {{ card.displayTitle }}
              </strong>

              <span class="card-host">
                {{ card.templateId | titlecase }} · {{ card.hostname }}
              </span>

              <span class="card-date">
                {{ card.createdAt | date: 'mediumDate' }}
              </span>
            </div>
          </a>

          <a
            class="edit-action"
            [routerLink]="[card.id, 'edit']"
            [attr.aria-label]="'Edit ' + card.displayTitle"
            title="Edit resume"
          >
            <span aria-hidden="true">✎</span>
          </a>

         <button
           type="button"
           class="delete-action"
           [attr.aria-label]="'Delete ' + card.displayTitle"
           title="Delete resume"
           (click)="deleteResume(card)"
         >
          <span aria-hidden="true">🗑</span>
         </button>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        --accent-1: #7a61ff;
        --accent-2: #4285f4;
        --ink: #f4f6ff;
      }
      .resumes-page {
        max-width: 68rem;
        margin: 0 auto;
        padding: 3rem 1.5rem;
        color: var(--ink);
      }
      .page-header {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        justify-content: space-between;
        align-items: flex-end;
        margin-bottom: 2rem;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.72rem;
        font-weight: 700;
        color: #b7a9ff;
        margin: 0 0 0.4rem;
      }
      .title {
        margin: 0;
        font-size: 1.7rem;
        font-weight: 700;
        color: var(--ink);
      }
      .primary-action {
        display: inline-flex;
        align-items: center;
        padding: 0.65rem 1.3rem;
        border-radius: 0.7rem;
        font-weight: 600;
        text-decoration: none;
        font-size: 0.9rem;
        background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
        color: #fff;
        box-shadow: 0 12px 28px -14px rgba(66, 133, 244, 0.8);
        transition:
          transform 0.16s ease,
          box-shadow 0.16s ease;
      }
      .primary-action:hover {
        transform: translateY(-1px);
        box-shadow: 0 16px 32px -14px rgba(66, 133, 244, 0.9);
      }

      .state {
        color: rgba(244, 246, 255, 0.6);
      }
      .state.error {
        color: #ff9d9d;
      }
      .empty {
        text-align: center;
        padding: 4rem 1rem;
        border: 1px dashed rgba(255, 255, 255, 0.14);
        border-radius: 1.25rem;
        background: rgba(255, 255, 255, 0.03);
      }
      .empty p {
        margin: 0 0 1.25rem;
        color: rgba(244, 246, 255, 0.7);
      }

      /* Two per row on mobile, three per row on desktop. */
      .grid {
        display: grid;
        gap: 1.5rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      @media (min-width: 720px) {
        .grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      .card {
        position: relative;
        display: flex;
        flex-direction: column;
        text-decoration: none;
        color: inherit;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
        overflow: hidden;
        background: rgba(13, 16, 39, 0.72);
        transition:
          transform 0.16s ease,
          box-shadow 0.16s ease,
          border-color 0.16s ease;
      }
      .card-open {
        display: flex;
        flex: 1;
        flex-direction: column;
        color: inherit;
        text-decoration: none;
      }
      .card:hover {
        transform: translateY(-3px);
        border-color: rgba(122, 97, 255, 0.5);
        box-shadow: 0 24px 60px -32px rgba(0, 0, 0, 0.85);
      }

      .thumb {
        position: relative;
        aspect-ratio: 8.5 / 11;
        background: #fff;
        overflow: hidden;
      }
      .thumb iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        pointer-events: none;
      }
      .thumb-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: #fff;
        background: rgba(10, 12, 34, 0.55);
        opacity: 0;
        transition: opacity 0.16s ease;
      }
      .card:hover .thumb-overlay {
        opacity: 1;
      }

      .card-meta {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.85rem 6.5rem 0.85rem 1rem;
      }
      .card-title {
        font-size: 0.98rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .card-host,
      .card-date {
        font-size: 0.78rem;
        color: rgba(244, 246, 255, 0.55);
      }
      .edit-action {
        position: absolute;
        right: 0.8rem;
        bottom: 0.8rem;
        z-index: 2;

        display: flex;
        align-items: center;
        justify-content: center;

        width: 2.25rem;
        height: 2.25rem;
        border: 1px solid rgba(122, 97, 255, 0.55);
        border-radius: 50%;

        color: #fff;
        background: linear-gradient(135deg, #7a61ff, #4285f4);
        text-decoration: none;
        font-size: 1.2rem;

        transition:
          transform 0.16s ease,
          box-shadow 0.16s ease;
      }

      .edit-action:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px -8px rgba(66, 133, 244, 0.9);
      }

      .delete-action {
        position: absolute;
        right: 3.55rem;
        bottom: 0.8rem;
        z-index: 2;

        display: flex;
        align-items: center;
        justify-content: center;

        width: 2.25rem;
        height: 2.25rem;
        padding: 0;
        border: 1px solid rgba(255, 105, 105, 0.6);
        border-radius: 50%;

        color: #fff;
        background: rgba(190, 50, 65, 0.85);
        font: inherit;
        cursor: pointer;

        transition:
          transform 0.16s ease,
          background 0.16s ease;
      }

      .delete-action:hover {
        transform: translateY(-2px);
        background: #d44758;
      }
    `,
  ],
})
export class MyResumesPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly resumeService = inject(ResumeService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  private readonly resumes = signal<ResumeSummary[]>([]);

  readonly cards = computed<ResumeCard[]>(() => {
    const userId = this.auth.user()?.id;
    if (!userId) return [];
    return this.resumes().map((r) => {
      // Suppress the pdf viewer chrome so the card reads as a clean thumbnail.
      const url = `${this.resumeService.getPdfUrl(userId, r.id)}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
      const hostname = this.safeHostname(r.URL);
      return {
        ...r,
        openUrl: this.resumeService.getPdfUrl(userId, r.id),
        thumbUrl: this.sanitizer.bypassSecurityTrustResourceUrl(url),
        displayTitle: r.title?.trim() || hostname,
        hostname,
      };
    });
  });

  ngOnInit(): void {
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.loading.set(false);
      this.errorMessage.set('Please sign in to view your resumes.');
      return;
    }

    this.resumeService.listResumes(userId).subscribe({
      next: ({ resumes }) => {
        this.resumes.set(resumes);
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.errorMessage.set(
          error?.error?.error ?? 'Unable to load your resumes right now.',
        );
      },
    });
  }

  deleteResume(card: ResumeCard): void {
    const userId = this.auth.user()?.id;

    if (!userId) {this.errorMessage.set('Please sign in to delete a resume.');
      return;
    }

    const confirmed = window.confirm(`Delete "${card.displayTitle}"? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    this.resumeService.deleteResume(userId, card.id).subscribe({next: () => 
      {
        this.resumes.update((resumes) => resumes.filter((resume) => resume.id !== card.id));
      },
      error: (error) => {this.errorMessage.set(error?.error?.error ??'Unable to delete this resume.');}
    });
  }

  private safeHostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}
