import { Routes } from '@angular/router';
import { adminAuthGuard } from './data/auth.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'entrar',
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
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
      },
      {
        path: 'cooperativas',
        loadComponent: () => import('./pages/cooperativas/cooperativas').then(m => m.Cooperativas),
      },
      {
        path: 'clientes',
        loadComponent: () => import('./pages/clientes/clientes').then(m => m.Clientes),
      },
    ],
  },
];
