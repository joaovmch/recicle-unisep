import { Routes } from '@angular/router';
import { moradorAuthGuard } from './data/auth.guard';

export const MORADOR_ROUTES: Routes = [
  {
    path: '',
    canActivate: [moradorAuthGuard],
    loadComponent: () => import('./layout/morador-layout').then(m => m.MoradorLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      {
        path: 'painel',
        loadComponent: () => import('./pages/painel/painel').then(m => m.Painel),
      },
      {
        path: 'chat',
        loadComponent: () => import('./pages/chat/chat').then(m => m.Chat),
      },
      {
        path: 'ecopontos',
        loadComponent: () => import('./pages/ecopontos/ecopontos').then(m => m.Ecopontos),
      },
      {
        path: 'solicitacoes',
        loadComponent: () => import('./pages/solicitacoes/solicitacoes').then(m => m.Solicitacoes),
      },
      {
        path: 'solicitacoes/:id',
        loadComponent: () => import('./pages/solicitacao-detalhe/solicitacao-detalhe').then(m => m.SolicitacaoDetalhe),
      },
      {
        path: 'pontos',
        loadComponent: () => import('./pages/pontos/pontos').then(m => m.Pontos),
      },
      {
        path: 'perfil',
        loadComponent: () => import('./pages/perfil/perfil').then(m => m.Perfil),
      },
    ],
  },
];
