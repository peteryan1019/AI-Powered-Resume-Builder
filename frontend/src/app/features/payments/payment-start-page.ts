import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PaymentService } from './payment.service';

@Component({
  selector: 'app-payment-start-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="payment-page">
      <h1>Preparing checkout</h1>
      <p>{{ statusMessage() }}</p>
    </section>
  `,
})
export class PaymentStartPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly payment = inject(PaymentService);

  readonly statusMessage = signal('Sending you to Stripe...');

  ngOnInit(): void {
    const action = this.safeCheckoutAction(
      this.route.snapshot.queryParamMap.get('checkoutAction') ?? this.route.snapshot.queryParamMap.get('action'),
    );
    const returnTo = this.safeReturnTo(this.route.snapshot.queryParamMap.get('returnTo'));

    if (!action) {
      void this.router.navigateByUrl(returnTo);
      return;
    }

    this.payment.startCheckout(action, returnTo).subscribe({
      error: (error) => {
        this.statusMessage.set(error?.error?.error ?? 'Unable to start checkout right now.');
      },
    });
  }

  private safeReturnTo(value: string | null): string {
    return value?.startsWith('/') && !value.startsWith('//') ? value : '/tailor';
  }

  private safeCheckoutAction(value: string | null): string | null {
    return value && /^[a-z0-9_:-]{1,80}$/i.test(value) ? value : null;
  }
}
