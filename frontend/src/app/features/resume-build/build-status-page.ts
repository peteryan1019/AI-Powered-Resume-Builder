import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService } from '../auth/auth.service';
import {
  CoachRecommendation,
  CoachReview,
  RecommendationDecision,
  ResumeBuildService,
  ResumeBuildStep,
  RunTraceEvent,
  WorkflowTopology,
  foldTrace,
} from './resume-build.service';
import { RunTraceComponent } from './run-trace.component';

interface DisplayStep {
  states: ResumeBuildStep['state'][];
  short: string;
  label: string;
}

interface DecisionDraft {
  decision: 'accept' | 'reject' | null;
  specification: string;
  projectMode: 'none' | 'existing' | 'new';
  existingProjectSourceId: string;
  newProject: {
    name: string;
    description: string;
    url: string;
    startDate: string;
    endDate: string;
    current: boolean;
  };
}

function emptyDecision(): DecisionDraft {
  return {
    decision: null,
    specification: '',
    projectMode: 'none',
    existingProjectSourceId: '',
    newProject: { name: '', description: '', url: '', startDate: '', endDate: '', current: false },
  };
}

@Component({
  selector: 'app-build-status-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RunTraceComponent],
  template: `
    <section class="build-page">
      <div class="panel">
        <p class="eyebrow">Resume workspace</p>
        <h1>{{ headline() }}</h1>

        <ng-container *ngIf="!review(); else coachDialogue">
          <p class="sub" *ngIf="!errorMessage()">
            You can leave this page. The worker will keep going.
          </p>
          <app-run-trace
            [topology]="topology()"
            [visits]="trace()"
            [errored]="!!errorMessage()"
            [completed]="completed()"
            [unavailable]="graphError()"
          />
        </ng-container>

        <ng-template #coachDialogue>
          <section class="coach" *ngIf="review() as currentReview">
            <div class="coach-intro">
              <div class="score" [class.high]="currentReview.overallScore > 80">
                <strong>{{ currentReview.overallScore }}</strong
                ><span>/100</span>
              </div>
              <div>
                <p class="speaker">AI coach · review {{ currentReview.round }}</p>
                <p>{{ currentReview.summary }}</p>
              </div>
            </div>

            <figure class="draft-preview" *ngIf="draftUrl() as src">
              <figcaption>
                <span>The draft being reviewed · round {{ currentReview.round }}</span>
                <a [href]="rawDraftUrl()" target="_blank" rel="noopener">Open full size</a>
              </figcaption>
              <iframe [src]="src" title="Current resume draft"></iframe>
            </figure>

            <details class="rubric">
              <summary>See score breakdown</summary>
              <div class="criterion" *ngFor="let criterion of currentReview.criteria">
                <div>
                  <strong>{{ criterion.label }}</strong
                  ><span>{{ criterion.score }}/{{ criterion.maxScore }}</span>
                </div>
                <p>{{ criterion.explanation }}</p>
              </div>
            </details>

            <div
              class="recommendation"
              *ngFor="let item of currentReview.recommendations; let i = index"
            >
              <p class="speaker">Coach suggestion {{ i + 1 }}</p>
              <h2>{{ item.title }}</h2>
              <p>{{ item.rationale }}</p>
              <blockquote>{{ item.proposedChange }}</blockquote>

              <div class="choice-row">
                <button
                  type="button"
                  [class.selected]="decisionFor(item.id).decision === 'accept'"
                  (click)="choose(item.id, 'accept')"
                >
                  Approve
                </button>
                <button
                  type="button"
                  [class.selected]="decisionFor(item.id).decision === 'reject'"
                  (click)="choose(item.id, 'reject')"
                >
                  Reject
                </button>
              </div>

              <div class="user-reply" *ngIf="decisionFor(item.id).decision === 'accept'">
                <p class="speaker">Your reply</p>
                <ng-container *ngIf="item.category === 'PROJECT_SELECTION'">
                  <label class="radio" *ngIf="currentReview.projectCandidates.length">
                    <input
                      type="radio"
                      [name]="'project-mode-' + item.id"
                      value="existing"
                      [(ngModel)]="decisionFor(item.id).projectMode"
                    />
                    Use a project already in my profile
                  </label>
                  <select
                    *ngIf="decisionFor(item.id).projectMode === 'existing'"
                    [(ngModel)]="decisionFor(item.id).existingProjectSourceId"
                  >
                    <option value="">Choose a project</option>
                    <option
                      *ngFor="let project of projectOptions(item, currentReview)"
                      [value]="project.sourceId"
                    >
                      {{ project.title }}
                    </option>
                  </select>
                  <label class="radio">
                    <input
                      type="radio"
                      [name]="'project-mode-' + item.id"
                      value="new"
                      [(ngModel)]="decisionFor(item.id).projectMode"
                    />
                    Add a new project to my profile
                  </label>
                  <div class="project-form" *ngIf="decisionFor(item.id).projectMode === 'new'">
                    <label
                      >Project name<input [(ngModel)]="decisionFor(item.id).newProject.name"
                    /></label>
                    <label class="wide"
                      >Project details<textarea
                        rows="4"
                        [(ngModel)]="decisionFor(item.id).newProject.description"
                        placeholder="What it does, your contribution, technologies, and verified results"
                      ></textarea>
                    </label>
                    <label class="wide"
                      >Project URL (optional)<input
                        type="url"
                        [(ngModel)]="decisionFor(item.id).newProject.url"
                    /></label>
                    <label
                      >Start date<input
                        placeholder="YYYY-MM"
                        [(ngModel)]="decisionFor(item.id).newProject.startDate"
                    /></label>
                    <label
                      >End date<input
                        placeholder="YYYY-MM"
                        [disabled]="decisionFor(item.id).newProject.current"
                        [(ngModel)]="decisionFor(item.id).newProject.endDate"
                    /></label>
                    <label class="radio wide"
                      ><input
                        type="checkbox"
                        [(ngModel)]="decisionFor(item.id).newProject.current"
                      />
                      Ongoing project</label
                    >
                  </div>
                </ng-container>
                <label class="specification">
                  Anything the writer should know? (optional)
                  <textarea
                    rows="3"
                    maxlength="2000"
                    [(ngModel)]="decisionFor(item.id).specification"
                  ></textarea>
                </label>
              </div>
            </div>

            <p class="inline-error" *ngIf="feedbackError()">{{ feedbackError() }}</p>
            <button
              class="submit"
              type="button"
              [disabled]="!canSubmitFeedback(currentReview) || submitting()"
              (click)="submitFeedback(currentReview)"
            >
              {{ submitting() ? 'Sending to the writer…' : 'Continue with my decisions' }}
            </button>
          </section>
        </ng-template>

        <p class="error" *ngIf="errorMessage()">{{ errorMessage() }}</p>
        <div class="error-actions" *ngIf="errorMessage()">
          <button
            class="submit"
            type="button"
            *ngIf="canRegenerate()"
            [disabled]="retrying()"
            (click)="regenerate()"
          >
            {{ retrying() ? 'Regenerating…' : 'Regenerate resume' }}
          </button>
          <a routerLink="/tailor">Back to tailor</a>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        color: #f4f6ff;
      }
      .build-page {
        display: flex;
        justify-content: center;
        padding: 4rem 1.25rem;
      }
      .panel {
        width: min(100%, 54rem);
        padding: 2.5rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1.5rem;
        background: rgba(255, 255, 255, 0.045);
        box-shadow: 0 30px 80px -42px #000;
      }
      .eyebrow,
      .speaker {
        margin: 0 0 0.45rem;
        color: #b7a9ff;
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.13em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(1.6rem, 4vw, 2.25rem);
      }
      .sub {
        color: rgba(244, 246, 255, 0.58);
      }
      .coach {
        margin-top: 2rem;
      }
      .draft-preview {
        margin: 1.5rem 0;
      }
      .draft-preview figcaption {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.5rem;
        font-size: 0.78rem;
        font-weight: 700;
        color: rgba(244, 246, 255, 0.5);
      }
      .draft-preview figcaption a {
        color: #b7a9ff;
        font-weight: 600;
      }
      .draft-preview iframe {
        display: block;
        width: 100%;
        height: min(70vh, 860px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 0.75rem;
        background: rgba(255, 255, 255, 0.04);
      }
      .coach-intro {
        display: flex;
        gap: 1rem;
        align-items: center;
        padding: 1.25rem;
        border-radius: 1rem;
        background: rgba(122, 97, 255, 0.1);
      }
      .coach-intro p {
        margin: 0.2rem 0 0;
        line-height: 1.55;
      }
      .score {
        flex: 0 0 5rem;
        display: grid;
        place-items: center;
        align-content: center;
        width: 5rem;
        height: 5rem;
        border-radius: 50%;
        border: 3px solid #ffb15c;
      }
      .score.high {
        border-color: #76e6aa;
      }
      .score strong {
        font-size: 1.5rem;
        line-height: 1;
      }
      .score span {
        font-size: 0.7rem;
        opacity: 0.65;
      }
      .rubric {
        margin: 1rem 0 1.5rem;
        padding: 1rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 0.75rem;
      }
      .rubric summary {
        cursor: pointer;
        font-weight: 700;
      }
      .criterion {
        margin-top: 1rem;
      }
      .criterion div {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
      }
      .criterion p {
        margin: 0.25rem 0;
        color: rgba(244, 246, 255, 0.65);
        font-size: 0.9rem;
      }
      .recommendation {
        margin: 1rem 0;
        padding: 1.25rem;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 1rem;
        background: rgba(5, 8, 28, 0.42);
        text-align: left;
      }
      .recommendation h2 {
        margin: 0.2rem 0 0.55rem;
        font-size: 1.15rem;
      }
      .recommendation > p:not(.speaker) {
        color: rgba(244, 246, 255, 0.72);
        line-height: 1.5;
      }
      blockquote {
        margin: 1rem 0;
        padding: 0.8rem 1rem;
        border-left: 3px solid #7a61ff;
        background: rgba(122, 97, 255, 0.08);
      }
      .choice-row {
        display: flex;
        gap: 0.65rem;
      }
      button,
      a {
        border-radius: 0.55rem;
        font: inherit;
        font-weight: 750;
      }
      .choice-row button {
        padding: 0.55rem 1.2rem;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        background: rgba(255, 255, 255, 0.06);
        cursor: pointer;
      }
      .choice-row button.selected {
        border-color: #8b72ff;
        background: rgba(122, 97, 255, 0.28);
      }
      .user-reply {
        margin-top: 1rem;
        padding: 1rem;
        border-radius: 0.8rem;
        background: rgba(255, 255, 255, 0.05);
      }
      label {
        display: grid;
        gap: 0.35rem;
        color: rgba(244, 246, 255, 0.8);
        font-size: 0.88rem;
      }
      .radio {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0.65rem 0;
      }
      input,
      select,
      textarea {
        box-sizing: border-box;
        width: 100%;
        padding: 0.65rem 0.7rem;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 0.45rem;
        color: #fff;
        background: #11152d;
        font: inherit;
      }
      input[type='radio'],
      input[type='checkbox'] {
        width: auto;
      }
      .project-form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        margin: 0.8rem 0;
      }
      .wide {
        grid-column: 1/-1;
      }
      .specification {
        margin-top: 1rem;
      }
      .submit {
        display: block;
        margin: 1.25rem auto 0;
        padding: 0.75rem 1.35rem;
        border: 0;
        color: #fff;
        background: linear-gradient(135deg, #7a61ff, #4285f4);
        cursor: pointer;
      }
      .submit:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .inline-error,
      .error {
        color: #ffabab;
        text-align: center;
      }
      .error-actions {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 1rem;
      }
      .error-actions a {
        color: #ddd6ff;
      }
      @media (max-width: 650px) {
        .panel {
          padding: 1.5rem 1rem;
        }
        .project-form {
          grid-template-columns: 1fr;
        }
        .wide {
          grid-column: auto;
        }
        .coach-intro {
          align-items: flex-start;
        }
        .score {
          flex-basis: 4rem;
          width: 4rem;
          height: 4rem;
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
  private readonly sanitizer = inject(DomSanitizer);

  readonly displaySteps: DisplayStep[] = [
    { states: ['queued', 'generating'], short: 'Draft', label: 'Generating your first draft' },
    { states: ['checking'], short: 'Coach', label: 'The AI coach is reviewing it' },
    { states: ['revising'], short: 'Revise', label: 'Applying your approved feedback' },
    { states: ['generating_pdf'], short: 'PDF', label: 'Generating the final PDF' },
    { states: ['done'], short: 'Done', label: 'All set' },
  ];
  readonly activeIndex = signal(0);
  // False while the job sits in the BullMQ queue with no worker consuming
  // it. Without this the page claims "Generating your first draft" for a
  // build that nothing has picked up.
  readonly started = signal(false);

  /** The graph's real shape, fetched from the backend's compiled LangGraph. */
  readonly topology = signal<WorkflowTopology | null>(null);
  readonly graphError = signal<string | null>(null);
  /** The paused draft, rendered on demand so you can see what you are grading. */
  readonly draftUrl = signal<SafeResourceUrl | null>(null);
  readonly rawDraftUrl = signal<string>('');
  /** Raw trace events in arrival order; RunTraceComponent draws the fold. */
  readonly traceEvents = signal<RunTraceEvent[]>([]);
  readonly trace = computed(() => foldTrace(this.traceEvents()));
  readonly completed = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly canRegenerate = signal(false);
  readonly retrying = signal(false);
  readonly review = signal<CoachReview | null>(null);
  readonly feedbackError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly headline = computed(() =>
    this.errorMessage()
      ? 'Resume build stopped'
      : this.review()
        ? 'Your coach has feedback'
        : this.completed()
          ? 'All set!'
          : !this.started()
            ? 'Waiting in the queue…'
            : (this.displaySteps[this.activeIndex()]?.label ??
              'Building your resume'),
  );

  private source?: EventSource;
  private jobId: string | null = null;
  private userId: string | null = null;
  private eventCursor = '';
  private leaving = false;
  private decisions = new Map<string, DecisionDraft>();

  ngOnInit(): void {
    this.jobId = this.route.snapshot.paramMap.get('jobId');
    this.userId = this.auth.user()?.id ?? null;
    if (!this.jobId || !this.userId) {
      this.errorMessage.set('Missing build details. Please start again from the tailor page.');
      return;
    }
    const draftUrl = this.resumeBuild.draftPdfUrl(this.userId, this.jobId);
    this.rawDraftUrl.set(draftUrl);
    this.draftUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(draftUrl));

    this.resumeBuild.getWorkflowGraph(this.userId).subscribe({
      next: (topology) => this.topology.set(topology),
      error: () =>
        this.graphError.set('The workflow diagram is unavailable right now.'),
    });
    this.openEventStream();
  }

  ngOnDestroy(): void {
    this.source?.close();
  }

  decisionFor(id: string): DecisionDraft {
    let value = this.decisions.get(id);
    if (!value) {
      value = emptyDecision();
      this.decisions.set(id, value);
    }
    return value;
  }

  choose(id: string, decision: 'accept' | 'reject'): void {
    this.decisionFor(id).decision = decision;
    this.feedbackError.set(null);
  }

  projectOptions(item: CoachRecommendation, review: CoachReview) {
    const preferred = new Set(item.candidateSourceIds);
    return [...review.projectCandidates].sort(
      (a, b) => Number(preferred.has(b.sourceId)) - Number(preferred.has(a.sourceId)),
    );
  }

  canSubmitFeedback(review: CoachReview): boolean {
    return review.recommendations.every((item) => {
      const draft = this.decisionFor(item.id);
      if (!draft.decision) return false;
      if (draft.decision === 'reject' || item.category !== 'PROJECT_SELECTION') return true;
      if (draft.projectMode === 'existing') return Boolean(draft.existingProjectSourceId);
      if (draft.projectMode === 'new')
        return Boolean(draft.newProject.name.trim() && draft.newProject.description.trim());
      return !item.requiresUserInput;
    });
  }

  submitFeedback(review: CoachReview): void {
    if (!this.userId || !this.jobId || !this.canSubmitFeedback(review)) return;
    const decisions: RecommendationDecision[] = review.recommendations.map((item) => {
      const draft = this.decisionFor(item.id);
      if (draft.decision === 'reject') return { recommendationId: item.id, decision: 'reject' };
      const base: RecommendationDecision = {
        recommendationId: item.id,
        decision: 'accept',
        ...(draft.specification.trim() ? { specification: draft.specification.trim() } : {}),
      };
      if (item.category === 'PROJECT_SELECTION' && draft.projectMode === 'existing') {
        base.existingProjectSourceId = draft.existingProjectSourceId;
      }
      if (item.category === 'PROJECT_SELECTION' && draft.projectMode === 'new') {
        base.newProject = {
          name: draft.newProject.name.trim(),
          description: draft.newProject.description.trim(),
          ...(draft.newProject.url.trim() ? { url: draft.newProject.url.trim() } : {}),
          ...(draft.newProject.startDate.trim()
            ? { startDate: draft.newProject.startDate.trim() }
            : {}),
          ...(draft.newProject.endDate.trim() && !draft.newProject.current
            ? { endDate: draft.newProject.endDate.trim() }
            : {}),
          current: draft.newProject.current,
        };
      }
      return base;
    });

    this.submitting.set(true);
    this.feedbackError.set(null);
    this.resumeBuild
      .submitDecisions(this.userId, this.jobId, review.reviewId, decisions)
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.review.set(null);
          this.activeIndex.set(2);
          this.started.set(false);
          this.openEventStream();
        },
        error: (error) => {
          this.submitting.set(false);
          this.feedbackError.set(
            error?.error?.error ?? 'Unable to submit your feedback right now.',
          );
        },
      });
  }

  regenerate(): void {
    if (!this.userId || !this.jobId || this.retrying()) return;
    this.retrying.set(true);
    this.resumeBuild.retryBuild(this.userId, this.jobId).subscribe({
      next: ({ jobId }) => {
        this.source?.close();
        this.jobId = jobId;
        this.eventCursor = '';
        this.activeIndex.set(0);
        this.started.set(false);
        this.traceEvents.set([]);
        this.completed.set(false);
        this.errorMessage.set(null);
        this.canRegenerate.set(false);
        this.retrying.set(false);
        this.openEventStream();
        void this.router.navigate(['/tailor/build', jobId], { replaceUrl: true });
      },
      error: (error) => {
        this.retrying.set(false);
        this.errorMessage.set(error?.error?.error ?? 'Unable to regenerate right now.');
      },
    });
  }

  private openEventStream(): void {
    if (!this.userId || !this.jobId) return;
    this.source?.close();
    this.source = new EventSource(
      this.resumeBuild.eventsUrl(this.userId, this.jobId, this.eventCursor),
      { withCredentials: true },
    );
    this.source.addEventListener('state', (event) => {
      this.rememberEvent(event);
      const data = JSON.parse((event as MessageEvent).data) as ResumeBuildStep;
      if (data.state !== 'queued') this.started.set(true);
      const index = this.displaySteps.findIndex((step) => step.states.includes(data.state));
      if (index >= 0) this.activeIndex.set(index);
    });
    this.source.addEventListener('node_start', (event) => {
      this.rememberEvent(event);
      this.started.set(true);
      this.traceEvents.update((events) => [
        ...events,
        { type: 'node_start', data: JSON.parse((event as MessageEvent).data) },
      ]);
    });
    this.source.addEventListener('node_end', (event) => {
      this.rememberEvent(event);
      this.traceEvents.update((events) => [
        ...events,
        { type: 'node_end', data: JSON.parse((event as MessageEvent).data) },
      ]);
    });
    this.source.addEventListener('review_ready', (event) => {
      this.rememberEvent(event);
      this.source?.close();
      this.loadReview();
    });
    this.source.addEventListener('complete', (event) => {
      this.rememberEvent(event);
      const data = JSON.parse((event as MessageEvent).data) as { resumeId: string };
      this.completed.set(true);
      this.source?.close();
      void this.router.navigate(['/tailor/result', data.resumeId]);
    });
    this.source.addEventListener('job_post_unreadable', (event) => {
      this.rememberEvent(event);
      const data = JSON.parse((event as MessageEvent).data) as {
        url?: string;
        templateId?: string;
      };
      this.leaving = true;
      this.source?.close();
      void this.router.navigate(['/tailor/describe'], {
        queryParams: {
          ...(data.url ? { url: data.url } : {}),
          ...(data.templateId ? { template: data.templateId } : {}),
        },
      });
    });
    this.source.addEventListener('build_error', (event) => {
      this.rememberEvent(event);
      const data = JSON.parse((event as MessageEvent).data) as {
        message?: string;
        canRegenerate?: boolean;
      };
      this.errorMessage.set(data.message ?? 'Unable to build the resume right now.');
      this.canRegenerate.set(data.canRegenerate === true);
      this.source?.close();
    });
    this.source.addEventListener('error', () => {
      if (!this.completed() && !this.review() && !this.errorMessage() && !this.leaving) {
        this.errorMessage.set(
          'Lost the live progress connection. The worker may still be running; reload this page to reconnect.',
        );
        this.source?.close();
      }
    });
  }

  private rememberEvent(event: Event): void {
    const id = (event as MessageEvent).lastEventId;
    if (id) this.eventCursor = id;
  }

  private loadReview(): void {
    if (!this.userId || !this.jobId) return;
    this.resumeBuild.getReview(this.userId, this.jobId).subscribe({
      next: ({ review }) => {
        this.decisions.clear();
        this.review.set(review);
        this.feedbackError.set(null);
      },
      error: (error) => {
        this.errorMessage.set(error?.error?.error ?? 'Unable to load the coach feedback.');
      },
    });
  }
}
