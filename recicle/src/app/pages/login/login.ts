import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

type TipoConta = 'cooperativa' | 'morador';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly router = inject(Router);

  selecionar(tipo: TipoConta): void {
    if (tipo === 'cooperativa') {
      this.router.navigate(['/cooperativa/entrar']);
    }
  }
}
