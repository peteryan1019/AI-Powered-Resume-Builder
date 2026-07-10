import { Routes } from '@angular/router';
import { ResumeTemplatesPage } from './resume-templates-page/resume-templates-page';
import { HomePage } from './home-page/home-page';
import { ProfileSetupComponent } from './features/profile/profile-setup.component';
import { TailorPage } from './tailor-page/tailor-page';
import { AuthPage } from './auth-page/auth-page';
import { authGuard } from './features/auth/auth.guard';
import { PaymentStartPage } from './features/payments/payment-start-page';
import { PaymentSuccessPage } from './features/payments/payment-success-page';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'login', component: AuthPage, data: { mode: 'login' } },
  { path: 'signup', component: AuthPage, data: { mode: 'signup' } },
  { path: 'payment/start', component: PaymentStartPage, canActivate: [authGuard] },
  { path: 'payment/success', component: PaymentSuccessPage, canActivate: [authGuard] },
  { path: 'profile', component: ProfileSetupComponent, canActivate: [authGuard] },
  { path: 'tailor', component: TailorPage, canActivate: [authGuard] },
  { path: 'resume-templates', component: ResumeTemplatesPage, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
