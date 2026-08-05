import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

import { AuthUser } from './auth.types';

const AUTH_API = '/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSignal = signal<AuthUser | null>(null);

  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);

  constructor(private http: HttpClient) {}

  loadSession(): Observable<AuthUser | null> {
    return this.http.get<{ user: AuthUser | null }>(`${AUTH_API}/me`, { withCredentials: true }).pipe(
      tap(({ user }) => this.userSignal.set(user)),
      map(({ user }) => user),
      catchError((error) => {
        this.userSignal.set(null);

        if (error?.status === 401) {
          return of(null);
        }

        return throwError(() => error);
      })
    );
  }

  signInWithGoogle(returnUrl?: string, checkoutAction?: string): void {
    const params = new URLSearchParams();

    if (returnUrl) {
      params.set('returnUrl', returnUrl);
    }

    if (checkoutAction) {
      params.set('checkoutAction', checkoutAction);
    }

    const query = params.toString();
    window.location.assign(`${AUTH_API}/google${query ? `?${query}` : ''}`);
  }

  // Passwordless local auth. Step 1: ask for a one-time code by email. Returns
  // the neutral confirmation message (never reveals whether the email exists).
  requestCode(email: string): Observable<string> {
    return this.http
      .post<{ message: string }>(`${AUTH_API}/local/request-code`, { email }, { withCredentials: true })
      .pipe(map(({ message }) => message));
  }

  // Step 2: verify the code. On success the session is established and the user
  // is returned (account is created on first successful verification).
  verifyCode(email: string, code: string): Observable<AuthUser> {
    return this.http
      .post<{ user: AuthUser }>(`${AUTH_API}/local/verify-code`, { email, code }, { withCredentials: true })
      .pipe(
        tap(({ user }) => this.userSignal.set(user)),
        map(({ user }) => user)
      );
  }

  logout(): Observable<void> {
    return this.http.post<{ message: string }>(`${AUTH_API}/logout`, {}, { withCredentials: true }).pipe(
      tap(() => this.userSignal.set(null)),
      map(() => void 0)
    );
  }
}
