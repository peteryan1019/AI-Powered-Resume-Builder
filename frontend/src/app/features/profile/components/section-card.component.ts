// frontend/src/app/features/profile/components/section-card.component.ts

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfileSection, SECTION_CONFIG } from '../profile.types';
import { InstanceRowComponent } from './instance-row.component';
import { InstanceFormComponent } from './instance-form.component';

@Component({
  selector: 'app-section-card',
  standalone: true,
  imports: [CommonModule, InstanceRowComponent, InstanceFormComponent],
  template: `
    <div class="section-card">

      <!-- Header -->
      <div class="section-header" (click)="expanded = !expanded">
        <div class="section-title">
          <span class="section-dot"></span>
          <span class="section-name">{{ section.label }}</span>
          <span class="section-meta" *ngIf="section.instances.length > 0">
            {{ section.instances.length }} {{ section.instances.length === 1 ? 'entry' : 'entries' }}
          </span>
        </div>
        <div class="section-actions" (click)="$event.stopPropagation()">
          <button class="btn-ghost" (click)="openAddForm()">
            <i class="ti ti-plus"></i> Add
          </button>
          <button class="btn-ghost danger" (click)="onDeleteSection()">
            <i class="ti ti-trash"></i>
          </button>
          <button class="btn-ghost">
            <i class="ti" [class.ti-chevron-up]="expanded" [class.ti-chevron-down]="!expanded"></i>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="section-body" *ngIf="expanded">

        <!-- Instance list -->
        <app-instance-row
          *ngFor="let instance of section.instances"
          [instance]="instance"
          [sectionType]="section.type"
          (editClicked)="openEditForm(instance.id)"
          (deleteClicked)="instanceDeleted.emit(instance.id)"
        />

        <!-- Empty state -->
        <div class="empty-instances" *ngIf="section.instances.length === 0 && !showForm">
          <p>No entries yet.</p>
        </div>

        <!-- Add / Edit form -->
        <app-instance-form
          *ngIf="showForm"
          [sectionType]="section.type"
          [existingData]="editingInstance?.data ?? null"
          (formSubmitted)="onFormSubmit($event)"
          (formCancelled)="closeForm()"
        />

        <!-- Add button at bottom -->
        <button class="add-instance-btn" *ngIf="!showForm" (click)="openAddForm()">
          <i class="ti ti-plus"></i>
          {{ config.addLabel }}
        </button>
      </div>

    </div>
  `,
  styleUrls: ['./section-card.component.scss'],
})
export class SectionCardComponent {
  @Input() section!: ProfileSection;

  @Output() instanceAdded   = new EventEmitter<Record<string, unknown>>();
  @Output() instanceUpdated = new EventEmitter<{ id: string; data: Record<string, unknown> }>();
  @Output() instanceDeleted = new EventEmitter<string>();
  @Output() sectionDeleted  = new EventEmitter<void>();

  expanded = true;
  showForm = false;
  editingInstanceId: string | null = null;

  get config() {
    return SECTION_CONFIG[this.section.type];
  }

  get editingInstance() {
    return this.section.instances.find(i => i.id === this.editingInstanceId) ?? null;
  }

  openAddForm(): void {
    this.editingInstanceId = null;
    this.showForm = true;
  }

  openEditForm(instanceId: string): void {
    this.editingInstanceId = instanceId;
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
    this.editingInstanceId = null;
  }

  onFormSubmit(data: Record<string, unknown>): void {
    if (this.editingInstanceId) {
      this.instanceUpdated.emit({ id: this.editingInstanceId, data });
    } else {
      this.instanceAdded.emit(data);
    }
    this.closeForm();
  }

  onDeleteSection(): void {
    if (confirm(`Delete "${this.section.label}" and all its entries?`)) {
      this.sectionDeleted.emit();
    }
  }
}