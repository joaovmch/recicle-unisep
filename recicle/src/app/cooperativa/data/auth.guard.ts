import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../shared/data/auth.service';
import { CooperativaService } from './cooperativa.service';

/**
 * Enquanto o cadastro não é aprovado, só a tela de documentos (corrigir um documento
 * reprovado) fica aberta — equipe, dashboard, solicitações, relatórios etc. só liberam
 * depois que o admin aprova o cadastro.
 */
const ROTAS_LIBERADAS_PRE_APROVACAO = ['/cooperativa/documentos'];

export const cooperativaAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const cooperativaService = inject(CooperativaService);
  const router = inject(Router);

  const sessao = await auth.sessaoAtual();
  if (!sessao) return router.createUrlTree(['/cooperativa/entrar']);

  let cooperativa = cooperativaService.cooperativa();
  if (!cooperativa || cooperativa.statusCadastro !== 'aprovado') {
    // Reconfere no banco enquanto não está aprovado — sem isso, uma aba que já tinha
    // carregado "em análise" antes nunca via a aprovação do admin ao navegar direto
    // pra uma rota interna (só um F5 resolvia).
    cooperativa = await cooperativaService.carregar();
  }
  if (!cooperativa) return router.createUrlTree(['/cooperativa/cadastro']);

  const rotaLiberada = ROTAS_LIBERADAS_PRE_APROVACAO.some(rota => state.url.startsWith(rota));
  if (cooperativa.statusCadastro !== 'aprovado' && !rotaLiberada) {
    return router.createUrlTree(['/cooperativa/cadastro/analise']);
  }

  return true;
};
