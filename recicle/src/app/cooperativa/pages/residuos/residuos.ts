import { Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../../shared/ui/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';

type Categoria = 'reciclavel_seco' | 'volumoso' | 'perigoso' | 'organico';

/** Linha de apoio de cada tipo ligado — o que a cooperativa precisa ter para receber esse material. */
const DESCRICAO_CATEGORIA: Record<Categoria, string> = {
  reciclavel_seco: 'reciclável seco · triagem no galpão',
  volumoso: 'volumoso · precisa de espaço no veículo',
  perigoso: 'logística reversa · armazenagem própria',
  organico: 'orgânico · destino para compostagem',
};

interface TipoResiduo {
  id: string;
  nome: string;
  categoria: Categoria;
  ligado: boolean;
  bloqueado: boolean;
  recebidoMesKg: number;
  pedidos90d: number;
  recusados90d: number;
}

function inicioDoMesISO(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
}

function ha90DiasISO(): string {
  const data = new Date();
  data.setDate(data.getDate() - 90);
  return data.toISOString();
}

@Component({
  selector: 'app-residuos',
  imports: [],
  templateUrl: './residuos.html',
  styleUrls: ['../../../shared/ui/design-system.css', './residuos.css'],
})
export class Residuos {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  readonly tipos = signal<TipoResiduo[]>([]);
  readonly totalRecusados90d = signal(0);

  constructor() {
    this.carregar();
  }

  /** Tipo que mais gerou recusa em 90 dias — é o que o aviso laranja cita. */
  readonly tipoMaisRecusado = computed(() => {
    const comRecusa = this.tipos().filter(t => t.recusados90d > 0);
    if (comRecusa.length === 0) return null;
    return comRecusa.reduce((maior, t) => (t.recusados90d > maior.recusados90d ? t : maior));
  });

  readonly licencaNumero = computed(() => this.cooperativaService.cooperativa()?.licencaNumero ?? '');

  /**
   * O que aparece embaixo do nome do tipo: quando está ligado, o que ele exige;
   * quando está desligado, o motivo — é a informação que decide o liga/desliga.
   */
  descricaoDe(tipo: TipoResiduo): string {
    if (tipo.bloqueado) return 'desligado · liberado quando a licença for validada';
    if (!tipo.ligado) {
      const maisRecusado = this.tipoMaisRecusado();
      if (maisRecusado?.id === tipo.id) return 'desligado · é o tipo que vocês mais recusam';
      if (tipo.recusados90d > 0) return `desligado · ${tipo.recusados90d} pedidos recusados`;
      return 'desligado';
    }
    return DESCRICAO_CATEGORIA[tipo.categoria];
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const [{ data: tipos }, { data: ligados }, { data: pedidos90d }, { data: licencaPerigoso }] = await Promise.all([
      this.client.from('tipos_residuo').select('id, nome, categoria, exige_licenca_especifica').order('ordem'),
      this.client
        .from('cooperativa_tipos_residuo')
        .select('tipo_residuo_id, ligado')
        .eq('cooperativa_id', cooperativa.id),
      this.client
        .from('solicitacoes')
        .select('categoria, status')
        .eq('cooperativa_id', cooperativa.id)
        .gte('criado_em', ha90DiasISO()),
      this.client
        .from('documentos')
        .select('status')
        .eq('cooperativa_id', cooperativa.id)
        .eq('tipo', 'licenca_residuo_perigoso')
        .maybeSingle(),
    ]);

    const licencaPerigosoValidada = licencaPerigoso?.status === 'validado';

    const ligadoPorId = new Map((ligados ?? []).map((l: any) => [l.tipo_residuo_id, l.ligado]));

    const pedidosPorCategoria = new Map<string, number>();
    const recusadosPorCategoria = new Map<string, number>();
    for (const p of pedidos90d ?? []) {
      const chave = (p.categoria ?? '').toLowerCase();
      pedidosPorCategoria.set(chave, (pedidosPorCategoria.get(chave) ?? 0) + 1);
      if (p.status === 'recusada') {
        recusadosPorCategoria.set(chave, (recusadosPorCategoria.get(chave) ?? 0) + 1);
      }
    }
    this.totalRecusados90d.set([...recusadosPorCategoria.values()].reduce((total, n) => total + n, 0));

    const idsConcluidasMes = await this.buscarIdsConcluidasDoMes(cooperativa.id);
    const kgPorMaterial = await this.buscarKgPorMaterial(idsConcluidasMes);

    this.tipos.set(
      (tipos ?? []).map((t: any) => {
        const chave = t.nome.toLowerCase();
        return {
          id: t.id,
          nome: t.nome,
          categoria: t.categoria,
          ligado: ligadoPorId.get(t.id) ?? false,
          bloqueado: t.exige_licenca_especifica && !licencaPerigosoValidada,
          recebidoMesKg: kgPorMaterial.get(t.nome) ?? 0,
          pedidos90d: pedidosPorCategoria.get(chave) ?? 0,
          recusados90d: recusadosPorCategoria.get(chave) ?? 0,
        };
      })
    );
  }

  private async buscarIdsConcluidasDoMes(cooperativaId: string): Promise<string[]> {
    const { data } = await this.client
      .from('solicitacoes')
      .select('id')
      .eq('cooperativa_id', cooperativaId)
      .eq('status', 'concluida')
      .gte('confirmado_em', inicioDoMesISO());
    return (data ?? []).map((s: any) => s.id);
  }

  private async buscarKgPorMaterial(ids: string[]): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();
    if (ids.length === 0) return mapa;

    const { data } = await this.client.from('solicitacao_triagem').select('material, kg').in('solicitacao_id', ids);
    for (const t of data ?? []) {
      mapa.set(t.material, (mapa.get(t.material) ?? 0) + Number(t.kg));
    }
    return mapa;
  }

  alternarTipo(id: string): void {
    this.tipos.update(lista => lista.map(t => (t.id === id ? { ...t, ligado: !t.ligado } : t)));
  }

  async salvarAlteracoes(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const { error } = await this.client.from('cooperativa_tipos_residuo').upsert(
      this.tipos().map(t => ({
        cooperativa_id: cooperativa.id,
        tipo_residuo_id: t.id,
        ligado: t.ligado,
      })),
      { onConflict: 'cooperativa_id,tipo_residuo_id' }
    );
    if (error) {
      this.toast.mostrar('Não foi possível salvar as alterações. Tente novamente.');
      return;
    }

    this.toast.mostrar('Alterações salvas — valem a partir do próximo pedido que a IA enviar.');
  }
}
