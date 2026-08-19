import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { CooperativaService } from './cooperativa.service';

export const cooperativaAuthGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const cooperativaService = inject(CooperativaService);
  const router = inject(Router);

  const sessao = await auth.sessaoAtual();
  if (!sessao) return router.createUrlTree(['/cooperativa/entrar']);

  if (!cooperativaService.cooperativa()) {
    await cooperativaService.carregar();
  }
  return true;
};
