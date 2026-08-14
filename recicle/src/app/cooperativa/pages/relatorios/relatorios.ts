import { Component, computed, inject, signal } from '@angular/core';
import { baixarCsv } from '../../shared/csv';
import { ToastService } from '../../shared/toast.service';

type Periodo = '30' | '90' | 'ano';

interface SemanaVolume {
  label: string;
  kg: number;
  destaque: boolean;
}

interface BairroEnvio {
  nome: string;
  kg: number;
}

interface MaterialRelatorio {
  nome: string;
  subtitulo: string;
  pesoKg: number;
  unidade: string;
  coletas: number;
  rejeitoPercent: number;
}

interface RelatorioDataset {
  chartSubtitulo: string;
  comparativo: string;
  volumeSemanal: SemanaVolume[];
  bairrosQueMaisEnviam: BairroEnvio[];
  porTipoMaterial: MaterialRelatorio[];
  materialRecebido: string;
  coletasConcluidas: number;
  receitaRecebida: number;
  rejeitoTriagem: number;
}

const DATASET_VAZIO: RelatorioDataset = {
  chartSubtitulo: 'em quilos',
  comparativo: 'sem dados no período anterior',
  volumeSemanal: [],
  bairrosQueMaisEnviam: [],
  porTipoMaterial: [],
  materialRecebido: '0 kg',
  coletasConcluidas: 0,
  receitaRecebida: 0,
  rejeitoTriagem: 0,
};

const DATASETS: Record<Periodo, RelatorioDataset> = {
  '30': { ...DATASET_VAZIO, chartSubtitulo: 'em quilos, últimas 4 semanas' },
  '90': { ...DATASET_VAZIO, chartSubtitulo: 'em quilos, últimas 10 semanas' },
  ano: { ...DATASET_VAZIO, chartSubtitulo: 'em quilos, por mês' },
};

@Component({
  selector: 'app-relatorios',
  imports: [],
  templateUrl: './relatorios.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './relatorios.css'],
})
export class Relatorios {
  private readonly toast = inject(ToastService);

  readonly periodoAtivo = signal<Periodo>('90');
  private readonly dataset = computed(() => DATASETS[this.periodoAtivo()]);

  readonly chartSubtitulo = computed(() => this.dataset().chartSubtitulo);
  readonly comparativo = computed(() => this.dataset().comparativo);
  readonly volumeSemanal = computed(() => this.dataset().volumeSemanal);
  readonly bairrosQueMaisEnviam = computed(() => this.dataset().bairrosQueMaisEnviam);
  readonly porTipoMaterial = computed(() => this.dataset().porTipoMaterial);
  readonly materialRecebido = computed(() => this.dataset().materialRecebido);
  readonly coletasConcluidas = computed(() => this.dataset().coletasConcluidas);
  readonly receitaRecebida = computed(() => this.dataset().receitaRecebida);
  readonly rejeitoTriagem = computed(() => this.dataset().rejeitoTriagem);

  readonly volumeMaximo = computed(() => Math.max(1, ...this.volumeSemanal().map(s => s.kg)));
  readonly bairroMaximo = computed(() => Math.max(1, ...this.bairrosQueMaisEnviam().map(b => b.kg)));
  readonly volumososRejeito = computed(
    () => this.porTipoMaterial().find(m => m.nome.startsWith('Volumosos'))?.rejeitoPercent ?? 0
  );

  setPeriodo(periodo: Periodo): void {
    this.periodoAtivo.set(periodo);
  }

  alturaBarra(kg: number): number {
    return Math.round((kg / this.volumeMaximo()) * 100);
  }

  larguraBairro(kg: number): number {
    return Math.round((kg / this.bairroMaximo()) * 100);
  }

  formatarPreco(valor: number): string {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
  }

  exportarPdf(): void {
    window.print();
  }

  baixarCsvMaterial(): void {
    const linhas = this.porTipoMaterial().map(m => [m.nome, m.pesoKg, m.unidade, m.coletas, `${m.rejeitoPercent}%`]);
    baixarCsv(
      `relatorio-material-${this.periodoAtivo()}.csv`,
      ['Material', 'Peso recebido', 'Unidade', 'Coletas', 'Rejeito'],
      linhas
    );
    this.toast.mostrar('CSV exportado.');
  }

  gerarRelatorioPrefeitura(): void {
    const dataset = this.dataset();
    const linhas: unknown[][] = [
      ['Material recebido', dataset.materialRecebido],
      ['Coletas concluídas', dataset.coletasConcluidas],
      ['Recebido pelas coletas', this.formatarPreco(dataset.receitaRecebida)],
      ['Rejeito na triagem', `${dataset.rejeitoTriagem}%`],
      [],
      ['Material', 'Peso recebido', 'Coletas', 'Rejeito'],
      ...dataset.porTipoMaterial.map(m => [m.nome, `${m.pesoKg} ${m.unidade}`, m.coletas, `${m.rejeitoPercent}%`]),
    ];
    baixarCsv(`relatorio-prefeitura-${this.periodoAtivo()}.csv`, ['Consolidado da cooperativa'], linhas);
    this.toast.mostrar('Relatório gerado.');
  }
}
