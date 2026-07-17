// frontend/src/app/features/profile/components/basic-info-form.component.ts

import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Profile, ProfileUser } from '../profile.types';

@Component({
  selector: 'app-basic-info-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="section-card">
      <div class="section-header" (click)="expanded = !expanded">
        <div class="section-title">
          <span class="section-dot"></span>
          <span class="section-name">Basic info</span>
        </div>
        <button class="btn-ghost">
          <i class="ti" [class.ti-chevron-up]="expanded" [class.ti-chevron-down]="!expanded"></i>
        </button>
      </div>

      <div class="section-body" *ngIf="expanded">
        <form [formGroup]="form" (ngSubmit)="onSave()">

          <div class="basic-info-grid">
            <div class="field-group">
              <label>Full name <span class="field-lock">from account</span></label>
              <input [value]="user?.name ?? ''" readonly />
            </div>
            <div class="field-group">
              <label>Headline</label>
              <input formControlName="headline" placeholder="Full-stack developer" />
            </div>
            <div class="field-group">
              <label>Email <span class="field-lock">from account</span></label>
              <input [value]="user?.email ?? ''" type="email" readonly />
            </div>
            <div class="field-group">
              <label>Phone</label>
              <input formControlName="phone" placeholder="+1 416 555 0192" />
            </div>
            <div class="field-group">
              <label>Location</label>
              <input formControlName="location" placeholder="Toronto, ON" />
            </div>
            <div class="field-group full">
              <label>Summary</label>
              <textarea formControlName="summary" rows="3" placeholder="A short paragraph about you..."></textarea>
            </div>
          </div>

          <div class="links-section">
            <p class="links-title">Links</p>
            <div class="links-grid">
              <div class="field-group links-row">
                <i class="ti ti-brand-linkedin"></i>
                <input formControlName="linkedin" placeholder="linkedin.com/in/yourname" />
              </div>
              <div class="field-group links-row">
                <i class="ti ti-brand-github"></i>
                <input formControlName="github" placeholder="github.com/yourname" />
              </div>
              <div class="field-group links-row">
                <i class="ti ti-world"></i>
                <input formControlName="portfolio" placeholder="yourportfolio.com" />
              </div>
            </div>
          </div>

          <div class="form-actions">
            <span class="save-status saved" *ngIf="saveStatus === 'saved'">
              <i class="ti ti-check"></i> Saved
            </span>
            <span class="save-status error" *ngIf="saveStatus === 'error'">
              <i class="ti ti-alert-circle"></i> Failed to save
            </span>
            <button type="submit" class="btn-primary" [disabled]="form.pristine">Save</button>
          </div>

        </form>
      </div>
    </div>
  `,
  styleUrls: ['./basic-info-form.component.scss'],
})
export class BasicInfoFormComponent implements OnInit, OnChanges {
  @Input() profile: Profile | null = null;
  @Input() user: ProfileUser | null = null;
  @Input() saveStatus: 'idle' | 'saved' | 'error' = 'idle';
  @Output() saved = new EventEmitter<Partial<Profile>>();

  form!: FormGroup;
  expanded = true;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    // name/email are NOT in the form — they live on User and are shown
    // read-only above. The form only holds editable Profile fields.
    this.form = this.fb.group({
      headline:  [this.profile?.headline ?? ''],
      phone:     [this.profile?.phone ?? ''],
      location:  [this.profile?.location ?? ''],
      summary:   [this.profile?.summary ?? ''],
      linkedin:  [this.profile?.linkedin ?? ''],
      github:    [this.profile?.github ?? ''],
      portfolio: [this.profile?.portfolio ?? ''],
    });
  }

  // The profile loads asynchronously and can arrive after this component
  // has already been created (and ngOnInit has already built the form with
  // whatever was available at that instant, usually null). Re-patch here
  // so the form reflects data that loads later — but only while the user
  // hasn't started editing, so we don't clobber in-progress changes.
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profile'] && !changes['profile'].firstChange && this.form && this.form.pristine) {
      this.form.patchValue({
        headline:  this.profile?.headline ?? '',
        phone:     this.profile?.phone ?? '',
        location:  this.profile?.location ?? '',
        summary:   this.profile?.summary ?? '',
        linkedin:  this.profile?.linkedin ?? '',
        github:    this.profile?.github ?? '',
        portfolio: this.profile?.portfolio ?? '',
      });
    }
  }

  onSave(): void {
    this.saved.emit(this.form.value);
    this.form.markAsPristine();
  }
}