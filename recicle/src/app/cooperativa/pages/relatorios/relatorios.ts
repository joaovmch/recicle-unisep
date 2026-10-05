import { Component, computed, inject, signal } from '@angular/core';
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
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatarPeso(kg: number): string {
  if (kg < 1000) return `${kg.toLocaleString('pt-BR')} kg`;
  return `${(kg / 1000).toFixed(1).replace('.', ',')} t`;
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
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

    if (linhas.length === 0) {
      this._dataset.set(DATASET_VAZIO);
      return;
    }

    const recebidoKg = linhas.reduce((total, l) => total + Number(l.peso_recebido_kg ?? 0), 0);
    const rejeitoKg = linhas.reduce((total, l) => total + Number(l.rejeito_kg ?? 0), 0);
    const receitaRecebida = linhas.reduce((total, l) => total + Number(l.preco ?? 0), 0);

    // Rejeito por categoria sai da própria coleta (peso recebido × rejeito daquela coleta),
    // não de um percentual único repetido em todas as linhas.
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

    // Semanas do mês: blocos de 7 dias a partir do dia 1.
    const diasNoMes = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate();
    const semanas = Math.ceil(diasNoMes / 7);
    const hoje = new Date();

    const volumeSemanal: SemanaVolume[] = Array.from({ length: semanas }, (_, i) => {
      const de = new Date(inicio.getFullYear(), inicio.getMonth(), 1 + i * 7);
      const ate = new Date(inicio.getFullYear(), inicio.getMonth(), Math.min(1 + (i + 1) * 7, diasNoMes + 1));
      const kg = noIntervalo(de, ate).reduce((total, l) => total + Number(l.peso_recebido_kg ?? 0), 0);
      const emCurso = hoje >= de && hoje < ate;
      return { label: `${i + 1}ª sem`, kg, emCurso, destaque: false };
    });

    const maior = Math.max(...volumeSemanal.filter(s => !s.emCurso).map(s => s.kg), 0);
    for (const semana of volumeSemanal) {
      semana.destaque = !semana.emCurso && semana.kg === maior && maior > 0;
    }

    this._dataset.set({
      volumeSemanal,
      porCategoria,
      recebidoKg,
      rejeitoKg,
      coletasConcluidas: linhas.length,
      receitaRecebida,
    });
  }

  alturaBarra(kg: number): number {
    return Math.max(4, Math.round((kg / this.volumeMaximo()) * 100));
  }

  formatarPreco(valor: number): string {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
  }

  // ===== Modal "Exportar relatório" =====

  readonly modalExportarAberto = signal(false);
  readonly formatoExportar = signal<'pdf' | 'csv'>('pdf');

  abrirExportar(): void {
    this.formatoExportar.set('pdf');
    this.modalExportarAberto.set(true);
  }

  fecharExportar(): void {
    this.modalExportarAberto.set(false);
  }

  confirmarExportar(): void {
    this.fecharExportar();
    if (this.formatoExportar() === 'pdf') window.print();
    else this.baixarCsv();
  }

  baixarCsv(): void {
    const dataset = this._dataset();
    const linhas: unknown[][] = [
      ['Material recebido', formatarPeso(dataset.recebidoKg)],
      ['Coletas concluídas', dataset.coletasConcluidas],
      ['Recebido em coletas', this.formatarPreco(dataset.receitaRecebida)],
      ['Rejeito na triagem', `${this.rejeitoTriagem()}%`],
      [],
      ['Categoria', 'Recebido (kg)', 'Rejeito', 'Coletas'],
      ...dataset.porCategoria.map(c => [c.nome, c.pesoKg, `${c.rejeitoPercent}%`, c.coletas]),
    ];
    baixarCsv(`relatorio-${this.mesSelecionado()}.csv`, [`Consolidado · ${this.rotuloMes()}`], linhas);
    this.toast.mostrar('CSV exportado.');
  }
}
