import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Solicitacao, SolicitacoesStore } from '../../data/solicitacoes.store';
import { CooperativaService } from '../../data/cooperativa.service';
import { SupabaseService } from '../../../supabase.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { formatarPreco } from '../../../shared/util/format';

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-coleta-aceita',
  imports: [RouterLink],
  templateUrl: './coleta-aceita.html',
  styleUrls: ['../../../shared/ui/design-system.css', './coleta-aceita.css'],
})
export class ColetaAceita {
  private readonly store = inject(SolicitacoesStore);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly client = inject(SupabaseService).client;
  private readonly toast = inject(ToastService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly formatarPreco = formatarPreco;

  private readonly id = this.rota.snapshot.paramMap.get('id') ?? '';
  readonly carregando = signal(true);
  readonly coletorNome = signal('');

  readonly solicitacao = computed<Solicitacao | null>(
    () => this.store.solicitacoes().find(s => s.id === this.id) ?? null
  );

  readonly pendentes = computed(() => this.store.pendentes().slice(0, 3));

  readonly dataPorExtenso = computed(() => {
    const data = this.solicitacao()?.dataAgendada;
    if (!data) return '';
    return new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    });
  });

  readonly resumo = computed(() => {
    const s = this.solicitacao();
    if (!s) return '';

    const coletor = this.coletorNome();
    const quem = coletor ? `, com ${coletor}` : '';
    const periodo = s.janelaConfirmada ? `, período da ${s.janelaConfirmada}` : '';
    const primeiroNome = s.solicitante.split(' ')[0];
    return `A #${s.numero} entrou na rota de ${this.dataPorExtenso()}${periodo}${quem}. O código de retirada já aparece no app de ${primeiroNome}.`;
  });

  // ===== Agenda do dia marcado =====

  readonly capacidadeDiaria = computed(() => this.cooperativaService.cooperativa()?.coletasPorDia ?? 0);
  readonly usadasNoDia = computed(() => {
    const dia = this.solicitacao()?.dataAgendada;
    if (!dia) return 0;
    return this.store.aceitas().filter(s => s.dataAgendada === dia).length;
  });
  readonly percentualCapacidade = computed(() => {
    const total = this.capacidadeDiaria();
    if (total <= 0) return 0;
    return Math.min(100, (this.usadasNoDia() / total) * 100);
  });
  readonly textoCapacidade = computed(() => {
    const total = this.capacidadeDiaria();
    if (total <= 0) return 'Defina quantas coletas cabem por dia em Equipe e veículos para acompanhar as vagas aqui.';
    const vagas = Math.max(0, total - this.usadasNoDia());
    if (vagas === 0) return 'Agenda cheia para esse dia. A IA passa a oferecer a data seguinte.';
    return `${vagas === 1 ? 'Sobra 1 vaga' : `Sobram ${vagas} vagas`}. Depois disso a IA passa a oferecer a data seguinte.`;
  });

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    if (this.store.solicitacoes().length === 0) await this.store.carregar();

    const equipeId = this.solicitacao()?.atribuidoEquipeId;
    if (equipeId) {
      const { data } = await this.client.from('equipe').select('nome').eq('id', equipeId).maybeSingle();
      this.coletorNome.set(data?.nome ?? '');
    }

    this.carregando.set(false);
  }

  /** O botão só faz sentido quando a coleta está marcada para hoje — é o que a Visão geral mostra. */
  readonly ehHoje = computed(() => this.solicitacao()?.dataAgendada === paraISO(new Date()));

  async desfazer(): Promise<void> {
    const s = this.solicitacao();
    if (!s) return;
    const { erro } = await this.store.desfazerAceite(s.id);
    if (erro) {
      this.toast.mostrar(erro);
      return;
    }
    this.toast.mostrar(`Aceite da coleta #${s.numero} desfeito — voltou para pendentes.`);
    this.router.navigate(['/cooperativa/solicitacoes']);
  }

  resumoDe(s: Solicitacao): string {
    return `#${s.numero} · ${s.solicitante} · ${s.distanciaKm.toFixed(1).replace('.', ',')} km${s.janela ? ' · ' + s.janela : ''}`;
  }
}
