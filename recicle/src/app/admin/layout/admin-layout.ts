import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/data/auth.service';
import { AdminService } from '../data/admin.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.html',
  styleUrls: ['../../cooperativa/layout/cooperativa-layout.css'],
})
export class AdminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly adminService = inject(AdminService);

  async sair(): Promise<void> {
    await this.auth.sair();
    this.router.navigate(['/admin/entrar']);
  }
}
