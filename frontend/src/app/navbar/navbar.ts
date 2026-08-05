import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../features/auth/auth.service';
import { PaymentService } from '../features/payments/payment.service';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar implements OnInit {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly payment = inject(PaymentService);

  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.normalizePath(event.urlAfterRedirects)),
    ),
    {
      initialValue: this.normalizePath(this.router.url),
    },
  );

  ngOnInit(): void {
    this.auth.loadSession().subscribe();
  }

  isRouteActive(path: string, includeChildren = false): boolean {
    const currentPath = this.currentPath();

    return includeChildren
      ? currentPath === path || currentPath.startsWith(`${path}/`)
      : currentPath === path;
  }

  private normalizePath(url: string): string {
    return url.split('?')[0].split('#')[0];
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
      },
    });
  }
}
