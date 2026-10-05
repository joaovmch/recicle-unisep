import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rotas do morador — todas dependem da sessão no navegador, então são
  // renderizadas só no cliente (o detalhe ainda tem :id, que não dá para
  // pré-renderizar sem saber os ids de antemão).
  { path: 'painel', renderMode: RenderMode.Client },
  { path: 'chat', renderMode: RenderMode.Client },
  { path: 'ecopontos', renderMode: RenderMode.Client },
  { path: 'solicitacoes', renderMode: RenderMode.Client },
  { path: 'solicitacoes/:id', renderMode: RenderMode.Client },
  { path: 'pontos', renderMode: RenderMode.Client },
  { path: 'perfil', renderMode: RenderMode.Client },
  { path: 'entrar', renderMode: RenderMode.Client },

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
    path: 'cooperativa/solicitacoes/:id/conversa',
    renderMode: RenderMode.Client
  },
  {
    path: 'cooperativa/solicitacoes/:id/aceita',
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
    path: 'cooperativa/cadastro/editar',
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
