import { Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/toast.service';

interface Bairro {
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

const BAIRROS_INICIAL: Bairro[] = [];

const FORA_DO_RAIO: ForaDoRaio[] = [];

@Component({
  selector: 'app-area-cobertura',
  imports: [],
  templateUrl: './area-cobertura.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './area-cobertura.css'],
})
export class AreaCobertura {
  private readonly toast = inject(ToastService);

  readonly foraDoRaio = FORA_DO_RAIO;
  readonly bairros = signal(BAIRROS_INICIAL);
  readonly raio = signal(2);

  private baseline = { bairros: BAIRROS_INICIAL, raio: 2 };

  readonly bairrosNoRaio = computed(() => this.bairros().filter(b => b.atendido).length);
  readonly raioPx = computed(() => Math.round(this.raio() * 22));

  readonly todosMarcados = computed(() => this.bairros().length > 0 && this.bairros().every(b => b.atendido));

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

  salvarAlteracoes(): void {
    this.baseline = { bairros: this.bairros(), raio: this.raio() };
    this.toast.mostrar('Alterações salvas.');
  }
}
