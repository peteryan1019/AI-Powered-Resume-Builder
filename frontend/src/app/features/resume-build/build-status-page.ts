import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService } from '../auth/auth.service';
import {
  CoachRecommendation,
  CoachReview,
  ProfileChangeInput,
  ProfileProposal,
  RecommendationDecision,
  ResumeBuildService,
  ResumeBuildStep,
  RunTraceEvent,
  WorkflowTopology,
  foldTrace,
} from './resume-build.service';
import { RunTraceComponent } from './run-trace.component';
import { InstanceFormComponent } from '../profile/components/instance-form.component';
import { SectionType } from '../profile/profile.types';

interface DisplayStep {
  states: ResumeBuildStep['state'][];
  short: string;
  label: string;
}

interface DecisionDraft {
  decision: 'accept' | 'reject' | null;
  /** Guidance when approving, the reason when rejecting. The profile agent
   *  reads this too, and may notice something worth adding to the profile. */
  specification: string;
}

function emptyDecision(): DecisionDraft {
  return { decision: null, specification: '' };
}

@Component({
  selector: 'app-build-status-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RunTraceComponent, InstanceFormComponent],
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

              <div class="user-reply" *ngIf="decisionFor(item.id).decision">
                <p class="speaker">Your reply</p>
                <label class="specification">
                  {{
                    decisionFor(item.id).decision === 'reject'
                      ? 'Why not? The coach reads this before its next review. (optional)'
                      : 'Anything the writer should know? (optional)'
                  }}
                  <textarea
                    rows="3"
                    maxlength="2000"
                    [(ngModel)]="decisionFor(item.id).specification"
                  ></textarea>
                </label>
              </div>
            </div>

            <div class="page-reply">
              <p class="speaker">Anything else</p>
              <label class="specification">
                Anything else you want changed? (optional)
                <textarea rows="3" maxlength="2000" [(ngModel)]="pageDraft.specification"></textarea>
              </label>
            </div>

            <p class="inline-error" *ngIf="feedbackError()">{{ feedbackError() }}</p>

            <p class="checking" *ngIf="checkingProfile()">
              Reading your notes against your profile…
            </p>

            <div class="proposal" *ngIf="currentProposal() as proposal">
              <p class="speaker">
                Before we continue
                <span *ngIf="proposals().length > 1"
                  >· {{ proposalIndex() + 1 }} of {{ proposals().length }}</span
                >
              </p>
              <p *ngIf="proposal.mode === 'create'">
                It looks like you mentioned {{ proposal.label }}, which isn't in your profile
                yet. Would you like to add it?
              </p>
              <p *ngIf="proposal.mode === 'update'">
                It looks like you said something about {{ proposal.label }} that isn't written
                into your profile yet. Would you like to add it there?
              </p>
              <blockquote>{{ proposal.quote }}</blockquote>
              <p class="hint left" *ngIf="proposal.missing.length && !openForm()">
                You didn't mention {{ describeMissing(proposal.missing) }} — the form will ask.
              </p>
              <div class="choice-row" *ngIf="!openForm()">
                <button type="button" (click)="acceptProposal()">
                  {{ proposal.mode === 'update' ? 'Yes, update my profile' : 'Yes, add it to my profile' }}
                </button>
                <button type="button" (click)="declineProposal(currentReview)">
                  No, skip this
                </button>
              </div>
              <app-instance-form
                *ngIf="openForm()"
                [sectionType]="currentSectionType()"
                [existingData]="formData()"
                [appendToDescription]="formAppend()"
                (formSubmitted)="proposalCompleted(currentReview, $event)"
                (formCancelled)="declineProposal(currentReview)"
              />
            </div>

            <div
              class="choice-row submit-row"
              *ngIf="!currentProposal() && !checkingProfile()"
            >
              <button
                class="submit"
                type="button"
                [disabled]="!canSubmitFeedback(currentReview) || submitting() || atRoundCap()"
                (click)="submitFeedback(currentReview, 'revise')"
              >
                {{ submitting() ? 'Sending…' : 'Revise with my input' }}
              </button>
              <button
                class="submit secondary"
                type="button"
                [disabled]="
                  !canSubmitFeedback(currentReview) ||
                  submitting() ||
                  hasPendingAccepts(currentReview)
                "
                (click)="submitFeedback(currentReview, 'finalize')"
              >
                Finalize this version
              </button>
            </div>
            <ng-container *ngIf="!currentProposal() && !checkingProfile()">
            <p class="hint" *ngIf="blockingReason(currentReview) as reason">{{ reason }}</p>
            <p class="hint" *ngIf="hasPendingAccepts(currentReview)">
              You approved a change that has not been applied yet, so finalizing now would drop it.
              Choose Revise, or set those back to Reject.
            </p>
            <p class="hint" *ngIf="atRoundCap()">
              This is the last coaching round, so this version is the one you finalize.
            </p>
            </ng-container>
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
      .page-reply {
        margin-top: 1.75rem;
        padding: 1.15rem;
        border-radius: 0.8rem;
        border: 1px dashed rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.03);
      }
      .submit-row {
        justify-content: center;
        gap: 0.75rem;
        margin-top: 1.25rem;
      }
      .submit-row .submit {
        margin: 0;
      }
      .submit.secondary {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.22);
      }
      .hint {
        margin: 0.7rem 0 0;
        text-align: center;
        font-size: 0.78rem;
        color: rgba(244, 246, 255, 0.5);
      }
      .hint.left {
        text-align: left;
      }
      .checking {
        margin: 1.5rem 0 0;
        text-align: center;
        font-size: 0.85rem;
        color: rgba(244, 246, 255, 0.55);
      }
      .proposal {
        margin-top: 1.75rem;
        padding: 1.25rem;
        border-radius: 0.9rem;
        border: 1px solid rgba(139, 114, 255, 0.45);
        background: rgba(122, 97, 255, 0.09);
      }
      .proposal .choice-row {
        margin-top: 1rem;
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
  /**
   * The review page's own note and project, not attached to any recommendation.
   * A passing draft comes back with zero recommendations, so without these the
   * page would offer nowhere at all to say what should change.
   */
  readonly pageDraft: DecisionDraft = emptyDecision();

  /** What the profile agent noticed, walked through one at a time. */
  readonly proposals = signal<ProfileProposal[]>([]);
  readonly proposalIndex = signal(0);
  readonly openForm = signal(false);
  readonly checkingProfile = signal(false);
  readonly confirmedChanges = signal<ProfileChangeInput[]>([]);
  private readonly pendingNextStep = signal<'revise' | 'finalize' | null>(null);

  readonly currentProposal = computed(
    () => this.proposals()[this.proposalIndex()] ?? null,
  );

  /**
   * What the profile form opens on. For an edit that is the entry's data exactly
   * as stored -- raw, so the form's own legacy-field folding runs and nothing
   * already written is lost. Non-description corrections are layered on top.
   */
  readonly formData = computed<Record<string, unknown> | null>(() => {
    const proposal = this.currentProposal();
    if (!proposal) return null;
    if (proposal.mode === 'create') return proposal.fields;
    const { description: _ignored, ...corrections } = proposal.fields;
    return { ...(proposal.current ?? {}), ...corrections };
  });

  /** The sentence the agent extracted, appended by the form after folding. */
  readonly formAppend = computed<string | null>(() => {
    const proposal = this.currentProposal();
    if (!proposal || proposal.mode !== 'update') return null;
    const text = proposal.fields['description'];
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  });
  /** The profile form is typed against its own SectionType union. */
  readonly currentSectionType = computed(
    () => (this.currentProposal()?.sectionType ?? 'PROJECTS') as SectionType,
  );

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


  /**
   * True on the final coaching round, when revising again is no longer offered.
   * The limit comes from the coach's own node_end report rather than a constant
   * duplicated here, so it cannot drift from MAX_COACH_ROUNDS on the server.
   */
  readonly atRoundCap = computed(() => {
    const review = this.review();
    if (!review) return false;
    const coachVisits = this.trace().filter((visit) => visit.node === 'coach');
    const maxRounds = coachVisits[coachVisits.length - 1]?.detail?.maxRounds;
    return maxRounds !== undefined && review.round >= maxRounds;
  });

  /** Finalizing renders the draft on screen, so a pending approval would be lost. */
  hasPendingAccepts(review: CoachReview): boolean {
    return review.recommendations.some(
      (item) => this.decisionFor(item.id).decision === 'accept',
    );
  }

  /**
   * Why both buttons are disabled, in the user's terms. Without this a required
   * answer several cards up leaves the page looking broken rather than blocked.
   */
  blockingReason(review: CoachReview): string | null {
    if (this.canSubmitFeedback(review)) return null;
    if (review.recommendations.some((item) => !this.decisionFor(item.id).decision)) {
      return 'Approve or reject every suggestion to continue.';
    }
    const needsAnswer = review.recommendations.filter((item) => {
      const draft = this.decisionFor(item.id);
      return (
        draft.decision === 'accept' &&
        item.requiresUserInput &&
        !draft.specification.trim()
      );
    });
    if (needsAnswer.length) {
      return `"${needsAnswer[0]!.title}" needs an answer before it can be applied.`;
    }
    return null;
  }

  canSubmitFeedback(review: CoachReview): boolean {
    return review.recommendations.every((item) => {
      const draft = this.decisionFor(item.id);
      if (!draft.decision) return false;
      if (draft.decision === 'reject' || !item.requiresUserInput) return true;
      // Only the user can answer this one, and words are the answer.
      return Boolean(draft.specification.trim());
    });
  }

  /**
   * Step one of submitting. Before anything is sent, the profile agent reads
   * what the user typed and says whether they described something their profile
   * does not list. If it finds nothing -- the common case -- this goes straight
   * through and they never know it ran.
   */
  submitFeedback(review: CoachReview, nextStep: 'revise' | 'finalize'): void {
    if (!this.userId || !this.jobId || !this.canSubmitFeedback(review)) return;
    this.feedbackError.set(null);
    this.pendingNextStep.set(nextStep);

    const notes = [
      ...review.recommendations.map((item) => ({
        about: item.title,
        text: this.decisionFor(item.id).specification.trim(),
      })),
      { about: 'the resume as a whole', text: this.pageDraft.specification.trim() },
    ].filter((note) => note.text);

    if (!notes.length) {
      this.sendDecisions(review);
      return;
    }

    this.checkingProfile.set(true);
    this.resumeBuild.getProfileProposals(this.userId, this.jobId, notes).subscribe({
      next: ({ changes }) => {
        this.checkingProfile.set(false);
        if (!changes.length) {
          this.sendDecisions(review);
          return;
        }
        this.proposals.set(changes);
        this.proposalIndex.set(0);
        this.openForm.set(false);
      },
      // A suggestion that fails must never block the submission it precedes.
      error: () => {
        this.checkingProfile.set(false);
        this.sendDecisions(review);
      },
    });
  }

  /** Field names are for the code; this is what the user reads. */
  private readonly FIELD_LABELS: Record<string, string> = {
    startDate: 'a start date',
    endDate: 'an end date',
    date: 'a date',
    url: 'a link',
    issuer: 'who issued it',
    company: 'the employer',
    school: 'the school',
    organization: 'the organisation',
    role: 'your role',
    description: 'what it involved',
    current: 'whether it is ongoing',
    gpa: 'a GPA',
    proficiency: 'your level',
  };

  describeMissing(missing: string[]): string {
    const words = missing.map((key) => this.FIELD_LABELS[key] ?? key);
    if (words.length === 1) return words[0]!;
    return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
  }

  /** "Yes, add it" -- open the profile's own form, pre-filled with what it read. */
  acceptProposal(): void {
    this.openForm.set(true);
  }

  /** "No, skip" -- move on without adding anything. */
  declineProposal(review: CoachReview): void {
    this.advanceProposal(review);
  }

  /** The profile form emits the finished entry; keep it and move on. */
  proposalCompleted(review: CoachReview, data: Record<string, unknown>): void {
    const proposal = this.currentProposal();
    if (proposal) {
      this.confirmedChanges.update((list) => [
        ...list,
        {
          mode: proposal.mode,
          sectionType: proposal.sectionType,
          ...(proposal.mode === 'update' && proposal.sourceId
            ? { sourceId: proposal.sourceId }
            : {}),
          label: proposal.label,
          data,
        },
      ]);
    }
    this.advanceProposal(review);
  }

  private advanceProposal(review: CoachReview): void {
    this.openForm.set(false);
    const next = this.proposalIndex() + 1;
    if (next < this.proposals().length) {
      this.proposalIndex.set(next);
      return;
    }
    this.proposals.set([]);
    this.sendDecisions(review);
  }

  /** Step two: the decisions, the note, and anything the user confirmed adding. */
  private sendDecisions(review: CoachReview): void {
    const nextStep = this.pendingNextStep();
    if (!this.userId || !this.jobId || !nextStep) return;
    const decisions: RecommendationDecision[] = review.recommendations.map((item) => {
      const draft = this.decisionFor(item.id);
      // A rejection carries the reason the user typed; the coach reads it next round.
      return {
        recommendationId: item.id,
        decision: draft.decision as 'accept' | 'reject',
        ...(draft.specification.trim() ? { specification: draft.specification.trim() } : {}),
      };
    });
    const changes = this.confirmedChanges();

    this.submitting.set(true);
    this.resumeBuild
      .submitDecisions(this.userId, this.jobId, review.reviewId, decisions, nextStep, {
        ...(this.pageDraft.specification.trim()
          ? { note: this.pageDraft.specification.trim() }
          : {}),
        ...(changes.length ? { profileChanges: changes } : {}),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.confirmedChanges.set([]);
          this.pendingNextStep.set(null);
          this.review.set(null);
          this.activeIndex.set(nextStep === 'finalize' ? 3 : 2);
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
