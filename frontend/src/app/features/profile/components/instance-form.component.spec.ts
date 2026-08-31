import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InstanceFormComponent } from './instance-form.component';
import testProviders from '../../../../test-providers';

describe('InstanceFormComponent', () => {
  let fixture: ComponentFixture<InstanceFormComponent>;
  let component: InstanceFormComponent;

  const mount = (
    sectionType: InstanceFormComponent['sectionType'],
    existingData: Record<string, unknown> | null = null,
  ) => {
    fixture = TestBed.createComponent(InstanceFormComponent);
    component = fixture.componentInstance;
    component.sectionType = sectionType;
    component.existingData = existingData;
    fixture.detectChanges();
  };

  const textareaValue = (): string =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      'textarea[formControlName="description"]',
    )!.value;

  beforeEach(() => TestBed.configureTestingModule({ providers: testProviders }));

  it('renders one description box and no bullet list for a work entry', () => {
    mount('WORK_EXPERIENCE');
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('textarea[formControlName="description"]')).toBeTruthy();
    // The old form had an "Add bullet" button and a per-bullet FormArray.
    expect(host.textContent).not.toContain('Add bullet');
    expect(host.querySelector('[formArrayName="bullets"]')).toBeNull();
    // Company and title stay structured: they head every resume entry and the
    // prompts require them exact.
    expect(host.querySelector('input[formControlName="company"]')).toBeTruthy();
    expect(host.querySelector('input[formControlName="title"]')).toBeTruthy();
  });

  it('folds a legacy entry into the description box so editing cannot lose it', () => {
    mount('WORK_EXPERIENCE', {
      company: 'Acme',
      title: 'Backend Developer',
      summary: 'Owned the billing service.',
      technologies: ['TypeScript', 'PostgreSQL'],
      bullets: ['Cut p99 latency by 40%.', 'Migrated 12M rows.'],
      customDetails: [{ label: 'Team', value: '6 engineers' }],
    });

    const value = textareaValue();
    expect(value).toContain('Owned the billing service.');
    expect(value).toContain('Technologies: TypeScript, PostgreSQL');
    expect(value).toContain('Cut p99 latency by 40%.');
    expect(value).toContain('Migrated 12M rows.');
    expect(value).toContain('Team: 6 engineers');
  });

  it('drops the legacy keys on save, so the row is not exported twice', () => {
    mount('WORK_EXPERIENCE', {
      company: 'Acme',
      title: 'Backend Developer',
      startDate: '2023-01',
      summary: 'Owned the billing service.',
      bullets: ['Cut p99 latency by 40%.'],
    });

    let emitted: Record<string, unknown> | undefined;
    component.formSubmitted.subscribe((v) => (emitted = v));
    component.onSubmit();

    expect(emitted).toBeDefined();
    expect(emitted!['description']).toContain('Cut p99 latency by 40%.');
    expect(emitted!['summary']).toBeUndefined();
    expect(emitted!['bullets']).toBeUndefined();
    expect(emitted!['technologies']).toBeUndefined();
    expect(emitted!['customDetails']).toBeUndefined();
  });

  it('gives education a description box and keeps GPA structured', () => {
    mount('EDUCATION', {
      school: 'UofT',
      degree: 'BSc',
      gpa: '3.8',
      bullets: ["Dean's List 2021", 'Coursework: Distributed Systems'],
    });

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('input[formControlName="gpa"]')).toBeTruthy();
    expect(textareaValue()).toContain("Dean's List 2021");
    expect(textareaValue()).toContain('Coursework: Distributed Systems');
  });

  it('leaves the skills form alone', () => {
    mount('SKILLS', { category: 'Languages', skills: ['TypeScript', 'Python'] });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('textarea[formControlName="description"]')).toBeNull();
    expect(
      host.querySelector<HTMLInputElement>('input[formControlName="skillsRaw"]')!.value,
    ).toBe('TypeScript, Python');
  });
});
