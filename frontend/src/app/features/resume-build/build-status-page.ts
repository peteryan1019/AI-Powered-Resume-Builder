import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { ResumeBuildService, ResumeBuildStep } from './resume-build.service';

interface DisplayStep {
  state: ResumeBuildStep['state'];
  short: string;
  label: string;
}

@Component({
  selector: 'app-build-status-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="fsa-page">
      <div class="fsa-panel">
        <p class="eyebrow">Building your resume</p>
        <h2 class="headline">{{ headline() }}</h2>
        <p class="sub" *ngIf="!errorMessage()">Watch it move through each stage.</p>

        <div class="automaton">
          <ng-container *ngFor="let step of displaySteps; let i = index; let last = last">
            <div
              class="node"
              [class.active]="i === activeIndex() && !completed()"
              [class.done]="i < activeIndex() || completed()"
            >
              <span class="node-text">{{ step.short }}</span>
              <span class="pulse-ring" *ngIf="i === activeIndex() && !completed()"></span>
              <span class="check-badge" *ngIf="i < activeIndex() || completed()">✓</span>
            </div>

            <div
              class="arrow"
              *ngIf="!last"
              [class.lit]="completed() || activeIndex() > i"
              [class.flow]="!completed() && activeIndex() === i"
            >
              <span class="arrow-line"></span>
              <span class="arrow-head"></span>
            </div>
          </ng-container>
        </div>

        <p class="error" *ngIf="errorMessage()">{{ errorMessage() }}</p>

        <div class="error-actions" *ngIf="errorMessage()">
          <button
            type="button"
            class="primary-action"
            *ngIf="canRegenerate()"
            [disabled]="retrying()"
            (click)="regenerate()"
          >
            {{ retrying() ? 'Regenerating...' : 'Regenerate resume' }}
          </button>
          <a class="secondary-action" routerLink="/tailor">Back to tailor</a>
        </div>
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
      .fsa-page {
        display: flex;
        justify-content: center;
        padding: 5rem 1.5rem;
      }
      .fsa-panel {
        width: 100%;
        max-width: 46rem;
        text-align: center;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 1.5rem;
        padding: 3rem 2rem 3.25rem;
        backdrop-filter: blur(14px);
        box-shadow: 0 30px 80px -42px rgba(0, 0, 0, 0.85);
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.72rem;
        font-weight: 700;
        color: #b7a9ff;
        margin: 0 0 0.6rem;
      }
      .headline {
        margin: 0;
        font-size: 1.85rem;
        font-weight: 700;
        color: var(--ink);
      }
      .sub {
        margin: 0.5rem 0 0;
        color: rgba(244, 246, 255, 0.55);
      }

      .automaton {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: 2.75rem;
      }

      .node {
        position: relative;
        width: 104px;
        height: 104px;
        flex: 0 0 auto;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.04);
        border: 2px solid rgba(255, 255, 255, 0.16);
        color: rgba(244, 246, 255, 0.55);
        transition:
          color 0.45s ease,
          border-color 0.45s ease,
          background 0.45s ease,
          box-shadow 0.45s ease;
        backdrop-filter: blur(6px);
      }
      .node-text {
        font-weight: 700;
        font-size: 0.95rem;
        letter-spacing: 0.01em;
      }

      .node.active {
        color: #fff;
        border-color: transparent;
        background: radial-gradient(
          circle at 30% 28%,
          rgba(122, 97, 255, 0.42),
          rgba(66, 133, 244, 0.14)
        );
        box-shadow:
          0 0 0 2px rgba(122, 97, 255, 0.75),
          0 0 36px rgba(122, 97, 255, 0.55),
          inset 0 0 24px rgba(122, 97, 255, 0.22);
      }
      .pulse-ring {
        position: absolute;
        inset: -7px;
        border-radius: 50%;
        border: 2px solid rgba(122, 97, 255, 0.6);
        animation: pulse 1.7s ease-out infinite;
      }
      @keyframes pulse {
        0% {
          transform: scale(0.9);
          opacity: 0.8;
        }
        70% {
          transform: scale(1.28);
          opacity: 0;
        }
        100% {
          opacity: 0;
        }
      }

      .node.done {
        color: #fff;
        border-color: transparent;
        background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
        box-shadow: 0 0 26px rgba(66, 133, 244, 0.45);
      }
      .check-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        font-weight: 700;
        color: #8affc1;
        background: #0a0c23;
        border: 1px solid rgba(138, 255, 193, 0.55);
      }

      .arrow {
        position: relative;
        display: flex;
        align-items: center;
        width: 58px;
        height: 20px;
        flex: 0 0 auto;
      }
      .arrow-line {
        flex: 1;
        height: 2px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.18);
        transition: background 0.4s ease;
      }
      .arrow-head {
        width: 0;
        height: 0;
        margin-left: -1px;
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
        border-left: 9px solid rgba(255, 255, 255, 0.18);
        transition: border-left-color 0.4s ease;
      }
      .arrow.lit .arrow-line {
        background: linear-gradient(90deg, var(--accent-1), var(--accent-2));
      }
      .arrow.lit .arrow-head {
        border-left-color: var(--accent-2);
      }
      .arrow.flow .arrow-line {
        background: linear-gradient(
          90deg,
          rgba(122, 97, 255, 0.15),
          var(--accent-1),
          rgba(66, 133, 244, 0.15)
        );
        background-size: 200% 100%;
        animation: flow 1.1s linear infinite;
      }
      .arrow.flow .arrow-head {
        border-left-color: var(--accent-1);
      }
      @keyframes flow {
        0% {
          background-position: 100% 0;
        }
        100% {
          background-position: -100% 0;
        }
      }

      .error {
        margin: 2rem 0 0;
        color: #ff9d9d;
      }
      .error-actions {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 1.25rem;
      }
      .primary-action,
      .secondary-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.5rem;
        padding: 0.65rem 1.25rem;
        border-radius: 0.5rem;
        border: 0;
        font: inherit;
        font-size: 0.9rem;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
        transition:
          transform 0.16s ease,
          box-shadow 0.16s ease,
          background 0.16s ease;
      }
      .primary-action {
        background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
        color: #fff;
        box-shadow: 0 12px 28px -14px rgba(66, 133, 244, 0.8);
      }
      .primary-action:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 16px 32px -14px rgba(66, 133, 244, 0.9);
      }
      .primary-action:disabled {
        cursor: wait;
        opacity: 0.66;
      }
      .secondary-action {
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(255, 255, 255, 0.06);
        color: var(--ink);
      }
      .secondary-action:hover {
        background: rgba(255, 255, 255, 0.12);
      }

      @media (max-width: 620px) {
        .automaton {
          flex-direction: column;
        }
        .node {
          width: 92px;
          height: 92px;
        }
        .arrow {
          transform: rotate(90deg);
          width: 44px;
          margin: 10px 0;
        }
      }
    `,
  ],
})
export class BuildStatusPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly resumeBuild = inject(ResumeBuildService);

  readonly displaySteps: DisplayStep[] = [
    { state: 'generating', short: 'Generate', label: 'Generating resume' },
    { state: 'checking', short: 'Check', label: 'Checking content' },
    { state: 'generating_pdf', short: 'PDF', label: 'Generating PDF' },
    { state: 'done', short: 'Done', label: 'Done' },
  ];

  readonly activeIndex = signal(0);
  readonly completed = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly canRegenerate = signal(false);
  readonly retrying = signal(false);

  // Set when the stream ended by sending us elsewhere (the posting could not be
  // read), so the stream's closing `error` event is not reported as a failure.
  private readonly leaving = signal(false);

  readonly headline = computed(() =>
    this.errorMessage()
      ? 'Resume build stopped'
      : this.completed()
        ? 'All set!'
        : this.displaySteps[this.activeIndex()].label,
  );

  private source?: EventSource;
  private jobId: string | null = null;
  private userId: string | null = null;

  ngOnInit(): void {
    this.jobId = this.route.snapshot.paramMap.get('jobId');
    this.userId = this.auth.user()?.id ?? null;

    if (!this.jobId || !this.userId) {
      this.errorMessage.set('Missing build details. Please start again from the tailor page.');
      return;
    }

    this.openEventStream(this.userId, this.jobId);
  }

  ngOnDestroy(): void {
    this.source?.close();
  }

  regenerate(): void {
    if (!this.userId || !this.jobId || this.retrying()) {
      return;
    }

    const userId = this.userId;
    const currentJobId = this.jobId;
    this.retrying.set(true);
    this.resumeBuild.retryBuild(userId, currentJobId).subscribe({
      next: ({ jobId }) => {
        this.source?.close();
        this.jobId = jobId;
        this.activeIndex.set(0);
        this.completed.set(false);
        this.errorMessage.set(null);
        this.canRegenerate.set(false);
        this.retrying.set(false);
        this.openEventStream(userId, jobId);
        void this.router.navigate(['/tailor/build', jobId], {
          replaceUrl: true,
        });
      },
      error: (error) => {
        this.retrying.set(false);
        this.errorMessage.set(
          error?.error?.error ?? 'Unable to regenerate the resume right now.',
        );
      },
    });
  }

  private openEventStream(userId: string, jobId: string): void {
    this.source = new EventSource(this.resumeBuild.eventsUrl(userId, jobId), {
      withCredentials: true,
    });

    this.source.addEventListener('state', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as ResumeBuildStep;
      const index = this.displaySteps.findIndex((step) => step.state === data.state);
      if (index >= 0) {
        this.activeIndex.set(index);
      }
    });

    this.source.addEventListener('complete', (event) => {
      const { resumeId } = JSON.parse((event as MessageEvent).data) as {
        resumeId: string;
      };
      this.completed.set(true);
      this.source?.close();
      void this.router.navigate(['/tailor/result', resumeId]);
    });

    // The generating AI saw none of the posting's content. Nothing to retry with
    // this URL — collect the description from the user and build from that.
    this.source.addEventListener('job_post_unreadable', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        url?: string;
        templateId?: string;
      };
      this.leaving.set(true);
      this.source?.close();
      void this.router.navigate(['/tailor/describe'], {
        queryParams: {
          ...(data.url ? { url: data.url } : {}),
          ...(data.templateId ? { template: data.templateId } : {}),
        },
      });
    });

    this.source.addEventListener('build_error', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        canRegenerate?: boolean;
        message?: string;
      };
      this.errorMessage.set(
        data.message ?? 'Unable to build the resume right now.',
      );
      this.canRegenerate.set(data.canRegenerate === true);
      this.source?.close();
    });

    this.source.addEventListener('error', () => {
      // A clean server close also surfaces as `error`; only report if we never
      // finished and are not already navigating away.
      if (!this.completed() && !this.errorMessage() && !this.leaving()) {
        this.errorMessage.set('Lost connection while building your resume. Please try again.');
        this.canRegenerate.set(false);
        this.source?.close();
      }
    });
  }
}
