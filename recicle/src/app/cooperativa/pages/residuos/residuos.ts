import { Component, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';

interface TipoResiduo {
  id: string;
  nome: string;
  detalhe: string;
  ligado: boolean;
  bloqueado?: boolean;
}

interface PedidoRecusado {
  tipo: string;
  pedidos: number;
}

const PEDIDOS_RECUSADOS: PedidoRecusado[] = [];

@Component({
  selector: 'app-residuos',
  imports: [],
  templateUrl: './residuos.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './residuos.css'],
})
export class Residuos {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  readonly reciclaveis = signal<TipoResiduo[]>([]);
  readonly volumosos = signal<TipoResiduo[]>([]);
  readonly perigosos = signal<TipoResiduo[]>([]);
  readonly pedidosRecusados = PEDIDOS_RECUSADOS;

  readonly pesoMaximo = signal(0);
  readonly coletasPorDia = signal(0);
  readonly volumeMaximo = signal(0);

  private baseline = {
    reciclaveis: [] as TipoResiduo[],
    volumosos: [] as TipoResiduo[],
    pesoMaximo: 0,
    coletasPorDia: 0,
    volumeMaximo: 0,
  };

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    this.pesoMaximo.set(cooperativa.pesoMaximoKg);
    this.coletasPorDia.set(cooperativa.coletasPorDia);
    this.volumeMaximo.set(cooperativa.volumeMaximoM3);

    const { data: tipos } = await this.client
      .from('tipos_residuo')
      .select('id, nome, categoria, exige_licenca_especifica')
      .order('ordem');

    const { data: ligados } = await this.client
      .from('cooperativa_tipos_residuo')
      .select('tipo_residuo_id, ligado')
      .eq('cooperativa_id', cooperativa.id);

    const ligadoPorId = new Map((ligados ?? []).map((l: any) => [l.tipo_residuo_id, l.ligado]));

    const paraItem = (t: any): TipoResiduo => ({
      id: t.id,
      nome: t.nome,
      detalhe: t.exige_licenca_especifica ? 'liberado quando a licença for validada' : '',
      ligado: ligadoPorId.get(t.id) ?? false,
      bloqueado: t.exige_licenca_especifica,
    });

    const todos = (tipos ?? []).map(paraItem);
    this.reciclaveis.set(todos.filter((_, i) => (tipos ?? [])[i].categoria === 'reciclavel_seco'));
    this.volumosos.set(todos.filter((_, i) => (tipos ?? [])[i].categoria === 'volumoso'));
    this.perigosos.set(todos.filter((_, i) => (tipos ?? [])[i].categoria === 'perigoso'));

    this.baseline = {
      reciclaveis: this.reciclaveis(),
      volumosos: this.volumosos(),
      pesoMaximo: this.pesoMaximo(),
      coletasPorDia: this.coletasPorDia(),
      volumeMaximo: this.volumeMaximo(),
    };
  }

  atualizarPesoMaximo(valor: string): void {
    const numero = Number(valor.replace(/[^0-9.]/g, ''));
    this.pesoMaximo.set(numero || 0);
  }

  alternarReciclavel(index: number): void {
    this.reciclaveis.update(lista => lista.map((item, i) => (i === index ? { ...item, ligado: !item.ligado } : item)));
  }

  alternarVolumoso(index: number): void {
    this.volumosos.update(lista => lista.map((item, i) => (i === index ? { ...item, ligado: !item.ligado } : item)));
  }

  descartar(): void {
    this.reciclaveis.set(this.baseline.reciclaveis);
    this.volumosos.set(this.baseline.volumosos);
    this.pesoMaximo.set(this.baseline.pesoMaximo);
    this.coletasPorDia.set(this.baseline.coletasPorDia);
    this.volumeMaximo.set(this.baseline.volumeMaximo);
  }

  async salvarAlteracoes(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const itens = [...this.reciclaveis(), ...this.volumosos()];
    await this.client.from('cooperativa_tipos_residuo').upsert(
      itens.map(item => ({
        cooperativa_id: cooperativa.id,
        tipo_residuo_id: item.id,
        ligado: item.ligado,
      })),
      { onConflict: 'cooperativa_id,tipo_residuo_id' }
    );

    await this.cooperativaService.atualizar({
      peso_maximo_kg: this.pesoMaximo(),
      coletas_por_dia: this.coletasPorDia(),
      volume_maximo_m3: this.volumeMaximo(),
    });

    this.baseline = {
      reciclaveis: this.reciclaveis(),
      volumosos: this.volumosos(),
      pesoMaximo: this.pesoMaximo(),
      coletasPorDia: this.coletasPorDia(),
      volumeMaximo: this.volumeMaximo(),
    };
    this.toast.mostrar('Alterações salvas.');
  }
}
