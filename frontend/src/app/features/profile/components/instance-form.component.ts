// frontend/src/app/features/profile/components/instance-form.component.ts
//
// Renders the correct form fields depending on section type.
// Uses ReactiveFormsModule for validation.

import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { SectionType } from '../profile.types';

@Component({
  selector: 'app-instance-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="instance-form">
      <form [formGroup]="form" (ngSubmit)="onSubmit()">

        <!-- ── WORK EXPERIENCE ─────────────────── -->
        <ng-container *ngIf="sectionType === 'WORK_EXPERIENCE'">
          <div class="form-row">
            <div class="field-group">
              <label>Company *</label>
              <input formControlName="company" placeholder="Shopify" />
            </div>
            <div class="field-group">
              <label>Job title *</label>
              <input formControlName="title" placeholder="Software Engineer" />
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Location</label>
              <input formControlName="location" placeholder="Toronto, ON" />
            </div>
          </div>
          <div class="field-group full-width">
            <label>Role summary</label>
            <textarea formControlName="summary" rows="3" placeholder="Describe the scope, responsibilities, and outcomes."></textarea>
          </div>
          <div class="field-group full-width">
            <label>Tools / stack</label>
            <input formControlName="technologiesRaw" placeholder="React, Node.js, PostgreSQL" />
            <p class="field-hint">Use commas to separate tools, technologies, or methods.</p>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Start date (month and year) *</label>
              <input formControlName="startDate" type="month" />
            </div>
            <div class="field-group" *ngIf="!form.get('current')?.value">
              <label>End date (month and year)</label>
              <input formControlName="endDate" type="month" />
            </div>
            <div class="field-group checkbox-group">
              <label>
                <input type="checkbox" formControlName="current" />
                Currently working here
              </label>
            </div>
          </div>
          <ng-container *ngTemplateOutlet="bulletsField"></ng-container>
        </ng-container>

        <!-- ── EDUCATION ───────────────────────── -->
        <ng-container *ngIf="sectionType === 'EDUCATION'">
          <div class="form-row">
            <div class="field-group">
              <label>School *</label>
              <input formControlName="school" placeholder="University of Toronto" />
            </div>
            <div class="field-group">
              <label>Degree *</label>
              <input formControlName="degree" placeholder="Bachelor of Science" />
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Field of study</label>
              <input formControlName="field" placeholder="Computer Science" />
            </div>
            <div class="field-group">
              <label>GPA</label>
              <input formControlName="gpa" placeholder="3.8" />
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Start date (month and year)</label>
              <input formControlName="startDate" type="month" />
            </div>
            <div class="field-group">
              <label>End date (month and year)</label>
              <input formControlName="endDate" type="month" />
            </div>
          </div>
          <ng-container *ngTemplateOutlet="bulletsField"></ng-container>
        </ng-container>

        <!-- ── SKILLS ──────────────────────────── -->
        <ng-container *ngIf="sectionType === 'SKILLS'">
          <div class="form-row">
            <div class="field-group">
              <label>Category *</label>
              <input formControlName="category" placeholder="Languages" />
            </div>
          </div>
          <div class="field-group">
            <label>Skills (comma-separated) *</label>
            <input formControlName="skillsRaw" placeholder="TypeScript, Python, SQL" />
            <p class="field-hint">Separate skills with commas</p>
          </div>
        </ng-container>

        <!-- ── PROJECTS ────────────────────────── -->
        <ng-container *ngIf="sectionType === 'PROJECTS'">
          <div class="form-row">
            <div class="field-group">
              <label>Project name *</label>
              <input formControlName="name" placeholder="Tailr" />
            </div>
            <div class="field-group">
              <label>URL</label>
              <input formControlName="url" placeholder="https://github.com/..." />
            </div>
          </div>
          <div class="field-group full-width">
            <label>Project summary</label>
            <textarea formControlName="summary" rows="3" placeholder="Explain what the project does and why it matters."></textarea>
          </div>
          <div class="field-group full-width">
            <label>Technologies</label>
            <input formControlName="technologiesRaw" placeholder="Angular, TypeScript, Prisma" />
            <p class="field-hint">Add one or more tools, libraries, or platforms separated by commas.</p>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Start date (month and year)</label>
              <input formControlName="startDate" type="month" />
            </div>
            <div class="field-group" *ngIf="!form.get('current')?.value">
              <label>End date (month and year)</label>
              <input formControlName="endDate" type="month" />
            </div>
            <div class="field-group checkbox-group">
              <label>
                <input type="checkbox" formControlName="current" />
                Ongoing
              </label>
            </div>
          </div>
          <ng-container *ngTemplateOutlet="bulletsField"></ng-container>
          <ng-container *ngTemplateOutlet="customDetailsField"></ng-container>
        </ng-container>

        <!-- ── CERTIFICATIONS ─────────────────── -->
        <ng-container *ngIf="sectionType === 'CERTIFICATIONS'">
          <div class="form-row">
            <div class="field-group">
              <label>Name *</label>
              <input formControlName="name" placeholder="AWS Solutions Architect" />
            </div>
            <div class="field-group">
              <label>Issuer</label>
              <input formControlName="issuer" placeholder="Amazon Web Services" />
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Date (month and year)</label>
              <input formControlName="date" type="month" />
            </div>
            <div class="field-group">
              <label>Credential URL</label>
              <input formControlName="url" placeholder="https://..." />
            </div>
          </div>
        </ng-container>

        <!-- ── AWARDS ─────────────────────────── -->
        <ng-container *ngIf="sectionType === 'AWARDS'">
          <div class="form-row">
            <div class="field-group">
              <label>Title *</label>
              <input formControlName="title" placeholder="Dean's List" />
            </div>
            <div class="field-group">
              <label>Issuer</label>
              <input formControlName="issuer" placeholder="University of Toronto" />
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Date (month and year)</label>
              <input formControlName="date" type="month" />
            </div>
          </div>
          <div class="field-group">
            <label>Description</label>
            <textarea formControlName="description" rows="2" placeholder="Top 10% of graduating class"></textarea>
          </div>
        </ng-container>

        <!-- ── LANGUAGES ──────────────────────── -->
        <ng-container *ngIf="sectionType === 'LANGUAGES'">
          <div class="form-row">
            <div class="field-group">
              <label>Language *</label>
              <input formControlName="language" placeholder="French" />
            </div>
            <div class="field-group">
              <label>Proficiency</label>
              <select formControlName="proficiency">
                <option value="">Select...</option>
                <option value="Native">Native</option>
                <option value="Fluent">Fluent</option>
                <option value="Professional">Professional</option>
                <option value="Conversational">Conversational</option>
                <option value="Basic">Basic</option>
              </select>
            </div>
          </div>
        </ng-container>

        <!-- ── VOLUNTEER ──────────────────────── -->
        <ng-container *ngIf="sectionType === 'VOLUNTEER'">
          <div class="form-row">
            <div class="field-group">
              <label>Organization *</label>
              <input formControlName="organization" placeholder="Code for Canada" />
            </div>
            <div class="field-group">
              <label>Role</label>
              <input formControlName="role" placeholder="Mentor" />
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Start date (month and year)</label>
              <input formControlName="startDate" type="month" />
            </div>
            <div class="field-group" *ngIf="!form.get('current')?.value">
              <label>End date (month and year)</label>
              <input formControlName="endDate" type="month" />
            </div>
            <div class="field-group checkbox-group">
              <label>
                <input type="checkbox" formControlName="current" />
                Currently active
              </label>
            </div>
          </div>
          <ng-container *ngTemplateOutlet="bulletsField"></ng-container>
          <ng-container *ngTemplateOutlet="customDetailsField"></ng-container>
        </ng-container>

        <!-- ── Bullets (shared template) ─────── -->
        <ng-template #bulletsField>
          <div class="field-group bullets-field" formArrayName="bullets">
            <label>Bullet points</label>
            <div
              *ngFor="let bullet of bulletsArray.controls; let i = index"
              class="bullet-row"
            >
              <input [formControlName]="i" placeholder="Describe what you did and the impact..." />
              <button type="button" class="btn-icon-remove" (click)="removeBullet(i)">
                <i class="ti ti-x"></i>
              </button>
            </div>
            <button type="button" class="btn-ghost add-bullet" (click)="addBullet()">
              <i class="ti ti-plus"></i> Add bullet
            </button>
          </div>
        </ng-template>

        <!-- ── Custom details (shared template) ─────── -->
        <ng-template #customDetailsField>
          <div class="field-group full-width custom-details-field" *ngIf="supportsCustomDetails" formArrayName="customDetails">
            <label>Additional details</label>
            <div
              *ngFor="let detail of customDetailsArray.controls; let i = index"
              class="detail-row"
              [formGroupName]="i"
            >
              <input formControlName="label" placeholder="Detail label" />
              <input formControlName="value" placeholder="Add a metric, skill, outcome, or note..." />
              <button type="button" class="btn-icon-remove" (click)="removeDetail(i)">
                <i class="ti ti-x"></i>
              </button>
            </div>
            <button type="button" class="btn-ghost add-bullet" (click)="addDetail()">
              <i class="ti ti-plus"></i> Add detail
            </button>
          </div>
        </ng-template>

        <!-- Form actions -->
        <div class="form-actions">
          <button type="button" class="btn-secondary" (click)="formCancelled.emit()">Cancel</button>
          <button type="submit" class="btn-primary" [disabled]="form.invalid">Save</button>
        </div>

      </form>
    </div>
  `,
  styleUrls: ['./instance-form.component.scss'],
})
export class InstanceFormComponent implements OnInit {
  @Input() sectionType!: SectionType;
  @Input() existingData: Record<string, unknown> | null = null;

  @Output() formSubmitted = new EventEmitter<Record<string, unknown>>();
  @Output() formCancelled = new EventEmitter<void>();

  form!: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.buildForm();
    if (this.existingData) {
      this.patchForm(this.existingData);
    }
  }

  get bulletsArray(): FormArray {
    return this.form.get('bullets') as FormArray;
  }

  get customDetailsArray(): FormArray {
    return this.form.get('customDetails') as FormArray;
  }

  get supportsCustomDetails(): boolean {
    return ['WORK_EXPERIENCE', 'PROJECTS'].includes(this.sectionType);
  }

  addBullet(): void {
    this.bulletsArray.push(this.fb.control(''));
  }

  removeBullet(index: number): void {
    this.bulletsArray.removeAt(index);
  }

  addDetail(): void {
    this.customDetailsArray.push(this.createDetailGroup());
  }

  removeDetail(index: number): void {
    this.customDetailsArray.removeAt(index);
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const raw = this.form.value;

    // Normalize skills from comma string to array
    if (this.sectionType === 'SKILLS' && raw.skillsRaw) {
      raw.skills = (raw.skillsRaw as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      delete raw.skillsRaw;
    }

    // Remove empty bullets
    if (raw.bullets) {
      raw.bullets = (raw.bullets as string[]).filter(b => b.trim() !== '');
    }

    if (raw.customDetails) {
      raw.customDetails = (raw.customDetails as Array<{ label?: string; value?: string }>).filter(detail => {
        return Boolean(detail.label?.trim() && detail.value?.trim());
      });
    }

    if (this.sectionType === 'WORK_EXPERIENCE' || this.sectionType === 'PROJECTS') {
      if (raw.technologiesRaw) {
        raw.technologies = (raw.technologiesRaw as string).split(',').map((item: string) => item.trim()).filter(Boolean);
        delete raw.technologiesRaw;
      }
    }

    this.formSubmitted.emit(raw);
  }

  // ── Form builders ───────────────────────
  private buildForm(): FormGroup {
    const hasBullets = ['WORK_EXPERIENCE', 'EDUCATION', 'PROJECTS', 'VOLUNTEER'].includes(this.sectionType);
    const hasCustomDetails = ['WORK_EXPERIENCE', 'PROJECTS'].includes(this.sectionType);

    const base: Record<string, unknown> = hasBullets
      ? { bullets: this.fb.array([this.fb.control('')]) }
      : {};

    if (hasCustomDetails) {
      base['customDetails'] = this.fb.array([this.createDetailGroup()]);
    }

    const fields: Record<SectionType, Record<string, unknown>> = {
      WORK_EXPERIENCE:  { company: ['', Validators.required], title: ['', Validators.required], location: [''], summary: [''], technologiesRaw: [''], startDate: ['', Validators.required], endDate: [''], current: [false] },
      EDUCATION:        { school: ['', Validators.required], degree: ['', Validators.required], field: [''], gpa: [''], startDate: [''], endDate: [''] },
      SKILLS:           { category: ['', Validators.required], skillsRaw: ['', Validators.required] },
      PROJECTS:         { name: ['', Validators.required], url: [''], summary: [''], technologiesRaw: [''], startDate: [''], endDate: [''], current: [false] },
      CERTIFICATIONS:   { name: ['', Validators.required], issuer: [''], date: [''], url: [''] },
      AWARDS:           { title: ['', Validators.required], issuer: [''], date: [''], description: [''] },
      LANGUAGES:        { language: ['', Validators.required], proficiency: [''] },
      VOLUNTEER:        { organization: ['', Validators.required], role: [''], startDate: [''], endDate: [''], current: [false] },
    };

    return this.fb.group({ ...fields[this.sectionType], ...base });
  }

  private patchForm(data: Record<string, unknown>): void {
    // Patch bullets separately (FormArray)
    if (data['bullets'] && Array.isArray(data['bullets'])) {
      const bullets = data['bullets'] as string[];
      while (this.bulletsArray.length < bullets.length) {
        this.bulletsArray.push(this.fb.control(''));
      }
      this.bulletsArray.patchValue(bullets);
    }

    // Skills array → comma string for editing
    if (this.sectionType === 'SKILLS' && Array.isArray(data['skills'])) {
      (data as Record<string, unknown>)['skillsRaw'] = (data['skills'] as string[]).join(', ');
    }

    if (this.supportsCustomDetails && Array.isArray(data['customDetails'])) {
      const details = data['customDetails'] as Array<{ label?: string; value?: string }>;
      while (this.customDetailsArray.length < details.length) {
        this.customDetailsArray.push(this.createDetailGroup());
      }
      this.customDetailsArray.patchValue(details);
    }

    if (this.sectionType === 'WORK_EXPERIENCE' || this.sectionType === 'PROJECTS') {
      const technologies = data['technologies'];
      if (Array.isArray(technologies)) {
        (data as Record<string, unknown>)['technologiesRaw'] = technologies.join(', ');
      }
    }

    this.form.patchValue(data);
  }

  private createDetailGroup(): FormGroup {
    return this.fb.group({
      label: [''],
      value: [''],
    });
  }
}