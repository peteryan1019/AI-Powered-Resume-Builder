import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PaymentService } from '../features/payments/payment.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  private readonly payment = inject(PaymentService);

  startCheckout(action: string, returnTo: string): void {
    this.payment.startCheckout(action, returnTo).subscribe();
  }
}
