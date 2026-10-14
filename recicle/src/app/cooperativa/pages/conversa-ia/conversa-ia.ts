import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Solicitacao, SolicitacoesStore } from '../../data/solicitacoes.store';
import { CooperativaService } from '../../data/cooperativa.service';
import { PassoPreparo, classificar, respostaDaIa } from '../../../shared/data/classificador';
import { SupabaseService } from '../../../supabase.service';
import { UUID_RE } from '../../../shared/util/validators';
import { formatarDistancia, formatarPreco } from '../../../shared/util/format';

interface Mensagem {
  autor: 'morador' | 'ia';
  texto: string;
}

interface ResumoResiduo {
  categoria: string;
  materiais: string;
  reciclavel: string;
  atencao: string | null;
  passos: PassoPreparo[];
}

/** O que `conversa_da_solicitacao` devolve: a conversa gravada que gerou o pedido. */
interface ConversaGravada {
  materiais: string | null;
  reciclavel: string | null;
  atencao: string | null;
  mensagens: { autor: 'morador' | 'ia'; texto: string; passos: PassoPreparo[] | null }[];
}

@Component({
  selector: 'app-conversa-ia',
  imports: [RouterLink],
  templateUrl: './conversa-ia.html',
  styleUrls: ['../../../shared/ui/design-system.css', './conversa-ia.css'],
})
export class ConversaIa {
  private readonly store = inject(SolicitacoesStore);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly client = inject(SupabaseService).client;

  readonly formatarPreco = formatarPreco;

  private readonly id = this.rota.snapshot.paramMap.get('id') ?? '';
  readonly carregando = signal(true);

  readonly solicitacao = computed<Solicitacao | null>(
    () => this.store.solicitacoes().find(s => s.id === this.id) ?? null
  );

  /** Conversa gravada no chat do morador; null quando não existe (pedido antigo) ou não carregou. */
  private readonly conversa = signal<ConversaGravada | null>(null);

  /**
   * Sem conversa gravada, a tela mostra uma reconstrução feita pelo classificador local a
   * partir do título — e avisa que é uma reconstrução, não o que o morador leu.
   */
  readonly reconstruida = computed(() => !this.conversa());

  private readonly reconstrucao = computed(() => {
    const s = this.solicitacao();
    return s && !this.conversa() ? classificar(`${s.titulo} ${s.pesoEstimadoKg} kg`) : null;
  });

  readonly classificacao = computed<ResumoResiduo | null>(() => {
    const s = this.solicitacao();
    if (!s) return null;

    const gravada = this.conversa();
    if (gravada) {
      // Os passos que valem são os da última resposta da IA antes do pedido.
      const passos = [...gravada.mensagens].reverse().find(m => m.autor === 'ia' && m.passos?.length)?.passos ?? [];
      return {
        categoria: s.categoria,
        materiais: gravada.materiais ?? '—',
        reciclavel: gravada.reciclavel ?? '—',
        atencao: gravada.atencao,
        passos,
      };
    }

    const c = this.reconstrucao();
    return c ? { categoria: s.categoria, materiais: c.materiais, reciclavel: c.reciclavel, atencao: c.atencao, passos: c.passos } : null;
  });

  readonly mensagens = computed<Mensagem[]>(() => {
    const gravada = this.conversa();
    if (gravada) return gravada.mensagens.map(m => ({ autor: m.autor, texto: m.texto }));

    const s = this.solicitacao();
    const c = this.reconstrucao();
    if (!s || !c) return [];
    return [
      { autor: 'morador', texto: s.titulo },
      { autor: 'ia', texto: respostaDaIa(c) },
    ];
  });

  readonly destino = computed(() => {
    const s = this.solicitacao();
    const cooperativa = this.cooperativaService.cooperativa();
    if (!s) return '';

    // Não afirma que a cooperativa aceita o material: quem diz isso é a etiqueta da lista de
    // solicitações, que confere com os tipos ligados no cadastro.
    const nome = cooperativa?.nome ?? 'a cooperativa';
    const distancia = formatarDistancia(s.distanciaKm);
    const onde = distancia ? `${s.bairro}, a ${distancia} de ${nome}` : s.bairro;
    const janela = s.janela ? `, janela preferida ${s.janela}` : '';
    return `Coleta em ${onde}. Pedido enviado em ${this.quando(s.criadoEm)}${janela}, ${formatarPreco(s.preco)} pagos na retirada.`;
  });

  readonly aindaPendente = computed(() => this.solicitacao()?.status === 'pendente');

  readonly rotuloStatus = computed(() => {
    const s = this.solicitacao();
    if (!s) return '';
    if (s.status === 'pendente') return 'Ainda sem resposta';
    if (s.status === 'aceita') return 'Coleta aceita';
    if (s.status === 'concluida') return 'Coleta concluída';
    return 'Coleta recusada';
  });

  readonly detalheStatus = computed(() => {
    const s = this.solicitacao();
    if (!s) return '';
    if (s.status === 'pendente') {
      const horas = Math.max(0, Math.floor((Date.now() - new Date(s.criadoEm).getTime()) / 3_600_000));
      return horas < 1 ? 'Chegou há menos de uma hora.' : `Na fila há ${horas}h.`;
    }
    if (s.status === 'aceita') return `Agendada para ${s.janelaConfirmada || 'a janela combinada'}.`;
    if (s.status === 'concluida') return 'Material recebido, pesado e creditado ao morador.';
    return s.motivoRecusa ? `Motivo registrado: ${s.motivoRecusa.toLowerCase()}.` : 'Pedido recusado.';
  });

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const [, conversa] = await Promise.all([
      this.store.solicitacoes().length === 0 ? this.store.carregar() : Promise.resolve(),
      this.carregarConversa(),
    ]);
    this.conversa.set(conversa);
    this.carregando.set(false);
  }

  /** Falha aqui (função ainda não criada no banco, rede) só cai na reconstrução. */
  private async carregarConversa(): Promise<ConversaGravada | null> {
    if (!UUID_RE.test(this.id)) return null;
    const { data, error } = await this.client.rpc('conversa_da_solicitacao', { p_solicitacao: this.id });
    if (error || !data || !Array.isArray(data.mensagens) || data.mensagens.length === 0) return null;
    return data as ConversaGravada;
  }

  quando(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  aceitar(): void {
    this.router.navigate(['/cooperativa/solicitacoes'], { queryParams: { acao: 'aceitar', id: this.id } });
  }

  recusar(): void {
    this.router.navigate(['/cooperativa/solicitacoes'], { queryParams: { acao: 'recusar', id: this.id } });
  }
}
