import { Routes } from '@angular/router';
import { ProfileSetupComponent } from './features/profile/profile-setup.component';

export const routes: Routes = [
  { path: '', redirectTo: 'profile', pathMatch: 'full' },
  { path: 'profile', component: ProfileSetupComponent },
];
