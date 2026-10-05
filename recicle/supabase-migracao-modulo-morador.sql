-- =====================================================================
-- Módulo morador + correções de RLS
-- Rodar no Supabase: Dashboard → SQL Editor → colar tudo → Run.
-- É uma transação única: se qualquer parte falhar, nada é aplicado.
-- =====================================================================
begin;

-- Funções auxiliares de RLS são avaliadas também para visitantes (anon) em políticas
-- "public" (ex.: contagem de cooperativas na home). Sem sessão retornam false/null,
-- então liberar EXECUTE é seguro — sem isso o anon recebe "permission denied for function".
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.cooperativa_atual_id() to anon, authenticated;

-- Código de confirmação da coleta: `(random() * 32)::int` ARREDONDA, gerando índice 33 num
-- alfabeto de 32 letras → substr vazio → ~6% dos códigos saíam com 3 caracteres, e a tela de
-- confirmação exige 4: essas coletas nunca podiam ser concluídas. floor() corrige.
create or replace function public.gerar_codigo_confirmacao()
returns text language sql set search_path = public as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1),
    ''
  )
  from generate_series(1, 4);
$$;

-- ===================== MORADORES =====================
create table public.moradores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  email text not null,
  telefone text,
  avatar_url text,
  aviso_email boolean not null default true,
  aviso_whatsapp boolean not null default true,
  aviso_painel boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.moradores is 'Perfil de cada morador (cliente final) — uma linha por conta de login.';
create trigger set_atualizado_em before update on public.moradores
  for each row execute function public.set_atualizado_em();

create or replace function public.morador_atual_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.moradores where user_id = auth.uid();
$$;
grant execute on function public.morador_atual_id() to anon, authenticated;

alter table public.moradores enable row level security;
create policy "morador vê o próprio perfil" on public.moradores for select using (user_id = (select auth.uid()));
create policy "morador cria o próprio perfil" on public.moradores for insert with check (user_id = (select auth.uid()));
create policy "morador atualiza o próprio perfil" on public.moradores for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "morador exclui o próprio perfil" on public.moradores for delete using (user_id = (select auth.uid()));
create policy "admin vê moradores" on public.moradores for select using (public.is_admin());

-- Perfil criado no mesmo instante do signUp (metadado tipo=morador). Antes dependia de uma
-- segunda chamada do navegador — se ela falhasse, a conta de login ficava órfã e a nova
-- tentativa dizia "e-mail já cadastrado" (o bug reportado).
create or replace function public.criar_morador_no_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data->>'tipo', '') = 'morador'
     and length(trim(coalesce(new.raw_user_meta_data->>'nome', ''))) > 0 then
    insert into public.moradores (user_id, nome, email)
    values (new.id, trim(new.raw_user_meta_data->>'nome'), new.email)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger trg_criar_morador_no_signup after insert on auth.users
  for each row execute function public.criar_morador_no_signup();

-- ===================== ENDEREÇOS =====================
create table public.morador_enderecos (
  id uuid primary key default gen_random_uuid(),
  morador_id uuid not null references public.moradores(id) on delete cascade,
  apelido text not null default 'Casa',
  cep text,
  rua text not null,
  numero text,
  complemento text,
  bairro text not null,
  cidade text not null,
  uf text not null,
  referencia text,
  principal boolean not null default false,
  criado_em timestamptz not null default now()
);
create index on public.morador_enderecos(morador_id);

-- Só um endereço principal por morador.
create or replace function public.unico_endereco_principal()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.morador_enderecos set principal = false
  where morador_id = new.morador_id and id <> new.id and principal;
  return new;
end;
$$;
create trigger trg_unico_endereco_principal after insert or update of principal on public.morador_enderecos
  for each row when (new.principal) execute function public.unico_endereco_principal();

alter table public.morador_enderecos enable row level security;
create policy "morador gerencia seus endereços" on public.morador_enderecos for all
  using (morador_id = public.morador_atual_id()) with check (morador_id = public.morador_atual_id());

-- ===================== ECOPONTOS =====================
create table public.ecopontos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'publico' check (tipo in ('publico', 'cooperativa')),
  cooperativa_id uuid references public.cooperativas(id) on delete cascade,
  rua text not null,
  numero text,
  bairro text not null,
  cidade text not null,
  uf text not null,
  latitude numeric,
  longitude numeric,
  horario text,
  telefone text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check ((tipo = 'cooperativa') = (cooperativa_id is not null))
);
create table public.ecoponto_tipos_residuo (
  ecoponto_id uuid not null references public.ecopontos(id) on delete cascade,
  tipo_residuo_id uuid not null references public.tipos_residuo(id) on delete cascade,
  primary key (ecoponto_id, tipo_residuo_id)
);
alter table public.ecopontos enable row level security;
alter table public.ecoponto_tipos_residuo enable row level security;
create policy "qualquer pessoa vê ecopontos ativos" on public.ecopontos for select
  using (ativo or public.is_admin() or cooperativa_id = public.cooperativa_atual_id());
create policy "admin gerencia ecopontos" on public.ecopontos for all
  using (public.is_admin()) with check (public.is_admin());
create policy "cooperativa gerencia seu ecoponto" on public.ecopontos for all
  using (cooperativa_id = public.cooperativa_atual_id()) with check (cooperativa_id = public.cooperativa_atual_id());
create policy "qualquer pessoa vê o que cada ecoponto aceita" on public.ecoponto_tipos_residuo for select using (true);
create policy "admin gerencia o que ecopontos aceitam" on public.ecoponto_tipos_residuo for all
  using (public.is_admin()) with check (public.is_admin());

-- ===================== SOLICITAÇÕES (lado do morador) =====================
alter table public.solicitacoes alter column cooperativa_id drop not null;
alter table public.solicitacoes
  add column morador_id uuid references public.moradores(id) on delete set null,
  add column ecoponto_id uuid references public.ecopontos(id) on delete set null,
  add column endereco_id uuid references public.morador_enderecos(id) on delete set null,
  add column destino text not null default 'coleta_casa' check (destino in ('coleta_casa', 'entrega_ecoponto')),
  add column pontos_previstos integer not null default 0 check (pontos_previstos >= 0),
  add column pontos_creditados integer,
  add column remarcacoes_usadas integer not null default 0 check (remarcacoes_usadas between 0 and 2),
  add column motivo_cancelamento text,
  add column cancelada_em timestamptz,
  add column cancelada_por text check (cancelada_por in ('morador', 'cooperativa', 'admin'));
alter table public.solicitacoes drop constraint solicitacoes_status_check;
alter table public.solicitacoes add constraint solicitacoes_status_check
  check (status in ('pendente', 'aceita', 'concluida', 'recusada', 'cancelada'));
create index on public.solicitacoes(morador_id);
create index on public.solicitacoes(cooperativa_id);

-- Código de confirmação fora de `solicitacoes`: a cooperativa lê a linha inteira da
-- solicitação (e a tela até exibia o código), então ele não provava a presença do morador.
-- Agora fica numa tabela que só o morador dono enxerga; a cooperativa só consegue concluir
-- pela função confirmar_recebimento(), que confere o código no banco.
alter table public.solicitacoes drop column codigo_confirmacao;
create table public.solicitacao_codigos (
  solicitacao_id uuid primary key references public.solicitacoes(id) on delete cascade,
  codigo text not null default public.gerar_codigo_confirmacao() check (length(codigo) = 4)
);
alter table public.solicitacao_codigos enable row level security;
create policy "morador vê o código das suas solicitações" on public.solicitacao_codigos for select
  using (exists (select 1 from public.solicitacoes s
                 where s.id = solicitacao_id and s.morador_id = public.morador_atual_id()));
create policy "admin vê códigos" on public.solicitacao_codigos for select using (public.is_admin());

create or replace function public.gera_codigo_da_solicitacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.solicitacao_codigos (solicitacao_id) values (new.id);
  return new;
end;
$$;
create trigger trg_gera_codigo_da_solicitacao after insert on public.solicitacoes
  for each row execute function public.gera_codigo_da_solicitacao();

-- Concluir só pela função de confirmação (que liga esta flag na transação) — ou pelo admin.
create or replace function public.exige_confirmacao_para_concluir()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida'
     and coalesce(current_setting('recicle.confirmacao', true), '') <> 'on'
     and not public.is_admin() then
    raise exception 'Use a confirmação de recebimento para concluir a coleta.';
  end if;
  return new;
end;
$$;
create trigger trg_exige_confirmacao_para_concluir before update on public.solicitacoes
  for each row execute function public.exige_confirmacao_para_concluir();

-- A política "provisória" deixava qualquer conta logada inserir pedido em nome de qualquer um.
drop policy "cooperativa autenticada registra solicitação (provisório)" on public.solicitacoes;
create policy "morador cria suas solicitações" on public.solicitacoes for insert
  with check (morador_id = public.morador_atual_id() and status = 'pendente');
create policy "morador vê suas solicitações" on public.solicitacoes for select
  using (morador_id = public.morador_atual_id());
create policy "morador atualiza suas solicitações" on public.solicitacoes for update
  using (morador_id = public.morador_atual_id()) with check (morador_id = public.morador_atual_id());

-- Pedido de coleta em casa sem cooperativa: qualquer cooperativa APROVADA vê e pode assumir.
-- Antes a cooperativa só enxergava cooperativa_id = ela, então ninguém via esses pedidos.
drop policy "cooperativa vê suas solicitações" on public.solicitacoes;
create policy "cooperativa vê suas solicitações e as abertas" on public.solicitacoes for select
  using (
    cooperativa_id = public.cooperativa_atual_id()
    or (cooperativa_id is null and status = 'pendente' and destino = 'coleta_casa'
        and exists (select 1 from public.cooperativas c
                    where c.id = public.cooperativa_atual_id() and c.status_cadastro = 'aprovado'))
  );
drop policy "cooperativa atualiza suas solicitações" on public.solicitacoes;
create policy "cooperativa atualiza ou assume solicitações" on public.solicitacoes for update
  using (
    cooperativa_id = public.cooperativa_atual_id()
    or (cooperativa_id is null and status = 'pendente'
        and exists (select 1 from public.cooperativas c
                    where c.id = public.cooperativa_atual_id() and c.status_cadastro = 'aprovado'))
  )
  with check (cooperativa_id = public.cooperativa_atual_id());

-- O morador só pode cancelar ou remarcar: qualquer outro campo que ele tente mudar
-- (preço, pontos, peso recebido...) volta ao valor original.
create or replace function public.protege_solicitacao_do_morador()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_admin() or public.cooperativa_atual_id() is not null then
    return new;
  end if;
  if old.morador_id is distinct from public.morador_atual_id() then
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (new.status = 'cancelada' and old.status in ('pendente', 'aceita')) then
      raise exception 'Mudança de status não permitida.';
    end if;
    new.cancelada_em := now();
    new.cancelada_por := 'morador';
  end if;

  -- O próprio banco conta as remarcações: o navegador nem sempre tem o valor atual
  -- (ex.: detalhe aberto direto pelo link) e não deve ser confiável para isso.
  new.remarcacoes_usadas := old.remarcacoes_usadas;
  if new.data_agendada is distinct from old.data_agendada
     or new.janela_confirmada is distinct from old.janela_confirmada then
    if old.status not in ('pendente', 'aceita') then
      raise exception 'Só dá para remarcar coletas em andamento.';
    end if;
    if new.data_agendada < current_date then
      raise exception 'A nova data não pode ser no passado.';
    end if;
    if old.remarcacoes_usadas >= 2 then
      raise exception 'Limite de remarcações atingido.';
    end if;
    new.remarcacoes_usadas := old.remarcacoes_usadas + 1;
  end if;

  new.morador_id := old.morador_id;
  new.cooperativa_id := old.cooperativa_id;
  new.ecoponto_id := old.ecoponto_id;
  new.preco := old.preco;
  new.pontos_previstos := old.pontos_previstos;
  new.pontos_creditados := old.pontos_creditados;
  new.peso_estimado_kg := old.peso_estimado_kg;
  new.peso_recebido_kg := old.peso_recebido_kg;
  new.rejeito_kg := old.rejeito_kg;
  new.confirmado_em := old.confirmado_em;
  new.confirmado_por := old.confirmado_por;
  return new;
end;
$$;
create trigger trg_protege_solicitacao_do_morador before update on public.solicitacoes
  for each row execute function public.protege_solicitacao_do_morador();

-- Entrega em ecoponto de cooperativa: o pedido já nasce atribuído a ela, para que ela
-- possa confirmar o recebimento (e o morador ganhar os pontos).
create or replace function public.atribui_cooperativa_do_ecoponto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ecoponto_id is not null and new.cooperativa_id is null then
    select cooperativa_id into new.cooperativa_id from public.ecopontos where id = new.ecoponto_id;
  end if;
  return new;
end;
$$;
create trigger trg_atribui_cooperativa_do_ecoponto before insert on public.solicitacoes
  for each row execute function public.atribui_cooperativa_do_ecoponto();

-- ===================== PONTOS =====================
create table public.pontos_movimentos (
  id uuid primary key default gen_random_uuid(),
  morador_id uuid not null references public.moradores(id) on delete cascade,
  tipo text not null check (tipo in ('credito', 'bonus', 'resgate', 'ajuste')),
  descricao text not null,
  detalhe text,
  pontos integer not null,
  solicitacao_id uuid references public.solicitacoes(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index on public.pontos_movimentos(morador_id);
alter table public.pontos_movimentos enable row level security;
create policy "morador vê seu extrato" on public.pontos_movimentos for select
  using (morador_id = public.morador_atual_id());
create policy "admin gerencia pontos" on public.pontos_movimentos for all
  using (public.is_admin()) with check (public.is_admin());

-- Cálculo e lançamento dos pontos de uma coleta — usado pelo crédito automático e pelo
-- crédito manual do admin (coletas confirmadas por foto). Mesma tabela de "Como os pontos
-- são calculados": 5 pts/kg na entrega, 75% disso na coleta em casa, 16 pts/L de óleo,
-- +25 se o rejeito ficar abaixo de 10%. Usa o peso REAL recebido, não o estimado.
create or replace function public.lancar_pontos_da_coleta(
  p_morador_id uuid, p_solicitacao_id uuid, p_numero bigint, p_titulo text,
  p_categoria text, p_destino text, p_peso_kg numeric, p_rejeito_kg numeric
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_pontos integer;
begin
  v_pontos := round(p_peso_kg
                    * case when p_categoria = 'Óleo de cozinha' then 16 else 5 end
                    * case when p_destino = 'coleta_casa' then 0.75 else 1 end);

  if v_pontos > 0 then
    insert into public.pontos_movimentos (morador_id, tipo, descricao, detalhe, pontos, solicitacao_id)
    values (p_morador_id, 'credito', p_titulo,
            format('%s kg recebidos · #%s', p_peso_kg, p_numero), v_pontos, p_solicitacao_id);
  end if;

  if coalesce(p_rejeito_kg, 0) < p_peso_kg * 0.1 then
    insert into public.pontos_movimentos (morador_id, tipo, descricao, detalhe, pontos, solicitacao_id)
    values (p_morador_id, 'bonus', 'Bônus de separação',
            format('rejeito abaixo de 10%% · #%s', p_numero), 25, p_solicitacao_id);
    v_pontos := v_pontos + 25;
  end if;

  return v_pontos;
end;
$$;
revoke execute on function public.lancar_pontos_da_coleta(uuid, uuid, bigint, text, text, text, numeric, numeric) from public, anon, authenticated;

create or replace function public.credita_pontos_na_conclusao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Confirmação por foto (sem o código do morador) conclui a coleta mas NÃO credita:
  -- fica para conferência do admin (creditar_pontos_conferidos). Sem isso a foto seria
  -- um atalho para gerar pontos sem provar a entrega.
  if new.status <> 'concluida' or old.status = 'concluida' or new.morador_id is null
     or coalesce(new.peso_recebido_kg, 0) <= 0 or new.confirmado_via_foto then
    return new;
  end if;

  new.pontos_creditados := public.lancar_pontos_da_coleta(
    new.morador_id, new.id, new.numero, new.titulo, new.categoria, new.destino,
    new.peso_recebido_kg, new.rejeito_kg);
  return new;
end;
$$;
create trigger trg_credita_pontos_na_conclusao before update of status on public.solicitacoes
  for each row execute function public.credita_pontos_na_conclusao();

-- Única porta para a cooperativa concluir uma coleta: confere dono, status, pesos, a
-- pessoa da equipe e — fora a confirmação por foto — o código que só o morador tem.
create or replace function public.confirmar_recebimento(
  p_solicitacao_id uuid,
  p_codigo text,
  p_peso_recebido_kg numeric,
  p_rejeito_kg numeric,
  p_via_foto boolean default false,
  p_confirmado_por uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.solicitacoes%rowtype;
  v_cooperativa uuid := public.cooperativa_atual_id();
begin
  if v_cooperativa is null then
    raise exception 'Só a cooperativa responsável pode confirmar o recebimento.';
  end if;

  select * into s from public.solicitacoes where id = p_solicitacao_id for update;
  if not found or s.cooperativa_id is distinct from v_cooperativa then
    raise exception 'Solicitação não encontrada.';
  end if;
  if s.status <> 'aceita' then
    raise exception 'Só coletas aceitas podem ser confirmadas.';
  end if;
  if coalesce(p_peso_recebido_kg, 0) <= 0 then
    raise exception 'Informe o peso recebido.';
  end if;
  if coalesce(p_rejeito_kg, 0) < 0 or coalesce(p_rejeito_kg, 0) > p_peso_recebido_kg then
    raise exception 'O rejeito não pode ser maior que o peso recebido.';
  end if;
  if p_confirmado_por is not null and not exists (
    select 1 from public.equipe where id = p_confirmado_por and cooperativa_id = v_cooperativa
  ) then
    raise exception 'Pessoa da equipe inválida.';
  end if;
  if not coalesce(p_via_foto, false) and s.morador_id is not null and not exists (
    select 1 from public.solicitacao_codigos c
    where c.solicitacao_id = s.id and c.codigo = upper(trim(coalesce(p_codigo, '')))
  ) then
    raise exception 'Código incorreto. Confira com o morador.';
  end if;

  perform set_config('recicle.confirmacao', 'on', true);
  update public.solicitacoes
  set status = 'concluida',
      peso_recebido_kg = p_peso_recebido_kg,
      rejeito_kg = coalesce(p_rejeito_kg, 0),
      confirmado_via_foto = coalesce(p_via_foto, false),
      confirmado_por = p_confirmado_por,
      confirmado_em = now()
  where id = s.id;
  perform set_config('recicle.confirmacao', '', true);
end;
$$;
revoke execute on function public.confirmar_recebimento(uuid, text, numeric, numeric, boolean, uuid) from public, anon;
grant execute on function public.confirmar_recebimento(uuid, text, numeric, numeric, boolean, uuid) to authenticated;

-- Conferência do admin para coletas confirmadas por foto: credita os pontos uma única vez.
create or replace function public.creditar_pontos_conferidos(p_solicitacao_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  s public.solicitacoes%rowtype;
  v_pontos integer;
begin
  if not public.is_admin() then
    raise exception 'Só a equipe administrativa pode conferir coletas.';
  end if;

  select * into s from public.solicitacoes where id = p_solicitacao_id for update;
  if not found or s.status <> 'concluida' or not s.confirmado_via_foto then
    raise exception 'Essa coleta não está aguardando conferência.';
  end if;
  if s.pontos_creditados is not null then
    raise exception 'Os pontos dessa coleta já foram creditados.';
  end if;
  if s.morador_id is null or coalesce(s.peso_recebido_kg, 0) <= 0 then
    raise exception 'Coleta sem morador ou sem peso recebido — não há pontos a creditar.';
  end if;

  v_pontos := public.lancar_pontos_da_coleta(
    s.morador_id, s.id, s.numero, s.titulo, s.categoria, s.destino, s.peso_recebido_kg, s.rejeito_kg);
  update public.solicitacoes set pontos_creditados = v_pontos where id = s.id;
  return v_pontos;
end;
$$;
revoke execute on function public.creditar_pontos_conferidos(uuid) from public, anon;
grant execute on function public.creditar_pontos_conferidos(uuid) to authenticated;

create table public.beneficios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  parceiro text,
  custo_pontos integer not null check (custo_pontos > 0),
  estoque integer check (estoque >= 0),
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);
alter table public.beneficios enable row level security;
create policy "qualquer pessoa vê benefícios ativos" on public.beneficios for select using (ativo or public.is_admin());
create policy "admin gerencia benefícios" on public.beneficios for all
  using (public.is_admin()) with check (public.is_admin());

create table public.resgates (
  id uuid primary key default gen_random_uuid(),
  morador_id uuid not null references public.moradores(id) on delete cascade,
  beneficio_id uuid not null references public.beneficios(id) on delete restrict,
  pontos integer not null,
  codigo text not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  criado_em timestamptz not null default now()
);
alter table public.resgates enable row level security;
create policy "morador vê seus resgates" on public.resgates for select using (morador_id = public.morador_atual_id());
create policy "morador resgata para si" on public.resgates for insert with check (morador_id = public.morador_atual_id());
create policy "admin vê resgates" on public.resgates for select using (public.is_admin());

-- Saldo e estoque conferidos no banco (o navegador não é confiável), com trava de linha
-- contra dois resgates simultâneos gastando o mesmo saldo.
create or replace function public.processa_resgate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b public.beneficios%rowtype;
  v_saldo integer;
begin
  select * into b from public.beneficios where id = new.beneficio_id for update;
  if not found or not b.ativo then raise exception 'Benefício indisponível.'; end if;
  if b.estoque is not null and b.estoque <= 0 then raise exception 'Benefício esgotado.'; end if;

  perform 1 from public.moradores where id = new.morador_id for update;
  select coalesce(sum(pontos), 0) into v_saldo from public.pontos_movimentos where morador_id = new.morador_id;
  if v_saldo < b.custo_pontos then raise exception 'Saldo insuficiente.'; end if;

  new.pontos := b.custo_pontos;
  new.codigo := upper(substr(md5(gen_random_uuid()::text), 1, 8));

  insert into public.pontos_movimentos (morador_id, tipo, descricao, detalhe, pontos)
  values (new.morador_id, 'resgate', b.nome, coalesce(b.parceiro, 'Resgate de benefício'), -b.custo_pontos);

  if b.estoque is not null then
    update public.beneficios set estoque = estoque - 1 where id = b.id;
  end if;
  return new;
end;
$$;
create trigger trg_processa_resgate before insert on public.resgates
  for each row execute function public.processa_resgate();

-- ===================== CHAT =====================
create table public.chat_conversas (
  id uuid primary key default gen_random_uuid(),
  morador_id uuid not null references public.moradores(id) on delete cascade,
  titulo text not null,
  solicitacao_id uuid references public.solicitacoes(id) on delete set null,
  categoria text,
  materiais text,
  reciclavel text,
  peso_estimado_kg numeric,
  aceita_coleta_comum boolean,
  atencao text,
  pontos_previstos integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.chat_conversas(morador_id);
create trigger set_atualizado_em before update on public.chat_conversas
  for each row execute function public.set_atualizado_em();

create table public.chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.chat_conversas(id) on delete cascade,
  autor text not null check (autor in ('morador', 'ia')),
  texto text not null,
  passos jsonb,
  criado_em timestamptz not null default now()
);
create index on public.chat_mensagens(conversa_id);

alter table public.chat_conversas enable row level security;
alter table public.chat_mensagens enable row level security;
create policy "morador gerencia suas conversas" on public.chat_conversas for all
  using (morador_id = public.morador_atual_id()) with check (morador_id = public.morador_atual_id());
create policy "morador gerencia mensagens das suas conversas" on public.chat_mensagens for all
  using (exists (select 1 from public.chat_conversas c
                 where c.id = conversa_id and c.morador_id = public.morador_atual_id()))
  with check (exists (select 1 from public.chat_conversas c
                      where c.id = conversa_id and c.morador_id = public.morador_atual_id()));

-- ===================== VITRINE PÚBLICA DE COOPERATIVAS =====================
-- A tabela cooperativas só é legível pela própria cooperativa e pelo admin (tem CNPJ,
-- e-mail e telefone do responsável). Visitantes e moradores precisam só do nome e da
-- região das aprovadas — para o contador da home e para "quem vai buscar" no histórico.
-- Sem security_invoker de propósito: a view expõe apenas estas colunas.
create view public.cooperativas_publicas as
select id, nome, bairro, cidade, uf
from public.cooperativas
where status_cadastro = 'aprovado';
grant select on public.cooperativas_publicas to anon, authenticated;

-- ===================== ADMIN: resumo de clientes =====================
-- A view clientes_resumo já existe no banco, com security_invoker (respeita o RLS de
-- quem consulta) e as colunas que o painel do admin usa — não é recriada aqui.

commit;
