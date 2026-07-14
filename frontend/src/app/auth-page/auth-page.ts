import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../features/auth/auth.service';
import { PaymentService } from '../features/payments/payment.service';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
})
export class AuthPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly payment = inject(PaymentService);

  readonly auth = inject(AuthService);
  readonly isSignup = this.route.snapshot.data['mode'] === 'signup';
  readonly returnUrl = this.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  readonly checkoutAction = this.safeCheckoutAction(this.route.snapshot.queryParamMap.get('checkoutAction'));
  readonly isSubmitting = signal(false);
  readonly statusMessage = signal<string | null>(this.getInitialStatusMessage());

  readonly form = this.fb.nonNullable.group({
    name: this.fb.nonNullable.control(
      this.isSignup ? '' : '',
      this.isSignup ? [Validators.required, Validators.minLength(2)] : [],
    ),
    email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    password: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]),
  });

  readonly title = computed(() => (this.isSignup ? 'Create your Tailr account' : 'Welcome back'));
  readonly copy = computed(() =>
    this.isSignup
      ? 'Create an email/password account for the regular flow, or use Google when you want a one-click sign in.'
      : 'Use the regular sign in flow to keep your session separate from Google. You can still use Google if that is faster.',
  );
  readonly submitLabel = computed(() => (this.isSignup ? 'Create account' : 'Sign in'));
  readonly switchLabel = computed(() =>
    this.isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up',
  );
  readonly switchRoute = computed(() => (this.isSignup ? '/login' : '/signup'));
  readonly switchQueryParams = computed(() => ({
    returnUrl: this.returnUrl,
    ...(this.checkoutAction ? { checkoutAction: this.checkoutAction } : {}),
  }));

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.statusMessage.set(null);

    const payload = this.form.getRawValue();
    const request$ = this.isSignup
      ? this.auth.signUp({
          name: payload.name,
          email: payload.email,
          password: payload.password,
        })
      : this.auth.signIn({
          email: payload.email,
          password: payload.password,
        });

    request$.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.continueAfterAuth();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.statusMessage.set(error?.error?.error ?? 'Unable to authenticate right now.');
      },
    });
  }

  googleLogin(): void {
    this.auth.signInWithGoogle(this.returnUrl, this.checkoutAction ?? undefined);
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
      return 'Google sign in failed. Try again or use the regular email/password flow.';
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
