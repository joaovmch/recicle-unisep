import { Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../../shared/ui/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';

type SituacaoTipo = 'good' | 'info' | 'neutral';

interface MembroEquipe {
  id: string;
  nome: string;
  iniciais: string;
  telefone: string;
  observacao?: string;
  funcao: string;
  coletas: number | null;
  situacao: string;
  situacaoTipo: SituacaoTipo;
  podeConfirmar: boolean;
  acessoPainel: boolean;
}

interface Veiculo {
  id: string;
  nome: string;
  identificacao: string;
  situacao: string;
  situacaoTipo: SituacaoTipo;
  capacidadeKg: number;
  capacidadeM3: number;
  extraLabel: string;
  extraValor: string;
}

const FUNCOES_DISPONIVEIS = ['Motorista', 'Coletor', 'Triagem', 'Administrativo'];

/** O que cada função faz — é o card "Quem pode o quê" da lateral. */
const PAPEIS = [
  {
    nome: 'Responsável legal',
    descricao: 'Aceita e recusa pedidos, edita o cadastro, envia documentos e gerencia a equipe.',
  },
  {
    nome: 'Motorista e coletor',
    descricao: 'Vê a rota do dia e confirma o recebimento com o código do morador.',
  },
  {
    nome: 'Triagem',
    descricao: 'Registra pesagem e separação por material, sem acesso a pedidos e cadastro.',
  },
];

/** Linha de apoio de cada membro: o que ele pode fazer hoje, pelas permissões reais salvas. */
function permissoesLegiveis(membro: { acessoPainel: boolean; podeConfirmar: boolean; coletas: number | null }): string {
  const partes: string[] = [];
  if (membro.acessoPainel) partes.push('vê o painel');
  if (membro.podeConfirmar) partes.push('confirma recebimento');
  if (partes.length === 0) partes.push('sem acesso ao painel');
  if (membro.coletas) partes.push(`${membro.coletas} coletas no mês`);
  return partes.join(' · ');
}

function gerarIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

function situacaoEquipeTipo(situacao: string): SituacaoTipo {
  return situacao === 'Em coleta' ? 'info' : 'neutral';
}

function situacaoVeiculoTipo(situacao: string): SituacaoTipo {
  return situacao === 'Disponível' ? 'good' : situacao === 'Em uso' ? 'info' : 'neutral';
}

@Component({
  selector: 'app-equipe',
  imports: [],
  templateUrl: './equipe.html',
  styleUrls: ['../../../shared/ui/design-system.css', './equipe.css'],
})
export class Equipe {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  readonly equipe = signal<MembroEquipe[]>([]);
  readonly veiculos = signal<Veiculo[]>([]);
  readonly funcoesDisponiveis = FUNCOES_DISPONIVEIS;
  readonly papeis = PAPEIS;

  permissoesDe(membro: MembroEquipe): string {
    return permissoesLegiveis(membro);
  }

  /** Qualquer pessoa da equipe pode ser autorizada a confirmar recebimento, incluindo o presidente. */
  readonly coletores = this.equipe;
  readonly pessoasComAcesso = computed(() => this.equipe().filter(m => m.acessoPainel).length);
  readonly capacidadeSomada = computed(() => this.veiculos().reduce((total, v) => total + v.capacidadeKg, 0));
  /** É o maior veículo que define o teto por coleta — nada acima disso chega da IA. */
  readonly maiorVeiculoKg = computed(() => Math.max(0, ...this.veiculos().map(v => v.capacidadeKg)));

  // ===== Capacidade de operação =====
  // O teto por coleta é o maior veículo da frota — é o que as telas dizem ("nada acima
  // do maior veículo disponível"), então ele é sincronizado sozinho, sem campo manual.
  // Quantas coletas cabem por período é editado em Área de cobertura.

  readonly resumoCapacidade = computed(() => {
    const veiculos = this.veiculos().length;
    if (veiculos === 0) return 'Cadastre ao menos um veículo para a IA saber o que cabe na sua operação.';

    const nome = this.cooperativaService.cooperativa()?.nome ?? 'a cooperativa';
    const coletas = this.cooperativaService.cooperativa()?.coletasPorDia ?? 0;
    const teto = this.maiorVeiculoKg();

    const frota = veiculos === 1 ? 'Com um veículo' : `Com ${veiculos} veículos`;
    const agenda = coletas > 0 ? `, ${nome} sustenta ${coletas} coletas por período` : '';
    const limite = teto > 0 ? ` Pedidos acima de ${teto.toLocaleString('pt-BR')} kg não chegam até vocês.` : '';
    return `${frota}${agenda}.${limite}`;
  });

  /** Mantém peso_maximo_kg igual ao maior veículo sempre que a frota muda. */
  private async sincronizarTetoDaFrota(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    const teto = this.maiorVeiculoKg();
    if (!cooperativa || teto === cooperativa.pesoMaximoKg) return;
    await this.cooperativaService.atualizar({ peso_maximo_kg: teto });
  }

  /** Tira a pessoa da equipe. Coletas já confirmadas por ela continuam registradas. */
  async removerPessoa(membro: MembroEquipe): Promise<void> {
    if (!window.confirm(`Tirar ${membro.nome} da equipe?`)) return;
    const { error } = await this.client.from('equipe').delete().eq('id', membro.id);
    if (error) {
      this.toast.mostrar(`Não foi possível remover ${membro.nome}.`);
      return;
    }
    this.equipe.update(lista => lista.filter(m => m.id !== membro.id));
    this.toast.mostrar(`${membro.nome} saiu da equipe.`);
  }
  /** Só quem confirmou pelo menos uma coleta nos últimos 30 dias — combinado com o subtítulo do card. */
  readonly coletasPorPessoa = signal<{ nome: string; coletas: number }[]>([]);

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const ha30Dias = new Date();
    ha30Dias.setDate(ha30Dias.getDate() - 30);

    const [{ data: equipeRows }, { data: veiculoRows }, { data: solicitacoesConcluidas }, { data: concluidas30d }] =
      await Promise.all([
        this.client.from('equipe').select('*').eq('cooperativa_id', cooperativa.id).order('criado_em'),
        this.client.from('veiculos').select('*').eq('cooperativa_id', cooperativa.id).order('criado_em'),
        this.client
          .from('solicitacoes')
          .select('confirmado_por')
          .eq('cooperativa_id', cooperativa.id)
          .eq('status', 'concluida'),
        this.client
          .from('solicitacoes')
          .select('confirmado_por')
          .eq('cooperativa_id', cooperativa.id)
          .eq('status', 'concluida')
          .gte('confirmado_em', ha30Dias.toISOString()),
      ]);

    const coletasPorMembro = new Map<string, number>();
    for (const s of solicitacoesConcluidas ?? []) {
      if (!s.confirmado_por) continue;
      coletasPorMembro.set(s.confirmado_por, (coletasPorMembro.get(s.confirmado_por) ?? 0) + 1);
    }

    const coletasPorMembro30d = new Map<string, number>();
    for (const s of concluidas30d ?? []) {
      if (!s.confirmado_por) continue;
      coletasPorMembro30d.set(s.confirmado_por, (coletasPorMembro30d.get(s.confirmado_por) ?? 0) + 1);
    }
    this.coletasPorPessoa.set(
      (equipeRows ?? [])
        .map((m: any) => ({ nome: m.nome as string, coletas: coletasPorMembro30d.get(m.id) ?? 0 }))
        .filter(item => item.coletas > 0)
        .sort((a, b) => b.coletas - a.coletas)
    );

    this.equipe.set(
      (equipeRows ?? []).map((m: any) => ({
        id: m.id,
        nome: m.nome,
        iniciais: gerarIniciais(m.nome),
        telefone: m.telefone || '—',
        observacao: m.observacao ?? undefined,
        funcao: m.funcao,
        coletas: coletasPorMembro.get(m.id) ?? null,
        situacao: m.situacao,
        situacaoTipo: situacaoEquipeTipo(m.situacao),
        podeConfirmar: m.pode_confirmar,
        acessoPainel: m.acesso_painel,
      }))
    );

    this.veiculos.set(
      (veiculoRows ?? []).map((v: any) => ({
        id: v.id,
        nome: v.nome,
        identificacao: v.identificacao || 'sem placa',
        situacao: v.situacao,
        situacaoTipo: situacaoVeiculoTipo(v.situacao),
        capacidadeKg: Number(v.capacidade_kg),
        capacidadeM3: v.capacidade_m3 !== null ? Number(v.capacidade_m3) : 0,
        extraLabel: 'Próxima revisão',
        extraValor: v.proxima_revisao ?? '—',
      }))
    );

    await this.sincronizarTetoDaFrota();
  }

  async alternarConfirmacao(id: string): Promise<void> {
    const membro = this.equipe().find(m => m.id === id);
    if (!membro) return;

    const { error } = await this.client.from('equipe').update({ pode_confirmar: !membro.podeConfirmar }).eq('id', id);
    if (error) {
      this.toast.mostrar('Não foi possível alterar a permissão.');
      return;
    }
    this.equipe.update(lista => lista.map(m => (m.id === id ? { ...m, podeConfirmar: !m.podeConfirmar } : m)));
  }

  // ===== Adicionar pessoa =====

  readonly modalPessoaAberto = signal(false);
  readonly novoNome = signal('');
  readonly novoTelefone = signal('');
  readonly novaFuncao = signal(FUNCOES_DISPONIVEIS[0]);

  abrirModalPessoa(): void {
    this.novoNome.set('');
    this.novoTelefone.set('');
    this.novaFuncao.set(FUNCOES_DISPONIVEIS[0]);
    this.modalPessoaAberto.set(true);
  }

  fecharModalPessoa(): void {
    this.modalPessoaAberto.set(false);
  }

  async salvarPessoa(): Promise<void> {
    const nome = this.novoNome().trim();
    const cooperativa = this.cooperativaService.cooperativa();
    if (!nome || !cooperativa) return;

    const { data, error } = await this.client
      .from('equipe')
      .insert({
        cooperativa_id: cooperativa.id,
        nome,
        telefone: this.novoTelefone().trim() || null,
        funcao: this.novaFuncao(),
      })
      .select()
      .single();

    if (error || !data) {
      this.toast.mostrar('Não foi possível adicionar essa pessoa.');
      return;
    }

    const membro: MembroEquipe = {
      id: data.id,
      nome: data.nome,
      iniciais: gerarIniciais(data.nome),
      telefone: data.telefone || '—',
      funcao: data.funcao,
      coletas: null,
      situacao: data.situacao,
      situacaoTipo: situacaoEquipeTipo(data.situacao),
      podeConfirmar: data.pode_confirmar,
      acessoPainel: data.acesso_painel,
    };

    this.equipe.update(lista => [...lista, membro]);
    this.fecharModalPessoa();
    this.toast.mostrar(`${nome} adicionado à equipe.`);
  }

  // ===== Adicionar veículo =====

  readonly modalVeiculoAberto = signal(false);
  readonly novoVeiculoNome = signal('');
  readonly novoVeiculoIdentificacao = signal('');
  readonly novoVeiculoCapacidade = signal(200);

  abrirModalVeiculo(): void {
    this.novoVeiculoNome.set('');
    this.novoVeiculoIdentificacao.set('');
    this.novoVeiculoCapacidade.set(200);
    this.modalVeiculoAberto.set(true);
  }

  fecharModalVeiculo(): void {
    this.modalVeiculoAberto.set(false);
  }

  async salvarVeiculo(): Promise<void> {
    const nome = this.novoVeiculoNome().trim();
    const cooperativa = this.cooperativaService.cooperativa();
    if (!nome || !cooperativa) return;

    const capacidadeM3 = +(this.novoVeiculoCapacidade() / 200).toFixed(1);

    const { data, error } = await this.client
      .from('veiculos')
      .insert({
        cooperativa_id: cooperativa.id,
        nome,
        identificacao: this.novoVeiculoIdentificacao().trim() || null,
        capacidade_kg: this.novoVeiculoCapacidade(),
        capacidade_m3: capacidadeM3,
      })
      .select()
      .single();

    if (error || !data) {
      this.toast.mostrar('Não foi possível adicionar esse veículo.');
      return;
    }

    const veiculo: Veiculo = {
      id: data.id,
      nome: data.nome,
      identificacao: data.identificacao || 'sem placa',
      situacao: data.situacao,
      situacaoTipo: situacaoVeiculoTipo(data.situacao),
      capacidadeKg: Number(data.capacidade_kg),
      capacidadeM3: data.capacidade_m3 !== null ? Number(data.capacidade_m3) : 0,
      extraLabel: 'Próxima revisão',
      extraValor: data.proxima_revisao ?? '—',
    };

    this.veiculos.update(lista => [...lista, veiculo]);
    await this.sincronizarTetoDaFrota();
    this.fecharModalVeiculo();
    this.toast.mostrar(`${nome} adicionado à frota.`);
  }

  // ===== Gerenciar permissões =====

  readonly modalPermissoesAberto = signal(false);

  abrirModalPermissoes(): void {
    this.modalPermissoesAberto.set(true);
  }

  fecharModalPermissoes(): void {
    this.modalPermissoesAberto.set(false);
  }

  async alternarAcessoPainel(id: string): Promise<void> {
    const membro = this.equipe().find(m => m.id === id);
    if (!membro) return;

    const { error } = await this.client.from('equipe').update({ acesso_painel: !membro.acessoPainel }).eq('id', id);
    if (error) {
      this.toast.mostrar('Não foi possível alterar o acesso ao painel.');
      return;
    }
    this.equipe.update(lista => lista.map(m => (m.id === id ? { ...m, acessoPainel: !m.acessoPainel } : m)));
  }
}
