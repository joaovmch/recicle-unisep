-- Migração: funções para checar CNPJ/e-mail já cadastrados ANTES do envio final
-- do wizard (hoje só descobria no fim, com todos os arquivos já anexados).
--
-- São SECURITY DEFINER porque RLS bloqueia SELECT em cooperativas/auth.users para
-- quem não é dono da linha — sem isso, dava pra descobrir dados de outra cooperativa
-- fazendo select direto. Aqui só devolvem um boolean, nunca a linha em si.
--
-- Idempotente. Rode no SQL Editor do Supabase.

create or replace function public.cnpj_disponivel(p_cnpj text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.cooperativas where cnpj = p_cnpj
  );
$$;

create or replace function public.email_em_uso(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(p_email)
  );
$$;

grant execute on function public.cnpj_disponivel(text) to anon, authenticated;
grant execute on function public.email_em_uso(text) to anon, authenticated;
