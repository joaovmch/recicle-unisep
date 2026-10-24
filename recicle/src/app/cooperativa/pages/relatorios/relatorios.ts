import { Component, computed, inject, signal } from '@angular/core';
import { formatarPeso, maiuscula } from '../../../shared/util/format';
import { baixarCsv } from '../../../shared/util/csv';
import { ToastService } from '../../../shared/ui/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';

interface SemanaVolume {
  label: string;
  kg: number;
  emCurso: boolean;
  destaque: boolean;
}

interface CategoriaRelatorio {
  nome: string;
  pesoKg: number;
  coletas: number;
  rejeitoPercent: number;
}

/** Linha da "Lista das coletas" do arquivo exportado. */
interface ColetaExportada {
  data: string;
  categoria: string;
  pesoKg: number;
  rejeitoKg: number;
  preco: number;
  solicitante: string;
}

interface MesAnterior {
  mes: string;
  rotulo: string;
  total: string;
}

interface RelatorioDataset {
  volumeSemanal: SemanaVolume[];
  porCategoria: CategoriaRelatorio[];
  recebidoKg: number;
  rejeitoKg: number;
  coletasConcluidas: number;
  receitaRecebida: number;
}

const DATASET_VAZIO: RelatorioDataset = {
  volumeSemanal: [],
  porCategoria: [],
  recebidoKg: 0,
  rejeitoKg: 0,
  coletasConcluidas: 0,
  receitaRecebida: 0,
};

/** Acima disso o rejeito de uma categoria vira aviso na lateral. */
const REJEITO_ALTO_PERCENT = 12;

type PeriodoExportacao = 'mes' | '90dias' | 'ano' | 'datas';

const PERIODOS_EXPORTACAO: { valor: PeriodoExportacao; label: string }[] = [
  { valor: 'mes', label: 'Mês atual' },
  { valor: '90dias', label: 'Últimos 90 dias' },
  { valor: 'ano', label: 'Ano atual' },
  { valor: 'datas', label: 'Escolher datas' },
];

/** "O que incluir" do arquivo exportado (US14). Ao menos um precisa ficar marcado. */
const CONTEUDOS_EXPORTACAO = [
  { chave: 'resumo', label: 'Resumo do período' },
  { chave: 'categoria', label: 'Tabela por categoria' },
  { chave: 'semana', label: 'Gráfico por semana' },
  { chave: 'coletas', label: 'Lista das coletas' },
  { chave: 'solicitantes', label: 'Nome dos solicitantes' },
] as const;

type ChaveConteudo = (typeof CONTEUDOS_EXPORTACAO)[number]['chave'];

/** O relatório não substitui o MTR; a observação vai impressa no rodapé (RN47). */
const RODAPE_MTR =
  'Este relatório não substitui o MTR (Manifesto de Transporte de Resíduos) exigido de geradores obrigados.';

function mesAtualISO(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function limitesDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, mesNum] = mes.split('-').map(Number);
  return {
    inicio: new Date(ano, mesNum - 1, 1),
    fim: new Date(ano, mesNum, 1),
  };
}

function mesAnterior(mes: string, passos = 1): string {
  const [ano, mesNum] = mes.split('-').map(Number);
  const data = new Date(ano, mesNum - 1 - passos, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function rotuloDoMes(mes: string): string {
  const { inicio } = limitesDoMes(mes);
  const texto = inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return maiuscula(texto);
}

/** Início e fim (exclusivo) do período escolhido no modal de exportação. */
function limitesDaExportacao(
  periodo: PeriodoExportacao,
  mes: string,
  dataInicial: string,
  dataFinal: string
): { inicio: Date; fim: Date; rotulo: string } | null {
  const hoje = new Date();

  if (periodo === 'mes') {
    const { inicio, fim } = limitesDoMes(mes);
    return { inicio, fim, rotulo: rotuloDoMes(mes) };
  }
  if (periodo === '90dias') {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 90);
    return { inicio, fim: hoje, rotulo: 'Últimos 90 dias' };
  }
  if (periodo === 'ano') {
    return { inicio: new Date(hoje.getFullYear(), 0, 1), fim: hoje, rotulo: `Ano de ${hoje.getFullYear()}` };
  }

  if (!dataInicial || !dataFinal) return null;
  const inicio = new Date(`${dataInicial}T00:00:00`);
  // Fim exclusivo: somando um dia, a data final escolhida entra inteira no arquivo.
  const fim = new Date(`${dataFinal}T00:00:00`);
  fim.setDate(fim.getDate() + 1);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio >= fim) return null;

  const formato = (d: Date) => d.toLocaleDateString('pt-BR');
  const ultimoDia = new Date(fim);
  ultimoDia.setDate(ultimoDia.getDate() - 1);
  return { inicio, fim, rotulo: `${formato(inicio)} a ${formato(ultimoDia)}` };
}



/**
 * Monta o consolidado de um intervalo qualquer. Fica fora do componente porque a tela
 * usa para o mês selecionado e a exportação usa para o período escolhido no modal —
 * antes a exportação reaproveitava o dataset do mês e ignorava o período pedido.
 */
function agregar(linhas: any[], inicio: Date, fim: Date): RelatorioDataset {
  if (linhas.length === 0) return DATASET_VAZIO;

  const recebidoKg = linhas.reduce((total, l) => total + Number(l.peso_recebido_kg ?? 0), 0);
  const rejeitoKg = linhas.reduce((total, l) => total + Number(l.rejeito_kg ?? 0), 0);
  const receitaRecebida = linhas.reduce((total, l) => total + Number(l.preco ?? 0), 0);

  const porCategoriaMapa = new Map<string, { pesoKg: number; rejeitoKg: number; coletas: number }>();
  for (const l of linhas) {
    const chave = l.categoria || 'Sem categoria';
    const atual = porCategoriaMapa.get(chave) ?? { pesoKg: 0, rejeitoKg: 0, coletas: 0 };
    porCategoriaMapa.set(chave, {
      pesoKg: atual.pesoKg + Number(l.peso_recebido_kg ?? 0),
      rejeitoKg: atual.rejeitoKg + Number(l.rejeito_kg ?? 0),
      coletas: atual.coletas + 1,
    });
  }

  const porCategoria: CategoriaRelatorio[] = [...porCategoriaMapa.entries()]
    .map(([nome, v]) => ({
      nome: maiuscula(nome),
      pesoKg: v.pesoKg,
      coletas: v.coletas,
      rejeitoPercent: v.pesoKg > 0 ? Math.round((v.rejeitoKg / v.pesoKg) * 100) : 0,
    }))
    .sort((a, b) => b.pesoKg - a.pesoKg);

  // Blocos de 7 dias a partir do início do intervalo.
  const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / 86_400_000));
  const semanas = Math.ceil(dias / 7);
  const hoje = new Date();

  const volumeSemanal: SemanaVolume[] = Array.from({ length: semanas }, (_, i) => {
    const de = new Date(inicio);
    de.setDate(de.getDate() + i * 7);
    const ate = new Date(inicio);
    ate.setDate(ate.getDate() + (i + 1) * 7);
    const kg = linhas
      .filter(l => {
        const quando = new Date(l.confirmado_em);
        return quando >= de && quando < ate;
      })
      .reduce((total, l) => total + Number(l.peso_recebido_kg ?? 0), 0);
    return { label: `${i + 1}ª sem`, kg, emCurso: hoje >= de && hoje < ate, destaque: false };
  });

  const maior = Math.max(...volumeSemanal.filter(s => !s.emCurso).map(s => s.kg), 0);
  for (const semana of volumeSemanal) {
    semana.destaque = !semana.emCurso && semana.kg === maior && maior > 0;
  }

  return { volumeSemanal, porCategoria, recebidoKg, rejeitoKg, coletasConcluidas: linhas.length, receitaRecebida };
}

@Component({
  selector: 'app-relatorios',
  imports: [],
  templateUrl: './relatorios.html',
  styleUrls: ['../../../shared/ui/design-system.css', './relatorios.css'],
})
export class Relatorios {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);
  /** Usado no cabeçalho da folha de impressão (CNPJ e licença). */
  readonly cooperativa = this.cooperativaService.cooperativa;

  readonly mesSelecionado = signal(mesAtualISO());
  readonly mesMaximo = mesAtualISO();

  private readonly _dataset = signal<RelatorioDataset>(DATASET_VAZIO);
  private readonly _recebidoMesAnteriorKg = signal(0);
  readonly mesesAnteriores = signal<MesAnterior[]>([]);

  readonly rotuloMes = computed(() => rotuloDoMes(this.mesSelecionado()));
  readonly ehMesCorrente = computed(() => this.mesSelecionado() === mesAtualISO());

  readonly volumeSemanal = computed(() => this._dataset().volumeSemanal);
  readonly porCategoria = computed(() => this._dataset().porCategoria);
  readonly coletasConcluidas = computed(() => this._dataset().coletasConcluidas);
  readonly receitaRecebida = computed(() => this._dataset().receitaRecebida);

  readonly materialRecebido = computed(() => formatarPeso(this._dataset().recebidoKg));
  readonly rejeitoKg = computed(() => this._dataset().rejeitoKg);
  readonly rejeitoTriagem = computed(() => {
    const recebido = this._dataset().recebidoKg;
    return recebido > 0 ? Math.round((this._dataset().rejeitoKg / recebido) * 100) : 0;
  });

  readonly mediaPorColeta = computed(() => {
    const { recebidoKg, coletasConcluidas } = this._dataset();
    if (coletasConcluidas === 0) return '';
    return `média de ${Math.round(recebidoKg / coletasConcluidas).toLocaleString('pt-BR')} kg por coleta`;
  });

  /** Variação sobre o mês anterior — é a linha verde embaixo do total recebido. */
  readonly variacaoMesAnterior = computed(() => {
    const anterior = this._recebidoMesAnteriorKg();
    const atual = this._dataset().recebidoKg;
    if (anterior === 0) return '';
    const variacao = Math.round(((atual - anterior) / anterior) * 100);
    const sinal = variacao > 0 ? '+' : '';
    const nomeAnterior = limitesDoMes(mesAnterior(this.mesSelecionado())).inicio.toLocaleDateString('pt-BR', {
      month: 'long',
    });
    return `${sinal}${variacao}% sobre ${nomeAnterior}`;
  });

  readonly variacaoPositiva = computed(() => this.variacaoMesAnterior().startsWith('+'));

  readonly volumeMaximo = computed(() => Math.max(1, ...this.volumeSemanal().map(s => s.kg)));

  /** Categoria que mais vira rejeito, quando passa do aceitável. */
  readonly categoriaCritica = computed(() => {
    const candidatas = this.porCategoria().filter(c => c.rejeitoPercent >= REJEITO_ALTO_PERCENT);
    if (candidatas.length === 0) return null;
    return candidatas.reduce((maior, c) => (c.rejeitoPercent > maior.rejeitoPercent ? c : maior));
  });

  constructor() {
    this.carregar();
  }

  selecionarMes(mes: string): void {
    if (!mes) return;
    this.mesSelecionado.set(mes);
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const mes = this.mesSelecionado();
    const { inicio, fim } = limitesDoMes(mes);
    const anterior = limitesDoMes(mesAnterior(mes));
    // Busca de uma vez os 4 meses que a tela usa: o selecionado, o anterior (variação)
    // e mais dois para a lista de "Relatórios anteriores".
    const desde = limitesDoMes(mesAnterior(mes, 3)).inicio;

    const { data } = await this.client
      .from('solicitacoes')
      .select('id, categoria, preco, peso_recebido_kg, rejeito_kg, confirmado_em')
      .eq('cooperativa_id', cooperativa.id)
      .eq('status', 'concluida')
      .gte('confirmado_em', desde.toISOString())
      .lt('confirmado_em', fim.toISOString());

    const todas = data ?? [];
    const noIntervalo = (de: Date, ate: Date) =>
      todas.filter(l => {
        const quando = new Date(l.confirmado_em);
        return quando >= de && quando < ate;
      });

    const linhas = noIntervalo(inicio, fim);
    this._recebidoMesAnteriorKg.set(
      noIntervalo(anterior.inicio, anterior.fim).reduce((total, l) => total + Number(l.peso_recebido_kg ?? 0), 0)
    );

    this.mesesAnteriores.set(
      [1, 2, 3].map(passos => {
        const alvo = mesAnterior(mes, passos);
        const { inicio: de, fim: ate } = limitesDoMes(alvo);
        const kg = noIntervalo(de, ate).reduce((total, l) => total + Number(l.peso_recebido_kg ?? 0), 0);
        return { mes: alvo, rotulo: rotuloDoMes(alvo), total: formatarPeso(kg) };
      })
    );

    this._dataset.set(agregar(linhas, inicio, fim));
  }

  alturaBarra(kg: number): number {
    return Math.max(4, Math.round((kg / this.volumeMaximo()) * 100));
  }

  /** O `formatarPeso` do módulo não é visível no template; a folha chama por aqui. */
  formatarPesoFolha(kg: number): string {
    return formatarPeso(kg);
  }

  rejeitoDoDataset(dataset: RelatorioDataset): number {
    return dataset.recebidoKg > 0 ? Math.round((dataset.rejeitoKg / dataset.recebidoKg) * 100) : 0;
  }

  formatarPreco(valor: number): string {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
  }

  // ===== Modal "Exportar relatório" (US14, passos 4 a 8) =====

  readonly modalExportarAberto = signal(false);
  readonly formatoExportar = signal<'pdf' | 'csv'>('pdf');
  readonly periodoExportar = signal<PeriodoExportacao>('mes');
  readonly dataInicial = signal('');
  readonly dataFinal = signal('');
  readonly periodosExportacao = PERIODOS_EXPORTACAO;
  readonly conteudosExportacao = CONTEUDOS_EXPORTACAO;
  readonly rodapeMtr = RODAPE_MTR;

  private readonly _conteudo = signal<Record<ChaveConteudo, boolean>>({
    resumo: true,
    categoria: true,
    semana: true,
    coletas: false,
    solicitantes: false,
  });
  readonly conteudo = this._conteudo.asReadonly();

  readonly nenhumConteudo = computed(() => Object.values(this._conteudo()).every(v => !v));

  /** FE01: data final anterior à inicial bloqueia a geração. */
  readonly erroPeriodo = computed(() => {
    if (this.periodoExportar() !== 'datas') return '';
    if (!this.dataInicial() || !this.dataFinal()) return 'Informe as duas datas.';
    return this.dataFinal() < this.dataInicial() ? 'A data final não pode ser anterior à inicial.' : '';
  });

  readonly exportacaoBloqueada = computed(() => this.nenhumConteudo() || !!this.erroPeriodo());

  alternarConteudo(chave: ChaveConteudo): void {
    this._conteudo.update(atual => ({ ...atual, [chave]: !atual[chave] }));
  }

  abrirExportar(): void {
    this.formatoExportar.set('pdf');
    this.periodoExportar.set('mes');
    this.dataInicial.set('');
    this.dataFinal.set('');
    this.modalExportarAberto.set(true);
  }

  fecharExportar(): void {
    this.modalExportarAberto.set(false);
  }

  /** Dados da folha de impressão (PDF); vazio enquanto ninguém mandou imprimir. */
  readonly folha = signal<{
    rotuloPeriodo: string;
    dataset: RelatorioDataset;
    coletas: ColetaExportada[];
    incluir: Record<ChaveConteudo, boolean>;
  } | null>(null);

  readonly exportando = signal(false);

  /**
   * Antes isto era `window.print()` puro: o período e os itens marcados no modal não
   * entravam na conta, e o PDF saía com a tela como estava. Agora os dois formatos
   * consultam o intervalo pedido e montam o conteúdo escolhido.
   */
  async confirmarExportar(): Promise<void> {
    // FE02 — sem conteúdo marcado não há arquivo para gerar.
    if (this.nenhumConteudo()) {
      this.toast.mostrar('Marque ao menos um item para incluir.');
      return;
    }
    if (this.erroPeriodo()) {
      this.toast.mostrar(this.erroPeriodo());
      return;
    }

    const limites = limitesDaExportacao(
      this.periodoExportar(),
      this.mesSelecionado(),
      this.dataInicial(),
      this.dataFinal()
    );
    if (!limites) {
      this.toast.mostrar('Informe a data inicial e a final.');
      return;
    }

    this.exportando.set(true);
    const dados = await this.buscarPeriodo(limites.inicio, limites.fim);
    this.exportando.set(false);

    if (!dados) {
      this.toast.mostrar('Não foi possível montar o relatório. Tente novamente.');
      return;
    }
    if (dados.dataset.coletasConcluidas === 0) {
      this.toast.mostrar(`Nenhuma coleta concluída em ${limites.rotulo.toLowerCase()}.`);
      return;
    }

    this.fecharExportar();

    if (this.formatoExportar() === 'pdf') {
      await this.imprimir(limites.rotulo, dados);
    } else {
      this.baixarCsv(limites.rotulo, dados);
    }
  }

  /** Busca as coletas concluídas do intervalo pedido (não as do mês da tela). */
  private async buscarPeriodo(
    inicio: Date,
    fim: Date
  ): Promise<{ dataset: RelatorioDataset; coletas: ColetaExportada[] } | null> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return null;

    const { data, error } = await this.client
      .from('solicitacoes')
      .select('categoria, preco, peso_recebido_kg, rejeito_kg, confirmado_em, solicitante_nome')
      .eq('cooperativa_id', cooperativa.id)
      .eq('status', 'concluida')
      .gte('confirmado_em', inicio.toISOString())
      .lt('confirmado_em', fim.toISOString())
      .order('confirmado_em');
    if (error) return null;

    const linhas = data ?? [];
    return {
      dataset: agregar(linhas, inicio, fim),
      coletas: linhas.map(l => ({
        data: new Date(l.confirmado_em).toLocaleDateString('pt-BR'),
        categoria: maiuscula(l.categoria || 'Sem categoria'),
        pesoKg: Number(l.peso_recebido_kg ?? 0),
        rejeitoKg: Number(l.rejeito_kg ?? 0),
        preco: Number(l.preco ?? 0),
        solicitante: l.solicitante_nome ?? '—',
      })),
    };
  }

  /**
   * Monta a folha no DOM, espera um quadro para ela existir e só então chama a impressão.
   * O `@media print` do CSS esconde o painel e deixa apenas essa folha na página.
   */
  private async imprimir(
    rotuloPeriodo: string,
    dados: { dataset: RelatorioDataset; coletas: ColetaExportada[] }
  ): Promise<void> {
    this.folha.set({ rotuloPeriodo, dataset: dados.dataset, coletas: dados.coletas, incluir: this._conteudo() });
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    window.print();
    this.folha.set(null);
  }

  private baixarCsv(rotuloPeriodo: string, dados: { dataset: RelatorioDataset; coletas: ColetaExportada[] }): void {
    const { dataset, coletas } = dados;
    const cooperativa = this.cooperativaService.cooperativa();
    const incluir = this._conteudo();

    // Cabeçalho com CNPJ e licença, exigido no arquivo gerado (US14).
    const linhas: unknown[][] = [
      [cooperativa?.nome ?? 'Cooperativa'],
      [`CNPJ ${cooperativa?.cnpj ?? '—'} · Licença ${cooperativa?.licencaNumero ?? '—'} (${cooperativa?.licencaOrgao ?? '—'})`],
      [`Período: ${rotuloPeriodo}`],
      [],
    ];

    if (incluir.resumo) {
      linhas.push(
        ['Material recebido', formatarPeso(dataset.recebidoKg)],
        ['Coletas concluídas', dataset.coletasConcluidas],
        ['Recebido em coletas', this.formatarPreco(dataset.receitaRecebida)],
        ['Rejeito na triagem', `${dataset.recebidoKg > 0 ? Math.round((dataset.rejeitoKg / dataset.recebidoKg) * 100) : 0}%`],
        []
      );
    }

    if (incluir.semana) {
      linhas.push(['Semana', 'Recebido (kg)']);
      linhas.push(...dataset.volumeSemanal.map(s => [s.label, s.kg]));
      linhas.push([]);
    }

    if (incluir.categoria) {
      linhas.push(['Categoria', 'Recebido (kg)', 'Rejeito', 'Coletas']);
      linhas.push(...dataset.porCategoria.map(c => [c.nome, c.pesoKg, `${c.rejeitoPercent}%`, c.coletas]));
      linhas.push([]);
    }

    if (incluir.coletas) {
      const cabecalho = ['Data', 'Categoria', 'Recebido (kg)', 'Rejeito (kg)', 'Valor'];
      if (incluir.solicitantes) cabecalho.push('Solicitante');
      linhas.push(cabecalho);
      linhas.push(
        ...coletas.map(c => {
          const linha: unknown[] = [c.data, c.categoria, c.pesoKg, c.rejeitoKg, this.formatarPreco(c.preco)];
          if (incluir.solicitantes) linha.push(c.solicitante);
          return linha;
        })
      );
      linhas.push([]);
    }

    linhas.push([RODAPE_MTR]);

    baixarCsv(`relatorio-${this.mesSelecionado()}.csv`, [`Consolidado · ${rotuloPeriodo}`], linhas);
    this.toast.mostrar('CSV exportado.');
  }
}
