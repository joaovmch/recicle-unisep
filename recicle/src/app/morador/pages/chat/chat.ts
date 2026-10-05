import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChatStore } from '../../data/chat.store';
import { EcopontosStore } from '../../data/ecopontos.store';
import { MoradorService, enderecoResumido } from '../../data/morador.service';
import { PontosStore } from '../../data/pontos.store';
import { ToastService } from '../../../shared/ui/toast.service';
import { formatarPreco } from '../../../shared/util/format';

/** Preço de referência por kg da coleta em casa, até existir tabela por cooperativa. */
const PRECO_BASE_POR_KG = 3.75;

@Component({
  selector: 'app-morador-chat',
  imports: [RouterLink],
  templateUrl: './chat.html',
  styleUrls: ['../../../shared/ui/design-system.css', './chat.css'],
})
export class Chat {
  private readonly store = inject(ChatStore);
  private readonly ecopontosStore = inject(EcopontosStore);
  private readonly moradorService = inject(MoradorService);
  private readonly pontosStore = inject(PontosStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly formatarPreco = formatarPreco;

  readonly conversas = this.store.conversas;
  readonly ativa = this.store.ativa;
  readonly mensagens = this.store.mensagens;
  readonly enviando = this.store.enviando;

  readonly saldo = this.pontosStore.saldo;
  readonly nivel = this.pontosStore.nivel;
  readonly enderecos = this.moradorService.enderecos;

  readonly texto = signal('');
  readonly agendando = signal(false);

  /** Destino só aparece depois que a IA classificou e antes de virar solicitação. */
  readonly podeEscolherDestino = computed(() => {
    const c = this.ativa();
    return !!c && !c.solicitacaoId && !!c.categoria && c.categoria !== 'A conferir';
  });

  readonly ecopontosProximos = computed(() => {
    const c = this.ativa();
    if (!c) return [];
    return this.ecopontosStore
      .ecopontos()
      .filter(e => e.aceita.length === 0 || e.aceita.some(t => t.toLowerCase().includes((c.categoria ?? '').toLowerCase().split(' ')[0])))
      .slice(0, 4);
  });

  readonly precoColeta = computed(() => {
    const peso = this.ativa()?.pesoEstimadoKg ?? 0;
    return Math.max(25, Math.round(peso * PRECO_BASE_POR_KG));
  });

  readonly enderecoPrincipal = computed(
    () => this.enderecos().find(e => e.principal) ?? this.enderecos()[0] ?? null
  );

  constructor() {
    this.store.carregarConversas();
    this.ecopontosStore.carregar();
    this.pontosStore.carregar();
  }

  nova(): void {
    this.store.novaConversa();
    this.texto.set('');
  }

  abrir(id: string): void {
    this.store.abrir(id);
  }

  async enviar(): Promise<void> {
    const texto = this.texto().trim();
    // Enter de novo durante o envio limparia a caixa sem enviar nada.
    if (!texto || this.enviando()) return;
    this.texto.set('');
    const { erro } = await this.store.enviar(texto);
    if (erro) {
      // Devolve o texto para a caixa — a pessoa não perde o que escreveu.
      this.texto.set(texto);
      this.toast.mostrar(erro);
    }
  }

  /** Cria a solicitação de coleta em casa a partir da conversa atual. */
  async agendarColeta(): Promise<void> {
    const endereco = this.enderecoPrincipal();
    if (!endereco) {
      this.toast.mostrar('Cadastre um endereço no seu perfil para agendar a coleta em casa.');
      this.router.navigate(['/perfil']);
      return;
    }

    this.agendando.set(true);
    const { erro, id } = await this.store.criarSolicitacao({
      destino: 'coleta_casa',
      enderecoId: endereco.id,
      endereco: enderecoResumido(endereco),
      bairro: endereco.bairro,
      janelaPreferida: 'A combinar',
      preco: this.precoColeta(),
    });
    this.agendando.set(false);

    if (erro) {
      this.toast.mostrar(erro);
      return;
    }

    this.toast.mostrar('Pedido enviado. Uma cooperativa da sua região vai responder.');
    if (id) this.router.navigate(['/solicitacoes', id]);
  }

  /** Registra que o morador vai levar o material ele mesmo. */
  async escolherEcoponto(ecopontoId: string, nome: string, bairro: string): Promise<void> {
    this.agendando.set(true);
    const { erro, id } = await this.store.criarSolicitacao({
      destino: 'entrega_ecoponto',
      ecopontoId,
      endereco: nome,
      bairro,
      janelaPreferida: 'Entrega própria',
      preco: 0,
    });
    this.agendando.set(false);

    if (erro) {
      this.toast.mostrar(erro);
      return;
    }

    this.toast.mostrar(`Entrega registrada para ${nome}.`);
    if (id) this.router.navigate(['/solicitacoes', id]);
  }
}
