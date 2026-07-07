import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TailorPage } from './tailor-page';

describe('TailorPage', () => {
  let component: TailorPage;
  let fixture: ComponentFixture<TailorPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TailorPage],
    }).compileComponents();

    fixture = TestBed.createComponent(TailorPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
