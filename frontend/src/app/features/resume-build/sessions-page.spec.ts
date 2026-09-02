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

  it('asks the user to log in rather than calling the API', async () => {
    mount(null);
    await fixture.whenStable();
    // No request at all: there is no user to list sessions for.
    expect(component.errorMessage()).toBe('Please log in to see your build sessions.');
    expect(component.loading()).toBe(false);
  });
});
