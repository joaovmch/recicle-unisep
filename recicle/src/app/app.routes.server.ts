import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rotas protegidas pelo login da cooperativa — dependem de estado do
  // navegador (localStorage), então não fazem sentido pré-renderizadas.
  {
    path: 'cooperativa/dashboard',
    renderMode: RenderMode.Client
  },
  {
    path: 'cooperativa/solicitacoes',
    renderMode: RenderMode.Client
  },
  {
    path: 'cooperativa/solicitacoes/:id/confirmar',
    renderMode: RenderMode.Client
  },
  {
    path: 'cooperativa/residuos',
    renderMode: RenderMode.Client
  },
  {
    path: 'cooperativa/area-cobertura',
    renderMode: RenderMode.Client
  },
  {
    path: 'cooperativa/equipe',
    renderMode: RenderMode.Client
  },
  {
    path: 'cooperativa/documentos',
    renderMode: RenderMode.Client
  },
  {
    path: 'cooperativa/relatorios',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
