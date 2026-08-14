import { Component, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/toast.service';

interface TipoResiduo {
  nome: string;
  detalhe: string;
  ligado: boolean;
  bloqueado?: boolean;
}

interface PedidoRecusado {
  tipo: string;
  pedidos: number;
}

const RECICLAVEIS_INICIAL: TipoResiduo[] = [
  { nome: 'Papel e papelão', detalhe: '', ligado: false },
  { nome: 'Plástico', detalhe: '', ligado: false },
  { nome: 'Metal', detalhe: '', ligado: false },
  { nome: 'Vidro', detalhe: '', ligado: false },
  { nome: 'Óleo de cozinha', detalhe: '', ligado: false },
  { nome: 'Têxteis', detalhe: '', ligado: false },
];

const VOLUMOSOS_INICIAL: TipoResiduo[] = [
  { nome: 'Madeira', detalhe: '', ligado: false },
  { nome: 'Móveis e estofados', detalhe: '', ligado: false },
  { nome: 'Entulho classe A', detalhe: '', ligado: false },
];

const PERIGOSOS: TipoResiduo[] = [
  { nome: 'Pilhas e baterias', detalhe: 'liberado quando a licença for validada', ligado: false, bloqueado: true },
  { nome: 'Eletrônicos', detalhe: 'liberado quando a licença for validada', ligado: false, bloqueado: true },
  { nome: 'Lâmpadas', detalhe: 'liberado quando a licença for validada', ligado: false, bloqueado: true },
];

const PEDIDOS_RECUSADOS: PedidoRecusado[] = [];

@Component({
  selector: 'app-residuos',
  imports: [],
  templateUrl: './residuos.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './residuos.css'],
})
export class Residuos {
  private readonly toast = inject(ToastService);

  readonly reciclaveis = signal(RECICLAVEIS_INICIAL);
  readonly volumosos = signal(VOLUMOSOS_INICIAL);
  readonly perigosos = PERIGOSOS;
  readonly pedidosRecusados = PEDIDOS_RECUSADOS;

  readonly pesoMaximo = signal(0);
  readonly coletasPorDia = signal(0);
  readonly volumeMaximo = signal(0);

  private baseline = {
    reciclaveis: RECICLAVEIS_INICIAL,
    volumosos: VOLUMOSOS_INICIAL,
    pesoMaximo: 0,
    coletasPorDia: 0,
    volumeMaximo: 0,
  };

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

  salvarAlteracoes(): void {
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
