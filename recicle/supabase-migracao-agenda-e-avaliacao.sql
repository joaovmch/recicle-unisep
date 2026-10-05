-- Migração: campos que faltavam para o painel bater com as telas conceito
-- (agenda do dia, quem vai buscar a coleta e avaliação do morador).
--
-- Idempotente — "add column if not exists" não duplica nada se já tiver rodado.
-- Rode isso no SQL Editor do painel do Supabase.

-- 1) Agendamento definido no aceite da coleta ("Confirme a janela" / "Quem vai buscar"
--    na tela de Solicitações). Sem isso não dá pra montar "Rota de hoje" nem a "Agenda"
--    do dashboard com dado de verdade — só existia a janela que o morador pediu.
alter table public.solicitacoes
  add column if not exists data_agendada date,
  add column if not exists janela_confirmada text,
  add column if not exists atribuido_equipe_id uuid references public.equipe(id) on delete set null,
  add column if not exists atribuido_veiculo_id uuid references public.veiculos(id) on delete set null;

create index if not exists idx_solicitacoes_data_agendada
  on public.solicitacoes (cooperativa_id, data_agendada);

-- 2) Avaliação que o morador dá depois da coleta (1 a 5). Ainda não existe app do
--    morador neste repositório para escrever aqui — a coluna fica pronta para quando
--    existir, e o card "Avaliação" do dashboard mostra "ainda sem avaliações" até lá,
--    em vez de inventar uma média.
alter table public.solicitacoes
  add column if not exists avaliacao_nota smallint check (avaliacao_nota between 1 and 5);
