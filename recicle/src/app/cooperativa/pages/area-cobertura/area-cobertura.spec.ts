import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AreaCobertura } from './area-cobertura';

describe('AreaCobertura', () => {
  let component: AreaCobertura;
  let fixture: ComponentFixture<AreaCobertura>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AreaCobertura],
    }).compileComponents();

    fixture = TestBed.createComponent(AreaCobertura);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
