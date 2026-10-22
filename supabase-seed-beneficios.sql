-- ===================== SEED: catálogo de benefícios =====================
-- A tela de Pontos do morador já sabia listar, checar saldo e gerar código de resgate,
-- mas a tabela estava vazia — então o catálogo aparecia sempre vazio e o resgate era
-- inalcançável. Estes são exemplos plausíveis para Dois Vizinhos / Francisco Beltrão;
-- troque parceiro e custo pelos acordos reais.
-- Rodar de novo não duplica: a chave é o nome.

create unique index if not exists beneficios_nome_idx on public.beneficios (nome);

insert into public.beneficios (nome, descricao, parceiro, custo_pontos, estoque, ativo, ordem)
values
  ('Desconto de 10% na feira',        'Vale 10% de desconto em uma compra na feira municipal.',              'Feira Municipal',        150,  50, true, 1),
  ('Sacola retornável',               'Sacola de ráfia reforçada para separar recicláveis em casa.',         'Re-cicle',               200, 120, true, 2),
  ('Kit de composteira doméstica',    'Composteira pequena com minhocas e manual de uso.',                   'Cooperativa parceira',   900,  15, true, 3),
  ('Muda de árvore nativa',           'Uma muda nativa para plantio, retirada no viveiro municipal.',        'Viveiro Municipal',      120, 200, true, 4),
  ('Desconto de R$ 20 na conta de água', 'Abatimento de R$ 20 em uma fatura, aplicado no mês seguinte.',     'Saneamento',            1200,  30, true, 5),
  ('Ingresso para oficina de reciclagem', 'Vaga em uma oficina de reaproveitamento de materiais.',           'Centro Cultural',        400,  40, true, 6)
on conflict (nome) do update set
  descricao = excluded.descricao,
  parceiro = excluded.parceiro,
  custo_pontos = excluded.custo_pontos,
  estoque = excluded.estoque,
  ativo = true,
  ordem = excluded.ordem;
