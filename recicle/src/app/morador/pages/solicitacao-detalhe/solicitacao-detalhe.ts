import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Descarte, DescartesStore, STATUS_DESCARTE } from '../../data/descartes.store';
import { ToastService } from '../../../shared/ui/toast.service';
import { formatarData, formatarPreco, hojeISO } from '../../../shared/util/format';

const MOTIVOS_CANCELAMENTO = [
  { valor: 'levei', label: 'Já levei ao ecoponto', ajuda: 'Você entrega por conta própria e ainda pontua' },
  { valor: 'ninguem', label: 'Não vai ter ninguém em casa', ajuda: 'Se preferir, dá para remarcar em vez de cancelar' },
  { valor: 'guardar', label: 'Vou guardar para depois', ajuda: 'Resíduo perigoso não deve ficar guardado muito tempo' },
  { valor: 'problema', label: 'Problema com a cooperativa', ajuda: 'A equipe do Re-cicle recebe esse retorno' },
  { valor: 'outro', label: 'Outro motivo', ajuda: '' },
];


@Component({
  selector: 'app-morador-solicitacao-detalhe',
  imports: [RouterLink],
  templateUrl: './solicitacao-detalhe.html',
  styleUrls: ['../../../shared/ui/design-system.css', './solicitacao-detalhe.css'],
})
export class SolicitacaoDetalhe {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(DescartesStore);
  private readonly toast = inject(ToastService);

  readonly formatarData = formatarData;
  readonly formatarPreco = formatarPreco;
  readonly statusLabel = STATUS_DESCARTE;
  readonly motivos = MOTIVOS_CANCELAMENTO;
  readonly limiteRemarcacoes = this.store.limiteRemarcacoes;
  readonly hoje = hojeISO();

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly descarte = signal<Descarte | undefined>(undefined);
  readonly carregando = signal(true);

  readonly podeAlterar = computed(() => {
    const d = this.descarte();
    return !!d && (d.status === 'pendente' || d.status === 'aceita');
  });

  readonly remarcacoesRestantes = computed(() =>
    Math.max(0, this.limiteRemarcacoes - (this.descarte()?.remarcacoesUsadas ?? 0))
  );

  // ===== Remarcar =====
  readonly modalRemarcar = signal(false);
  readonly novaData = signal(hojeISO());
  readonly novaJanela = signal('Manhã (8h–12h)');
  readonly salvando = signal(false);

  // ===== Cancelar =====
  readonly modalCancelar = signal(false);
  readonly motivoSelecionado = signal(MOTIVOS_CANCELAMENTO[0].valor);
  readonly observacaoCancelamento = signal('');

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    this.carregando.set(true);
    this.descarte.set(await this.store.buscarPorId(this.id));
    this.carregando.set(false);
  }

  abrirRemarcar(): void {
    const d = this.descarte();
    const agendada = d?.dataAgendada;
    this.novaData.set(agendada && agendada >= hojeISO() ? agendada : hojeISO());
    this.novaJanela.set(d?.janelaConfirmada ?? 'Manhã (8h–12h)');
    this.modalRemarcar.set(true);
  }

  async confirmarRemarcacao(): Promise<void> {
    const descarte = this.descarte();
    if (this.salvando() || !descarte) return;
    this.salvando.set(true);
    const { erro } = await this.store.remarcar(descarte, this.novaData(), this.novaJanela());
    this.salvando.set(false);

    if (erro) {
      this.toast.mostrar(erro);
      return;
    }

    this.modalRemarcar.set(false);
    await this.carregar();
    // Não existe notificação ativa para a cooperativa — ela vê a nova data no painel dela.
    this.toast.mostrar('Coleta remarcada. A nova data já aparece para a cooperativa.');
  }

  abrirCancelar(): void {
    this.motivoSelecionado.set(MOTIVOS_CANCELAMENTO[0].valor);
    this.observacaoCancelamento.set('');
    this.modalCancelar.set(true);
  }

  async confirmarCancelamento(): Promise<void> {
    if (this.salvando()) return;

    const motivo = this.motivos.find(m => m.valor === this.motivoSelecionado());
    const texto = [motivo?.label, this.observacaoCancelamento().trim()].filter(Boolean).join(' — ');

    this.salvando.set(true);
    const { erro } = await this.store.cancelar(this.id, texto);
    this.salvando.set(false);

    if (erro) {
      this.toast.mostrar(erro);
      return;
    }

    this.modalCancelar.set(false);
    await this.carregar();
    this.toast.mostrar('Solicitação cancelada.');
  }

  voltar(): void {
    this.router.navigate(['/solicitacoes']);
  }

  imprimirComprovante(): void {
    window.print();
  }
}
