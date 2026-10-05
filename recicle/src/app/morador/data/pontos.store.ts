import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';
import { MoradorService } from './morador.service';
import { mensagemDoBanco } from '../../shared/util/erros';

export interface MovimentoPontos {
  id: string;
  tipo: 'credito' | 'bonus' | 'resgate' | 'ajuste';
  descricao: string;
  detalhe: string | null;
  pontos: number;
  criadoEm: string;
}

export interface Beneficio {
  id: string;
  nome: string;
  descricao: string | null;
  parceiro: string | null;
  custoPontos: number;
  estoque: number | null;
  disponivel: boolean;
}

/** Níveis por pontos acumulados — o card do painel mostra quanto falta para o próximo. */
export const NIVEIS = [
  { nome: 'Semente', minimo: 0 },
  { nome: 'Muda', minimo: 500 },
  { nome: 'Árvore', minimo: 1500 },
  { nome: 'Floresta', minimo: 4000 },
] as const;

type Nivel = (typeof NIVEIS)[number];

export function nivelDe(pontos: number) {
  let atual: Nivel = NIVEIS[0];
  let proximo: Nivel | null = null;
  for (const n of NIVEIS) {
    if (pontos >= n.minimo) atual = n;
    else if (!proximo) proximo = n;
  }
  return { atual, proximo, faltam: proximo ? proximo.minimo - pontos : 0 };
}

/** Tabela de pontuação mostrada em "Como os pontos são calculados". */
export const REGRAS_PONTUACAO = [
  { titulo: 'Entrega em ecoponto', valor: '5 pts/kg', detalhe: 'você leva o material' },
  { titulo: 'Coleta em casa', valor: '3,75 pts/kg', detalhe: 'a cooperativa busca' },
  { titulo: 'Óleo de cozinha', valor: '16 pts/L', detalhe: 'valor por litro entregue' },
  { titulo: 'Bônus de separação', valor: '+25 pts', detalhe: 'quando o rejeito fica abaixo de 10%' },
];

function paraMovimento(row: any): MovimentoPontos {
  return {
    id: row.id,
    tipo: row.tipo,
    descricao: row.descricao,
    detalhe: row.detalhe,
    pontos: Number(row.pontos),
    criadoEm: row.criado_em,
  };
}

function paraBeneficio(row: any): Beneficio {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    parceiro: row.parceiro,
    custoPontos: Number(row.custo_pontos),
    estoque: row.estoque !== null ? Number(row.estoque) : null,
    // estoque null = ilimitado; 0 = esgotado
    disponivel: row.estoque === null || Number(row.estoque) > 0,
  };
}

@Injectable({ providedIn: 'root' })
export class PontosStore {
  private readonly client = inject(SupabaseService).client;
  private readonly moradorService = inject(MoradorService);

  private readonly _movimentos = signal<MovimentoPontos[]>([]);
  readonly movimentos = this._movimentos.asReadonly();

  private readonly _beneficios = signal<Beneficio[]>([]);
  readonly beneficios = this._beneficios.asReadonly();

  /** Saldo sempre derivado do extrato — nunca um contador guardado à parte. */
  readonly saldo = computed(() => this._movimentos().reduce((total, m) => total + m.pontos, 0));

  readonly acumulado = computed(() =>
    this._movimentos().filter(m => m.pontos > 0).reduce((total, m) => total + m.pontos, 0)
  );
  readonly resgatado = computed(() =>
    Math.abs(this._movimentos().filter(m => m.pontos < 0).reduce((total, m) => total + m.pontos, 0))
  );

  readonly nivel = computed(() => nivelDe(this.saldo()));
  readonly regras = REGRAS_PONTUACAO;

  /** Benefício mais barato que o morador já consegue resgatar. */
  readonly proximoBeneficio = computed(() => {
    const disponiveis = this._beneficios().filter(b => b.disponivel);
    if (disponiveis.length === 0) return null;
    const saldo = this.saldo();
    const alcancavel = disponiveis.filter(b => b.custoPontos <= saldo);
    if (alcancavel.length > 0) {
      return alcancavel.reduce((maior, b) => (b.custoPontos > maior.custoPontos ? b : maior));
    }
    return disponiveis.reduce((menor, b) => (b.custoPontos < menor.custoPontos ? b : menor));
  });

  async carregar(): Promise<void> {
    const morador = this.moradorService.morador();
    if (!morador) {
      this._movimentos.set([]);
      return;
    }

    const [{ data: movimentos }, { data: beneficios }] = await Promise.all([
      this.client
        .from('pontos_movimentos')
        .select('*')
        .eq('morador_id', morador.id)
        .order('criado_em', { ascending: false }),
      this.client.from('beneficios').select('*').eq('ativo', true).order('ordem'),
    ]);

    this._movimentos.set((movimentos ?? []).map(paraMovimento));
    this._beneficios.set((beneficios ?? []).map(paraBeneficio));
  }

  async resgatar(beneficio: Beneficio): Promise<{ erro: string | null; codigo?: string }> {
    const morador = this.moradorService.morador();
    if (!morador) return { erro: 'Nenhum morador carregado.' };
    if (beneficio.custoPontos > this.saldo()) return { erro: 'Saldo insuficiente para esse benefício.' };
    if (!beneficio.disponivel) return { erro: 'Esse benefício está esgotado no momento.' };

    const { data, error } = await this.client
      .from('resgates')
      .insert({ morador_id: morador.id, beneficio_id: beneficio.id, pontos: beneficio.custoPontos })
      .select('codigo')
      .single();

    if (error || !data) {
      return { erro: error ? mensagemDoBanco(error, 'Não foi possível concluir o resgate. Tente novamente.') : 'Não foi possível concluir o resgate. Tente novamente.' };
    }

    await this.carregar();
    return { erro: null, codigo: data.codigo };
  }
}
