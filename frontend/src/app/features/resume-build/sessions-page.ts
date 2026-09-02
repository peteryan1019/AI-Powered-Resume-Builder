import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { BuildSession, ResumeBuildService } from './resume-build.service';

interface SessionCard {
  session: BuildSession;
  /** What state it is in, in the user's terms. */
  state: string;
  /** Whether the card is a link back into the build. */
  actionable: boolean;
  cls: string;
  detail: string;
}

/**
 * Every resume build this user has started.
 *
 * A build lives in Redis under its own id and nothing else, so closing the tab
 * used to lose it -- including a build paused waiting for feedback, which
 * cannot be restarted without abandoning the coaching rounds already spent on
 * it. This page is how those come back.
 */
@Component({
  selector: 'app-sessions-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="sessions-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Your workspace</p>
          <h2 class="title">Build sessions</h2>
        </div>
        <a class="primary-action" routerLink="/tailor">Build a new one</a>
      </header>

      <p class="state" *ngIf="loading()">Loading your sessions…</p>
      <p class="state error" *ngIf="errorMessage()">{{ errorMessage() }}</p>

      <div class="empty" *ngIf="!loading() && !errorMessage() && cards().length === 0">
        <p>No builds in the last three days.</p>
        <a class="primary-action" routerLink="/tailor">Tailor a resume</a>
      </div>

      <p class="waiting" *ngIf="waitingCount() > 0">
        {{ waitingCount() }}
        {{ waitingCount() === 1 ? 'build is' : 'builds are' }} waiting for your feedback.
      </p>

      <ul class="list" *ngIf="cards().length > 0">
        <li *ngFor="let card of cards()" [attr.class]="card.cls">
          <div class="row">
            <div class="what">
              <p class="job">{{ card.session.title ?? card.session.jobPost }}</p>
              <p class="meta">
                {{ card.state }} · {{ card.session.templateId }} ·
                {{ card.session.createdAt | date: 'MMM d, HH:mm' }}
              </p>
              <p class="detail" *ngIf="card.detail">{{ card.detail }}</p>
            </div>
            <a
              class="open"
              *ngIf="card.actionable"
              [routerLink]="['/tailor/build', card.session.buildId]"
            >
              {{ card.session.status === 'awaiting_feedback' ? 'Give feedback' : 'Open' }}
            </a>
            <a
              class="open quiet"
              *ngIf="card.session.status === 'done' && card.session.resumeId"
              [routerLink]="['/tailor/result', card.session.resumeId]"
            >
              View resume
            </a>
          </div>
        </li>
      </ul>

      <p class="footnote" *ngIf="cards().length > 0">
        Builds and their coaching history are kept for three days.
      </p>
    </section>
  `,
  styles: [
    `
      :host {
        --accent-1: #7a61ff;
        --accent-2: #4285f4;
        --ink: #f4f6ff;
      }
      .sessions-page {
        max-width: 56rem;
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
        margin-bottom: 1.75rem;
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
      }
      .primary-action {
        display: inline-flex;
        align-items: center;
        padding: 0.65rem 1.3rem;
        border-radius: 0.7rem;
        font-weight: 600;
        font-size: 0.9rem;
        text-decoration: none;
        color: #fff;
        background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
      }
      .state,
      .footnote {
        color: rgba(244, 246, 255, 0.5);
        font-size: 0.85rem;
      }
      .state.error {
        color: #ffb3bd;
      }
      .waiting {
        margin: 0 0 1rem;
        padding: 0.7rem 1rem;
        border-radius: 0.7rem;
        border: 1px solid rgba(139, 114, 255, 0.45);
        background: rgba(122, 97, 255, 0.12);
        font-size: 0.88rem;
        font-weight: 600;
      }
      .empty {
        padding: 2.5rem 1rem;
        text-align: center;
        border: 1px dashed rgba(255, 255, 255, 0.16);
        border-radius: 1rem;
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.7rem;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.15rem;
        border-radius: 0.85rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
      }
      /* A build wanting attention should read as such before anything is read. */
      li.needs-you .row {
        border-color: rgba(139, 114, 255, 0.55);
        background: rgba(122, 97, 255, 0.1);
      }
      li.failed .row {
        border-color: rgba(255, 96, 116, 0.4);
      }
      li.finished .row {
        opacity: 0.75;
      }
      .what {
        min-width: 0;
      }
      .job {
        margin: 0 0 0.25rem;
        font-weight: 700;
        font-size: 0.98rem;
      }
      .meta {
        margin: 0;
        font-size: 0.76rem;
        color: rgba(244, 246, 255, 0.5);
      }
      .detail {
        margin: 0.35rem 0 0;
        font-size: 0.8rem;
        color: rgba(244, 246, 255, 0.72);
      }
      .open {
        flex-shrink: 0;
        padding: 0.55rem 1.1rem;
        border-radius: 0.6rem;
        font-size: 0.85rem;
        font-weight: 600;
        text-decoration: none;
        color: #fff;
        background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
      }
      .open.quiet {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.22);
      }
      .footnote {
        margin-top: 1.5rem;
      }
      @media (max-width: 560px) {
        .row {
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class SessionsPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly resumeBuild = inject(ResumeBuildService);

  readonly sessions = signal<BuildSession[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly waitingCount = computed(
    () => this.sessions().filter((s) => s.status === 'awaiting_feedback').length,
  );

  readonly cards = computed<SessionCard[]>(() =>
    this.sessions().map((session) => {
      if (session.status === 'awaiting_feedback') {
        return {
          session,
          state: 'Waiting for your feedback',
          actionable: true,
          cls: 'needs-you',
          detail:
            session.round !== undefined
              ? `The coach scored round ${session.round} at ${session.score}/100.`
              : '',
        };
      }
      if (session.status === 'error') {
        return {
          session,
          state: 'Stopped',
          actionable: true,
          cls: 'failed',
          detail: session.errorMessage ?? '',
        };
      }
      if (session.status === 'done') {
        return { session, state: 'Finished', actionable: false, cls: 'finished', detail: '' };
      }
      return {
        session,
        state: this.RUNNING_LABELS[session.status] ?? 'Working',
        actionable: true,
        cls: 'running',
        detail: '',
      };
    }),
  );

  private readonly RUNNING_LABELS: Record<string, string> = {
    queued: 'Queued',
    generating: 'Writing the first draft',
    checking: 'The coach is reviewing it',
    revising: 'Applying your feedback',
    generating_pdf: 'Generating the PDF',
  };

  ngOnInit(): void {
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.loading.set(false);
      this.errorMessage.set('Please log in to see your build sessions.');
      return;
    }
    this.resumeBuild.getSessions(userId).subscribe({
      next: ({ sessions }) => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load your build sessions right now.');
      },
    });
  }
}
