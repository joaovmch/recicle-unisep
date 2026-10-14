-- =====================================================================
-- Re-cicle · Conversa com a IA vista pela cooperativa
--
-- A tela "Como o pedido chegou até vocês" mostrava uma conversa reconstruída no
-- navegador (classificador local rodando de novo sobre o título). Com o Gemini
-- ligado, isso podia divergir do que o morador realmente viu.
--
-- Esta função devolve a conversa verdadeira que gerou a solicitação:
--   * só as mensagens até a criação do pedido (o resto do chat é do morador);
--   * só para quem já enxerga aquela solicitação pelas políticas atuais
--     (admin, a cooperativa dona, ou cooperativa aprovada vendo um pedido aberto
--     de coleta em casa).
-- As tabelas de chat continuam fechadas: não há policy nova nelas.
--
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem erro.
-- =====================================================================

create or replace function public.conversa_da_solicitacao(p_solicitacao uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'materiais', c.materiais,
    'reciclavel', c.reciclavel,
    'aceita_coleta_comum', c.aceita_coleta_comum,
    'atencao', c.atencao,
    'mensagens', coalesce((
      select jsonb_agg(
               jsonb_build_object('autor', m.autor, 'texto', m.texto, 'passos', m.passos)
               order by m.criado_em, m.autor desc  -- morador antes da ia no mesmo instante
             )
        from public.chat_mensagens m
       where m.conversa_id = c.id
         and m.criado_em <= s.criado_em
    ), '[]'::jsonb)
  )
  from public.solicitacoes s
  join public.chat_conversas c on c.solicitacao_id = s.id
  where s.id = p_solicitacao
    and (
      public.is_admin()
      or s.cooperativa_id = public.cooperativa_atual_id()
      or (
        s.cooperativa_id is null
        and s.status = 'pendente'
        and s.destino = 'coleta_casa'
        and exists (
          select 1 from public.cooperativas co
           where co.id = public.cooperativa_atual_id()
             and co.status_cadastro = 'aprovado'
        )
      )
    )
  limit 1;
$$;

revoke all on function public.conversa_da_solicitacao(uuid) from public, anon;
grant execute on function public.conversa_da_solicitacao(uuid) to authenticated;
