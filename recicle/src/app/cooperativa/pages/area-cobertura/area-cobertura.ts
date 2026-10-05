import { Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../../shared/ui/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';

interface Bairro {
  id: string;
  nome: string;
  distanciaKm: number;
  atendido: boolean;
  top: number;
  left: number;
}

interface ForaDoRaio {
  nome: string;
  distanciaKm: number;
  pedidos: number;
}

interface PedidosPorBairro {
  nome: string;
  pedidos: number;
}

function inicioDoMesISO(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
}

/** Mesmo texto usado como motivo de recusa em Solicitações — é assim que uma coleta fora do raio fica registrada. */
const MOTIVO_RECUSA_AREA = 'Endereço fora da área de coleta';

function ha90DiasISO(): string {
  const data = new Date();
  data.setDate(data.getDate() - 90);
  return data.toISOString();
}

function paraBairro(row: any, index: number): Bairro {
  return {
    id: row.id,
    nome: row.nome,
    distanciaKm: Number(row.distancia_km),
    atendido: row.atendido,
    top: 20 + ((index * 37) % 60),
    left: 20 + ((index * 53) % 60),
  };
}

@Component({
  selector: 'app-area-cobertura',
  imports: [],
  templateUrl: './area-cobertura.html',
  styleUrls: ['../../../shared/ui/design-system.css', './area-cobertura.css'],
})
export class AreaCobertura {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  readonly foraDoRaio = signal<ForaDoRaio[]>([]);
  readonly pedidosPorBairro = signal<PedidosPorBairro[]>([]);
  readonly bairros = signal<Bairro[]>([]);
  readonly raio = signal(2);
  readonly coletasPorPeriodo = signal(0);

  readonly mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  /** Texto do aviso laranja: quanto pedido o raio atual está deixando passar. */
  readonly avisoDistancia = computed(() => {
    const fora = this.foraDoRaio();
    if (fora.length === 0) return '';

    const total = fora.reduce((soma, b) => soma + b.pedidos, 0);
    const maior = fora[0];
    const raioSugerido = Math.ceil(maior.distanciaKm);
    return `${total} ${total === 1 ? 'pedido chegou' : 'pedidos chegaram'} de bairros fora do raio nos últimos 90 dias, a maioria de ${maior.nome} (${maior.distanciaKm.toFixed(0)} km). Ampliar para ${raioSugerido} km traria esses pedidos.`;
  });

  readonly cooperativa = this.cooperativaService.cooperativa;

  readonly bairrosNoRaio = computed(() => this.bairros().filter(b => b.atendido).length);
  readonly raioPx = computed(() => Math.round(this.raio() * 22));

  readonly enderecoGalpao = computed(() => {
    const c = this.cooperativaService.cooperativa();
    if (!c?.rua) return 'Endereço do galpão ainda não cadastrado';
    const complemento = c.numero ? `, ${c.numero}` : '';
    const bairro = c.bairro ? ` — ${c.bairro}` : '';
    return `${c.rua}${complemento}${bairro}`;
  });

  readonly todosMarcados = computed(() => this.bairros().length > 0 && this.bairros().every(b => b.atendido));

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    this.raio.set(cooperativa.raioKm);
    this.coletasPorPeriodo.set(cooperativa.coletasPorDia);

    const [{ data }, { data: recusadasPorArea }, { data: pedidosDoMes }] = await Promise.all([
      this.client.from('bairros_atendidos').select('*').eq('cooperativa_id', cooperativa.id).order('nome'),
      this.client
        .from('solicitacoes')
        .select('bairro, distancia_km')
        .eq('cooperativa_id', cooperativa.id)
        .eq('status', 'recusada')
        .eq('motivo_recusa', MOTIVO_RECUSA_AREA)
        .gte('criado_em', ha90DiasISO()),
      this.client
        .from('solicitacoes')
        .select('bairro')
        .eq('cooperativa_id', cooperativa.id)
        .gte('criado_em', inicioDoMesISO()),
    ]);

    this.bairros.set((data ?? []).map(paraBairro));

    const contagem = new Map<string, number>();
    for (const p of pedidosDoMes ?? []) {
      if (!p.bairro) continue;
      contagem.set(p.bairro, (contagem.get(p.bairro) ?? 0) + 1);
    }
    this.pedidosPorBairro.set(
      [...contagem.entries()]
        .map(([nome, pedidos]) => ({ nome, pedidos }))
        .sort((a, b) => b.pedidos - a.pedidos)
        .slice(0, 6)
    );

    const porBairro = new Map<string, { distanciaKm: number; pedidos: number }>();
    for (const r of recusadasPorArea ?? []) {
      const atual = porBairro.get(r.bairro) ?? { distanciaKm: 0, pedidos: 0 };
      porBairro.set(r.bairro, {
        distanciaKm: Math.max(atual.distanciaKm, Number(r.distancia_km ?? 0)),
        pedidos: atual.pedidos + 1,
      });
    }
    this.foraDoRaio.set(
      [...porBairro.entries()]
        .map(([nome, v]) => ({ nome, distanciaKm: v.distanciaKm, pedidos: v.pedidos }))
        .sort((a, b) => b.pedidos - a.pedidos)
    );
  }

  atualizarRaio(valor: string): void {
    this.raio.set(Math.max(1, Number(valor) || 0));
  }

  atualizarColetasPorPeriodo(valor: string): void {
    this.coletasPorPeriodo.set(Math.max(0, Math.round(Number(valor) || 0)));
  }

  alternarBairro(index: number): void {
    this.bairros.update(lista => lista.map((b, i) => (i === index ? { ...b, atendido: !b.atendido } : b)));
  }

  alternarTodos(): void {
    const novoValor = !this.todosMarcados();
    this.bairros.update(lista => lista.map(b => ({ ...b, atendido: novoValor })));
  }

  async salvarAlteracoes(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    if (this.bairros().length > 0) {
      const { error } = await this.client.from('bairros_atendidos').upsert(
        this.bairros().map(b => ({
          id: b.id,
          cooperativa_id: cooperativa.id,
          nome: b.nome,
          distancia_km: b.distanciaKm,
          atendido: b.atendido,
        }))
      );
      if (error) {
        this.toast.mostrar('Não foi possível salvar os bairros. Tente novamente.');
        return;
      }
    }

    const { erro } = await this.cooperativaService.atualizar({
      raio_km: this.raio(),
      coletas_por_dia: this.coletasPorPeriodo(),
    });
    if (erro) {
      this.toast.mostrar('Não foi possível salvar o raio de atendimento. Tente novamente.');
      return;
    }

    this.toast.mostrar('Alterações salvas.');
  }
}
