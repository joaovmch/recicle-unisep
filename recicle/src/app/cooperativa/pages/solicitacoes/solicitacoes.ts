import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { baixarCsv } from '../../shared/csv';
import { ToastService } from '../../shared/toast.service';
import { Solicitacao, SolicitacoesStore } from '../../data/solicitacoes.store';

type Aba = 'pendente' | 'aceita' | 'concluida' | 'recusada';

interface MotivoRecusa {
  valor: string;
  label: string;
  ajuda: string;
}

interface MensagemChat {
  autor: 'morador' | 'ia';
  texto: string;
}

const ABA_LABEL: Record<Aba, string> = {
  pendente: 'pendentes',
  aceita: 'aceitas',
  concluida: 'concluidas',
  recusada: 'recusadas',
};

const MOTIVOS_RECUSA: MotivoRecusa[] = [
  {
    valor: 'tipo',
    label: 'Não recebemos esse tipo de resíduo',
    ajuda: 'Reveja os tipos de resíduo aceitos no seu cadastro',
  },
  {
    valor: 'capacidade',
    label: 'Peso ou volume acima do veículo',
    ajuda: 'Sua capacidade máxima é 800 kg por viagem',
  },
  {
    valor: 'agenda',
    label: 'Sem vaga na data pedida',
    ajuda: 'Dá para sugerir outra data em vez de recusar',
  },
  {
    valor: 'area',
    label: 'Endereço fora da área de coleta',
    ajuda: 'Ajuste o raio se isso estiver acontecendo sempre',
  },
];

@Component({
  selector: 'app-solicitacoes',
  imports: [RouterLink],
  templateUrl: './solicitacoes.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './solicitacoes.css'],
})
export class Solicitacoes {
  private readonly store = inject(SolicitacoesStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly motivos = MOTIVOS_RECUSA;
  readonly abaAtiva = signal<Aba>('pendente');

  readonly pendentes = this.store.pendentes;
  readonly aceitas = this.store.aceitas;
  readonly concluidas = this.store.concluidas;
  readonly recusadas = this.store.recusadas;

  readonly totalColetasConcluidas = computed(() => this.concluidas().length);
  readonly materialRecebidoMes = computed(
    () => `${this.concluidas().reduce((total, s) => total + (s.dadosColeta?.pesoRecebidoKg ?? 0), 0)} kg`
  );

  constructor() {
    this.store.carregar();
  }

  readonly listaAtiva = computed<Solicitacao[]>(() => {
    const aba = this.abaAtiva();
    if (aba === 'pendente') return this.pendentes();
    if (aba === 'aceita') return this.aceitas();
    if (aba === 'concluida') return this.concluidas();
    return this.recusadas();
  });

  readonly solicitacaoParaRecusar = signal<Solicitacao | null>(null);
  readonly motivoSelecionado = signal(MOTIVOS_RECUSA[0].valor);
  readonly observacaoRecusa = signal('');

  readonly conversaAberta = signal<Solicitacao | null>(null);

  setAba(aba: Aba): void {
    this.abaAtiva.set(aba);
  }

  async aceitar(solicitacao: Solicitacao): Promise<void> {
    await this.store.aceitar(solicitacao.id);
  }

  irParaConfirmacao(solicitacao: Solicitacao): void {
    this.router.navigate(['/cooperativa/solicitacoes', solicitacao.id, 'confirmar']);
  }

  abrirRecusa(solicitacao: Solicitacao): void {
    this.solicitacaoParaRecusar.set(solicitacao);
    this.motivoSelecionado.set(MOTIVOS_RECUSA[0].valor);
    this.observacaoRecusa.set('');
  }

  fecharRecusa(): void {
    this.solicitacaoParaRecusar.set(null);
  }

  selecionarMotivo(valor: string): void {
    this.motivoSelecionado.set(valor);
  }

  atualizarObservacao(valor: string): void {
    this.observacaoRecusa.set(valor);
  }

  async confirmarRecusa(): Promise<void> {
    const solicitacao = this.solicitacaoParaRecusar();
    if (!solicitacao) return;

    const motivo = this.motivos.find(m => m.valor === this.motivoSelecionado());
    await this.store.recusar(solicitacao.id, motivo?.label ?? '', this.observacaoRecusa());
    this.fecharRecusa();
  }

  formatarPreco(valor: number): string {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatarDistancia(km: number): string {
    return `${km.toFixed(1).replace('.', ',')} km`;
  }

  exportarCsv(): void {
    const linhas = this.listaAtiva().map(s => [
      s.id,
      s.titulo,
      s.categoria,
      s.pesoEstimadoKg,
      s.solicitante,
      `${s.endereco} — ${s.bairro}`,
      s.preco,
      s.status,
    ]);
    baixarCsv(
      `solicitacoes-${ABA_LABEL[this.abaAtiva()]}.csv`,
      ['ID', 'Título', 'Categoria', 'Peso estimado (kg)', 'Solicitante', 'Endereço', 'Valor (R$)', 'Status'],
      linhas
    );
    this.toast.mostrar('CSV exportado.');
  }

  abrirConversa(solicitacao: Solicitacao): void {
    this.conversaAberta.set(solicitacao);
  }

  fecharConversa(): void {
    this.conversaAberta.set(null);
  }

  conversaDe(s: Solicitacao): MensagemChat[] {
    return [
      { autor: 'morador', texto: `Tenho ${s.titulo.toLowerCase()} pra descartar, mais ou menos ${s.pesoEstimadoKg} kg.` },
      { autor: 'ia', texto: `Entendi — isso entra como "${s.categoria}". Deixa eu ver quem atende sua região.` },
      {
        autor: 'ia',
        texto: `A Cooperativa Reviver aceita esse material e fica a ${this.formatarDistancia(s.distanciaKm)}. Tem vaga em ${s.janela.toLowerCase()}.`,
      },
      { autor: 'morador', texto: 'Perfeito, pode confirmar com eles.' },
      {
        autor: 'ia',
        texto: `Prontinho. Solicitação #${s.numero} enviada para a Cooperativa Reviver, valor combinado de ${this.formatarPreco(s.preco)}.`,
      },
    ];
  }
}
