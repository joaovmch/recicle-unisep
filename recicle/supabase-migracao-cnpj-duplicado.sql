-- Checagem de CNPJ repetido na etapa 1 do cadastro.
--
-- A função comparava o texto recebido com a coluna `cnpj` como está gravada ("12.345.678/0001-88"),
-- enquanto a tela mandava só os dígitos ("12345678000188"): nunca batia, o CNPJ repetido passava
-- pela etapa 1 e só estourava no envio final — depois de a conta de login já ter sido criada,
-- deixando uma conta órfã ("e-mail já cadastrado" na tentativa seguinte).
--
-- Agora compara só os dígitos dos dois lados, independentemente de como foi digitado ou gravado.
-- Idempotente. Rode no SQL Editor do Supabase.

create or replace function public.cnpj_disponivel(p_cnpj text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.cooperativas
    where regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
  );
$$;

grant execute on function public.cnpj_disponivel(text) to anon, authenticated;
