import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AnaliseCadastro } from './analise-cadastro';

describe('AnaliseCadastro', () => {
  let component: AnaliseCadastro;
  let fixture: ComponentFixture<AnaliseCadastro>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnaliseCadastro],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AnaliseCadastro);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
