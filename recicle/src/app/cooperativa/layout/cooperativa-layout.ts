import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastHost } from '../shared/toast-host';
import { AuthService } from '../data/auth.service';

@Component({
  selector: 'app-cooperativa-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastHost],
  templateUrl: './cooperativa-layout.html',
  styleUrls: ['../shared/cooperativa-shared.css', './cooperativa-layout.css'],
})
export class CooperativaLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  sair(): void {
    this.auth.sair();
    this.router.navigate(['/cooperativa/entrar']);
  }
}
