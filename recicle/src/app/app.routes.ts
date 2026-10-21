import { Routes } from '@angular/router';

export const routes: Routes = [
  // --- Público ---
  {
    path: '',
    title: 'Re-cicle',
    pathMatch: 'full',
    loadComponent: () => import('./publico/home/home').then(m => m.Home),
  },
  {
    path: 'como-funciona',
    title: 'Como funciona · Re-cicle',
    loadComponent: () => import('./publico/como-funciona/como-funciona').then(m => m.ComoFunciona),
  },
  {
    path: 'entrar',
    title: 'Entrar · Re-cicle',
    loadComponent: () => import('./publico/entrar/entrar').then(m => m.Entrar),
  },
  {
    // Destino do link de "esqueci a senha" (vale para morador e cooperativa).
    path: 'nova-senha',
    title: 'Nova senha · Re-cicle',
    loadComponent: () => import('./publico/nova-senha/nova-senha').then(m => m.NovaSenha),
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

  // Endereço que não existe (link velho, digitação) volta para o início em vez de tela branca.
  { path: '**', redirectTo: '' },
];
