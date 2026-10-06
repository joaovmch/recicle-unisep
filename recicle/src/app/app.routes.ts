import { Routes } from '@angular/router';

export const routes: Routes = [
  // --- Público ---
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./publico/home/home').then(m => m.Home),
  },
  {
    path: 'como-funciona',
    loadComponent: () => import('./publico/como-funciona/como-funciona').then(m => m.ComoFunciona),
  },
  {
    path: 'entrar',
    loadComponent: () => import('./publico/entrar/entrar').then(m => m.Entrar),
  },
  {
    path: 'cadastro',
    pathMatch: 'full',
    redirectTo: 'entrar',
  },

  // --- Parceiros e equipe ---
  {
    path: 'cooperativa',
    loadChildren: () => import('./cooperativa/cooperativa.routes').then(m => m.COOPERATIVA_ROUTES),
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES),
  },

  // --- Morador (na raiz: /painel, /chat, /ecopontos, /solicitacoes, /pontos, /perfil) ---
  {
    path: '',
    loadChildren: () => import('./morador/morador.routes').then(m => m.MORADOR_ROUTES),
  },
];
