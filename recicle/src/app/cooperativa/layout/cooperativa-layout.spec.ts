import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CooperativaLayout } from './cooperativa-layout';

describe('CooperativaLayout', () => {
  let component: CooperativaLayout;
  let fixture: ComponentFixture<CooperativaLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CooperativaLayout],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CooperativaLayout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
