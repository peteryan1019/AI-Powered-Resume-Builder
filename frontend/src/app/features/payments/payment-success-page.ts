import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PaymentService } from './payment.service';

@Component({
  selector: 'app-payment-success-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="payment-page">
      <h1>Confirming payment</h1>
      <p>{{ statusMessage() }}</p>
    </section>
  `,
})
export class PaymentSuccessPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly payment = inject(PaymentService);

  readonly statusMessage = signal('Checking your Stripe payment...');

  ngOnInit(): void {
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');

    if (!sessionId) {
      this.statusMessage.set('Missing Stripe checkout session.');
      return;
    }

    this.checkPayment(sessionId, 0);
  }

  private checkPayment(sessionId: string, attempt: number): void {
    this.payment.status(sessionId).subscribe({
      next: ({ paid, returnTo }) => {
        if (paid) {
          void this.router.navigateByUrl(this.safeReturnTo(returnTo));
          return;
        }

        if (attempt < 5) {
          window.setTimeout(() => this.checkPayment(sessionId, attempt + 1), 1200);
          return;
        }

        this.statusMessage.set('Stripe has not confirmed the payment yet. Refresh this page in a moment.');
      },
      error: (error) => {
        this.statusMessage.set(error?.error?.error ?? 'Unable to confirm the payment right now.');
      },
    });
  }

  private safeReturnTo(value: string): string {
    return value.startsWith('/') && !value.startsWith('//') ? value : '/tailor';
  }
}
