// frontend/src/app/features/profile/profile-wizard.component.ts
//
// First-time onboarding wizard: walks a new user through their profile one
// stage at a time (basic info -> education -> work -> skills), then hands off
// to the dashboard. Reuses the same forms/rows and ProfileService as the
// dashboard — this is just a guided shell on top.

import { Component, EventEmitter, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfileService } from './profile.service';
import { Profile, ProfileSection, SectionType, SECTION_CONFIG } from './profile.types';
import { BasicInfoFormComponent } from './components/basic-info-form.component';
import { InstanceFormComponent } from './components/instance-form.component';
import { InstanceRowComponent } from './components/instance-row.component';

type Stage =
  | { kind: 'basic'; title: string; subtitle: string }
  | { kind: 'section'; type: SectionType; title: string; subtitle: string };

@Component({
  selector: 'app-profile-wizard',
  standalone: true,
  imports: [CommonModule, BasicInfoFormComponent, InstanceFormComponent, InstanceRowComponent],
  template: `
    <div class="wizard">
      <!-- Progress -->
      <div class="wizard-progress" *ngIf="!isDone()">
        <div class="progress-track">
          <div class="progress-fill" [style.width.%]="progressPercent()"></div>
        </div>
        <p class="progress-label">Step {{ stageIndex() + 1 }} of {{ stages.length }} · {{ stage().title }}</p>
      </div>

      <!-- Stage card -->
      <div class="wizard-card" *ngIf="!isDone()">
        <div class="wizard-head">
          <h1>{{ stage().title }}</h1>
          <p>{{ stage().subtitle }}</p>
        </div>

        <!-- Basic info stage -->
        <app-basic-info-form
          *ngIf="stage().kind === 'basic'"
          [embedded]="true"
          [profile]="profile()"
          [user]="user()"
          (saved)="onBasicSaved($event)"
        />

        <!-- Section stages (education / work / skills) -->
        <ng-container *ngIf="stage().kind === 'section'">
          <app-instance-row
            *ngFor="let instance of currentInstances()"
            [instance]="instance"
            [sectionType]="sectionType()"
            (editClicked)="openEdit(instance.id)"
            (deleteClicked)="onDeleteInstance(instance.id)"
          />

          <app-instance-form
            *ngIf="showForm()"
            [sectionType]="sectionType()"
            [existingData]="editingData()"
            (formSubmitted)="onSubmitInstance($event)"
            (formCancelled)="closeForm()"
          />

          <button class="add-instance-btn" *ngIf="!showForm()" (click)="openAdd()">
            <i class="ti ti-plus"></i> {{ config().addLabel }}
          </button>
        </ng-container>

        <!-- Nav -->
        <div class="wizard-nav">
          <button class="btn-secondary" *ngIf="stageIndex() > 0" (click)="back()">Back</button>
          <span class="spacer"></span>
          <button class="btn-ghost" (click)="skip()">Skip</button>
          <button class="btn-primary" (click)="next()">
            {{ isLastStage() ? 'Finish' : 'Next' }}
          </button>
        </div>
      </div>

      <!-- Done -->
      <div class="wizard-card done" *ngIf="isDone()">
        <i class="ti ti-circle-check"></i>
        <h1>You're all set</h1>
        <p>Your profile is ready. You can keep editing it and add more sections
           (projects, certifications, awards…) any time.</p>
        <button class="btn-primary" (click)="finish()">Go to my profile</button>
      </div>
    </div>
  `,
  styleUrls: ['./profile-wizard.component.scss'],
})
export class ProfileWizardComponent {
  // Emitted when the user finishes or exits onboarding; parent switches to
  // the dashboard.
  @Output() done = new EventEmitter<void>();

  @ViewChild(BasicInfoFormComponent) private basicForm?: BasicInfoFormComponent;

  private profileService = inject(ProfileService);

  readonly profile = this.profileService.profile;
  readonly user = this.profileService.user;

  // Education before work experience (per team decision).
  readonly stages: Stage[] = [
    { kind: 'basic', title: 'Basic info', subtitle: 'Tell us who you are. Name and email come from your account.' },
    { kind: 'section', type: 'EDUCATION', title: 'Education', subtitle: 'Add your degrees, starting with the most recent.' },
    { kind: 'section', type: 'WORK_EXPERIENCE', title: 'Work experience', subtitle: 'Add roles you want on your resumes.' },
    { kind: 'section', type: 'SKILLS', title: 'Skills', subtitle: 'Group your skills by category.' },
  ];

  stageIndex = signal(0);
  showForm = signal(false);
  editingInstanceId = signal<string | null>(null);

  isDone = computed(() => this.stageIndex() >= this.stages.length);
  stage = computed(() => this.stages[Math.min(this.stageIndex(), this.stages.length - 1)]);
  isLastStage = computed(() => this.stageIndex() === this.stages.length - 1);
  progressPercent = computed(() => ((this.stageIndex() + 1) / this.stages.length) * 100);

  sectionType = computed<SectionType>(() => {
    const s = this.stage();
    return s.kind === 'section' ? s.type : 'WORK_EXPERIENCE';
  });
  config = computed(() => SECTION_CONFIG[this.sectionType()]);
  currentSection = computed<ProfileSection | undefined>(() =>
    this.profile()?.sections.find((s) => s.type === this.sectionType()),
  );
  currentInstances = computed(() => this.currentSection()?.instances ?? []);
  editingData = computed(() => {
    const id = this.editingInstanceId();
    return id ? (this.currentInstances().find((i) => i.id === id)?.data ?? null) : null;
  });

  // ── Navigation ──────────────────────────
  next(): void {
    if (this.stage().kind === 'basic') {
      // Save basic info first, then advance (see onBasicSaved).
      this.basicForm?.save();
      return;
    }
    this.advance();
  }

  onBasicSaved(data: Partial<Profile>): void {
    this.profileService.saveBasicInfo(data).subscribe(() => this.advance());
  }

  back(): void {
    this.closeForm();
    this.stageIndex.update((i) => Math.max(0, i - 1));
  }

  skip(): void {
    this.advance();
  }

  private advance(): void {
    this.closeForm();
    this.stageIndex.update((i) => i + 1);
  }

  finish(): void {
    this.done.emit();
  }

  // ── Section instances ───────────────────
  openAdd(): void {
    this.editingInstanceId.set(null);
    this.showForm.set(true);
  }

  openEdit(id: string): void {
    this.editingInstanceId.set(id);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingInstanceId.set(null);
  }

  onSubmitInstance(data: Record<string, unknown>): void {
    const editingId = this.editingInstanceId();
    const section = this.currentSection();

    if (editingId && section) {
      this.profileService.updateInstance(section.id, editingId, data).subscribe(() => this.closeForm());
      return;
    }

    if (section) {
      this.profileService.addInstance(section.id, data).subscribe(() => this.closeForm());
      return;
    }

    // No section of this type yet — create it, then add the first instance.
    const type = this.sectionType();
    this.profileService.addSection(type, SECTION_CONFIG[type].label).subscribe(({ section: created }) => {
      this.profileService.addInstance(created.id, data).subscribe(() => this.closeForm());
    });
  }

  onDeleteInstance(id: string): void {
    const section = this.currentSection();
    if (section) {
      this.profileService.deleteInstance(section.id, id).subscribe();
    }
  }
}
