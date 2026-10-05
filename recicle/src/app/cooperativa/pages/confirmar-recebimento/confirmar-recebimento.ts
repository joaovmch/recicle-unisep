import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DadosColeta, Solicitacao, SolicitacaoStatus, SolicitacoesStore, TriagemItem } from '../../data/solicitacoes.store';
import { CooperativaService } from '../../data/cooperativa.service';
import { SupabaseService } from '../../../supabase.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { MembroSelecionavel } from '../../shared/equipe-basico';

const PONTOS_POR_KG = 4.2;

const MOTIVOS_PROBLEMA = [
  'Endereço não encontrado ou morador ausente',
  'Material divergente do combinado',
  'Risco de segurança no local',
  'Outro',
];

@Component({
  selector: 'app-confirmar-recebimento',
  imports: [RouterLink],
  templateUrl: './confirmar-recebimento.html',
  styleUrls: ['../../../shared/ui/design-system.css', './confirmar-recebimento.css'],
})
export class ConfirmarRecebimento {
  private readonly store = inject(SolicitacoesStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly client = inject(SupabaseService).client;

  readonly motivosProblema = MOTIVOS_PROBLEMA;

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly solicitacao = signal<Solicitacao | undefined>(undefined);
  readonly carregando = signal(true);

  readonly codigoDigitado = signal<string[]>(['', '', '', '']);
  readonly codigoCompleto = computed(() => this.codigoDigitado().join(''));
  /** Só confere o formato aqui — se o código bate quem decide é o banco, ao confirmar. */
  readonly codigoPreenchido = computed(() => /^[A-Z0-9]{4}$/.test(this.codigoCompleto()));

  readonly pesoRecebido = signal(0);
  readonly rejeitoKg = signal(0);
  readonly triagem = signal<TriagemItem[]>([]);

  readonly equipeDisponivel = signal<MembroSelecionavel[]>([]);
  readonly coletorId = signal<string | null>(null);
  readonly valorRecebidoConfirmado = signal(false);

  readonly pesoEstimado = computed(() => this.solicitacao()?.pesoEstimadoKg ?? 0);

  readonly podeConfirmar = computed(() => this.solicitacao()?.status === 'aceita');

  private readonly STATUS_LABEL: Record<SolicitacaoStatus, string> = {
    pendente: 'Pendente',
    aceita: 'Em rota',
    concluida: 'Concluída',
    recusada: 'Recusada',
    cancelada: 'Cancelada pelo morador',
  };

  rotuloStatus(status: SolicitacaoStatus): string {
    return this.STATUS_LABEL[status];
  }

  readonly divergenciaKg = computed(() => +(this.pesoEstimado() - this.pesoRecebido()).toFixed(1));

  readonly pontosCreditados = computed(() =>
    Math.max(0, Math.round((this.pesoRecebido() - this.rejeitoKg()) * PONTOS_POR_KG))
  );

  readonly problemaAberto = signal(false);
  readonly motivoProblema = signal(MOTIVOS_PROBLEMA[0]);
  readonly descricaoProblema = signal('');

  readonly fotoSelecionada = signal(false);

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const solicitacao = await this.store.buscarPorId(this.id);
    this.solicitacao.set(solicitacao);

    const dadosIniciais = solicitacao?.dadosColeta;
    this.pesoRecebido.set(dadosIniciais?.pesoRecebidoKg ?? solicitacao?.pesoEstimadoKg ?? 0);
    this.rejeitoKg.set(dadosIniciais?.rejeitoKg ?? 0);
    this.triagem.set(
      dadosIniciais?.triagem?.length
        ? dadosIniciais.triagem
        : [{ material: 'Material triado', kg: solicitacao?.pesoEstimadoKg ?? 0, checado: true }]
    );

    const cooperativa = this.cooperativaService.cooperativa();
    if (cooperativa) {
      const { data } = await this.client.from('equipe').select('id, nome').eq('cooperativa_id', cooperativa.id).order('nome');
      this.equipeDisponivel.set((data ?? []).map((m: any) => ({ id: m.id, nome: m.nome })));
    }
    this.coletorId.set(solicitacao?.atribuidoEquipeId ?? this.equipeDisponivel()[0]?.id ?? null);

    this.carregando.set(false);
  }

  formatarDivergencia(): string {
    const abs = Math.abs(this.divergenciaKg());
    return abs.toFixed(1).replace('.', ',');
  }

  atualizarDigito(index: number, valor: string, proximo: HTMLInputElement | null): void {
    const caractere = valor.slice(-1).toUpperCase();
    this.codigoDigitado.update(arr => {
      const copia = [...arr];
      copia[index] = caractere;
      return copia;
    });
    if (caractere && proximo) proximo.focus();
  }

  atualizarPesoRecebido(valor: string): void {
    this.pesoRecebido.set(Number(valor) || 0);
  }

  atualizarRejeito(valor: string): void {
    this.rejeitoKg.set(Number(valor) || 0);
  }

  alternarTriagem(index: number): void {
    this.triagem.update(itens =>
      itens.map((item, i) => (i === index ? { ...item, checado: !item.checado } : item))
    );
  }

  atualizarTriagemKg(index: number, valor: string): void {
    const kg = Number(valor) || 0;
    this.triagem.update(itens => itens.map((item, i) => (i === index ? { ...item, kg } : item)));
  }

  async confirmar(): Promise<void> {
    if (!this.codigoPreenchido() || !this.podeConfirmar() || !this.valorRecebidoConfirmado()) return;

    const dados: DadosColeta = {
      pesoRecebidoKg: this.pesoRecebido(),
      rejeitoKg: this.rejeitoKg(),
      triagem: this.triagem(),
    };

    const { erro } = await this.store.confirmarRecebimento(this.id, dados, this.coletorId(), this.codigoCompleto());
    if (erro) {
      this.toast.mostrar(erro);
      return;
    }
    this.toast.mostrar('Recebimento confirmado e pontos creditados.');
    this.router.navigate(['/cooperativa/solicitacoes']);
  }

  abrirProblema(): void {
    this.motivoProblema.set(MOTIVOS_PROBLEMA[0]);
    this.descricaoProblema.set('');
    this.problemaAberto.set(true);
  }

  fecharProblema(): void {
    this.problemaAberto.set(false);
  }

  async enviarProblema(): Promise<void> {
    const { erro } = await this.store.registrarProblema(this.id, this.motivoProblema(), this.descricaoProblema());
    if (erro) {
      this.toast.mostrar(erro);
      return;
    }
    this.fecharProblema();
    this.toast.mostrar('Problema registrado. Nossa equipe vai revisar.');
    this.router.navigate(['/cooperativa/solicitacoes']);
  }

  selecionarFoto(): void {
    this.fotoSelecionada.set(true);
  }

  async confirmarPorFoto(): Promise<void> {
    if (!this.fotoSelecionada() || !this.podeConfirmar()) return;

    const dados: DadosColeta = {
      pesoRecebidoKg: this.pesoRecebido(),
      rejeitoKg: this.rejeitoKg(),
      triagem: this.triagem(),
      viaFoto: true,
    };

    const { erro } = await this.store.confirmarRecebimento(this.id, dados, this.coletorId(), null);
    if (erro) {
      this.toast.mostrar(erro);
      return;
    }
    this.toast.mostrar('Enviado por foto. A coleta fica marcada para conferência.');
    this.router.navigate(['/cooperativa/solicitacoes']);
  }
}
