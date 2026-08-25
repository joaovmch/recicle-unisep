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
  // O wizard de cadastro/revisão também depende 100% de sessão do navegador
  // (é onde "Revisar cadastro" pré-preenche com os dados reais da cooperativa) —
  // sem isso, ficava servindo uma versão pré-renderizada em branco, sem dados de ninguém.
  {
    path: 'cooperativa/cadastro',
    renderMode: RenderMode.Client
  },
  {
    path: 'cooperativa/cadastro/analise',
    renderMode: RenderMode.Client
  },
  // Rotas protegidas pelo login de admin — mesmo motivo: dependem de sessão do
  // navegador, então nunca podem ser pré-renderizadas (senão o guard de admin
  // roda sem sessão nenhuma e sempre manda de volta pro login).
  {
    path: 'admin/dashboard',
    renderMode: RenderMode.Client
  },
  {
    path: 'admin/cooperativas',
    renderMode: RenderMode.Client
  },
  {
    path: 'admin/clientes',
    renderMode: RenderMode.Client
  },
  {
    path: 'admin/administradores',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
