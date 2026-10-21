import { Routes } from '@angular/router';
import { adminAuthGuard } from './data/auth.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'entrar',
    title: 'Entrar · Admin · Re-cicle',
    loadComponent: () => import('./pages/entrar/entrar').then(m => m.Entrar),
  },
  {
    path: '',
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./layout/admin-layout').then(m => m.AdminLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        title: 'Visão geral · Admin · Re-cicle',
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
      },
      {
        path: 'cooperativas',
        title: 'Cooperativas · Admin · Re-cicle',
        loadComponent: () => import('./pages/cooperativas/cooperativas').then(m => m.Cooperativas),
      },
      {
        path: 'clientes',
        title: 'Clientes · Admin · Re-cicle',
        loadComponent: () => import('./pages/clientes/clientes').then(m => m.Clientes),
      },
      {
        path: 'administradores',
        title: 'Administradores · Admin · Re-cicle',
        loadComponent: () =>
          import('./pages/administradores/administradores').then(m => m.Administradores),
      },
    ],
  },
];
