import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/data/auth.service';
import { MoradorService } from '../../morador/data/morador.service';
import { CooperativaService } from '../../cooperativa/data/cooperativa.service';
import { ToastService } from '../../shared/ui/toast.service';
import { EMAIL_RE, SENHA_MIN_CARACTERES } from '../../shared/util/validators';
import { definirContinuarConectado } from '../../supabase.service';

type Aba = 'criar' | 'entrar';
type Perfil = 'morador' | 'cooperativa';

const DESTAQUES = [
  'Instrução específica para cada resíduo',
  'Cooperativas e ecopontos verificados',
  'Pontos a cada descarte confirmado',
];

@Component({
  selector: 'app-publico-entrar',
  imports: [RouterLink],
  templateUrl: './entrar.html',
  styleUrls: ['../../shared/ui/design-system.css', './entrar.css'],
})
export class Entrar {
  private readonly auth = inject(AuthService);
  private readonly moradorService = inject(MoradorService);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly destaques = DESTAQUES;
  readonly senhaMinCaracteres = SENHA_MIN_CARACTERES;

  readonly aba = signal<Aba>('criar');
  readonly perfil = signal<Perfil>('morador');

  readonly nome = signal('');
  readonly email = signal('');
  readonly senha = signal('');
  readonly aceitouTermos = signal(false);
  readonly continuarConectado = signal(true);

  readonly erro = signal<string | null>(null);
  readonly processando = signal(false);

  readonly modalRecuperar = signal(false);
  readonly emailRecuperacao = signal('');
  readonly linkEnviado = signal(false);
  readonly erroRecuperacao = signal<string | null>(null);

  constructor() {
    // /entrar?aba=entrar abre direto no login; ?completar=morador avisa que a conta
    // existe mas o perfil não foi criado.
    const q = this.route.snapshot.queryParamMap;
    if (q.get('aba') === 'entrar') this.aba.set('entrar');
    if (q.get('completar') === 'morador') {
      this.aba.set('criar');
      this.erro.set('Sua conta existe, mas o perfil não foi concluído. Complete os dados abaixo.');
    }
  }

  setAba(aba: Aba): void {
    this.aba.set(aba);
    this.erro.set(null);
  }

  /** Cooperativa tem cadastro próprio (wizard de 4 etapas) — aqui só redireciona. */
  selecionarPerfil(p: Perfil): void {
    this.perfil.set(p);
    if (p === 'cooperativa') this.router.navigate(['/cooperativa/cadastro']);
  }

  async criarConta(): Promise<void> {
    if (this.processando()) return;

    if (!this.nome().trim()) return this.erro.set('Informe seu nome completo.');
    if (!EMAIL_RE.test(this.email().trim())) return this.erro.set('Digite um e-mail válido.');
    if (this.senha().length < SENHA_MIN_CARACTERES) {
      return this.erro.set(`A senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`);
    }
    if (!this.aceitouTermos()) return this.erro.set('É preciso aceitar os termos de uso para continuar.');

    this.processando.set(true);
    this.erro.set(null);

    const nome = this.nome().trim();
    const email = this.email().trim();
    const conta = await this.auth.criarConta(email, this.senha(), { tipo: 'morador', nome });

    let userId = conta.userId;

    if (conta.jaExiste) {
      // Pode ser a mesma pessoa tentando de novo depois de uma falha que deixou a conta
      // de login sem perfil. Com a mesma senha, recupera a conta em vez de travar.
      const erroLogin = await this.auth.entrar(email, this.senha());
      if (erroLogin) {
        this.processando.set(false);
        this.erro.set('Já existe uma conta com esse e-mail. Use "Entrar" ou recupere sua senha.');
        return;
      }
      userId = (await this.auth.sessaoAtual())?.user.id ?? null;
    } else if (conta.erro || !userId) {
      this.processando.set(false);
      this.erro.set(conta.erro ?? 'Não foi possível criar a conta.');
      return;
    } else if (!conta.comSessao) {
      this.processando.set(false);
      this.erro.set(null);
      this.setAba('entrar');
      this.toast.mostrar('Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.');
      return;
    }

    if (!userId) {
      this.processando.set(false);
      this.erro.set('Não foi possível criar a conta.');
      return;
    }

    const perfil = await this.moradorService.garantirPerfil(userId, nome, email);
    this.processando.set(false);

    if (perfil.erro) {
      this.erro.set(perfil.erro);
      return;
    }

    this.router.navigate(['/painel']);
  }

  async entrar(): Promise<void> {
    if (this.processando()) return;

    if (!this.email().trim() || !this.senha()) return this.erro.set('Preencha e-mail e senha.');

    this.processando.set(true);
    this.erro.set(null);

    // Antes do login: é essa preferência que decide se a sessão vai para o localStorage
    // (sobrevive a fechar o navegador) ou para o sessionStorage (morre com a aba).
    definirContinuarConectado(this.continuarConectado());

    const erroLogin = await this.auth.entrar(this.email(), this.senha());
    if (erroLogin) {
      this.processando.set(false);
      this.erro.set(erroLogin);
      return;
    }

    const morador = await this.moradorService.carregar();

    if (!morador) {
      const cooperativa = await this.cooperativaService.carregar();
      this.processando.set(false);

      if (cooperativa) {
        // Login de cooperativa pela porta errada: manda para o lugar certo em vez de travar.
        this.router.navigate(['/cooperativa/dashboard']);
        return;
      }

      // Conta de login sem perfil nenhum (signUp passou, perfil falhou): pede só o nome
      // para concluir, mantendo e-mail e senha já digitados.
      this.aba.set('criar');
      this.erro.set('Sua conta existe, mas o perfil não foi concluído. Informe seu nome e aceite os termos para concluir.');
      return;
    }

    this.processando.set(false);
    this.router.navigate(['/painel']);
  }

  abrirRecuperar(): void {
    this.emailRecuperacao.set(this.email());
    this.linkEnviado.set(false);
    this.erroRecuperacao.set(null);
    this.modalRecuperar.set(true);
  }

  async enviarLinkRecuperacao(): Promise<void> {
    if (!EMAIL_RE.test(this.emailRecuperacao().trim())) {
      this.erroRecuperacao.set('Digite um e-mail válido.');
      return;
    }
    this.erroRecuperacao.set(null);
    await this.auth.enviarLinkRecuperacao(this.emailRecuperacao());
    this.linkEnviado.set(true);
  }
}
