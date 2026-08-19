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
    path: 'cadastro/analise',
    loadComponent: () =>
      import('./pages/analise-cadastro/analise-cadastro').then(m => m.AnaliseCadastro)
  },
  {
    path: '',
    canActivate: [cooperativaAuthGuard],
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
