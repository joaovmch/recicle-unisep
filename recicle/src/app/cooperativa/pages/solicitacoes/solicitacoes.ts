import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastService } from '../../../shared/ui/toast.service';
import { Solicitacao, SolicitacoesStore } from '../../data/solicitacoes.store';
import { CooperativaService } from '../../data/cooperativa.service';
import { SupabaseService } from '../../../supabase.service';
import { formatarPreco, hojeISO } from '../../../shared/util/format';
import { MembroSelecionavel } from '../../shared/equipe-basico';

type Aba = 'pendente' | 'aceita' | 'concluida' | 'recusada';

/** Etiqueta ao lado do título do card — o alerta vermelho ganha da espera na fila. */
interface Etiqueta {
  texto: string;
  tom: 'alerta' | 'espera' | 'neutro';
}

/** Quarta coluna da faixa cinza: muda conforme o que há de mais relevante no pedido. */
interface Destaque {
  rotulo: string;
  valor: string;
  tom: 'normal' | 'atencao' | 'alerta';
}

interface MotivoRecusa {
  valor: string;
  label: string;
  ajuda: (pesoMaximoKg: number) => string;
}

interface VeiculoSelecionavel {
  id: string;
  nome: string;
  identificacao: string;
  capacidadeKg: number;
}

interface DiaDaAgenda {
  iso: string;
  rotulo: string;
  usadas: number;
  total: number;
  lotado: boolean;
}

const PERIODOS = ['manhã', 'tarde', 'dia todo'];

/** Acima disso a retirada não é de uma pessoa só — vira aviso no card. */
const PESO_DUAS_PESSOAS_KG = 40;

/** A partir daqui a espera na fila fica em destaque (laranja). */
const HORAS_ESPERA_DESTAQUE = 8;

const MOTIVOS_RECUSA: MotivoRecusa[] = [
  {
    valor: 'tipo',
    label: 'Não recebemos esse tipo de resíduo',
    ajuda: () => 'Reveja os tipos de resíduo aceitos no seu cadastro',
  },
  {
    valor: 'capacidade',
    label: 'Peso ou volume acima do veículo',
    ajuda: pesoMaximoKg =>
      pesoMaximoKg > 0
        ? `Sua capacidade máxima é ${pesoMaximoKg} kg por coleta`
        : 'Defina a capacidade máxima em Tipos de resíduo',
  },
  {
    valor: 'agenda',
    label: 'Sem vaga na data pedida',
    ajuda: () => 'Dá para sugerir outra data em vez de recusar',
  },
  {
    valor: 'area',
    label: 'Endereço fora da área de coleta',
    ajuda: () => 'Ajuste o raio se isso estiver acontecendo sempre',
  },
];

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function horasDesde(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
}

@Component({
  selector: 'app-solicitacoes',
  imports: [RouterLink],
  templateUrl: './solicitacoes.html',
  styleUrls: ['../../../shared/ui/design-system.css', './solicitacoes.css'],
})
export class Solicitacoes {
  private readonly store = inject(SolicitacoesStore);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly client = inject(SupabaseService).client;

  readonly cooperativa = this.cooperativaService.cooperativa;
  readonly motivos = MOTIVOS_RECUSA;
  readonly periodos = PERIODOS;
  readonly abaAtiva = signal<Aba>('pendente');

  readonly pendentes = this.store.pendentes;
  readonly aceitas = this.store.aceitas;
  readonly concluidas = this.store.concluidas;
  readonly recusadas = this.store.recusadas;

  readonly residuosAtivos = signal<string[]>([]);

  readonly listaAtiva = computed<Solicitacao[]>(() => {
    const aba = this.abaAtiva();
    if (aba === 'pendente') return this.pendentes();
    if (aba === 'aceita') return this.aceitas();
    if (aba === 'concluida') return this.concluidas();
    return this.recusadas();
  });

  readonly formatarPreco = formatarPreco;

  constructor() {
    this.carregarTudo();
  }

  private async carregarTudo(): Promise<void> {
    await this.store.carregar();
    await Promise.all([this.carregarEquipeEVeiculos(), this.carregarResiduosAtivos()]);
    this.aplicarAcaoDaUrl();
  }

  /** A Visão geral manda "aceitar"/"recusar" por query param — aqui o modal certo já abre. */
  private aplicarAcaoDaUrl(): void {
    const { acao, id } = this.rota.snapshot.queryParams;
    if (!acao || !id) return;

    const solicitacao = this.pendentes().find(s => s.id === id);
    if (solicitacao) {
      if (acao === 'aceitar') this.abrirAceite(solicitacao);
      if (acao === 'recusar') this.abrirRecusa(solicitacao);
    }
    this.router.navigate([], { relativeTo: this.rota, queryParams: {}, replaceUrl: true });
  }

  private async carregarResiduosAtivos(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const { data } = await this.client
      .from('cooperativa_tipos_residuo')
      .select('tipos_residuo(nome)')
      .eq('cooperativa_id', cooperativa.id)
      .eq('ligado', true);

    this.residuosAtivos.set(
      (data ?? []).map((r: any) => r.tipos_residuo?.nome).filter((nome: unknown): nome is string => !!nome)
    );
  }

  setAba(aba: Aba): void {
    this.abaAtiva.set(aba);
  }

  // ===== Leitura do pedido =====

  /**
   * Um pedido está fora do escopo quando a categoria não bate com nenhum tipo ligado
   * no cadastro, ou quando o peso passa da capacidade máxima declarada.
   */
  motivoForaDoEscopo(s: Solicitacao): string | null {
    const pesoMaximoKg = this.cooperativa()?.pesoMaximoKg ?? 0;
    if (pesoMaximoKg > 0 && s.pesoEstimadoKg > pesoMaximoKg) return 'acima da capacidade do veículo';

    const ativos = this.residuosAtivos();
    if (ativos.length === 0) return null;

    const categoria = s.categoria.toLowerCase();
    const aceita = ativos.some(nome => {
      const tipo = nome.toLowerCase();
      return categoria.includes(tipo) || tipo.includes(categoria);
    });
    return aceita ? null : 'tipo desligado no cadastro';
  }

  etiquetaDe(s: Solicitacao): Etiqueta | null {
    if (s.status !== 'pendente') return null;
    if (this.motivoForaDoEscopo(s)) return { texto: 'fora do que vocês aceitam', tom: 'alerta' };

    const horas = horasDesde(s.criadoEm);
    if (horas < 1) return { texto: 'chegou agora', tom: 'neutro' };
    return {
      texto: `há ${horas}h na fila`,
      tom: horas >= HORAS_ESPERA_DESTAQUE ? 'espera' : 'neutro',
    };
  }

  /** Quantas coletas já concluídas esse mesmo solicitante teve com a cooperativa. */
  private coletasAnteriores(s: Solicitacao): number {
    return this.concluidas().filter(c => c.solicitante === s.solicitante).length;
  }

  destaqueDe(s: Solicitacao): Destaque {
    if (s.status === 'aceita') {
      // O código fica só com o morador — é ele que prova a entrega na confirmação.
      return { rotulo: 'Agendada', valor: s.janelaConfirmada || s.dataAgendada || '—', tom: 'normal' };
    }
    if (s.status === 'concluida') {
      const kg = s.dadosColeta?.pesoRecebidoKg ?? 0;
      return { rotulo: 'Recebido', valor: `${kg.toLocaleString('pt-BR')} kg`, tom: 'normal' };
    }
    if (s.status === 'recusada') {
      return { rotulo: 'Motivo', valor: s.motivoRecusa || '—', tom: 'alerta' };
    }

    const foraDoEscopo = this.motivoForaDoEscopo(s);
    if (foraDoEscopo) return { rotulo: 'Motivo do alerta', valor: foraDoEscopo, tom: 'alerta' };

    if (s.pesoEstimadoKg >= PESO_DUAS_PESSOAS_KG) {
      return { rotulo: 'Atenção', valor: 'precisa de 2 pessoas', tom: 'atencao' };
    }

    const anteriores = this.coletasAnteriores(s);
    if (anteriores > 0) {
      return { rotulo: 'Histórico', valor: `${anteriores + 1}ª coleta no local`, tom: 'normal' };
    }

    return { rotulo: 'Na fila desde', valor: this.formatarQuando(s.criadoEm), tom: 'normal' };
  }

  rotuloJanela(s: Solicitacao): string {
    if (s.status === 'aceita') return 'Janela confirmada';
    if (s.status === 'concluida') return 'Concluída em';
    return 'Janela pedida';
  }

  valorJanela(s: Solicitacao): string {
    if (s.status === 'aceita') return s.janelaConfirmada || s.janela || '—';
    if (s.status === 'concluida') return s.confirmadoEm ? this.formatarQuando(s.confirmadoEm) : '—';
    return s.janela || '—';
  }

  formatarQuando(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatarDistancia(km: number): string {
    return `${km.toFixed(1).replace('.', ',')} km`;
  }

  // ===== Equipe e veículos (para o modal de aceite) =====

  readonly equipeDisponivel = signal<MembroSelecionavel[]>([]);
  readonly veiculosDisponiveis = signal<VeiculoSelecionavel[]>([]);

  private async carregarEquipeEVeiculos(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const [{ data: equipe }, { data: veiculos }] = await Promise.all([
      this.client.from('equipe').select('id, nome').eq('cooperativa_id', cooperativa.id).order('nome'),
      this.client
        .from('veiculos')
        .select('id, nome, identificacao, capacidade_kg')
        .eq('cooperativa_id', cooperativa.id)
        .order('nome'),
    ]);

    this.equipeDisponivel.set((equipe ?? []).map((m: any) => ({ id: m.id, nome: m.nome })));
    this.veiculosDisponiveis.set(
      (veiculos ?? []).map((v: any) => ({
        id: v.id,
        nome: v.nome,
        identificacao: v.identificacao || 'sem placa',
        capacidadeKg: Number(v.capacidade_kg),
      }))
    );
  }

  // ===== Aceitar coleta =====

  readonly solicitacaoParaAceitar = signal<Solicitacao | null>(null);
  readonly dataAgendadaAceite = signal('');
  readonly hoje = hojeISO();
  readonly janelaConfirmadaAceite = signal(PERIODOS[0]);
  readonly equipeIdAceite = signal<string | null>(null);
  readonly veiculoIdAceite = signal<string | null>(null);
  readonly escolhendoOutraData = signal(false);

  /** Próximos dias com a ocupação real da agenda, para escolher sem sair do modal. */
  readonly diasDaAgenda = computed<DiaDaAgenda[]>(() => {
    const total = this.cooperativa()?.coletasPorDia ?? 0;
    const aceitas = this.aceitas();
    const hoje = new Date();

    return Array.from({ length: 5 }, (_, i) => {
      const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
      const iso = paraISO(data);
      const usadas = aceitas.filter(s => s.dataAgendada === iso).length;
      return {
        iso,
        rotulo: data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        usadas,
        total,
        lotado: total > 0 && usadas >= total,
      };
    });
  });

  readonly diaSelecionado = computed(() => this.diasDaAgenda().find(d => d.iso === this.dataAgendadaAceite()) ?? null);

  readonly resumoDoAceite = computed(() => {
    const s = this.solicitacaoParaAceitar();
    if (!s) return '';

    const dia = this.diaSelecionado();
    const primeiroNome = s.solicitante.split(' ')[0];
    const agenda = dia && dia.total > 0 ? `A agenda de ${dia.rotulo} passa de ${dia.usadas} para ${dia.usadas + 1} de ${dia.total} vagas. ` : '';
    return `${agenda}${primeiroNome} recebe um código de retirada na hora — a coleta só fecha quando o coletor digitar esse código no recebimento e pesar o material.`;
  });

  abrirAceite(solicitacao: Solicitacao): void {
    const primeiroLivre = this.diasDaAgenda().find(d => !d.lotado) ?? this.diasDaAgenda()[0];
    this.dataAgendadaAceite.set(primeiroLivre?.iso ?? paraISO(new Date()));
    this.janelaConfirmadaAceite.set(PERIODOS[0]);
    this.escolhendoOutraData.set(false);
    this.equipeIdAceite.set(this.equipeDisponivel()[0]?.id ?? null);
    this.veiculoIdAceite.set(this.veiculosDisponiveis()[0]?.id ?? null);
    this.solicitacaoParaAceitar.set(solicitacao);
  }

  fecharAceite(): void {
    this.solicitacaoParaAceitar.set(null);
  }

  selecionarDia(dia: DiaDaAgenda): void {
    this.dataAgendadaAceite.set(dia.iso);
    this.escolhendoOutraData.set(false);
  }

  abrirOutraData(): void {
    this.escolhendoOutraData.set(true);
  }

  async confirmarAceite(): Promise<void> {
    const solicitacao = this.solicitacaoParaAceitar();
    if (!solicitacao || !this.dataAgendadaAceite() || !this.janelaConfirmadaAceite().trim()) return;
    if (this.dataAgendadaAceite() < hojeISO()) {
      this.toast.mostrar('Escolha uma data a partir de hoje.');
      return;
    }

    const { erro } = await this.store.aceitar(solicitacao.id, {
      dataAgendada: this.dataAgendadaAceite(),
      janelaConfirmada: this.janelaConfirmadaAceite().trim(),
      equipeId: this.equipeIdAceite(),
      veiculoId: this.veiculoIdAceite(),
    });

    this.fecharAceite();
    if (erro) {
      this.toast.mostrar(erro);
      return;
    }
    this.router.navigate(['/cooperativa/solicitacoes', solicitacao.id, 'aceita']);
  }

  async desfazerAceite(solicitacao: Solicitacao): Promise<void> {
    const { erro } = await this.store.desfazerAceite(solicitacao.id);
    if (erro) {
      this.toast.mostrar(erro);
      return;
    }
    this.abaAtiva.set('pendente');
    this.toast.mostrar(`Aceite da coleta #${solicitacao.numero} desfeito — voltou para pendentes.`);
  }

  irParaConfirmacao(solicitacao: Solicitacao): void {
    this.router.navigate(['/cooperativa/solicitacoes', solicitacao.id, 'confirmar']);
  }

  // ===== Recusar coleta =====

  readonly solicitacaoParaRecusar = signal<Solicitacao | null>(null);
  readonly motivoSelecionado = signal(MOTIVOS_RECUSA[0].valor);
  readonly observacaoRecusa = signal('');

  abrirRecusa(solicitacao: Solicitacao): void {
    this.solicitacaoParaRecusar.set(solicitacao);
    this.motivoSelecionado.set(this.motivoSugerido(solicitacao));
    this.observacaoRecusa.set('');
  }

  /** Quando o alerta já diz o porquê, o motivo correspondente vem marcado. */
  private motivoSugerido(s: Solicitacao): string {
    const motivo = this.motivoForaDoEscopo(s);
    if (motivo === 'acima da capacidade do veículo') return 'capacidade';
    if (motivo === 'tipo desligado no cadastro') return 'tipo';
    return MOTIVOS_RECUSA[0].valor;
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

  ajudaMotivo(motivo: MotivoRecusa): string {
    return motivo.ajuda(this.cooperativa()?.pesoMaximoKg ?? 0);
  }

  async confirmarRecusa(): Promise<void> {
    const solicitacao = this.solicitacaoParaRecusar();
    if (!solicitacao) return;

    const motivo = this.motivos.find(m => m.valor === this.motivoSelecionado());
    const { erro } = await this.store.recusar(solicitacao.id, motivo?.label ?? '', this.observacaoRecusa());
    this.fecharRecusa();
    if (erro) {
      this.toast.mostrar(erro);
      return;
    }
    if (solicitacao.cooperativaId === null) {
      this.toast.mostrar(`Pedido #${solicitacao.numero} dispensado — continua disponível para outras cooperativas.`);
      return;
    }
    this.abaAtiva.set('recusada');
    this.toast.mostrar(`Coleta #${solicitacao.numero} recusada.`);
  }
}
