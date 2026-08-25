-- Migração: liga os dados da etapa 4 do cadastro (licença + documentos) ao que
-- a tela "Documentos e licença" do painel já espera ler.
--
-- Seguro rodar mais de uma vez (idempotente): "add column if not exists",
-- "create table if not exists" e "on conflict do nothing" não duplicam nada
-- nem sobrescrevem dados existentes.
--
-- Rode isso no SQL Editor do painel do Supabase.

-- 1) Número, órgão emissor e validade da licença ambiental, guardados direto na cooperativa.
alter table public.cooperativas
  add column if not exists licenca_numero text,
  add column if not exists licenca_orgao text,
  add column if not exists licenca_validade text;

-- 2) Tabela de documentos — só cria se ainda não existir. A estrutura abaixo é
--    exatamente a que src/app/cooperativa/pages/documentos/documentos.ts já usa
--    (select/upsert com onConflict cooperativa_id+tipo, upload pro bucket abaixo).
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  cooperativa_id uuid not null references public.cooperativas(id) on delete cascade,
  tipo text not null,
  nome_arquivo text,
  arquivo_url text,
  tamanho_bytes bigint,
  status text not null default 'em_analise',
  enviado_em timestamptz not null default now(),
  unique (cooperativa_id, tipo)
);

-- 3) Bucket de storage pros arquivos.
--    CONFIRMADO (testei via REST antes de escrever isso): o bucket "documentos-cooperativa"
--    AINDA NÃO EXISTE no projeto, então a tela "Documentos e licença" nunca conseguiu
--    subir um arquivo de verdade até hoje — não é só o cadastro que estava quebrado.
insert into storage.buckets (id, name, public)
values ('documentos-cooperativa', 'documentos-cooperativa', false)
on conflict (id) do nothing;

-- 4) Políticas de acesso ao bucket. Como o bucket é novo, não existe política pra ele ainda.
--    Reaproveitei a função cooperativa_atual_id() que a policy da tabela "documentos"
--    já usa (ela existe no seu banco — eu vi o erro "permission denied for function
--    cooperativa_atual_id" ao tentar ler a tabela sem estar autenticado). A convenção
--    de caminho já usada no código é "{cooperativa_id}/nome-do-arquivo".
--    CONFIRA se cooperativa_atual_id() realmente devolve o id da cooperativa do usuário
--    logado — se o nome/retorno for outro na sua função, ajuste as 3 policies abaixo.
drop policy if exists "cooperativa le seus documentos" on storage.objects;
create policy "cooperativa le seus documentos"
  on storage.objects for select
  using (
    bucket_id = 'documentos-cooperativa'
    and (storage.foldername(name))[1] = cooperativa_atual_id()::text
  );

drop policy if exists "cooperativa envia seus documentos" on storage.objects;
create policy "cooperativa envia seus documentos"
  on storage.objects for insert
  with check (
    bucket_id = 'documentos-cooperativa'
    and (storage.foldername(name))[1] = cooperativa_atual_id()::text
  );

drop policy if exists "cooperativa atualiza seus documentos" on storage.objects;
create policy "cooperativa atualiza seus documentos"
  on storage.objects for update
  using (
    bucket_id = 'documentos-cooperativa'
    and (storage.foldername(name))[1] = cooperativa_atual_id()::text
  );

-- 5) Admin precisa ver o documento de qualquer cooperativa pra conferir na análise.
drop policy if exists "admin le todos os documentos" on storage.objects;
create policy "admin le todos os documentos"
  on storage.objects for select
  using (
    bucket_id = 'documentos-cooperativa'
    and exists (select 1 from public.admins where user_id = auth.uid())
  );
