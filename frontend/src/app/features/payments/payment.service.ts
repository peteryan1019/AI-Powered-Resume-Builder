import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, from, map, of, switchMap, throwError } from 'rxjs';

type SubscriptionResponse = {
  active: boolean;
  status: string;
};

type CheckoutResponse = {
  url?: string;
  alreadyPaid?: boolean;
  returnTo?: string;
};

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  startCheckout(action: string, returnTo: string): Observable<void> {
    const safeReturnTo = this.safeReturnTo(returnTo);

    return this.subscription().pipe(
      switchMap(({ active }) => {
        if (active) {
          return from(this.router.navigateByUrl(safeReturnTo)).pipe(map(() => void 0));
        }

        return this.createCheckout(action, safeReturnTo);
      }),
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

  subscription(): Observable<SubscriptionResponse> {
    return this.http.get<SubscriptionResponse>('/api/users/me/subscription', {
      withCredentials: true,
    });
  }

  status(sessionId: string): Observable<{ paid: boolean; returnTo: string }> {
    return this.http.get<{ paid: boolean; returnTo: string }>(
      `/api/payments/status/${sessionId}`,
      { withCredentials: true },
    );
  }

  private createCheckout(action: string, returnTo: string): Observable<void> {
    return this.http
      .post<CheckoutResponse>(
        '/api/payments/checkout',
        { action, returnTo },
        { withCredentials: true },
      )
      .pipe(
        switchMap((response) => {
          if (response.alreadyPaid) {
            return from(
              this.router.navigateByUrl(this.safeReturnTo(response.returnTo ?? returnTo)),
            ).pipe(map(() => void 0));
          }

          if (!response.url) {
            return throwError(() => new Error('Checkout did not return a Stripe URL.'));
          }

          window.location.assign(response.url);
          return of(void 0);
        }),
      );
  }

  private safeReturnTo(returnTo: string): string {
    return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/tailor';
  }
}