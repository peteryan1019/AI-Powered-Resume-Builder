import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { TailorPage } from './tailor-page';

describe('TailorPage', () => {
  let component: TailorPage;
  let fixture: ComponentFixture<TailorPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TailorPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TailorPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
