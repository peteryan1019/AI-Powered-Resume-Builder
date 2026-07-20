import { Routes } from '@angular/router';
import { ResumeTemplatesPage } from './resume-templates-page/resume-templates-page';
import { HomePage } from './home-page/home-page';
import { ProfileSetupComponent } from './features/profile/profile-setup.component';
import { TailorPage } from './tailor-page/tailor-page';
import { AuthPage } from './auth-page/auth-page';
import { authGuard } from './features/auth/auth.guard';
import { PaymentStartPage } from './features/payments/payment-start-page';
import { PaymentSuccessPage } from './features/payments/payment-success-page';
import { BuildStatusPage } from './features/resume-build/build-status-page';
import { BuildResultPage } from './features/resume-build/build-result-page';
import { MyResumesPage } from './features/resume-build/my-resumes-page';
import { paymentGuard } from './features/payments/payment.guard';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'login', component: AuthPage, data: { mode: 'login' } },
  { path: 'signup', component: AuthPage, data: { mode: 'signup' } },
  { path: 'payment/start', component: PaymentStartPage, canActivate: [authGuard] },
  { path: 'payment/success', component: PaymentSuccessPage, canActivate: [authGuard] },
  {
    path: 'profile',
    component: ProfileSetupComponent,
    canActivate: [authGuard, paymentGuard],
  },
  { path: 'tailor', component: TailorPage, canActivate: [authGuard, paymentGuard] },
  { path: 'tailor/build/:jobId', component: BuildStatusPage, canActivate: [authGuard, paymentGuard] },
  { path: 'tailor/result/:jobId', component: BuildResultPage, canActivate: [authGuard, paymentGuard] },
  { path: 'my-resumes', component: MyResumesPage, canActivate: [authGuard] },
  { path: 'resume-templates', component: ResumeTemplatesPage, canActivate: [authGuard, paymentGuard] },
  { path: '**', redirectTo: '' },
];
