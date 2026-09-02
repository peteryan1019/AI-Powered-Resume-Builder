// frontend/src/app/features/profile/components/instance-form.component.ts
//
// Renders the correct form fields depending on section type.
// Uses ReactiveFormsModule for validation.

import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
          <ng-container *ngTemplateOutlet="descriptionField"></ng-container>
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
          <ng-container *ngTemplateOutlet="descriptionField"></ng-container>
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
          <ng-container *ngTemplateOutlet="descriptionField"></ng-container>
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
          <ng-container *ngTemplateOutlet="descriptionField"></ng-container>
        </ng-container>

        <!-- ── Description (shared template) ─────── -->
        <ng-template #descriptionField>
          <div class="field-group full-width description-field">
            <label>{{ descriptionLabel }}</label>
            <textarea
              formControlName="description"
              rows="8"
              [placeholder]="descriptionPlaceholder"
            ></textarea>
            <p class="field-hint">
              Write as much as you can, in plain sentences — there is no need to
              format this. {{ descriptionHint }} When you generate a resume, the
              AI rewrites this into bullet points chosen and worded for that
              specific job posting, so detail you leave out here can never
              appear on a resume.
            </p>
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
  /**
   * Text to add to the description box on top of whatever the entry already
   * carries. The resume build flow uses it: when its profile agent notices a
   * fact the user stated but never wrote down, the sentence is appended here
   * rather than merged by the caller -- only this component knows how legacy
   * rows fold into the description, so merging anywhere else would drop content.
   */
  @Input() appendToDescription: string | null = null;

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

  /** Section types whose detail now lives in one free-text description box. */
  private static readonly DESCRIBED_TYPES: SectionType[] = [
    'WORK_EXPERIENCE', 'EDUCATION', 'PROJECTS', 'VOLUNTEER',
  ];

  get usesDescription(): boolean {
    return InstanceFormComponent.DESCRIBED_TYPES.includes(this.sectionType);
  }

  get descriptionLabel(): string {
    return this.sectionType === 'EDUCATION' ? 'Coursework, awards, and details' : 'Description';
  }

  get descriptionPlaceholder(): string {
    switch (this.sectionType) {
      case 'WORK_EXPERIENCE':
        return 'What the team did, what you owned, what you built and with which tools, and how it turned out — numbers included where you have them.';
      case 'EDUCATION':
        return 'Relevant coursework, scholarships, awards, thesis or capstone work, teaching or lab roles, and anything else that might matter to an employer.';
      case 'PROJECTS':
        return 'What the project does, why you built it, the stack you used, the parts you personally implemented, and any results or usage numbers.';
      case 'VOLUNTEER':
        return 'The organisation, what you actually did week to week, who you worked with, and any outcome you can point to.';
      default:
        return '';
    }
  }

  get descriptionHint(): string {
    switch (this.sectionType) {
      case 'EDUCATION':
        return 'Name specific courses and awards rather than summarising them.';
      case 'WORK_EXPERIENCE':
      case 'PROJECTS':
        return 'Name every tool and technology you actually used.';
      default:
        return '';
    }
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const raw = { ...this.form.value } as Record<string, unknown>;

    // Normalize skills from comma string to array
    if (this.sectionType === 'SKILLS' && raw['skillsRaw']) {
      raw['skills'] = (raw['skillsRaw'] as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      delete raw['skillsRaw'];
    }

    // Saving converts a legacy row to the new shape. The legacy values were
    // folded into the description box when the form loaded, so dropping the
    // keys here removes duplicates rather than data — without this the export
    // in backend/src/lib/profileExport.ts would emit both copies.
    if (this.usesDescription) {
      for (const legacyKey of ['summary', 'technologies', 'bullets', 'customDetails']) {
        delete raw[legacyKey];
      }
    }

    this.formSubmitted.emit(raw);
  }

  // ── Form builders ───────────────────────
  private buildForm(): FormGroup {
    const fields: Record<SectionType, Record<string, unknown>> = {
      WORK_EXPERIENCE:  { company: ['', Validators.required], title: ['', Validators.required], location: [''], startDate: ['', Validators.required], endDate: [''], current: [false], description: [''] },
      EDUCATION:        { school: ['', Validators.required], degree: ['', Validators.required], field: [''], gpa: [''], startDate: [''], endDate: [''], description: [''] },
      SKILLS:           { category: ['', Validators.required], skillsRaw: ['', Validators.required] },
      PROJECTS:         { name: ['', Validators.required], url: [''], startDate: [''], endDate: [''], current: [false], description: [''] },
      CERTIFICATIONS:   { name: ['', Validators.required], issuer: [''], date: [''], url: [''] },
      AWARDS:           { title: ['', Validators.required], issuer: [''], date: [''], description: [''] },
      LANGUAGES:        { language: ['', Validators.required], proficiency: [''] },
      VOLUNTEER:        { organization: ['', Validators.required], role: [''], startDate: [''], endDate: [''], current: [false], description: [''] },
    };

    return this.fb.group(fields[this.sectionType]);
  }

  private patchForm(data: Record<string, unknown>): void {
    const patch = { ...data };

    // Skills array → comma string for editing
    if (this.sectionType === 'SKILLS' && Array.isArray(data['skills'])) {
      patch['skillsRaw'] = (data['skills'] as string[]).join(', ');
    }

    if (this.usesDescription) {
      const folded = this.foldLegacyIntoDescription(data);
      patch['description'] = this.appendToDescription
        ? [folded, this.appendToDescription].filter(Boolean).join('\n\n')
        : folded;
    }

    this.form.patchValue(patch);
  }

  /**
   * Builds the description box's initial text for an entry saved before the
   * forms were simplified.
   *
   * Those rows carry `summary`, `technologies`, `bullets`, and `customDetails`
   * and no `description`; there is no database migration, so they are still out
   * there. Showing the description box empty would look like the entry had lost
   * its content, and saving would then genuinely lose it. Flattening the old
   * fields into editable prose mirrors what describeEntry() in
   * backend/src/lib/profileExport.ts already sends to the AI, so what the user
   * sees is what the resume is written from.
   */
  private foldLegacyIntoDescription(data: Record<string, unknown>): string {
    const existing = typeof data['description'] === 'string' ? data['description'].trim() : '';

    const technologies = Array.isArray(data['technologies'])
      ? (data['technologies'] as string[]).filter(Boolean)
      : [];

    const details = Array.isArray(data['customDetails'])
      ? (data['customDetails'] as Array<{ label?: string; value?: string }>)
          .filter(d => d.label?.trim() && d.value?.trim())
          .map(d => `${d.label!.trim()}: ${d.value!.trim()}`)
      : [];

    const bullets = Array.isArray(data['bullets'])
      ? (data['bullets'] as string[]).map(b => b.trim()).filter(Boolean)
      : [];

    return [
      existing,
      typeof data['summary'] === 'string' ? data['summary'].trim() : '',
      technologies.length ? `Technologies: ${technologies.join(', ')}` : '',
      details.join('. '),
      bullets.join('\n'),
    ].filter(Boolean).join('\n\n');
  }
}
