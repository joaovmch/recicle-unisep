import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Residuos } from './residuos';

describe('Residuos', () => {
  let component: Residuos;
  let fixture: ComponentFixture<Residuos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Residuos],
    }).compileComponents();

    fixture = TestBed.createComponent(Residuos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
