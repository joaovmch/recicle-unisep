-- Migração: ajustes de segurança, performance e limpeza de schema encontrados na
-- revisão do banco (advisors do Supabase + comparação com o que o código realmente usa).
--
-- Seguro rodar mais de uma vez: "create or replace", "drop policy if exists" e
-- "drop column if exists" não quebram nada se já tiverem sido aplicados.
--
-- Rode isso no SQL Editor do painel do Supabase.

-- 1) Código de confirmação de recebimento deixa de ser calculado no front-end
--    (hash determinístico a partir do próprio id da solicitação, visível no bundle
--    JS — qualquer pessoa conseguia calcular o código sem nunca ter visto a tela
--    do morador) e passa a ser um valor aleatório gerado pelo banco na criação da
--    solicitação, do mesmo jeito que o app da cooperativa já espera comparar.
create or replace function public.gerar_codigo_confirmacao()
returns text
language sql
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 32)::int + 1, 1),
    ''
  )
  from generate_series(1, 4);
$$;

alter table public.solicitacoes
  add column if not exists codigo_confirmacao text not null default public.gerar_codigo_confirmacao();

-- 2) Colunas mortas em "documentos": ficaram de uma versão anterior do schema, antes
--    da licença (número/órgão/validade) passar a morar em "cooperativas". Nenhuma
--    tela ou serviço do código-fonte lê ou escreve nelas hoje.
alter table public.documentos
  drop column if exists numero_licenca,
  drop column if exists orgao_emissor,
  drop column if exists validade;

-- 3) Índice faltando na chave estrangeira usada pela tela "Equipe e veículos"
--    (contagem de coletas confirmadas por pessoa).
create index if not exists idx_solicitacoes_confirmado_por
  on public.solicitacoes (confirmado_por);

-- 4) Performance das políticas de RLS: `auth.uid()`/`auth.role()` chamado direto numa
--    policy é reavaliado linha a linha; envolver em "select" deixa o Postgres avaliar
--    uma vez só por consulta. Comportamento das políticas continua idêntico.
drop policy if exists "cooperativa vê o próprio perfil" on public.cooperativas;
create policy "cooperativa vê o próprio perfil"
  on public.cooperativas for select
  using (user_id = (select auth.uid()));

drop policy if exists "usuário autenticado cria seu próprio perfil de cooperativa" on public.cooperativas;
create policy "usuário autenticado cria seu próprio perfil de cooperativa"
  on public.cooperativas for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "cooperativa atualiza o próprio perfil" on public.cooperativas;
create policy "cooperativa atualiza o próprio perfil"
  on public.cooperativas for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Nome como o Postgres realmente guardou (truncado em 63 bytes pelo limite de
-- identificador — o nome original já nasceu cortado no meio da palavra "provisório").
drop policy if exists "usuário autenticado pode registrar uma solicitação (provisó" on public.solicitacoes;
create policy "cooperativa autenticada registra solicitação (provisório)"
  on public.solicitacoes for insert
  with check ((select auth.role()) = 'authenticated');
