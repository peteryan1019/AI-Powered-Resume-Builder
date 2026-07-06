import { Routes } from '@angular/router';
import { ResumeTemplatesPage } from './resume-templates-page/resume-templates-page';
import { HomePage } from './home-page/home-page';
import { ProfileSetupComponent } from './features/profile/profile-setup.component';
import { TailorPage } from './tailor-page/tailor-page';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'profile', component: ProfileSetupComponent },
  { path: 'resume-templates', component: ResumeTemplatesPage },
  { path: '**', redirectTo: '' }
];
