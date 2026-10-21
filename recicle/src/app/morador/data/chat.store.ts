import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';
import { MoradorService } from './morador.service';
import { Classificacao, PassoPreparo, conversarComIA, pontosPrevistos } from '../../shared/data/classificador';

export interface Mensagem {
  id: string;
  autor: 'morador' | 'ia';
  texto: string;
  passos: PassoPreparo[] | null;
  criadoEm: string;
}

export interface Conversa {
  id: string;
  titulo: string;
  solicitacaoId: string | null;
  categoria: string | null;
  materiais: string | null;
  reciclavel: string | null;
  pesoEstimadoKg: number | null;
  aceitaColetaComum: boolean | null;
  atencao: string | null;
  pontosPrevistos: number | null;
  atualizadoEm: string;
  /** status da solicitação ligada, quando já existe */
  statusSolicitacao: string | null;
}

function paraConversa(row: any): Conversa {
  return {
    id: row.id,
    titulo: row.titulo,
    solicitacaoId: row.solicitacao_id,
    categoria: row.categoria,
    materiais: row.materiais,
    reciclavel: row.reciclavel,
    pesoEstimadoKg: row.peso_estimado_kg !== null ? Number(row.peso_estimado_kg) : null,
    aceitaColetaComum: row.aceita_coleta_comum,
    atencao: row.atencao,
    pontosPrevistos: row.pontos_previstos !== null ? Number(row.pontos_previstos) : null,
    atualizadoEm: row.atualizado_em,
    statusSolicitacao: row.solicitacoes?.status ?? null,
  };
}

function paraMensagem(row: any): Mensagem {
  return {
    id: row.id,
    autor: row.autor,
    texto: row.texto,
    passos: row.passos ?? null,
    criadoEm: row.criado_em,
  };
}

/** Primeira frase vira o título da conversa na lista de recentes. */
function tituloDe(descricao: string): string {
  const limpo = descricao.trim().replace(/\s+/g, ' ');
  return limpo.length > 46 ? `${limpo.slice(0, 46)}…` : limpo || 'Novo descarte';
}

/** O que a IA recebe de cada mensagem anterior — os passos entram como texto para ela lembrar. */
function paraHistorico(m: Mensagem): { autor: Mensagem['autor']; texto: string } {
  const passos = m.passos?.map((p, i) => `${i + 1}. ${p.titulo}: ${p.descricao}`).join('\n');
  return { autor: m.autor, texto: passos ? `${m.texto}\n${passos}` : m.texto };
}

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly client = inject(SupabaseService).client;
  private readonly moradorService = inject(MoradorService);

  private readonly _conversas = signal<Conversa[]>([]);
  readonly conversas = this._conversas.asReadonly();

  private readonly _ativa = signal<Conversa | null>(null);
  readonly ativa = this._ativa.asReadonly();

  private readonly _mensagens = signal<Mensagem[]>([]);
  readonly mensagens = this._mensagens.asReadonly();

  readonly enviando = signal(false);

  async carregarConversas(): Promise<void> {
    const morador = this.moradorService.morador();
    if (!morador) return;

    const { data } = await this.client
      .from('chat_conversas')
      .select('*, solicitacoes(status)')
      .eq('morador_id', morador.id)
      .order('atualizado_em', { ascending: false });

    this._conversas.set((data ?? []).map(paraConversa));
  }

  async abrir(conversaId: string): Promise<void> {
    const conversa = this._conversas().find(c => c.id === conversaId) ?? null;
    this._ativa.set(conversa);

    const { data } = await this.client
      .from('chat_mensagens')
      .select('*')
      .eq('conversa_id', conversaId)
      .order('criado_em');

    this._mensagens.set((data ?? []).map(paraMensagem));
  }

  novaConversa(): void {
    this._ativa.set(null);
    this._mensagens.set([]);
  }

  /**
   * Manda a mensagem do morador para o assistente e grava as duas mensagens. Cria a
   * conversa na primeira mensagem; o resumo do resíduo só muda quando a IA identifica um item.
   */
  async enviar(texto: string): Promise<{ erro: string | null }> {
    const morador = this.moradorService.morador();
    const descricao = texto.trim();
    if (!morador || !descricao || this.enviando()) return { erro: null };

    this.enviando.set(true);
    try {
      return await this.enviarComoMorador(morador.id, descricao);
    } finally {
      this.enviando.set(false);
    }
  }

  private async enviarComoMorador(moradorId: string, descricao: string): Promise<{ erro: string | null }> {
    const falha = { erro: 'Não foi possível enviar sua mensagem. Tente novamente.' };

    let conversa = this._ativa();
    const resposta = await conversarComIA(this._mensagens().map(paraHistorico), descricao);
    const classificacao = resposta.classificacao;

    // Só conta como "item novo/diferente" quando a IA classifica algo e a categoria muda.
    // Uma resposta que só repete o item já identificado (ex.: responder uma dúvida sobre ele,
    // ou uma pergunta fora do tema que o modelo devolve com a mesma classificação) não deve
    // renomear a conversa nem gerar um descarte novo — o título vira o título do pedido.
    const itemMudou = !!classificacao && classificacao.categoria !== conversa?.categoria;

    // Conversa que já virou pedido fica congelada: um item diferente abre um descarte novo,
    // em vez de reclassificar o pedido já enviado. Dúvidas continuam na mesma conversa.
    if (conversa?.solicitacaoId && itemMudou) conversa = null;

    if (!conversa) {
      const { data } = await this.client
        .from('chat_conversas')
        .insert({
          morador_id: moradorId,
          titulo: tituloDe(descricao),
          ...(classificacao ? this.camposClassificacao(classificacao) : {}),
        })
        .select('*, solicitacoes(status)')
        .single();

      if (!data) return falha;
      conversa = paraConversa(data);
      this._ativa.set(conversa);
    } else if (itemMudou) {
      // Item diferente na mesma conversa reclassifica — e o título acompanha, porque é ele
      // que vai como título da solicitação.
      const { error } = await this.client
        .from('chat_conversas')
        .update({ titulo: tituloDe(descricao), ...this.camposClassificacao(classificacao!) })
        .eq('id', conversa.id);
      if (error) return falha;
    }

    const { error: erroMensagens } = await this.client.from('chat_mensagens').insert([
      { conversa_id: conversa.id, autor: 'morador', texto: descricao },
      {
        conversa_id: conversa.id,
        autor: 'ia',
        texto: resposta.texto,
        // Passos só quando a IA identifica o item (novo ou diferente); numa dúvida é só texto.
        passos: itemMudou ? classificacao!.passos : null,
      },
    ]);
    if (erroMensagens) return falha;

    await this.carregarConversas();
    await this.abrir(conversa.id);
    return { erro: null };
  }

  private camposClassificacao(c: Classificacao) {
    return {
      categoria: c.categoria,
      materiais: c.materiais,
      reciclavel: c.reciclavel,
      peso_estimado_kg: c.pesoEstimadoKg,
      aceita_coleta_comum: c.aceitaColetaComum,
      atencao: c.atencao,
      pontos_previstos: pontosPrevistos(c, 'entrega_ecoponto'),
    };
  }

  /** Gera a solicitação a partir da conversa — é o "Agendar coleta" / "Escolher este local". */
  async criarSolicitacao(opcoes: {
    destino: 'coleta_casa' | 'entrega_ecoponto';
    cooperativaId?: string | null;
    ecopontoId?: string | null;
    enderecoId?: string | null;
    endereco: string;
    bairro: string;
    janelaPreferida: string;
    preco: number;
  }): Promise<{ erro: string | null; id?: string }> {
    const morador = this.moradorService.morador();
    const conversa = this._ativa();
    if (!morador || !conversa) return { erro: 'Nenhuma conversa aberta.' };

    const pontos = Math.round(
      (conversa.pontosPrevistos ?? 0) * (opcoes.destino === 'entrega_ecoponto' ? 1 : 0.75)
    );

    const { data, error } = await this.client
      .from('solicitacoes')
      .insert({
        morador_id: morador.id,
        cooperativa_id: opcoes.cooperativaId ?? null,
        ecoponto_id: opcoes.ecopontoId ?? null,
        endereco_id: opcoes.enderecoId ?? null,
        destino: opcoes.destino,
        titulo: conversa.titulo,
        categoria: conversa.categoria ?? 'A conferir',
        peso_estimado_kg: conversa.pesoEstimadoKg ?? 0,
        solicitante_nome: morador.nome,
        endereco: opcoes.endereco,
        bairro: opcoes.bairro,
        janela_preferida: opcoes.janelaPreferida,
        preco: opcoes.preco,
        pontos_previstos: pontos,
      })
      .select('id')
      .single();

    if (error || !data) return { erro: 'Não foi possível criar a solicitação. Tente novamente.' };

    await this.client.from('chat_conversas').update({ solicitacao_id: data.id }).eq('id', conversa.id);
    await this.carregarConversas();
    await this.abrir(conversa.id);

    return { erro: null, id: data.id };
  }
}
