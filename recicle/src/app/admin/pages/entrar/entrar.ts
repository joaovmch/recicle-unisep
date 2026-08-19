import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../cooperativa/data/auth.service';
import { AdminService } from '../../data/admin.service';

@Component({
  selector: 'app-admin-entrar',
  imports: [RouterLink],
  templateUrl: './entrar.html',
  styleUrls: ['../../../cooperativa/shared/cooperativa-shared.css', '../../../cooperativa/pages/entrar/entrar.css'],
})
export class Entrar {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly adminService = inject(AdminService);

  readonly email = signal('');
  readonly senha = signal('');
  readonly senhaVisivel = signal(false);
  readonly erro = signal<string | null>(null);
  readonly entrando = signal(false);

  async entrar(): Promise<void> {
    if (this.entrando()) return;
    this.entrando.set(true);
    this.erro.set(null);

    const erroLogin = await this.auth.entrar(this.email(), this.senha());
    if (erroLogin) {
      this.entrando.set(false);
      this.erro.set(erroLogin);
      return;
    }

    const admin = await this.adminService.carregar();
    this.entrando.set(false);

    if (!admin) {
      this.erro.set('Essa conta não tem acesso à área administrativa.');
      await this.auth.sair();
      return;
    }

    this.router.navigate(['/admin/dashboard']);
  }
}
