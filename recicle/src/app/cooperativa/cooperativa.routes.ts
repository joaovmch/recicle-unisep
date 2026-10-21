import { Routes } from '@angular/router';
import { cooperativaAuthGuard } from './data/auth.guard';

export const COOPERATIVA_ROUTES: Routes = [
  {
    path: 'entrar',
    title: 'Entrar · Cooperativa · Re-cicle',
    loadComponent: () =>
      import('./pages/entrar/entrar').then(m => m.Entrar)
  },
  {
    path: 'cadastro',
    title: 'Cadastro de cooperativa · Re-cicle',
    loadComponent: () =>
      import('./pages/cadastro/cadastro').then(m => m.Cadastro)
  },
  {
    // Mesmo wizard da rota acima, mas em modo edição: sempre busca a cooperativa logada e
    // pré-preenche com os dados reais, em vez de decidir isso pela sessão estar ou não ativa
    // (o que misturava "Cadastrar" com "Editar cadastro" quando havia sessão de outro teste aberta).
    path: 'cadastro/editar',
    title: 'Revisar cadastro · Re-cicle',
    data: { edicao: true },
    loadComponent: () =>
      import('./pages/cadastro/cadastro').then(m => m.Cadastro)
  },
  {
    path: 'cadastro/analise',
    title: 'Cadastro em análise · Re-cicle',
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
        title: 'Visão geral · Cooperativa · Re-cicle',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then(m => m.Dashboard)
      },
      {
        path: 'solicitacoes',
        title: 'Solicitações · Cooperativa · Re-cicle',
        loadComponent: () =>
          import('./pages/solicitacoes/solicitacoes').then(m => m.Solicitacoes)
      },
      {
        path: 'solicitacoes/:id/conversa',
        title: 'Conversa com a IA · Re-cicle',
        loadComponent: () =>
          import('./pages/conversa-ia/conversa-ia').then(m => m.ConversaIa)
      },
      {
        path: 'solicitacoes/:id/aceita',
        title: 'Coleta aceita · Re-cicle',
        loadComponent: () =>
          import('./pages/coleta-aceita/coleta-aceita').then(m => m.ColetaAceita)
      },
      {
        path: 'solicitacoes/:id/confirmar',
        title: 'Confirmar recebimento · Re-cicle',
        loadComponent: () =>
          import('./pages/confirmar-recebimento/confirmar-recebimento').then(m => m.ConfirmarRecebimento)
      },
      {
        path: 'residuos',
        title: 'Tipos de resíduo · Re-cicle',
        loadComponent: () =>
          import('./pages/residuos/residuos').then(m => m.Residuos)
      },
      {
        path: 'area-cobertura',
        title: 'Área de cobertura · Re-cicle',
        loadComponent: () =>
          import('./pages/area-cobertura/area-cobertura').then(m => m.AreaCobertura)
      },
      {
        path: 'equipe',
        title: 'Equipe e veículos · Re-cicle',
        loadComponent: () =>
          import('./pages/equipe/equipe').then(m => m.Equipe)
      },
      {
        path: 'documentos',
        title: 'Documentos e licença · Re-cicle',
        loadComponent: () =>
          import('./pages/documentos/documentos').then(m => m.Documentos)
      },
      {
        path: 'relatorios',
        title: 'Relatórios · Re-cicle',
        loadComponent: () =>
          import('./pages/relatorios/relatorios').then(m => m.Relatorios)
      }
    ]
  }
];
