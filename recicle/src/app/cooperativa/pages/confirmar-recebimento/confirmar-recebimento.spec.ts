import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { ConfirmarRecebimento } from './confirmar-recebimento';

describe('ConfirmarRecebimento', () => {
  let component: ConfirmarRecebimento;
  let fixture: ComponentFixture<ConfirmarRecebimento>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmarRecebimento],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '1042' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmarRecebimento);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
