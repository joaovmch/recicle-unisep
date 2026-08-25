import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'cooperativa/entrar'
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login').then(m => m.Login)
  },
  {
    path: 'cadastro',
    pathMatch: 'full',
    redirectTo: 'cooperativa/cadastro'
  },
  {
  path: 'cooperativa',
  loadChildren: () =>
    import('./cooperativa/cooperativa.routes').then(
      m => m.COOPERATIVA_ROUTES
    )
},
  {
    path: 'admin',
    loadChildren: () =>
      import('./admin/admin.routes').then(m => m.ADMIN_ROUTES)
  }
];