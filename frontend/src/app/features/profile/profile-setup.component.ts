// frontend/src/app/features/profile/profile-setup.component.ts

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ProfileService } from './profile.service';
import { AuthService } from '../auth/auth.service';
import { Profile, SectionType, SECTION_CONFIG } from './profile.types';
import { BasicInfoFormComponent } from './components/basic-info-form.component';
import { SectionCardComponent } from './components/section-card.component';


@Component({
  selector: 'app-profile-setup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DragDropModule,
    BasicInfoFormComponent,
    SectionCardComponent,
  ],
  template: `
    <div class="profile-layout">

      <!-- Sidebar -->
      <nav class="profile-sidebar">
        <p class="sidebar-label">Sections</p>
        <button
          *ngFor="let section of profile()?.sections"
          class="nav-section-item"
          (click)="scrollToSection(section.id)"
        >
          <span>
            <i class="ti {{ sectionConfig[section.type].icon }}"></i>
            {{ sectionConfig[section.type].label }}
          </span>
          <span class="count">{{ section.instances.length }}</span>
        </button>

        <hr class="nav-divider" />

        <button class="nav-item add-section" *ngIf="!showAddSectionForm()" (click)="openAddSectionModal()">
          <i class="ti ti-plus"></i> Add section
        </button>

        <div class="add-section-form" *ngIf="showAddSectionForm()">
          <label>
            Section type
            <select [(ngModel)]="newSectionType">
              <option *ngFor="let type of sectionTypes" [value]="type">{{ sectionConfig[type].label }}</option>
            </select>
          </label>
          <p class="add-section-error" *ngIf="addSectionError()">{{ addSectionError() }}</p>
          <div class="add-section-form-actions">
            <button class="btn-secondary" (click)="cancelAddSectionForm()">Cancel</button>
            <button class="btn-primary" (click)="confirmAddSection()">Add</button>
          </div>
        </div>
      </nav>

      <!-- Main content -->
      <div class="profile-main">
        <div class="page-header">
          <h1>Your profile</h1>
          <p>This is the source of truth for all your resumes. Keep it complete for best AI results.</p>
        </div>

        <!-- Basic info form -->
        <app-basic-info-form
          *ngIf="profile() !== undefined"
          [profile]="profile()"
          [user]="user()"
          [saveStatus]="basicInfoSaveStatus()"
          (saved)="onBasicInfoSaved($event)"
        />

        <!-- Section cards (drag to reorder) -->
        <div class="section-list" cdkDropList (cdkDropListDropped)="onSectionDrop($event)">
          <div
            class="section-drag-item"
            *ngFor="let section of profile()?.sections"
            cdkDrag
            [id]="'section-' + section.id"
          >
            <button class="drag-handle" cdkDragHandle type="button" title="Drag to reorder">
              <i class="ti ti-grip-vertical"></i>
            </button>
            <app-section-card
              class="section-drag-card"
              [section]="section"
              (instanceAdded)="onInstanceAdded(section.id, $event)"
              (instanceUpdated)="onInstanceUpdated(section.id, $event.id, $event.data)"
              (instanceDeleted)="onInstanceDeleted(section.id, $event)"
              (sectionDeleted)="onSectionDeleted(section.id)"
            />
          </div>
        </div>

        <!-- Empty state -->
        <div *ngIf="profile()?.sections?.length === 0" class="empty-sections">
          <i class="ti ti-layout-list"></i>
          <p>No sections yet. Add your work experience, education, and skills.</p>
          <button class="btn-primary" (click)="openAddSectionModal()">
            <i class="ti ti-plus"></i> Add first section
          </button>
        </div>
      </div>

      <!-- Before login: cover the page so nothing can be filled in;
           clicking anywhere prompts the user to log in first. -->
      <div
        class="auth-overlay"
        *ngIf="sessionChecked() && !auth.isAuthenticated()"
        (click)="promptLogin()"
      ></div>

    </div>

    <!-- Transient prompt shown when a logged-out user tries to interact. -->
    <div class="login-toast" *ngIf="loginPromptVisible()">
      <i class="ti ti-lock"></i>
      <span>Please log in before filling in your profile.</span>
      <a routerLink="/login">Log in</a>
    </div>
  `,
  styleUrls: ['./profile-setup.component.scss'],
})
export class ProfileSetupComponent implements OnInit {
  // A signal (not a plain property) so updates arriving from async HTTP
  // callbacks are picked up by zoneless change detection.
  profile!: ProfileService['profile'];
  user!: ProfileService['user'];
  showAddSectionForm = signal(false);
  addSectionError = signal<string | null>(null);
  basicInfoSaveStatus = signal<'idle' | 'saved' | 'error'>('idle');
  // False until the session check resolves, so we don't flash the login
  // overlay before we know whether the user is actually logged in.
  sessionChecked = signal(false);
  loginPromptVisible = signal(false);

  sectionConfig = SECTION_CONFIG;
  sectionTypes = Object.keys(SECTION_CONFIG) as SectionType[];
  newSectionType: SectionType = this.sectionTypes[0];

  constructor(
    private profileService: ProfileService,
    readonly auth: AuthService,
  ) {
    this.profile = this.profileService.profile;
    this.user = this.profileService.user;
  }

  ngOnInit(): void {
    // Confirm auth first; only load the profile once we know we're logged in
    // (avoids a guaranteed 401 and lets the template gate on auth state).
    this.auth.loadSession().subscribe((user) => {
      this.sessionChecked.set(true);
      if (user) {
        this.profileService.loadProfile().subscribe();
      }
    });
  }

  onBasicInfoSaved(data: Partial<Profile>): void {
    this.profileService.saveBasicInfo(data).subscribe({
      next: () => this.flashSaveStatus('saved'),
      error: () => this.flashSaveStatus('error'),
    });
  }

  private flashSaveStatus(status: 'saved' | 'error'): void {
    this.basicInfoSaveStatus.set(status);
    setTimeout(() => this.basicInfoSaveStatus.set('idle'), 2500);
  }

  onInstanceAdded(sectionId: string, data: Record<string, unknown>): void {
    this.profileService.addInstance(sectionId, data).subscribe();
  }

  onInstanceUpdated(sectionId: string, instanceId: string, data: Record<string, unknown>): void {
    this.profileService.updateInstance(sectionId, instanceId, data).subscribe();
  }

  onInstanceDeleted(sectionId: string, instanceId: string): void {
    this.profileService.deleteInstance(sectionId, instanceId).subscribe();
  }

  onSectionDeleted(sectionId: string): void {
    this.profileService.deleteSection(sectionId).subscribe();
  }

  onSectionDrop(event: CdkDragDrop<unknown>): void {
    // Service updates local order optimistically; reload to roll back on failure.
    this.profileService.moveSection(event.previousIndex, event.currentIndex).subscribe({
      error: () => this.profileService.loadProfile().subscribe(),
    });
  }

  openAddSectionModal(): void {
    this.newSectionType = this.sectionTypes[0];
    this.addSectionError.set(null);
    this.showAddSectionForm.set(true);
  }

  confirmAddSection(): void {
    this.addSectionError.set(null);
    // Label is no longer user-editable; it always mirrors the type name.
    const label = SECTION_CONFIG[this.newSectionType].label;
    this.profileService.addSection(this.newSectionType, label).subscribe({
      next: () => {
        this.showAddSectionForm.set(false);
      },
      error: (err) => {
        // 404 = no profile row yet (basic info never saved); other codes
        // are genuine failures, so surface the backend message instead of
        // always blaming unsaved basic info.
        this.addSectionError.set(
          err?.status === 404
            ? 'Could not add section — save your basic info first.'
            : (err?.error?.error ?? 'Could not add section. Please try again.'),
        );
      },
    });
  }

  cancelAddSectionForm(): void {
    this.showAddSectionForm.set(false);
    this.addSectionError.set(null);
  }

  // Logged-out user tried to interact — show the prompt briefly.
  promptLogin(): void {
    this.loginPromptVisible.set(true);
    setTimeout(() => this.loginPromptVisible.set(false), 3500);
  }

  scrollToSection(sectionId: string): void {
    document.getElementById('section-' + sectionId)?.scrollIntoView({ behavior: 'smooth' });
  }
}
