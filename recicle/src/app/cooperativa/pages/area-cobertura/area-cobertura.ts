import { Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/toast.service';
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

const FORA_DO_RAIO: ForaDoRaio[] = [];

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
  styleUrls: ['../../shared/cooperativa-shared.css', './area-cobertura.css'],
})
export class AreaCobertura {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  readonly foraDoRaio = FORA_DO_RAIO;
  readonly bairros = signal<Bairro[]>([]);
  readonly raio = signal(2);

  private baseline = { bairros: [] as Bairro[], raio: 2 };

  readonly bairrosNoRaio = computed(() => this.bairros().filter(b => b.atendido).length);
  readonly raioPx = computed(() => Math.round(this.raio() * 22));

  readonly todosMarcados = computed(() => this.bairros().length > 0 && this.bairros().every(b => b.atendido));

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    this.raio.set(cooperativa.raioKm);

    const { data } = await this.client
      .from('bairros_atendidos')
      .select('*')
      .eq('cooperativa_id', cooperativa.id)
      .order('nome');

    this.bairros.set((data ?? []).map(paraBairro));
    this.baseline = { bairros: this.bairros(), raio: this.raio() };
  }

  atualizarRaio(valor: string): void {
    this.raio.set(Number(valor) || 0);
  }

  alternarBairro(index: number): void {
    this.bairros.update(lista => lista.map((b, i) => (i === index ? { ...b, atendido: !b.atendido } : b)));
  }

  alternarTodos(): void {
    const novoValor = !this.todosMarcados();
    this.bairros.update(lista => lista.map(b => ({ ...b, atendido: novoValor })));
  }

  descartar(): void {
    this.bairros.set(this.baseline.bairros);
    this.raio.set(this.baseline.raio);
  }

  async salvarAlteracoes(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    if (this.bairros().length > 0) {
      await this.client.from('bairros_atendidos').upsert(
        this.bairros().map(b => ({
          id: b.id,
          cooperativa_id: cooperativa.id,
          nome: b.nome,
          distancia_km: b.distanciaKm,
          atendido: b.atendido,
        }))
      );
    }

    await this.cooperativaService.atualizar({ raio_km: this.raio() });

    this.baseline = { bairros: this.bairros(), raio: this.raio() };
    this.toast.mostrar('Alterações salvas.');
  }
}
