import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Solicitacao, SolicitacoesStore } from '../../data/solicitacoes.store';
import { CooperativaService } from '../../data/cooperativa.service';
import { classificar, respostaDaIa } from '../../../shared/data/classificador';
import { formatarPreco } from '../../../shared/util/format';

interface Mensagem {
  autor: 'morador' | 'ia';
  texto: string;
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

  readonly formatarPreco = formatarPreco;

  private readonly id = this.rota.snapshot.paramMap.get('id') ?? '';
  readonly carregando = signal(true);

  readonly solicitacao = computed<Solicitacao | null>(
    () => this.store.solicitacoes().find(s => s.id === this.id) ?? null
  );

  /**
   * A conversa é reconstruída a partir do mesmo classificador que o chat do morador usa:
   * é ele que transforma a descrição em categoria, materiais e passos de preparo. O que a
   * cooperativa lê aqui é, portanto, o raciocínio real que gerou o pedido — não um texto fixo.
   */
  readonly classificacao = computed(() => {
    const s = this.solicitacao();
    return s ? classificar(`${s.titulo} ${s.pesoEstimadoKg} kg`) : null;
  });

  readonly mensagens = computed<Mensagem[]>(() => {
    const s = this.solicitacao();
    const c = this.classificacao();
    if (!s || !c) return [];

    return [
      { autor: 'ia', texto: 'Oi! Me conta o que você quer descartar hoje.' },
      { autor: 'morador', texto: s.titulo.toLowerCase() },
      { autor: 'ia', texto: respostaDaIa(c) },
      { autor: 'morador', texto: 'prefiro que venham buscar, tenho como pagar' },
    ];
  });

  readonly destino = computed(() => {
    const s = this.solicitacao();
    const cooperativa = this.cooperativaService.cooperativa();
    if (!s) return '';

    const nome = cooperativa?.nome ?? 'a cooperativa';
    const distancia = `${s.distanciaKm.toFixed(1).replace('.', ',')} km`;
    const janela = s.janela ? `, janela preferida ${s.janela}` : '';
    return `${nome} fica a ${distancia} e aceita esse material. Pedido enviado em ${this.quando(s.criadoEm)}${janela}, ${formatarPreco(s.preco)} pagos na retirada.`;
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
    if (this.store.solicitacoes().length === 0) await this.store.carregar();
    this.carregando.set(false);
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
