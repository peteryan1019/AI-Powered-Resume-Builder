import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../features/auth/auth.service';
import { PaymentService } from '../features/payments/payment.service';

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})

export class Navbar implements OnInit {
  readonly auth = inject(AuthService);
  private readonly payment = inject(PaymentService);

  ngOnInit(): void {
    this.auth.loadSession().subscribe();
  }

  googleLogin(): void {
    this.auth.signInWithGoogle();
  }

  startCheckout(action: string, returnTo: string): void {
    this.payment.startCheckout(action, returnTo).subscribe();
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => {
        window.location.assign('/');
      }
    });
  }
}
