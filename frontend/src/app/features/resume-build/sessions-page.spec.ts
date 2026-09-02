import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SessionsPage } from './sessions-page';
import { AuthService } from '../auth/auth.service';
import { BuildSession } from './resume-build.service';

const USER = 'user-1';

function session(over: Partial<BuildSession>): BuildSession {
  return {
    buildId: 'b1',
    status: 'done',
    createdAt: '2026-09-02T10:00:00.000Z',
    templateId: 'signal',
    jobPost: 'jobright.ai',
    ...over,
  };
}

describe('SessionsPage', () => {
  let component: SessionsPage;
  let fixture: ComponentFixture<SessionsPage>;
  let http: HttpTestingController;

  function mount(user: { id: string } | null) {
    TestBed.configureTestingModule({
      imports: [SessionsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: () => user, isAuthenticated: () => Boolean(user) } },
      ],
    });
    fixture = TestBed.createComponent(SessionsPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http?.verify());

  it('surfaces the builds that are waiting on the user', async () => {
    mount({ id: USER });
    await fixture.whenStable();
    http.expectOne(`/api/users/${USER}/resumes/sessions`).flush({
      sessions: [
        session({ buildId: 'waiting', status: 'awaiting_feedback', round: 2, score: 71 }),
        session({ buildId: 'finished', status: 'done', title: 'Software Developer' }),
      ],
    });

    expect(component.waitingCount()).toBe(1);
    const [first, second] = component.cards();
    expect(first!.state).toBe('Waiting for your feedback');
    expect(first!.actionable).toBe(true);
    expect(first!.cls).toBe('needs-you');
    // The score is what tells the user whether it is worth going back in.
    expect(first!.detail).toBe('The coach scored round 2 at 71/100.');
    expect(second!.state).toBe('Finished');
    expect(second!.actionable).toBe(false);
  });

  it('shows why a stopped build stopped, and offers a way back in', async () => {
    mount({ id: USER });
    await fixture.whenStable();
    http.expectOne(`/api/users/${USER}/resumes/sessions`).flush({
      sessions: [
        session({ status: 'error', errorMessage: 'Unable to build the resume right now.' }),
      ],
    });
    const [card] = component.cards();
    expect(card!.state).toBe('Stopped');
    expect(card!.detail).toBe('Unable to build the resume right now.');
    expect(card!.actionable).toBe(true);
  });

  it('names each in-progress stage in the user\'s terms', async () => {
    mount({ id: USER });
    await fixture.whenStable();
    http.expectOne(`/api/users/${USER}/resumes/sessions`).flush({
      sessions: [
        session({ buildId: 'a', status: 'queued' }),
        session({ buildId: 'b', status: 'checking' }),
        session({ buildId: 'c', status: 'generating_pdf' }),
      ],
    });
    expect(component.cards().map((c) => c.state)).toEqual([
      'Queued',
      'The coach is reviewing it',
      'Generating the PDF',
    ]);
    expect(component.waitingCount()).toBe(0);
  });

  it('renders a row per session, with the waiting banner', async () => {
    mount({ id: USER });
    await fixture.whenStable();
    http.expectOne(`/api/users/${USER}/resumes/sessions`).flush({
      sessions: [
        session({ buildId: 'waiting', status: 'awaiting_feedback', round: 1, score: 88 }),
        session({ buildId: 'finished', status: 'done', resumeId: 'r1', title: 'Dev' }),
      ],
    });
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.list li').length).toBe(2);
    expect(el.querySelector('.waiting')!.textContent).toContain('1 build is waiting');
    expect(el.querySelector('li.needs-you')).not.toBeNull();
    expect(el.textContent).toContain('Give feedback');
    expect(el.textContent).toContain('View resume');
  });

  it('asks before deleting, and says what survives', async () => {
    mount({ id: USER });
    await fixture.whenStable();
    http.expectOne(`/api/users/${USER}/resumes/sessions`).flush({
      sessions: [
        session({ buildId: 'paused', status: 'awaiting_feedback', round: 1, score: 88 }),
        session({ buildId: 'finished', status: 'done', resumeId: 'r1', title: 'Dev' }),
      ],
    });
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    // Nothing is asked for until the user asks for it.
    expect(el.querySelector('.confirm')).toBeNull();
    el.querySelectorAll<HTMLButtonElement>('.delete')[1]!.click();
    await fixture.whenStable();

    // A finished build's resume is not part of the session, and the copy says so.
    expect(el.querySelector('.confirm')!.textContent).toContain(
      'The resume it produced stays in My resumes',
    );
    // Only the row being confirmed shows it.
    expect(el.querySelectorAll('.confirm').length).toBe(1);
    // And no request has gone out yet.
    http.expectNone(`/api/users/${USER}/resumes/finished/session`);
  });

  it('warns that coaching history is lost for a build still in progress', async () => {
    mount({ id: USER });
    await fixture.whenStable();
    http.expectOne(`/api/users/${USER}/resumes/sessions`).flush({
      sessions: [session({ buildId: 'paused', status: 'awaiting_feedback', round: 2, score: 71 })],
    });
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    el.querySelector<HTMLButtonElement>('.delete')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.confirm')!.textContent).toContain('cannot be undone');
  });

  it('deletes only on confirmation, and drops the row', async () => {
    mount({ id: USER });
    await fixture.whenStable();
    http.expectOne(`/api/users/${USER}/resumes/sessions`).flush({
      sessions: [
        session({ buildId: 'keep-me', status: 'done', resumeId: 'r1', title: 'Kept' }),
        session({ buildId: 'bin-me', status: 'error', errorMessage: 'broke' }),
      ],
    });

    component.askDelete('bin-me');
    component.confirmDelete('bin-me');
    const req = http.expectOne(`/api/users/${USER}/resumes/bin-me/session`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ deleted: true });

    expect(component.sessions().map((s) => s.buildId)).toEqual(['keep-me']);
    expect(component.confirming()).toBeNull();
    expect(component.deleting()).toBeNull();
  });

  it('sends nothing when the user backs out', async () => {
    mount({ id: USER });
    await fixture.whenStable();
    http.expectOne(`/api/users/${USER}/resumes/sessions`).flush({
      sessions: [session({ buildId: 'b1' })],
    });

    component.askDelete('b1');
    component.cancelDelete();
    expect(component.confirming()).toBeNull();
    // http.verify() in afterEach fails if a DELETE went out.
    expect(component.sessions().length).toBe(1);
  });

  it('keeps the row and explains when the delete fails', async () => {
    mount({ id: USER });
    await fixture.whenStable();
    http.expectOne(`/api/users/${USER}/resumes/sessions`).flush({
      sessions: [session({ buildId: 'b1' })],
    });

    component.askDelete('b1');
    component.confirmDelete('b1');
    http
      .expectOne(`/api/users/${USER}/resumes/b1/session`)
      .flush('nope', { status: 500, statusText: 'error' });

    expect(component.sessions().length).toBe(1);
    expect(component.errorMessage()).toBe('Unable to delete that session right now.');
    expect(component.deleting()).toBeNull();
  });

  it('asks the user to log in rather than calling the API', async () => {
    mount(null);
    await fixture.whenStable();
    // No request at all: there is no user to list sessions for.
    expect(component.errorMessage()).toBe('Please log in to see your build sessions.');
    expect(component.loading()).toBe(false);
  });
});
