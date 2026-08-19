import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../cooperativa/data/auth.service';
import { AdminService } from './admin.service';

export const adminAuthGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const adminService = inject(AdminService);
  const router = inject(Router);

  const sessao = await auth.sessaoAtual();
  if (!sessao) return router.createUrlTree(['/admin/entrar']);

  const admin = adminService.admin() ?? (await adminService.carregar());
  if (!admin) return router.createUrlTree(['/admin/entrar']);

  return true;
};
