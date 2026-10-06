import { Routes } from '@angular/router';
import { cooperativaAuthGuard } from './data/auth.guard';

export const COOPERATIVA_ROUTES: Routes = [
  {
    path: 'entrar',
    loadComponent: () =>
      import('./pages/entrar/entrar').then(m => m.Entrar)
  },
  {
    path: 'cadastro',
    loadComponent: () =>
      import('./pages/cadastro/cadastro').then(m => m.Cadastro)
  },
  {
    // Mesmo wizard da rota acima, mas em modo edição: sempre busca a cooperativa logada e
    // pré-preenche com os dados reais, em vez de decidir isso pela sessão estar ou não ativa
    // (o que misturava "Cadastrar" com "Editar cadastro" quando havia sessão de outro teste aberta).
    path: 'cadastro/editar',
    data: { edicao: true },
    loadComponent: () =>
      import('./pages/cadastro/cadastro').then(m => m.Cadastro)
  },
  {
    path: 'cadastro/analise',
    loadComponent: () =>
      import('./pages/analise-cadastro/analise-cadastro').then(m => m.AnaliseCadastro)
  },
  {
    path: '',
    // canActivateChild (e não canActivate): o layout fica ativo entre as telas, então um
    // canActivate no pai só rodaria na primeira entrada — uma cooperativa ainda em análise
    // entrava pelo /cooperativa/documentos (a exceção pré-aprovação) e de lá alcançava
    // dashboard, relatórios etc. pelo menu lateral sem passar pelo guard de novo.
    canActivateChild: [cooperativaAuthGuard],
    loadComponent: () =>
      import('./layout/cooperativa-layout').then(m => m.CooperativaLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then(m => m.Dashboard)
      },
      {
        path: 'solicitacoes',
        loadComponent: () =>
          import('./pages/solicitacoes/solicitacoes').then(m => m.Solicitacoes)
      },
      {
        path: 'solicitacoes/:id/conversa',
        loadComponent: () =>
          import('./pages/conversa-ia/conversa-ia').then(m => m.ConversaIa)
      },
      {
        path: 'solicitacoes/:id/aceita',
        loadComponent: () =>
          import('./pages/coleta-aceita/coleta-aceita').then(m => m.ColetaAceita)
      },
      {
        path: 'solicitacoes/:id/confirmar',
        loadComponent: () =>
          import('./pages/confirmar-recebimento/confirmar-recebimento').then(m => m.ConfirmarRecebimento)
      },
      {
        path: 'residuos',
        loadComponent: () =>
          import('./pages/residuos/residuos').then(m => m.Residuos)
      },
      {
        path: 'area-cobertura',
        loadComponent: () =>
          import('./pages/area-cobertura/area-cobertura').then(m => m.AreaCobertura)
      },
      {
        path: 'equipe',
        loadComponent: () =>
          import('./pages/equipe/equipe').then(m => m.Equipe)
      },
      {
        path: 'documentos',
        loadComponent: () =>
          import('./pages/documentos/documentos').then(m => m.Documentos)
      },
      {
        path: 'relatorios',
        loadComponent: () =>
          import('./pages/relatorios/relatorios').then(m => m.Relatorios)
      }
    ]
  }
];
