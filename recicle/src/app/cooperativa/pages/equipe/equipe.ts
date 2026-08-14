import { Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/toast.service';

type SituacaoTipo = 'good' | 'info' | 'neutral';

interface MembroEquipe {
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
  nome: string;
  identificacao: string;
  situacao: string;
  situacaoTipo: SituacaoTipo;
  capacidadeKg: number;
  capacidadeM3: number;
  extraLabel: string;
  extraValor: string;
}

const EQUIPE_INICIAL: MembroEquipe[] = [];

const VEICULOS: Veiculo[] = [];

const COLETAS_POR_PESSOA: { nome: string; coletas: number }[] = [];

const FUNCOES_DISPONIVEIS = ['Motorista', 'Coletor', 'Triagem', 'Administrativo'];

function gerarIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

@Component({
  selector: 'app-equipe',
  imports: [],
  templateUrl: './equipe.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './equipe.css'],
})
export class Equipe {
  private readonly toast = inject(ToastService);

  readonly equipe = signal(EQUIPE_INICIAL);
  readonly veiculos = signal(VEICULOS);
  readonly coletasPorPessoa = COLETAS_POR_PESSOA;
  readonly funcoesDisponiveis = FUNCOES_DISPONIVEIS;

  readonly coletores = computed(() => this.equipe().filter(m => m.funcao !== 'Presidente'));
  readonly pessoasComAcesso = computed(() => this.equipe().filter(m => m.acessoPainel).length);
  readonly capacidadeSomada = computed(() => this.veiculos().reduce((total, v) => total + v.capacidadeKg, 0));

  alternarConfirmacao(nome: string): void {
    this.equipe.update(lista =>
      lista.map(m => (m.nome === nome ? { ...m, podeConfirmar: !m.podeConfirmar } : m))
    );
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

  salvarPessoa(): void {
    const nome = this.novoNome().trim();
    if (!nome) return;

    const membro: MembroEquipe = {
      nome,
      iniciais: gerarIniciais(nome),
      telefone: this.novoTelefone().trim() || '—',
      funcao: this.novaFuncao(),
      coletas: null,
      situacao: 'No galpão',
      situacaoTipo: 'neutral',
      podeConfirmar: false,
      acessoPainel: true,
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

  salvarVeiculo(): void {
    const nome = this.novoVeiculoNome().trim();
    if (!nome) return;

    const veiculo: Veiculo = {
      nome,
      identificacao: this.novoVeiculoIdentificacao().trim() || 'sem placa',
      situacao: 'Disponível',
      situacaoTipo: 'good',
      capacidadeKg: this.novoVeiculoCapacidade(),
      capacidadeM3: +(this.novoVeiculoCapacidade() / 200).toFixed(1),
      extraLabel: 'Próxima revisão',
      extraValor: '—',
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

  alternarAcessoPainel(nome: string): void {
    this.equipe.update(lista =>
      lista.map(m => (m.nome === nome ? { ...m, acessoPainel: !m.acessoPainel } : m))
    );
  }
}
