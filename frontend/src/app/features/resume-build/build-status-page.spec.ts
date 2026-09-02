import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { BuildStatusPage } from './build-status-page';
import { CoachReview, ProfileProposal } from './resume-build.service';

const USER = 'user-1';
const BUILD = 'build-1';
const PROPOSALS_URL = `/api/users/${USER}/resumes/${BUILD}/profile-proposals`;
const DECISIONS_URL = `/api/users/${USER}/resumes/${BUILD}/decisions`;

/** Two recommendations: one answerable freely, one that needs input. */
function review(): CoachReview {
  return {
    reviewId: 'rev-1',
    round: 1,
    overallScore: 88,
    passes: false,
    summary: 'Close.',
    criteria: [],
    recommendations: [
      {
        id: 'rec-a',
        title: 'Remove Java',
        rationale: 'No project uses it.',
        proposedChange: 'Delete Java from Technical Skills.',
        requiresUserInput: false,
        candidateSourceIds: [],
      },
      {
        id: 'rec-b',
        title: 'Address AI tooling',
        rationale: 'The posting asks for it.',
        proposedChange: 'Mention AI assistants if you used them.',
        requiresUserInput: true,
        candidateSourceIds: [],
      },
    ],
  };
}

const NEW_ENTRY: ProfileProposal = {
  mode: 'create',
  sectionType: 'PROJECTS',
  label: 'a project called PromptForge',
  quote: 'I built a tool called PromptForge',
  fields: { name: 'PromptForge', description: 'Generates prompt test suites.' },
  missing: ['startDate', 'endDate'],
};

/** The case where a claim was true but never written into the profile. */
const EDIT: ProfileProposal = {
  mode: 'update',
  sectionType: 'WORK_EXPERIENCE',
  sourceId: 'job-1',
  label: 'your Data Engineer role at Epoch Media Group',
  quote: 'I did actually use AI to streamline work there',
  // Only the sentence to add, never a rewrite.
  fields: { description: 'Used AI productivity tools to streamline work.' },
  // Legacy row: the content lives in bullets, not description.
  current: { company: 'Epoch Media Group', title: 'Data Engineer', bullets: ['Built ETL pipelines'] },
  missing: [],
};

describe('BuildStatusPage feedback', () => {
  let component: BuildStatusPage;
  let fixture: ComponentFixture<BuildStatusPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BuildStatusPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(BuildStatusPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    // ngOnInit would open an EventSource; set the identifiers directly instead.
    Object.assign(component as never, { userId: USER, jobId: BUILD });
  });

  afterEach(() => http.verify());

  /** Answers the agent call with `changes`, then returns the decisions body. */
  function flush(changes: ProfileProposal[] = []): Record<string, never> {
    http.expectOne(PROPOSALS_URL).flush({ changes });
    const req = http.expectOne(DECISIONS_URL);
    req.flush({ buildId: BUILD, status: 'queued' });
    return req.request.body;
  }

  it('sends a rejection with the reason the user typed', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';
    component.decisionFor('rec-a').specification = 'I do use Java, on the ledger service';
    component.decisionFor('rec-b').decision = 'reject';

    component.submitFeedback(r, 'revise');
    const body = flush() as never as {
      nextStep: string;
      decisions: Array<{ recommendationId: string; decision: string; specification?: string }>;
    };

    expect(body.nextStep).toBe('revise');
    const rejected = body.decisions.find((d) => d.recommendationId === 'rec-a')!;
    expect(rejected.decision).toBe('reject');
    // The whole point: this used to be discarded before it left the browser.
    expect(rejected.specification).toBe('I do use Java, on the ledger service');
  });

  it('never calls the agent when nothing was typed', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';
    component.decisionFor('rec-b').decision = 'reject';

    component.submitFeedback(r, 'finalize');
    // Straight to the submission: there is no text for an agent to read.
    http.expectNone(PROPOSALS_URL);
    const req = http.expectOne(DECISIONS_URL);
    req.flush({ buildId: BUILD, status: 'queued' });
    expect((req.request.body as { nextStep: string }).nextStep).toBe('finalize');
  });

  it('submits straight through when the agent finds nothing', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';
    component.decisionFor('rec-a').specification = 'Keep Java, I disagree.';
    component.decisionFor('rec-b').decision = 'reject';

    component.submitFeedback(r, 'revise');
    const body = flush([]) as never as { profileChanges?: unknown };
    expect(component.currentProposal()).toBeNull();
    expect(body.profileChanges).toBeUndefined();
  });

  it('asks about a proposal, and sends what the form returns', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';
    component.decisionFor('rec-a').specification = 'I built a tool called PromptForge';
    component.decisionFor('rec-b').decision = 'reject';

    component.submitFeedback(r, 'revise');
    http.expectOne(PROPOSALS_URL).flush({ changes: [NEW_ENTRY] });

    // Nothing is submitted yet: it is waiting on the user.
    http.expectNone(DECISIONS_URL);
    expect(component.currentProposal()?.label).toBe('a project called PromptForge');

    // "Yes" opens the profile form, pre-filled; the form emits the finished entry.
    component.acceptProposal();
    expect(component.openForm()).toBe(true);
    component.proposalCompleted(r, {
      name: 'PromptForge',
      description: 'Generates prompt test suites.',
      startDate: '2025-06',
    });

    const req = http.expectOne(DECISIONS_URL);
    req.flush({ buildId: BUILD, status: 'queued' });
    const body = req.request.body as {
      profileChanges: Array<{ mode: string; sectionType: string; data: Record<string, unknown> }>;
    };
    expect(body.profileChanges.length).toBe(1);
    expect(body.profileChanges[0]!.mode).toBe('create');
    expect(body.profileChanges[0]!.sectionType).toBe('PROJECTS');
    expect(body.profileChanges[0]!.data['startDate']).toBe('2025-06');
  });

  it('skips a proposal the user declines, and still submits', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';
    component.decisionFor('rec-a').specification = 'I built a tool called PromptForge';
    component.decisionFor('rec-b').decision = 'reject';

    component.submitFeedback(r, 'revise');
    http.expectOne(PROPOSALS_URL).flush({ changes: [NEW_ENTRY] });
    component.declineProposal(r);

    const req = http.expectOne(DECISIONS_URL);
    req.flush({ buildId: BUILD, status: 'queued' });
    expect((req.request.body as { profileChanges?: unknown }).profileChanges).toBeUndefined();
  });

  it('submits anyway when the agent call fails', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';
    component.decisionFor('rec-a').specification = 'Something worth reading';
    component.decisionFor('rec-b').decision = 'reject';

    component.submitFeedback(r, 'revise');
    // A suggestion that fails must never block the submission it precedes.
    http.expectOne(PROPOSALS_URL).flush('boom', { status: 503, statusText: 'unavailable' });
    const req = http.expectOne(DECISIONS_URL);
    req.flush({ buildId: BUILD, status: 'queued' });
    expect((req.request.body as { nextStep: string }).nextStep).toBe('revise');
  });

  it('offers to write a true-but-unwritten fact into the existing entry', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';
    component.decisionFor('rec-a').specification =
      "I did actually use AI to streamline work there, I just never added it";
    component.decisionFor('rec-b').decision = 'reject';

    component.submitFeedback(r, 'revise');
    http.expectOne(PROPOSALS_URL).flush({ changes: [EDIT] });

    expect(component.currentProposal()?.mode).toBe('update');
    // The form opens on the entry exactly as stored, so its own legacy-field
    // folding runs and the bullets are not lost.
    expect(component.formData()).toEqual({
      company: 'Epoch Media Group',
      title: 'Data Engineer',
      bullets: ['Built ETL pipelines'],
    });
    // The extracted sentence is appended by the form, not merged here.
    expect(component.formAppend()).toBe('Used AI productivity tools to streamline work.');

    component.acceptProposal();
    component.proposalCompleted(r, {
      company: 'Epoch Media Group',
      title: 'Data Engineer',
      description: 'Built ETL pipelines\n\nUsed AI productivity tools to streamline work.',
    });

    const req = http.expectOne(DECISIONS_URL);
    req.flush({ buildId: BUILD, status: 'queued' });
    const body = req.request.body as {
      profileChanges: Array<{ mode: string; sourceId: string; data: Record<string, unknown> }>;
    };
    expect(body.profileChanges[0]!.mode).toBe('update');
    expect(body.profileChanges[0]!.sourceId).toBe('job-1');
    expect(String(body.profileChanges[0]!.data['description'])).toContain('Built ETL pipelines');
  });

  it('never appends anything when creating a new entry', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';
    component.decisionFor('rec-a').specification = 'I built PromptForge';
    component.decisionFor('rec-b').decision = 'reject';

    component.submitFeedback(r, 'revise');
    http.expectOne(PROPOSALS_URL).flush({ changes: [NEW_ENTRY] });

    expect(component.formAppend()).toBeNull();
    expect(component.formData()).toEqual(NEW_ENTRY.fields);
    component.declineProposal(r);
    http.expectOne(DECISIONS_URL).flush({ buildId: BUILD, status: 'queued' });
  });

  it('sends the page-level note', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';
    component.decisionFor('rec-b').decision = 'reject';
    component.pageDraft.specification = 'Shorten the summary.';

    component.submitFeedback(r, 'revise');
    const body = flush() as never as { note: string };
    expect(body.note).toBe('Shorten the summary.');
  });

  it('describes missing fields in words, not field names', () => {
    expect(component.describeMissing(['startDate'])).toBe('a start date');
    expect(component.describeMissing(['startDate', 'endDate'])).toBe(
      'a start date or an end date',
    );
    expect(component.describeMissing(['issuer', 'url', 'date'])).toBe(
      'who issued it, a link or a date',
    );
  });

  it('blocks finalizing while an approval is still pending', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'accept';
    component.decisionFor('rec-b').decision = 'reject';
    // Finalizing renders the draft on screen, which would drop the approval.
    expect(component.hasPendingAccepts(r)).toBe(true);

    component.decisionFor('rec-a').decision = 'reject';
    expect(component.hasPendingAccepts(r)).toBe(false);
  });

  it('requires an answer only when the coach asked for one', () => {
    const r = review();
    component.decisionFor('rec-a').decision = 'reject';

    component.decisionFor('rec-b').decision = 'accept';
    expect(component.canSubmitFeedback(r)).toBe(false);
    expect(component.blockingReason(r)).toBe(
      '"Address AI tooling" needs an answer before it can be applied.',
    );

    component.decisionFor('rec-b').specification = 'Yes, I used Copilot throughout.';
    expect(component.canSubmitFeedback(r)).toBe(true);
    expect(component.blockingReason(r)).toBeNull();

    // Rejecting it never demands an answer.
    component.decisionFor('rec-b').decision = 'reject';
    component.decisionFor('rec-b').specification = '';
    expect(component.canSubmitFeedback(r)).toBe(true);
  });

  it('renders the reply box on a REJECT, with no project form in sight', async () => {
    await fixture.whenStable();
    Object.assign(component as never, { userId: USER, jobId: BUILD });
    component.review.set(review());
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.user-reply')).toBeNull();

    // Click the real button: the app is zoneless, so change detection is
    // scheduled by the template's own listener, not by calling choose().
    const [, rejectButton] = Array.from(
      el.querySelectorAll<HTMLButtonElement>('.recommendation .choice-row button'),
    );
    rejectButton.click();
    await fixture.whenStable();

    const reply = el.querySelector('.user-reply')!;
    expect(reply).not.toBeNull();
    expect(reply.textContent).toContain('Why not?');
    // The project form is gone: the text box is the only input, and the agent
    // decides whether a form is warranted.
    expect(el.querySelector('.project-form')).toBeNull();
    expect(reply.textContent).not.toContain('Add a new project to my profile');
    expect(el.querySelectorAll('.submit-row .submit').length).toBe(2);
  });
});
