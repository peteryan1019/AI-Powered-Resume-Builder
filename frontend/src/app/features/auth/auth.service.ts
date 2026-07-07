import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

import { AuthCredentials, AuthUser, SignupCredentials } from './auth.types';

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

  signInWithGoogle(): void {
    window.location.assign(`${AUTH_API}/google`);
  }

  signIn(credentials: AuthCredentials): Observable<AuthUser> {
    return this.http
      .post<{ user: AuthUser }>(`${AUTH_API}/local/login`, credentials, { withCredentials: true })
      .pipe(
        tap(({ user }) => this.userSignal.set(user)),
        map(({ user }) => user)
      );
  }

  signUp(credentials: SignupCredentials): Observable<AuthUser> {
    return this.http
      .post<{ user: AuthUser }>(`${AUTH_API}/local/signup`, credentials, { withCredentials: true })
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
