import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastHost } from '../../cooperativa/shared/toast-host';
import { AuthService } from '../../cooperativa/data/auth.service';
import { AdminService } from '../data/admin.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastHost],
  templateUrl: './admin-layout.html',
  styleUrls: ['../../cooperativa/layout/cooperativa-layout.css'],
})
export class AdminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly adminService = inject(AdminService);

  async sair(): Promise<void> {
    await this.auth.sair();
    this.adminService.limpar();
    this.router.navigate(['/admin/entrar']);
  }
}
