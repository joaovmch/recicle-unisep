-- Migração: lacunas de schema apontadas pelo documento de requisitos (US08 a US14).
--
-- Cada bloco abaixo existe porque um campo obrigatório ou uma regra de negócio do
-- documento não tem onde ser gravada hoje. Sem isso, a tela consegue no máximo
-- registrar a intenção, não cumprir a regra.
--
-- Idempotente: pode rodar de novo sem duplicar nada.
-- Rode no SQL Editor do painel do Supabase.


-- =====================================================================
-- 1) US12 - MEMBRO DA EQUIPE COM LOGIN PRÓPRIO
-- =====================================================================
-- "E-mail (obrigatório se Acesso ao painel = Sim) ... será o login do membro."
-- RN38 (papéis e permissões), RN40 (convite vale 48h) e a visão de Triagem da US09
-- dependem de o membro conseguir entrar no sistema. Hoje só a cooperativa tem login
-- (cooperativas.user_id), então todo mundo que entra é o responsável legal.

alter table public.equipe
  add column if not exists email text,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists convite_enviado_em timestamptz,
  add column if not exists convite_aceito_em timestamptz;

comment on column public.equipe.email is 'Login do membro quando acesso_painel = true (US12).';
comment on column public.equipe.user_id is 'Conta de autenticação do membro, criada ao aceitar o convite.';
comment on column public.equipe.convite_enviado_em is 'Início da validade do convite — 48 horas por padrão (RN40).';

-- O e-mail é o login: precisa ser único no sistema inteiro, não só na cooperativa.
create unique index if not exists idx_equipe_email_unico
  on public.equipe (lower(email)) where email is not null;

create unique index if not exists idx_equipe_user_unico
  on public.equipe (user_id) where user_id is not null;

-- Papel do usuário autenticado dentro da cooperativa. SECURITY DEFINER pelo mesmo
-- motivo de cooperativa_atual_id(): a policy precisa ler a tabela sem cair na RLS
-- que está sendo avaliada.
create or replace function public.papel_na_cooperativa()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when exists (select 1 from public.cooperativas c where c.user_id = auth.uid())
      then 'Responsável legal'
    else (select e.funcao from public.equipe e where e.user_id = auth.uid() limit 1)
  end;
$$;


-- =====================================================================
-- 2) US12 - MOTORISTA HABITUAL DO VEÍCULO
-- =====================================================================
-- "Motorista habitual - lista de membros da equipe." Hoje o nome do motorista era
-- digitado junto da placa, num campo de texto só.

alter table public.veiculos
  add column if not exists motorista_id uuid references public.equipe(id) on delete set null;

comment on column public.veiculos.motorista_id is 'Membro da equipe que costuma dirigir este veículo (US12).';

-- FE02 - "Veículo já cadastrado nesta cooperativa": placa única por cooperativa,
-- com exceção de "sem placa", que vários veículos urbanos podem usar (FA03).
create unique index if not exists idx_veiculos_placa_unica
  on public.veiculos (cooperativa_id, upper(identificacao))
  where identificacao is not null and lower(identificacao) <> 'sem placa';


-- =====================================================================
-- 3) US08 e US13 - ATIVIDADES AUTORIZADAS PELA LICENÇA
-- =====================================================================
-- US08 passo 6: "Informa as atividades autorizadas pela licença e bloqueia os tipos
-- de resíduo que ela não permite." US13 exige exibir esse dado na tela da licença.

alter table public.cooperativas
  add column if not exists licenca_atividades text;

comment on column public.cooperativas.licenca_atividades is
  'Atividades que a licença autoriza, preenchidas pela equipe do Re-cicle na conferência (US08).';


-- =====================================================================
-- 4) US13 / RN44 - HISTÓRICO DE DOCUMENTOS SUBSTITUÍDOS
-- =====================================================================
-- "A substituição de um documento mantém o arquivo anterior no histórico da
-- cooperativa, com data e usuário." Hoje o upsert por (cooperativa_id, tipo)
-- sobrescreve a linha e o arquivo anterior fica órfão no bucket.

create table if not exists public.documento_versoes (
  id uuid primary key default gen_random_uuid(),
  cooperativa_id uuid not null references public.cooperativas(id) on delete cascade,
  tipo text not null,
  nome_arquivo text not null,
  arquivo_url text not null,
  tamanho_bytes bigint,
  status text not null,
  motivo_recusa text,
  enviado_em timestamptz not null,
  substituido_em timestamptz not null default now(),
  substituido_por uuid references auth.users(id) on delete set null
);

comment on table public.documento_versoes is
  'Versões anteriores dos documentos da cooperativa, preservadas na substituição (RN44 / RG04).';

create index if not exists idx_documento_versoes_cooperativa
  on public.documento_versoes (cooperativa_id, substituido_em desc);

alter table public.documento_versoes enable row level security;

drop policy if exists "cooperativa lê o próprio histórico de documentos" on public.documento_versoes;
create policy "cooperativa lê o próprio histórico de documentos" on public.documento_versoes
  for select using (cooperativa_id = public.cooperativa_atual_id() or public.is_admin());

drop policy if exists "cooperativa arquiva a própria versão anterior" on public.documento_versoes;
create policy "cooperativa arquiva a própria versão anterior" on public.documento_versoes
  for insert with check (cooperativa_id = public.cooperativa_atual_id() or public.is_admin());

-- Antes de o upsert sobrescrever a linha, a versão que estava lá vai para o histórico.
create or replace function public.arquivar_documento_anterior()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.arquivo_url is distinct from new.arquivo_url and old.arquivo_url is not null then
    insert into public.documento_versoes (
      cooperativa_id, tipo, nome_arquivo, arquivo_url, tamanho_bytes,
      status, motivo_recusa, enviado_em, substituido_por
    )
    values (
      old.cooperativa_id, old.tipo, old.nome_arquivo, old.arquivo_url, old.tamanho_bytes,
      old.status, old.motivo_recusa, old.enviado_em, auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_arquivar_documento_anterior on public.documentos;
create trigger trg_arquivar_documento_anterior before update on public.documentos
  for each row execute function public.arquivar_documento_anterior();
