-- Migração: RLS da tabela "solicitacao_triagem" (tela "Confirmar recebimento" da
-- cooperativa — "Não foi possível registrar a triagem." ao confirmar qualquer coleta).
--
-- A tabela existe no banco mas não tem nenhuma política de RLS registrada em nenhuma
-- migração deste repositório — ela foi criada direto no Studio do Supabase, sem as
-- policies que o código em solicitacoes.store.ts (delete + insert em
-- "solicitacao_triagem" antes de chamar confirmar_recebimento) já espera. Com RLS
-- ligado e zero política, TODA cooperativa autenticada cai no mesmo erro: Postgres
-- devolve "new row violates row-level security policy for table solicitacao_triagem"
-- pro insert (reproduzi isso com a chave anônima pra confirmar o diagnóstico).
--
-- CONFIRA os nomes de coluna abaixo contra a tabela real antes de rodar (o "create
-- table if not exists" só entra em ação se a tabela não existir — no seu caso, ela já
-- existe, então essa parte não faz nada; só as policies é que realmente importam aqui).
--
-- Seguro rodar mais de uma vez: "create table if not exists" e "drop policy if
-- exists" não duplicam nada nem quebram se já tiver sido aplicado.
--
-- Rode isso no SQL Editor do painel do Supabase.

begin;

create table if not exists public.solicitacao_triagem (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  material text not null,
  kg numeric not null default 0,
  checado boolean not null default false
);

alter table public.solicitacao_triagem enable row level security;

-- A cooperativa dona da solicitação lê, grava e apaga a própria triagem (é exatamente
-- esse trio de operações que a tela de confirmar recebimento faz: lê ao abrir a tela,
-- apaga e recria ao salvar). Não existe coluna cooperativa_id na própria tabela — quem
-- é dono é a solicitação, então a política precisa ir buscar isso em "solicitacoes".
drop policy if exists "cooperativa vê a triagem das suas solicitações" on public.solicitacao_triagem;
create policy "cooperativa vê a triagem das suas solicitações"
  on public.solicitacao_triagem for select
  using (exists (
    select 1 from public.solicitacoes s
    where s.id = solicitacao_triagem.solicitacao_id
      and s.cooperativa_id = (select public.cooperativa_atual_id())
  ));

drop policy if exists "cooperativa registra a triagem das suas solicitações" on public.solicitacao_triagem;
create policy "cooperativa registra a triagem das suas solicitações"
  on public.solicitacao_triagem for insert
  with check (exists (
    select 1 from public.solicitacoes s
    where s.id = solicitacao_triagem.solicitacao_id
      and s.cooperativa_id = (select public.cooperativa_atual_id())
  ));

drop policy if exists "cooperativa apaga a triagem das suas solicitações" on public.solicitacao_triagem;
create policy "cooperativa apaga a triagem das suas solicitações"
  on public.solicitacao_triagem for delete
  using (exists (
    select 1 from public.solicitacoes s
    where s.id = solicitacao_triagem.solicitacao_id
      and s.cooperativa_id = (select public.cooperativa_atual_id())
  ));

commit;
