import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Beneficio, PontosStore } from '../../data/pontos.store';
import { ToastService } from '../../../shared/ui/toast.service';
import { baixarCsv } from '../../../shared/util/csv';
import { formatarData } from '../../../shared/util/format';

@Component({
  selector: 'app-morador-pontos',
  imports: [RouterLink],
  templateUrl: './pontos.html',
  styleUrls: ['../../../shared/ui/design-system.css', './pontos.css'],
})
export class Pontos {
  private readonly store = inject(PontosStore);
  private readonly toast = inject(ToastService);

  readonly formatarData = formatarData;

  readonly saldo = this.store.saldo;
  readonly acumulado = this.store.acumulado;
  readonly resgatado = this.store.resgatado;
  readonly nivel = this.store.nivel;
  readonly regras = this.store.regras;
  readonly movimentos = this.store.movimentos;
  readonly beneficios = this.store.beneficios;

  readonly progressoNivel = computed(() => {
    const { atual, proximo } = this.nivel();
    if (!proximo) return 100;
    const faixa = proximo.minimo - atual.minimo;
    return faixa <= 0 ? 100 : Math.min(100, Math.round(((this.saldo() - atual.minimo) / faixa) * 100));
  });

  // ===== Resgate =====
  readonly beneficioParaResgatar = signal<Beneficio | null>(null);
  readonly resgatando = signal(false);
  readonly codigoResgate = signal<string | null>(null);

  constructor() {
    this.store.carregar();
  }

  podeResgatar(b: Beneficio): boolean {
    return b.disponivel && this.saldo() >= b.custoPontos;
  }

  abrirResgate(b: Beneficio): void {
    this.codigoResgate.set(null);
    this.beneficioParaResgatar.set(b);
  }

  fecharResgate(): void {
    this.beneficioParaResgatar.set(null);
    this.codigoResgate.set(null);
  }

  async confirmarResgate(): Promise<void> {
    const beneficio = this.beneficioParaResgatar();
    if (!beneficio || this.resgatando()) return;

    this.resgatando.set(true);
    const { erro, codigo } = await this.store.resgatar(beneficio);
    this.resgatando.set(false);

    if (erro) {
      this.toast.mostrar(erro);
      return;
    }

    this.codigoResgate.set(codigo ?? null);
    this.toast.mostrar(`${beneficio.nome} resgatado.`);
  }

  exportarHistorico(): void {
    const linhas = this.movimentos().map(m => [
      formatarData(m.criadoEm),
      m.descricao,
      m.detalhe ?? '',
      m.pontos,
    ]);
    baixarCsv('extrato-de-pontos.csv', ['Data', 'Descrição', 'Detalhe', 'Pontos'], linhas);
    this.toast.mostrar('Extrato exportado.');
  }
}
