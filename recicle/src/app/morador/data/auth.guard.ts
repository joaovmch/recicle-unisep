import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from '../../shared/data/auth.service';
import { MoradorService } from './morador.service';

/**
 * Ecopontos é anunciado na home pública como algo que dá pra ver sem conta — a tela
 * não usa nenhum dado do morador, então não faz sentido bloquear quem ainda não tem
 * login. Quem já está logado continua vendo com o topbar completo (pontos, avatar etc).
 */
const ROTAS_PUBLICAS = ['/ecopontos'];

/**
 * Sessão válida sem linha em "moradores" significa cadastro incompleto (a conta foi
 * criada mas o perfil não chegou a ser gravado) — nesse caso volta para a criação de
 * conta em vez de deixar o painel abrir vazio.
 */
export const moradorAuthGuard: CanActivateChildFn = async (_route, state) => {
  const auth = inject(AuthService);
  const moradorService = inject(MoradorService);
  const router = inject(Router);

  const rotaPublica = ROTAS_PUBLICAS.some(rota => state.url.startsWith(rota));

  const sessao = await auth.sessaoAtual();
  if (!sessao) return rotaPublica ? true : router.createUrlTree(['/entrar']);

  const morador = moradorService.morador() ?? (await moradorService.carregar());
  if (!morador) {
    return rotaPublica ? true : router.createUrlTree(['/entrar'], { queryParams: { completar: 'morador' } });
  }

  return true;
};
