// frontend/src/app/features/profile/profile-setup.component.ts

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from './profile.service';
import { Profile, SectionType, SECTION_CONFIG } from './profile.types';
import { BasicInfoFormComponent } from './components/basic-info-form.component';
import { SectionCardComponent } from './components/section-card.component';
import { ResumeUploadBannerComponent } from './components/resume-upload-banner.component';


@Component({
  selector: 'app-profile-setup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BasicInfoFormComponent,
    SectionCardComponent,
    ResumeUploadBannerComponent,
  ],
  template: `
    <div class="profile-layout">

      <!-- Sidebar -->
      <nav class="profile-sidebar">
        <p class="sidebar-label">Profile</p>
        <button class="nav-item" [class.active]="activeSection === 'basic'" (click)="activeSection = 'basic'">
          <i class="ti ti-user-circle"></i> Basic info
        </button>
        <button class="nav-item" [class.active]="activeSection === 'links'" (click)="activeSection = 'links'">
          <i class="ti ti-link"></i> Links
        </button>

        <hr class="nav-divider" />

        <p class="sidebar-label">Sections</p>
        <button
          *ngFor="let section of profile()?.sections"
          class="nav-section-item"
          (click)="scrollToSection(section.id)"
        >
          <span>
            <i class="ti {{ sectionConfig[section.type].icon }}"></i>
            {{ section.label }}
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
            <select [(ngModel)]="newSectionType" (ngModelChange)="onNewSectionTypeChange($event)">
              <option *ngFor="let type of sectionTypes" [value]="type">{{ sectionConfig[type].label }}</option>
            </select>
          </label>
          <label>
            Label
            <input [(ngModel)]="newSectionLabel" placeholder="e.g. Work experience" />
          </label>
          <p class="add-section-error" *ngIf="addSectionError()">{{ addSectionError() }}</p>
          <div class="add-section-form-actions">
            <button class="btn-secondary" (click)="cancelAddSectionForm()">Cancel</button>
            <button class="btn-primary" [disabled]="!newSectionLabel.trim()" (click)="confirmAddSection()">Add</button>
          </div>
        </div>
      </nav>

      <!-- Main content -->
      <div class="profile-main">
        <div class="page-header">
          <h1>Your profile</h1>
          <p>This is the source of truth for all your resumes. Keep it complete for best AI results.</p>
        </div>

        <!-- Resume upload -->
        <app-resume-upload-banner
          [resumeFileName]="profile()?.resumeFileName ?? null"
          [isParsing]="isParsing()"
          (fileSelected)="onResumeUpload($event)"
        />

        <!-- Basic info form -->
        <app-basic-info-form
          *ngIf="profile() !== undefined"
          [profile]="profile()"
          [saveStatus]="basicInfoSaveStatus()"
          (saved)="onBasicInfoSaved($event)"
        />

        <!-- Section cards -->
        <app-section-card
          *ngFor="let section of profile()?.sections"
          [id]="'section-' + section.id"
          [section]="section"
          (instanceAdded)="onInstanceAdded(section.id, $event)"
          (instanceUpdated)="onInstanceUpdated(section.id, $event.id, $event.data)"
          (instanceDeleted)="onInstanceDeleted(section.id, $event)"
          (sectionDeleted)="onSectionDeleted(section.id)"
        />

        <!-- Empty state -->
        <div *ngIf="profile()?.sections?.length === 0" class="empty-sections">
          <i class="ti ti-layout-list"></i>
          <p>No sections yet. Add your work experience, education, and skills.</p>
          <button class="btn-primary" (click)="openAddSectionModal()">
            <i class="ti ti-plus"></i> Add first section
          </button>
        </div>
      </div>

    </div>
  `,
  styleUrls: ['./profile-setup.component.scss'],
})
export class ProfileSetupComponent implements OnInit {
  // A signal (not a plain property) so updates arriving from async HTTP
  // callbacks are picked up by zoneless change detection.
  profile!: ProfileService['profile'];
  isParsing = signal(false);
  showAddSectionForm = signal(false);
  addSectionError = signal<string | null>(null);
  basicInfoSaveStatus = signal<'idle' | 'saved' | 'error'>('idle');

  activeSection = 'basic';
  sectionConfig = SECTION_CONFIG;
  sectionTypes = Object.keys(SECTION_CONFIG) as SectionType[];
  newSectionType: SectionType = this.sectionTypes[0];
  newSectionLabel = SECTION_CONFIG[this.sectionTypes[0]].label;

  constructor(private profileService: ProfileService) {
    this.profile = this.profileService.profile;
  }

  ngOnInit(): void {
    this.profileService.loadProfile().subscribe();
  }

  onResumeUpload(file: File): void {
    this.isParsing.set(true);
    this.profileService.uploadResume(file).subscribe({
      next: () => {
        // isParsing stays true until WebSocket signals parsing done
        // (Prithvi's WebSocket handler calls loadProfile() when AI is done)
      },
      error: () => this.isParsing.set(false),
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

  openAddSectionModal(): void {
    this.newSectionType = this.sectionTypes[0];
    this.newSectionLabel = SECTION_CONFIG[this.newSectionType].label;
    this.addSectionError.set(null);
    this.showAddSectionForm.set(true);
  }

  onNewSectionTypeChange(type: SectionType): void {
    this.newSectionLabel = SECTION_CONFIG[type].label;
  }

  confirmAddSection(): void {
    const label = this.newSectionLabel.trim();
    if (!label) return;
    this.addSectionError.set(null);
    this.profileService.addSection(this.newSectionType, label).subscribe({
      next: () => {
        this.showAddSectionForm.set(false);
      },
      error: () => {
        this.addSectionError.set('Could not add section — save your basic info first.');
      },
    });
  }

  cancelAddSectionForm(): void {
    this.showAddSectionForm.set(false);
    this.addSectionError.set(null);
  }

  scrollToSection(sectionId: string): void {
    document.getElementById('section-' + sectionId)?.scrollIntoView({ behavior: 'smooth' });
  }
}
