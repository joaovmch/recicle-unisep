-- =====================================================================
-- Re-cicle · Segurança: não expor nome e endereço do morador em pedidos abertos
--
-- Achado do teste de segurança: a política "cooperativa vê suas solicitações e as
-- abertas" deixava QUALQUER cooperativa aprovada ler, pela API, TODOS os pedidos de
-- coleta em casa ainda sem dono — cada um com o nome completo e o endereço do morador,
-- ANTES de aceitar. Como qualquer um pode cadastrar uma cooperativa e ser aprovado, isso
-- permitia coletar nome + endereço residencial de todos os moradores com pedido aberto.
--
-- Correção:
--  1) A cooperativa passa a ler pela tabela só os pedidos que já são dela (aceitos).
--  2) Os pedidos abertos vêm por uma função que devolve só o necessário para decidir
--     (bairro, categoria, peso, valor, janela) — SEM nome, SEM rua/número. O nome e o
--     endereço completo só aparecem depois que a cooperativa aceita (aí o pedido é dela).
--
-- Idempotente. Rode no SQL Editor do Supabase. Depois, faça o deploy do front atualizado
-- (a store da cooperativa passa a chamar public.pedidos_abertos()).
-- =====================================================================

-- 1) Política de leitura da cooperativa: só os pedidos que já são dela.
drop policy if exists "cooperativa vê suas solicitações e as abertas" on public.solicitacoes;

create policy "cooperativa vê as próprias solicitações"
  on public.solicitacoes for select
  using (cooperativa_id = public.cooperativa_atual_id());

-- 2) Pedidos abertos, sem PID do morador, só para cooperativa aprovada.
--    Devolve apenas os campos que a cooperativa precisa para decidir se aceita.
create or replace function public.pedidos_abertos()
returns table (
  id uuid,
  numero integer,
  titulo text,
  categoria text,
  peso_estimado_kg numeric,
  bairro text,
  distancia_km numeric,
  janela_preferida text,
  preco numeric,
  status text,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id, s.numero, s.titulo, s.categoria, s.peso_estimado_kg,
    s.bairro, s.distancia_km, s.janela_preferida,
    s.preco, s.status, s.criado_em
  from public.solicitacoes s
  where s.cooperativa_id is null
    and s.status = 'pendente'
    and s.destino = 'coleta_casa'
    and exists (
      select 1 from public.cooperativas c
      where c.id = public.cooperativa_atual_id()
        and c.status_cadastro = 'aprovado'
    )
  order by s.criado_em desc;
$$;

revoke all on function public.pedidos_abertos() from public, anon;
grant execute on function public.pedidos_abertos() to authenticated;

-- Observação: aceitar um pedido aberto passa a ser pela função do passo 3 (não mais por
-- UPDATE direto). O nome e o endereço completo passam a ser legíveis só depois do aceite,
-- porque o pedido vira da cooperativa e cai na política de leitura do passo 1.

-- 3) Aceitar (assumir) um pedido aberto passa a ser por função: como a cooperativa não
--    enxerga mais os pedidos sem dono por SELECT, o UPDATE direto de "assumir" não acharia
--    a linha (o Postgres exige SELECT para localizar a linha de um UPDATE com WHERE). A
--    função roda com privilégio, valida que a cooperativa é aprovada, que o pedido ainda
--    está aberto, e que equipe/veículo são dela.
create or replace function public.aceitar_pedido_aberto(
  p_id uuid,
  p_data_agendada date,
  p_janela text,
  p_equipe uuid default null,
  p_veiculo uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coop uuid := public.cooperativa_atual_id();
  s public.solicitacoes%rowtype;
begin
  if v_coop is null or not exists (
    select 1 from public.cooperativas where id = v_coop and status_cadastro = 'aprovado'
  ) then
    raise exception 'Só uma cooperativa aprovada pode aceitar pedidos.';
  end if;

  select * into s from public.solicitacoes where id = p_id for update;
  if not found or s.status <> 'pendente' or s.cooperativa_id is not null then
    raise exception 'Esse pedido já foi aceito por outra cooperativa ou cancelado pelo morador.';
  end if;

  if p_equipe is not null and not exists (
    select 1 from public.equipe where id = p_equipe and cooperativa_id = v_coop
  ) then
    raise exception 'Pessoa da equipe inválida.';
  end if;
  if p_veiculo is not null and not exists (
    select 1 from public.veiculos where id = p_veiculo and cooperativa_id = v_coop
  ) then
    raise exception 'Veículo inválido.';
  end if;
  if p_data_agendada < current_date then
    raise exception 'A data da coleta não pode ser no passado.';
  end if;

  update public.solicitacoes set
    cooperativa_id = v_coop,
    status = 'aceita',
    novo = false,
    data_agendada = p_data_agendada,
    janela_confirmada = p_janela,
    atribuido_equipe_id = p_equipe,
    atribuido_veiculo_id = p_veiculo
  where id = p_id;
end;
$$;

revoke all on function public.aceitar_pedido_aberto(uuid, date, text, uuid, uuid) from public, anon;
grant execute on function public.aceitar_pedido_aberto(uuid, date, text, uuid, uuid) to authenticated;
