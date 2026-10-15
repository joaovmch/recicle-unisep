-- ===================== SEED: ecopontos para o mapa =====================
-- Dados de exemplo para a tela /ecopontos ter o que mostrar no mapa. As coordenadas
-- caem dentro de Dois Vizinhos e Francisco Beltrão (PR); os endereços são fictícios,
-- troque pelos reais quando a prefeitura/cooperativa passar a lista oficial.
-- Rodar de novo não duplica: a chave usada é (nome, cidade).

create unique index if not exists ecopontos_nome_cidade_idx on public.ecopontos (nome, cidade);

insert into public.ecopontos (nome, tipo, cooperativa_id, rua, numero, bairro, cidade, uf, latitude, longitude, horario, telefone)
values
  ('Ecoponto Centro',            'publico', null, 'Rua Rio Grande do Sul', '820',  'Centro',                   'Dois Vizinhos',     'PR', -25.73890, -53.05560, 'Seg a sex, 8h às 17h · sáb 8h às 12h', '(46) 3536-0100'),
  ('Ecoponto São Francisco',     'publico', null, 'Rua Amazonas',          '1240', 'São Francisco de Assis',   'Dois Vizinhos',     'PR', -25.74620, -53.04880, 'Seg a sex, 8h às 17h',                 '(46) 3536-0101'),
  ('Ecoponto Jardim Primavera',  'publico', null, 'Rua Paraná',            '155',  'Jardim Primavera',         'Dois Vizinhos',     'PR', -25.73120, -53.06410, 'Seg a sáb, 7h30 às 18h',               null),
  ('Ecoponto Vila Nova',         'publico', null, 'Avenida Brasil',        '2300', 'Vila Nova',                'Dois Vizinhos',     'PR', -25.74510, -53.06720, 'Ter a sáb, 9h às 17h',                 null),
  ('Ecoponto Centro Beltrão',    'publico', null, 'Rua Octaviano Teixeira dos Santos', '1000', 'Centro',       'Francisco Beltrão', 'PR', -26.08170, -53.05500, 'Seg a sex, 8h às 18h',                 '(46) 3520-2000'),
  ('Ecoponto Cango',             'publico', null, 'Rua Guanabara',         '430',  'Cango',                    'Francisco Beltrão', 'PR', -26.07020, -53.06940, 'Seg a sex, 8h às 17h',                 null),
  ('Ecoponto Industrial',        'publico', null, 'Rua Guarani',           '77',   'Industrial',               'Francisco Beltrão', 'PR', -26.09450, -53.04120, 'Seg a sex, 7h às 16h',                 null)
on conflict (nome, cidade) do update set
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  horario = excluded.horario,
  ativo = true;

-- Ponto de entrega da cooperativa aprovada, se ela existir neste banco.
insert into public.ecopontos (nome, tipo, cooperativa_id, rua, numero, bairro, cidade, uf, latitude, longitude, horario, telefone)
select 'Galpão ' || c.nome, 'cooperativa', c.id, c.rua, c.numero, c.bairro, c.cidade, 'PR', -25.74280, -53.05010, 'Seg a sex, 8h às 17h', c.responsavel_telefone
from public.cooperativas c
where c.status_cadastro = 'aprovado' and c.cidade = 'Dois Vizinhos' and c.uf = 'PR' and c.rua is not null
order by c.criado_em
limit 1
on conflict (nome, cidade) do update set
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  ativo = true;

-- O que cada ecoponto aceita.
insert into public.ecoponto_tipos_residuo (ecoponto_id, tipo_residuo_id)
select e.id, t.id
from public.ecopontos e
join public.tipos_residuo t on t.nome = any (
  case e.nome
    when 'Ecoponto Centro'           then array['Papel e papelão','Plástico','Vidro','Metal','Óleo de cozinha']
    when 'Ecoponto São Francisco'    then array['Papel e papelão','Plástico','Metal','Eletrônicos','Pilhas e baterias']
    when 'Ecoponto Jardim Primavera' then array['Vidro','Plástico','Madeira','Entulho classe A']
    when 'Ecoponto Vila Nova'        then array['Papel e papelão','Plástico','Têxteis','Móveis e estofados']
    when 'Ecoponto Centro Beltrão'   then array['Papel e papelão','Plástico','Vidro','Metal','Lâmpadas','Pilhas e baterias']
    when 'Ecoponto Cango'            then array['Papel e papelão','Plástico','Metal','Óleo de cozinha']
    when 'Ecoponto Industrial'       then array['Entulho classe A','Madeira','Metal','Móveis e estofados']
    else array['Papel e papelão','Plástico','Vidro','Metal']
  end
)
where e.cidade in ('Dois Vizinhos', 'Francisco Beltrão')
on conflict do nothing;
