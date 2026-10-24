import { Component, computed, inject, signal } from '@angular/core';
import { maiuscula } from '../../../shared/util/format';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../../shared/ui/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';
import {
  SEM_PLACA,
  nomePessoaValido,
  normalizarPlaca,
  placaValida,
  telefoneValido,
} from '../../../shared/util/validators';

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

const FUNCAO_RESPONSAVEL = 'Responsável legal';
const FUNCOES_DISPONIVEIS = [FUNCAO_RESPONSAVEL, 'Coletor', 'Triagem'];

/** Intervalos dos campos obrigatórios de veículo (US12). */
const CAPACIDADE_MIN_KG = 1;
const CAPACIDADE_MAX_KG = 20000;
const VOLUME_MIN_M3 = 0.1;
const VOLUME_MAX_M3 = 100;

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
  // Maiúscula só no começo da linha montada: os pedaços depois do "·" seguem minúsculos.
  const linha = partes.join(' · ');
  return maiuscula(linha);
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
  imports: [RouterLink],
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
    // Sem frota, o limite que vale é o do cadastro (RN41).
    const teto = this.maiorVeiculoKg() || (this.cooperativaService.cooperativa()?.pesoMaximoKg ?? 0);

    const frota = veiculos === 1 ? 'Com um veículo' : `Com ${veiculos} veículos`;
    const agenda = coletas > 0 ? `, ${nome} sustenta ${coletas} coletas por período` : '';
    const limite = teto > 0 ? ` Pedidos acima de ${teto.toLocaleString('pt-BR')} kg não chegam até vocês.` : '';
    return `${frota}${agenda}.${limite}`;
  });

  /**
   * RN41: o teto por coleta é a capacidade do maior veículo. Sem veículo cadastrado
   * vale o peso máximo informado no cadastro (US06) — por isso não zera a frota vazia.
   */
  private async sincronizarTetoDaFrota(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    const teto = this.maiorVeiculoKg();
    if (!cooperativa || teto <= 0 || teto === cooperativa.pesoMaximoKg) return;
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

  // ===== Membro: adicionar e editar (US12 FA01) =====

  readonly modalPessoaAberto = signal(false);
  readonly membroEmEdicao = signal<MembroEquipe | null>(null);
  readonly novoNome = signal('');
  readonly novoTelefone = signal('');
  readonly novaFuncao = signal(FUNCOES_DISPONIVEIS[1]);
  readonly novoAcessoPainel = signal(false);

  abrirModalPessoa(membro: MembroEquipe | null = null): void {
    this.membroEmEdicao.set(membro);
    this.novoNome.set(membro?.nome ?? '');
    this.novoTelefone.set(membro && membro.telefone !== '—' ? membro.telefone : '');
    // Padrão "Coletor": o responsável legal já existe desde o cadastro.
    this.novaFuncao.set(membro?.funcao ?? FUNCOES_DISPONIVEIS[1]);
    this.novoAcessoPainel.set(membro?.acessoPainel ?? false);
    this.modalPessoaAberto.set(true);
  }

  fecharModalPessoa(): void {
    this.modalPessoaAberto.set(false);
    this.membroEmEdicao.set(null);
  }

  async salvarPessoa(): Promise<void> {
    const nome = this.novoNome().trim().replace(/\s+/g, ' ');
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    if (!nomePessoaValido(nome)) {
      this.toast.mostrar('Informe nome e sobrenome, usando apenas letras.');
      return;
    }
    if (this.novoTelefone().trim() && !telefoneValido(this.novoTelefone())) {
      this.toast.mostrar('Telefone inválido. Use o DDD e o número, ex.: (46) 99999-9999.');
      return;
    }

    const emEdicao = this.membroEmEdicao();
    const duplicado = this.equipe().some(
      m => m.id !== emEdicao?.id && m.nome.toLowerCase() === nome.toLowerCase()
    );
    if (duplicado) {
      this.toast.mostrar('Já existe alguém com esse nome na equipe.');
      return;
    }

    const campos = {
      nome,
      telefone: this.novoTelefone().trim() || null,
      funcao: this.novaFuncao(),
      acesso_painel: this.novoAcessoPainel(),
    };

    if (emEdicao) {
      const { error } = await this.client.from('equipe').update(campos).eq('id', emEdicao.id);
      if (error) {
        this.toast.mostrar('Não foi possível salvar as alterações.');
        return;
      }
      this.equipe.update(lista =>
        lista.map(m =>
          m.id === emEdicao.id
            ? {
                ...m,
                nome,
                iniciais: gerarIniciais(nome),
                telefone: campos.telefone || '—',
                funcao: campos.funcao,
                acessoPainel: campos.acesso_painel,
              }
            : m
        )
      );
      this.fecharModalPessoa();
      this.toast.mostrar(`Dados de ${nome} atualizados.`);
      return;
    }

    const { data, error } = await this.client
      .from('equipe')
      .insert({ cooperativa_id: cooperativa.id, ...campos })
      .select()
      .single();

    if (error || !data) {
      this.toast.mostrar('Não foi possível adicionar essa pessoa.');
      return;
    }

    this.equipe.update(lista => [
      ...lista,
      {
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
      },
    ]);
    this.fecharModalPessoa();
    this.toast.mostrar(`${nome} adicionado à equipe.`);
  }

  // ===== Membro: remover (US12 FA02 / FE03, RG07) =====

  readonly membroParaRemover = signal<MembroEquipe | null>(null);
  readonly coletasFuturasDoMembro = signal(0);

  async abrirRemocao(membro: MembroEquipe): Promise<void> {
    // FE03 — o responsável legal do cadastro só muda com a equipe do Re-cicle.
    if (membro.funcao === FUNCAO_RESPONSAVEL) {
      this.toast.mostrar(
        'O responsável legal não pode ser removido. Fale com a equipe do Re-cicle para trocar o responsável.',
        5200
      );
      return;
    }

    const { count } = await this.client
      .from('solicitacoes')
      .select('id', { count: 'exact', head: true })
      .eq('atribuido_equipe_id', membro.id)
      .eq('status', 'aceita');

    this.coletasFuturasDoMembro.set(count ?? 0);
    this.membroParaRemover.set(membro);
  }

  fecharRemocao(): void {
    this.membroParaRemover.set(null);
  }

  /** Tira a pessoa da equipe. O histórico das coletas que ela confirmou é mantido (RG04). */
  async confirmarRemocao(): Promise<void> {
    const membro = this.membroParaRemover();
    if (!membro || this.coletasFuturasDoMembro() > 0) return;

    await this.client.from('equipe').delete().eq('id', membro.id);
    this.equipe.update(lista => lista.filter(m => m.id !== membro.id));
    this.fecharRemocao();
    this.toast.mostrar(`${membro.nome} saiu da equipe. As coletas que ela confirmou continuam no histórico.`);
  }

  // ===== Veículo: adicionar e editar =====

  readonly modalVeiculoAberto = signal(false);
  readonly veiculoEmEdicao = signal<Veiculo | null>(null);
  readonly novoVeiculoNome = signal('');
  readonly novoVeiculoPlaca = signal('');
  readonly novoVeiculoCapacidade = signal(200);
  readonly novoVeiculoVolume = signal<number | null>(null);

  readonly capacidadeMin = CAPACIDADE_MIN_KG;
  readonly capacidadeMax = CAPACIDADE_MAX_KG;
  readonly volumeMin = VOLUME_MIN_M3;
  readonly volumeMax = VOLUME_MAX_M3;

  abrirModalVeiculo(veiculo: Veiculo | null = null): void {
    this.veiculoEmEdicao.set(veiculo);
    this.novoVeiculoNome.set(veiculo?.nome ?? '');
    this.novoVeiculoPlaca.set(veiculo?.identificacao ?? '');
    this.novoVeiculoCapacidade.set(veiculo?.capacidadeKg ?? 200);
    this.novoVeiculoVolume.set(veiculo?.capacidadeM3 || null);
    this.modalVeiculoAberto.set(true);
  }

  fecharModalVeiculo(): void {
    this.modalVeiculoAberto.set(false);
    this.veiculoEmEdicao.set(null);
  }

  async salvarVeiculo(): Promise<void> {
    const nome = this.novoVeiculoNome().trim();
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    if (nome.length < 3 || nome.length > 40) {
      this.toast.mostrar('O nome do veículo precisa ter de 3 a 40 caracteres.');
      return;
    }
    if (!placaValida(this.novoVeiculoPlaca())) {
      this.toast.mostrar('Placa inválida. Use AAA-0A00, AAA-0000 ou "sem placa".');
      return;
    }

    const placa = normalizarPlaca(this.novoVeiculoPlaca());
    const emEdicao = this.veiculoEmEdicao();

    // FE02 — placa única na cooperativa; "sem placa" pode repetir.
    if (placa !== SEM_PLACA && this.veiculos().some(v => v.id !== emEdicao?.id && v.identificacao === placa)) {
      this.toast.mostrar('Veículo já cadastrado nesta cooperativa.');
      return;
    }

    const capacidade = this.novoVeiculoCapacidade();
    if (capacidade < CAPACIDADE_MIN_KG || capacidade > CAPACIDADE_MAX_KG) {
      this.toast.mostrar(`A capacidade precisa estar entre ${CAPACIDADE_MIN_KG} e ${CAPACIDADE_MAX_KG} kg.`);
      return;
    }

    const volume = this.novoVeiculoVolume();
    if (volume !== null && (volume < VOLUME_MIN_M3 || volume > VOLUME_MAX_M3)) {
      this.toast.mostrar(`O volume precisa estar entre ${VOLUME_MIN_M3} e ${VOLUME_MAX_M3} m³.`);
      return;
    }

    const campos = {
      nome,
      identificacao: placa,
      capacidade_kg: capacidade,
      capacidade_m3: volume,
    };

    if (emEdicao) {
      const { error } = await this.client.from('veiculos').update(campos).eq('id', emEdicao.id);
      if (error) {
        this.toast.mostrar('Não foi possível salvar as alterações.');
        return;
      }
      this.veiculos.update(lista =>
        lista.map(v =>
          v.id === emEdicao.id
            ? { ...v, nome, identificacao: placa, capacidadeKg: capacidade, capacidadeM3: volume ?? 0 }
            : v
        )
      );
      await this.sincronizarTetoDaFrota();
      this.fecharModalVeiculo();
      this.toast.mostrar(`${nome} atualizado.`);
      return;
    }

    const { data, error } = await this.client
      .from('veiculos')
      .insert({ cooperativa_id: cooperativa.id, ...campos })
      .select()
      .single();

    if (error || !data) {
      this.toast.mostrar('Não foi possível adicionar esse veículo.');
      return;
    }

    this.veiculos.update(lista => [
      ...lista,
      {
        id: data.id,
        nome: data.nome,
        identificacao: data.identificacao || SEM_PLACA,
        situacao: data.situacao,
        situacaoTipo: situacaoVeiculoTipo(data.situacao),
        capacidadeKg: Number(data.capacidade_kg),
        capacidadeM3: data.capacidade_m3 !== null ? Number(data.capacidade_m3) : 0,
        extraLabel: 'Próxima revisão',
        extraValor: data.proxima_revisao ?? '—',
      },
    ]);
    await this.sincronizarTetoDaFrota();
    this.fecharModalVeiculo();
    this.toast.mostrar(`${nome} adicionado à frota.`);
  }

}
