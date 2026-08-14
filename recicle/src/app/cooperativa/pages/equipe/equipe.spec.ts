import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Equipe } from './equipe';

describe('Equipe', () => {
  let component: Equipe;
  let fixture: ComponentFixture<Equipe>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Equipe],
    }).compileComponents();

    fixture = TestBed.createComponent(Equipe);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
