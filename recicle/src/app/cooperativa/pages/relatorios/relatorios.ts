import { Component, computed, inject, signal } from '@angular/core';
import { baixarCsv } from '../../shared/csv';
import { ToastService } from '../../shared/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';

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

const DIAS_POR_PERIODO: Record<Periodo, number> = { '30': 30, '90': 90, ano: 365 };
const SUBTITULO_POR_PERIODO: Record<Periodo, string> = {
  '30': 'em quilos, últimas 4 semanas',
  '90': 'em quilos, últimas 10 semanas',
  ano: 'em quilos, por mês',
};

@Component({
  selector: 'app-relatorios',
  imports: [],
  templateUrl: './relatorios.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './relatorios.css'],
})
export class Relatorios {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  readonly periodoAtivo = signal<Periodo>('90');
  private readonly _dataset = signal<RelatorioDataset>(DATASET_VAZIO);

  readonly chartSubtitulo = computed(() => this._dataset().chartSubtitulo);
  readonly comparativo = computed(() => this._dataset().comparativo);
  readonly volumeSemanal = computed(() => this._dataset().volumeSemanal);
  readonly bairrosQueMaisEnviam = computed(() => this._dataset().bairrosQueMaisEnviam);
  readonly porTipoMaterial = computed(() => this._dataset().porTipoMaterial);
  readonly materialRecebido = computed(() => this._dataset().materialRecebido);
  readonly coletasConcluidas = computed(() => this._dataset().coletasConcluidas);
  readonly receitaRecebida = computed(() => this._dataset().receitaRecebida);
  readonly rejeitoTriagem = computed(() => this._dataset().rejeitoTriagem);

  readonly volumeMaximo = computed(() => Math.max(1, ...this.volumeSemanal().map(s => s.kg)));
  readonly bairroMaximo = computed(() => Math.max(1, ...this.bairrosQueMaisEnviam().map(b => b.kg)));
  readonly volumososRejeito = computed(
    () => this.porTipoMaterial().find(m => m.nome.startsWith('Volumosos'))?.rejeitoPercent ?? 0
  );

  constructor() {
    this.carregar();
  }

  setPeriodo(periodo: Periodo): void {
    this.periodoAtivo.set(periodo);
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const periodo = this.periodoAtivo();
    const dias = DIAS_POR_PERIODO[periodo];
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const { data: solicitacoes } = await this.client
      .from('solicitacoes')
      .select('id, categoria, bairro, preco, peso_recebido_kg, rejeito_kg, status, criado_em, confirmado_em')
      .eq('cooperativa_id', cooperativa.id)
      .eq('status', 'concluida')
      .gte('confirmado_em', desde.toISOString());

    const linhas = solicitacoes ?? [];

    if (linhas.length === 0) {
      this._dataset.set({ ...DATASET_VAZIO, chartSubtitulo: SUBTITULO_POR_PERIODO[periodo] });
      return;
    }

    const { data: triagem } = await this.client
      .from('solicitacao_triagem')
      .select('material, kg')
      .in('solicitacao_id', linhas.map(l => l.id));

    const totalRecebidoKg = linhas.reduce((total, l) => total + Number(l.peso_recebido_kg ?? 0), 0);
    const totalRejeitoKg = linhas.reduce((total, l) => total + Number(l.rejeito_kg ?? 0), 0);
    const receitaRecebida = linhas.reduce((total, l) => total + Number(l.preco ?? 0), 0);

    const kgPorBairro = new Map<string, number>();
    for (const l of linhas) {
      kgPorBairro.set(l.bairro, (kgPorBairro.get(l.bairro) ?? 0) + Number(l.peso_recebido_kg ?? 0));
    }
    const bairrosQueMaisEnviam: BairroEnvio[] = [...kgPorBairro.entries()]
      .map(([nome, kg]) => ({ nome, kg }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 6);

    const kgPorMaterial = new Map<string, number>();
    for (const t of triagem ?? []) {
      kgPorMaterial.set(t.material, (kgPorMaterial.get(t.material) ?? 0) + Number(t.kg));
    }
    const coletasPorCategoria = new Map<string, number>();
    for (const l of linhas) {
      coletasPorCategoria.set(l.categoria, (coletasPorCategoria.get(l.categoria) ?? 0) + 1);
    }
    const porTipoMaterial: MaterialRelatorio[] = [...kgPorMaterial.entries()].map(([nome, pesoKg]) => ({
      nome,
      subtitulo: '',
      pesoKg,
      unidade: 'kg',
      coletas: coletasPorCategoria.get(nome) ?? 0,
      rejeitoPercent: totalRecebidoKg > 0 ? Math.round((totalRejeitoKg / totalRecebidoKg) * 100) : 0,
    }));

    const numBuckets = periodo === '30' ? 4 : periodo === '90' ? 10 : 12;
    const bucketDias = periodo === 'ano' ? 30 : 7;
    const volumeSemanal: SemanaVolume[] = Array.from({ length: numBuckets }, (_, i) => {
      const inicioBucket = new Date();
      inicioBucket.setDate(inicioBucket.getDate() - (numBuckets - i) * bucketDias);
      const fimBucket = new Date();
      fimBucket.setDate(fimBucket.getDate() - (numBuckets - i - 1) * bucketDias);

      const kg = linhas
        .filter(l => {
          const data = new Date(l.confirmado_em ?? l.criado_em);
          return data >= inicioBucket && data < fimBucket;
        })
        .reduce((total, l) => total + Number(l.peso_recebido_kg ?? 0), 0);

      return { label: `${i + 1}`, kg, destaque: i === numBuckets - 1 };
    });

    this._dataset.set({
      chartSubtitulo: SUBTITULO_POR_PERIODO[periodo],
      comparativo: 'comparação com o período anterior ainda não disponível',
      volumeSemanal,
      bairrosQueMaisEnviam,
      porTipoMaterial,
      materialRecebido: `${totalRecebidoKg.toLocaleString('pt-BR')} kg`,
      coletasConcluidas: linhas.length,
      receitaRecebida,
      rejeitoTriagem: totalRecebidoKg > 0 ? Math.round((totalRejeitoKg / totalRecebidoKg) * 100) : 0,
    });
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
    const dataset = this._dataset();
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
