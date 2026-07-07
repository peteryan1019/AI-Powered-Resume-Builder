// frontend/src/app/features/profile/components/instance-row.component.ts
//
// Displays a single instance as a summary row.
// Shows different primary/secondary text depending on section type.

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfileInstance, SectionType, SECTION_CONFIG } from '../profile.types';

@Component({
  selector: 'app-instance-row',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="instance-row">
      <div class="instance-icon">
        <i class="ti {{ icon }}"></i>
      </div>
      <div class="instance-info">
        <div class="instance-title">{{ primaryText }}</div>
        <div class="instance-sub" *ngIf="secondaryText">{{ secondaryText }}</div>
      </div>
      <div class="instance-actions">
        <button class="btn-icon" (click)="editClicked.emit()" title="Edit">
          <i class="ti ti-pencil"></i>
        </button>
        <button class="btn-icon danger" (click)="deleteClicked.emit()" title="Delete">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./instance-row.component.scss'],
})
export class InstanceRowComponent {
  @Input() instance!: ProfileInstance;
  @Input() sectionType!: SectionType;

  @Output() editClicked   = new EventEmitter<void>();
  @Output() deleteClicked = new EventEmitter<void>();

  get icon(): string {
    return SECTION_CONFIG[this.sectionType].icon;
  }

  get primaryText(): string {
    const d = this.instance.data as Record<string, string>;
    switch (this.sectionType) {
      case 'WORK_EXPERIENCE':  return d['title'] ?? '';
      case 'EDUCATION':        return d['degree'] ? `${d['degree']}${d['field'] ? ` in ${d['field']}` : ''}` : '';
      case 'SKILLS':           return d['category'] ?? '';
      case 'PROJECTS':         return d['name'] ?? '';
      case 'CERTIFICATIONS':   return d['name'] ?? '';
      case 'AWARDS':           return d['title'] ?? '';
      case 'LANGUAGES':        return d['language'] ?? '';
      case 'VOLUNTEER':        return d['role'] ?? d['organization'] ?? '';
      default:                 return '';
    }
  }

  get secondaryText(): string {
    const d = this.instance.data as Record<string, string>;
    const dateRange = (start?: string, end?: string, current?: boolean) =>
      start ? `${start} – ${current ? 'Present' : (end ?? 'Present')}` : '';

    switch (this.sectionType) {
      case 'WORK_EXPERIENCE':
        return [d['company'], d['location'], d['summary'], dateRange(d['startDate'], d['endDate'], !!d['current'])]
          .filter(Boolean).join(' · ');
      case 'EDUCATION':
        return [d['school'], dateRange(d['startDate'], d['endDate'])].filter(Boolean).join(' · ');
      case 'SKILLS':
        return Array.isArray(this.instance.data['skills'])
          ? (this.instance.data['skills'] as string[]).join(', ')
          : '';
      case 'PROJECTS':
        return [d['summary'], dateRange(d['startDate'], d['endDate'], !!d['current'])].filter(Boolean).join(' · ');
      case 'CERTIFICATIONS':
        return [d['issuer'], d['date']].filter(Boolean).join(' · ');
      case 'AWARDS':
        return [d['issuer'], d['date']].filter(Boolean).join(' · ');
      case 'LANGUAGES':
        return d['proficiency'] ?? '';
      case 'VOLUNTEER':
        return [d['organization'], dateRange(d['startDate'], d['endDate'], !!d['current'])]
          .filter(Boolean).join(' · ');
      default:
        return '';
    }
  }
}