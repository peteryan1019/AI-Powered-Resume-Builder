import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { ResumeTemplatesPage } from './resume-templates-page';

describe('ResumeTemplatesPage', () => {
  let component: ResumeTemplatesPage;
  let fixture: ComponentFixture<ResumeTemplatesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResumeTemplatesPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ResumeTemplatesPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
