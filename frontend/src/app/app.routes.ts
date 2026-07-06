import { Routes } from '@angular/router';
import { ResumeTemplatesPage } from './resume-templates-page/resume-templates-page';
import { HomePage } from './home-page/home-page';
import { ProfilePage } from './profile-page/profile-page';
import { TailorPage } from './tailor-page/tailor-page';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'resume-templates', component: ResumeTemplatesPage },
  { path: '**', redirectTo: '' }
];