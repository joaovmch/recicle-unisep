import { Routes } from '@angular/router';
import { moradorAuthGuard } from './data/auth.guard';

export const MORADOR_ROUTES: Routes = [
  {
    path: '',
    // canActivateChild (e não canActivate): o layout fica ativo entre as telas, então um
    // canActivate no pai só rodaria na primeira entrada — quem chegasse pelo /ecopontos
    // público navegaria para /chat, /painel etc. pelas abas sem passar pelo guard de novo.
    canActivateChild: [moradorAuthGuard],
    loadComponent: () => import('./layout/morador-layout').then(m => m.MoradorLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      {
        path: 'painel',
        title: 'Painel · Re-cicle',
        loadComponent: () => import('./pages/painel/painel').then(m => m.Painel),
      },
      {
        path: 'chat',
        title: 'Assistente · Re-cicle',
        loadComponent: () => import('./pages/chat/chat').then(m => m.Chat),
      },
      {
        path: 'ecopontos',
        title: 'Ecopontos · Re-cicle',
        loadComponent: () => import('./pages/ecopontos/ecopontos').then(m => m.Ecopontos),
      },
      {
        path: 'solicitacoes',
        title: 'Minhas solicitações · Re-cicle',
        loadComponent: () => import('./pages/solicitacoes/solicitacoes').then(m => m.Solicitacoes),
      },
      {
        path: 'solicitacoes/:id',
        title: 'Solicitação · Re-cicle',
        loadComponent: () => import('./pages/solicitacao-detalhe/solicitacao-detalhe').then(m => m.SolicitacaoDetalhe),
      },
      {
        path: 'pontos',
        title: 'Meus pontos · Re-cicle',
        loadComponent: () => import('./pages/pontos/pontos').then(m => m.Pontos),
      },
      {
        path: 'perfil',
        title: 'Perfil · Re-cicle',
        loadComponent: () => import('./pages/perfil/perfil').then(m => m.Perfil),
      },
    ],
  },
];
