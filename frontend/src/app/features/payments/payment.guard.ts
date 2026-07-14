import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { PaymentService } from './payment.service';

export const paymentGuard: CanActivateFn = (_route, state) => {
  const payment = inject(PaymentService);
  const router = inject(Router);

  return payment.subscription().pipe(
    map(({ active }) => {
      if (active) return true;

      return router.createUrlTree(['/payment/start'], {
        queryParams: {
          returnTo: state.url,
          checkoutAction: 'route_access',
        },
      });
    }),
    catchError(() =>
      of(
        router.createUrlTree(['/login'], {
          queryParams: { returnUrl: state.url },
        }),
      ),
    ),
  );
};