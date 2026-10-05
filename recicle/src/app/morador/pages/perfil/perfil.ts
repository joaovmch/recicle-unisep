import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Endereco, MoradorService } from '../../data/morador.service';
import { AuthService } from '../../../shared/data/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { SupabaseService, traduzirErroAuth } from '../../../supabase.service';
import { SENHA_MIN_CARACTERES, UFS, ufValida } from '../../../shared/util/validators';

type Aba = 'dados' | 'notificacoes' | 'seguranca';

const ENDERECO_VAZIO = {
  id: '',
  apelido: 'Casa',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  referencia: '',
  principal: false,
};

@Component({
  selector: 'app-morador-perfil',
  imports: [],
  templateUrl: './perfil.html',
  styleUrls: ['../../../shared/ui/design-system.css', './perfil.css'],
})
export class Perfil {
  private readonly moradorService = inject(MoradorService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly client = inject(SupabaseService).client;

  readonly senhaMinCaracteres = SENHA_MIN_CARACTERES;
  readonly morador = this.moradorService.morador;
  readonly enderecos = this.moradorService.enderecos;

  readonly abaAtiva = signal<Aba>('dados');
  readonly ufs = UFS;
  readonly salvando = signal(false);

  // ===== Dados pessoais =====
  readonly nome = signal('');
  readonly telefone = signal('');

  // ===== Endereço =====
  readonly modalEndereco = signal(false);
  readonly form = signal({ ...ENDERECO_VAZIO });

  // ===== Segurança =====
  readonly novaSenha = signal('');
  readonly confirmacaoSenha = signal('');
  readonly modalExcluir = signal(false);
  readonly confirmacaoExclusao = signal('');

  constructor() {
    const m = this.morador();
    this.nome.set(m?.nome ?? '');
    this.telefone.set(m?.telefone ?? '');
  }

  setAba(aba: Aba): void {
    this.abaAtiva.set(aba);
  }

  // ===== Dados =====

  async salvarDados(): Promise<void> {
    if (!this.nome().trim()) {
      this.toast.mostrar('O nome não pode ficar em branco.');
      return;
    }

    this.salvando.set(true);
    const { erro } = await this.moradorService.atualizarPerfil({
      nome: this.nome().trim(),
      telefone: this.telefone().trim() || null,
    });
    this.salvando.set(false);

    this.toast.mostrar(erro ?? 'Dados salvos.');
  }

  // ===== Endereços =====

  abrirNovoEndereco(): void {
    this.form.set({ ...ENDERECO_VAZIO, principal: this.enderecos().length === 0 });
    this.modalEndereco.set(true);
  }

  abrirEdicaoEndereco(e: Endereco): void {
    this.form.set({
      id: e.id,
      apelido: e.apelido,
      cep: e.cep ?? '',
      rua: e.rua,
      numero: e.numero ?? '',
      complemento: e.complemento ?? '',
      bairro: e.bairro,
      cidade: e.cidade,
      uf: e.uf,
      referencia: e.referencia ?? '',
      principal: e.principal,
    });
    this.modalEndereco.set(true);
  }

  atualizarForm<K extends keyof typeof ENDERECO_VAZIO>(campo: K, valor: (typeof ENDERECO_VAZIO)[K]): void {
    this.form.update(f => ({ ...f, [campo]: valor }));
  }

  async salvarEndereco(): Promise<void> {
    const f = this.form();
    if (!f.rua.trim() || !f.bairro.trim() || !f.cidade.trim() || !f.uf.trim()) {
      this.toast.mostrar('Preencha rua, bairro, cidade e UF.');
      return;
    }
    if (!ufValida(f.uf)) {
      this.toast.mostrar('Escolha a UF na lista.');
      return;
    }

    this.salvando.set(true);
    const { erro } = await this.moradorService.salvarEndereco({
      id: f.id || undefined,
      apelido: f.apelido.trim() || 'Casa',
      cep: f.cep.trim() || null,
      rua: f.rua.trim(),
      numero: f.numero.trim() || null,
      complemento: f.complemento.trim() || null,
      bairro: f.bairro.trim(),
      cidade: f.cidade.trim(),
      uf: f.uf.trim().toUpperCase(),
      referencia: f.referencia.trim() || null,
      principal: f.principal,
    } as Partial<Endereco> & { rua: string; bairro: string; cidade: string; uf: string });
    this.salvando.set(false);

    if (erro) {
      this.toast.mostrar(erro);
      return;
    }

    this.modalEndereco.set(false);
    this.toast.mostrar('Endereço salvo.');
  }

  async removerEndereco(e: Endereco): Promise<void> {
    if (!window.confirm(`Remover o endereço "${e.apelido}"?`)) return;
    const { erro } = await this.moradorService.removerEndereco(e.id);
    this.toast.mostrar(erro ?? 'Endereço removido.');
  }

  // ===== Notificações =====

  async alternarAviso(campo: 'aviso_email' | 'aviso_whatsapp' | 'aviso_painel', valor: boolean): Promise<void> {
    const { erro } = await this.moradorService.atualizarPerfil({ [campo]: valor });
    this.toast.mostrar(erro ?? 'Preferências de notificação salvas.');
  }

  // ===== Segurança =====

  async alterarSenha(): Promise<void> {
    if (this.novaSenha().length < SENHA_MIN_CARACTERES) {
      this.toast.mostrar(`A senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`);
      return;
    }
    if (this.novaSenha() !== this.confirmacaoSenha()) {
      this.toast.mostrar('A confirmação não bate com a nova senha.');
      return;
    }

    this.salvando.set(true);
    const { error } = await this.client.auth.updateUser({ password: this.novaSenha() });
    this.salvando.set(false);

    if (error) {
      this.toast.mostrar(traduzirErroAuth(error.message));
      return;
    }

    this.novaSenha.set('');
    this.confirmacaoSenha.set('');
    this.toast.mostrar('Senha alterada.');
  }

  /**
   * Encerra a sessão em todos os dispositivos. Como o logout global invalida também a
   * sessão atual, a pessoa volta para a tela de login.
   */
  async encerrarSessoes(): Promise<void> {
    await this.auth.sair(true);
    this.toast.mostrar('Todas as sessões foram encerradas.');
    this.router.navigate(['/entrar']);
  }

  /**
   * Exclusão de conta. O app só apaga o perfil e os dados do morador — remover a conta
   * de autenticação exige chave de serviço, que não pode ficar no navegador. A conta de
   * login fica órfã até a equipe removê-la pelo painel do Supabase.
   */
  async excluirConta(): Promise<void> {
    const morador = this.morador();
    if (!morador || this.confirmacaoExclusao().trim().toUpperCase() !== 'EXCLUIR') return;

    this.salvando.set(true);

    // Coletas em andamento são canceladas antes: senão a cooperativa iria buscar material
    // de uma conta que não existe mais.
    const { error: erroCancelamento } = await this.client
      .from('solicitacoes')
      .update({ status: 'cancelada', motivo_cancelamento: 'Conta do morador excluída' })
      .eq('morador_id', morador.id)
      .in('status', ['pendente', 'aceita']);
    if (erroCancelamento) {
      this.salvando.set(false);
      this.toast.mostrar('Não foi possível cancelar suas coletas em andamento. Tente de novo.');
      return;
    }

    const { error } = await this.client.from('moradores').delete().eq('id', morador.id);
    this.salvando.set(false);

    if (error) {
      this.toast.mostrar('Não foi possível excluir a conta. Fale com a equipe.');
      return;
    }

    await this.auth.sair();
    this.toast.mostrar('Conta excluída. Sentiremos sua falta!');
    this.router.navigate(['/']);
  }
}
