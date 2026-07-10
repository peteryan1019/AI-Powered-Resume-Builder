import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, from, map, tap, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  startCheckout(action: string, returnTo: string): Observable<void> {
    const safeReturnTo = this.safeReturnTo(returnTo);

    return this.http
      .post<{ url: string }>(
        '/api/payments/checkout',
        { action, returnTo: safeReturnTo },
        { withCredentials: true },
      )
      .pipe(
        tap(({ url }) => window.location.assign(url)),
        map(() => void 0),
        catchError((error) => {
          if (error?.status === 401) {
            return from(
              this.router.navigate(['/login'], {
                queryParams: { returnUrl: safeReturnTo, checkoutAction: action },
              }),
            ).pipe(map(() => void 0));
          }

          return throwError(() => error);
        }),
      );
  }

  status(sessionId: string) {
    return this.http.get<{ paid: boolean; returnTo: string }>(
      `/api/payments/status/${sessionId}`,
      { withCredentials: true },
    );
  }

  private safeReturnTo(returnTo: string): string {
    return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/tailor';
  }
}
