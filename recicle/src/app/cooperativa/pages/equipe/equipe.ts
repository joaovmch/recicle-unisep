import { Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/toast.service';
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

const COLETAS_POR_PESSOA: { nome: string; coletas: number }[] = [];

const FUNCOES_DISPONIVEIS = ['Motorista', 'Coletor', 'Triagem', 'Administrativo'];

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
  styleUrls: ['../../shared/cooperativa-shared.css', './equipe.css'],
})
export class Equipe {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  readonly equipe = signal<MembroEquipe[]>([]);
  readonly veiculos = signal<Veiculo[]>([]);
  readonly coletasPorPessoa = COLETAS_POR_PESSOA;
  readonly funcoesDisponiveis = FUNCOES_DISPONIVEIS;

  readonly coletores = computed(() => this.equipe().filter(m => m.funcao !== 'Presidente'));
  readonly pessoasComAcesso = computed(() => this.equipe().filter(m => m.acessoPainel).length);
  readonly capacidadeSomada = computed(() => this.veiculos().reduce((total, v) => total + v.capacidadeKg, 0));

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const [{ data: equipeRows }, { data: veiculoRows }, { data: solicitacoesConcluidas }] = await Promise.all([
      this.client.from('equipe').select('*').eq('cooperativa_id', cooperativa.id).order('criado_em'),
      this.client.from('veiculos').select('*').eq('cooperativa_id', cooperativa.id).order('criado_em'),
      this.client
        .from('solicitacoes')
        .select('confirmado_por')
        .eq('cooperativa_id', cooperativa.id)
        .eq('status', 'concluida'),
    ]);

    const coletasPorMembro = new Map<string, number>();
    for (const s of solicitacoesConcluidas ?? []) {
      if (!s.confirmado_por) continue;
      coletasPorMembro.set(s.confirmado_por, (coletasPorMembro.get(s.confirmado_por) ?? 0) + 1);
    }

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
  }

  async alternarConfirmacao(id: string): Promise<void> {
    const membro = this.equipe().find(m => m.id === id);
    if (!membro) return;

    await this.client.from('equipe').update({ pode_confirmar: !membro.podeConfirmar }).eq('id', id);
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

    await this.client.from('equipe').update({ acesso_painel: !membro.acessoPainel }).eq('id', id);
    this.equipe.update(lista => lista.map(m => (m.id === id ? { ...m, acessoPainel: !m.acessoPainel } : m)));
  }
}
