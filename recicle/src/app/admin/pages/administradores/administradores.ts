import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../../data/admin.service';
import { ToastService } from '../../../cooperativa/shared/toast.service';
import { formatarData } from '../../../cooperativa/shared/format';
import { EMAIL_RE, SENHA_MIN_CARACTERES } from '../../../cooperativa/shared/validators';

@Component({
  selector: 'app-admin-administradores',
  imports: [],
  templateUrl: './administradores.html',
  styleUrls: ['../../../cooperativa/shared/cooperativa-shared.css'],
})
export class Administradores {
  readonly adminService = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly carregando = signal(true);
  readonly senhaMinCaracteres = SENHA_MIN_CARACTERES;

  readonly modalAberto = signal(false);
  readonly novoNome = signal('');
  readonly novoEmail = signal('');
  readonly novaSenha = signal('');
  readonly erro = signal<string | null>(null);
  readonly salvando = signal(false);

  constructor() {
    this.adminService.carregarLista().finally(() => this.carregando.set(false));
  }

  abrirModal(): void {
    this.novoNome.set('');
    this.novoEmail.set('');
    this.novaSenha.set('');
    this.erro.set(null);
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
  }

  async salvar(): Promise<void> {
    if (this.salvando()) return;

    if (!this.novoNome().trim() || !this.novoEmail().trim()) {
      this.erro.set('Preencha nome e e-mail.');
      return;
    }
    if (!EMAIL_RE.test(this.novoEmail().trim())) {
      this.erro.set('Digite um e-mail válido.');
      return;
    }
    if (this.novaSenha().length < SENHA_MIN_CARACTERES) {
      this.erro.set(`A senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`);
      return;
    }

    this.salvando.set(true);
    this.erro.set(null);

    const { erro } = await this.adminService.criarAdmin(this.novoNome(), this.novoEmail(), this.novaSenha());

    this.salvando.set(false);

    if (erro) {
      this.erro.set(erro);
      return;
    }

    this.fecharModal();
    this.toast.mostrar(`${this.novoNome()} agora tem acesso à área administrativa.`);
  }

  async remover(id: string, nome: string): Promise<void> {
    const { erro } = await this.adminService.removerAdmin(id);
    if (erro) {
      this.toast.mostrar('Não foi possível remover esse admin.');
      return;
    }
    this.toast.mostrar(`${nome} perdeu o acesso à área administrativa.`);
  }

  readonly formatarData = formatarData;
}
