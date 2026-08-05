import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../features/auth/auth.service';
import { PaymentService } from '../features/payments/payment.service';

type Phase = 'email' | 'code';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
  host: { '(document:keydown.escape)': 'close()' },
})
export class AuthPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly payment = inject(PaymentService);

  readonly auth = inject(AuthService);
  readonly returnUrl = this.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  readonly checkoutAction = this.safeCheckoutAction(this.route.snapshot.queryParamMap.get('checkoutAction'));
  readonly isSubmitting = signal(false);
  readonly statusMessage = signal<string | null>(this.getInitialStatusMessage());
  // Distinguishes a real error (red) from a neutral/positive notice (e.g. "code sent").
  readonly statusKind = signal<'info' | 'error'>(this.statusMessage() ? 'error' : 'info');

  // Two-step passwordless flow: enter email, then the code we email back.
  readonly phase = signal<Phase>('email');
  readonly sentToEmail = signal<string>('');

  readonly emailForm = this.fb.nonNullable.group({
    email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
  });
  readonly codeForm = this.fb.nonNullable.group({
    code: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(/^\d{6}$/)]),
  });

  readonly title = computed(() => (this.phase() === 'email' ? 'Sign in to Tailr' : 'Enter your code'));
  readonly copy = computed(() =>
    this.phase() === 'email'
      ? 'Use your email to get a one-time sign-in code, or continue with Google — no password needed.'
      : `We emailed a 6-digit code to ${this.sentToEmail()}. It expires in 10 minutes.`,
  );

  readonly switchQueryParams = computed(() => ({
    returnUrl: this.returnUrl,
    ...(this.checkoutAction ? { checkoutAction: this.checkoutAction } : {}),
  }));

  submitEmail(): void {
    if (this.emailForm.invalid || this.isSubmitting()) {
      this.emailForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.statusMessage.set(null);
    const email = this.emailForm.getRawValue().email.trim();

    this.auth.requestCode(email).subscribe({
      next: (message) => {
        this.isSubmitting.set(false);
        this.sentToEmail.set(email);
        this.phase.set('code');
        this.statusKind.set('info');
        this.statusMessage.set(message ?? 'Check your email for a sign-in code.');
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.statusKind.set('error');
        this.statusMessage.set(error?.error?.error ?? 'Unable to send a code right now.');
      },
    });
  }

  submitCode(): void {
    if (this.codeForm.invalid || this.isSubmitting()) {
      this.codeForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.statusMessage.set(null);
    const code = this.codeForm.getRawValue().code.trim();

    this.auth.verifyCode(this.sentToEmail(), code).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.continueAfterAuth();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.statusKind.set('error');
        this.statusMessage.set(error?.error?.error ?? 'That code was not accepted.');
      },
    });
  }

  useDifferentEmail(): void {
    this.phase.set('email');
    this.codeForm.reset();
    this.statusKind.set('info');
    this.statusMessage.set(null);
  }

  googleLogin(): void {
    this.auth.signInWithGoogle(this.returnUrl, this.checkoutAction ?? undefined);
  }

  // Dismiss the modal. Go to the public home page — NOT returnUrl, which is
  // usually a guarded route (e.g. /profile) that would bounce a logged-out user
  // straight back to login with a 401.
  close(): void {
    void this.router.navigateByUrl('/');
  }

  // Close only when the backdrop itself is clicked, not the card inside it.
  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  private continueAfterAuth(): void {
    if (this.checkoutAction) {
      this.payment.startCheckout(this.checkoutAction, this.returnUrl).subscribe({
        error: (error) => {
          this.statusMessage.set(error?.error?.error ?? 'Unable to start checkout right now.');
        },
      });
      return;
    }

    void this.router.navigateByUrl(this.returnUrl);
  }

  private getInitialStatusMessage(): string | null {
    const queryError = this.route.snapshot.queryParamMap.get('error');

    if (queryError === 'oauth') {
      return 'Google sign in failed. Try again or use a one-time email code.';
    }

    return null;
  }

  private safeReturnUrl(value: string | null): string {
    return value?.startsWith('/') && !value.startsWith('//') ? value : '/home';
  }

  private safeCheckoutAction(value: string | null): string | null {
    return value && /^[a-z0-9_:-]{1,80}$/i.test(value) ? value : null;
  }
}
