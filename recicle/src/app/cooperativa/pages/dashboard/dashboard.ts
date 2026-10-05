import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Solicitacao, SolicitacoesStore } from '../../data/solicitacoes.store';
import { CooperativaService } from '../../data/cooperativa.service';
import { SupabaseService } from '../../../supabase.service';
import { formatarPreco, hojeISO } from '../../../shared/util/format';

interface MaterialBarra {
  material: string;
  kg: number;
}

interface ParadaRota {
  id: string;
  categoria: string;
  solicitante: string;
  janela: string;
  concluida: boolean;
  proxima: boolean;
}

function inicioDoMes(): Date {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
}

/** Segunda-feira da semana corrente, para o card "na agenda desta semana". */
function inicioDaSemana(): Date {
  const hoje = new Date();
  const diasDesdeSegunda = (hoje.getDay() + 6) % 7;
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diasDesdeSegunda);
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrls: ['../../../shared/ui/design-system.css', './dashboard.css'],
})
export class Dashboard {
  private readonly store = inject(SolicitacoesStore);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly client = inject(SupabaseService).client;
  private readonly router = inject(Router);

  readonly formatarPreco = formatarPreco;

  readonly hoje = maiuscula(
    new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  );
  readonly mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  readonly pendentes = this.store.pendentes;
  readonly aceitas = this.store.aceitas;
  readonly proximasPendentes = computed(() => this.pendentes().slice(0, 3));

  readonly textoPendentes = computed(() => {
    const total = this.pendentes().length;
    if (total === 0) return 'nenhum pedido esperando resposta.';
    return total === 1 ? '1 pedido esperando resposta.' : `${total} pedidos esperando resposta.`;
  });

  readonly pendenteMaisAntiga = computed(() => {
    const lista = this.pendentes();
    if (lista.length === 0) return null;
    return lista.reduce((antiga, s) => (new Date(s.criadoEm) < new Date(antiga.criadoEm) ? s : antiga));
  });

  readonly esperaDaMaisAntiga = computed(() => {
    const antiga = this.pendenteMaisAntiga();
    if (!antiga) return '';
    const horas = Math.max(0, Math.round((Date.now() - new Date(antiga.criadoEm).getTime()) / 3_600_000));
    if (horas < 1) return 'a mais antiga chegou agora';
    return horas === 1 ? 'a mais antiga há 1h' : `a mais antiga há ${horas}h`;
  });

  /** Aceitas com data marcada entre segunda e domingo desta semana. */
  readonly aceitasNaSemana = computed(() => {
    const inicio = paraISO(inicioDaSemana());
    const fim = paraISO(somarDias(inicioDaSemana(), 6));
    return this.aceitas().filter(s => s.dataAgendada && s.dataAgendada >= inicio && s.dataAgendada <= fim);
  });

  readonly concluidasDoMes = computed(() => {
    const desde = inicioDoMes();
    return this.store.concluidas().filter(s => s.confirmadoEm && new Date(s.confirmadoEm) >= desde);
  });

  readonly materialRecebidoMes = computed(() => {
    const kg = this.concluidasDoMes().reduce((total, s) => total + (s.dadosColeta?.pesoRecebidoKg ?? 0), 0);
    if (kg < 1000) return `${kg.toLocaleString('pt-BR')} kg`;
    return `${(kg / 1000).toFixed(1).replace('.', ',')} t`;
  });

  private readonly avaliacoes = computed(() =>
    this.store
      .concluidas()
      .map(s => s.avaliacaoNota)
      .filter((nota): nota is number => typeof nota === 'number')
  );
  readonly totalAvaliacoes = computed(() => this.avaliacoes().length);
  readonly mediaAvaliacao = computed(() => {
    const notas = this.avaliacoes();
    if (notas.length === 0) return null;
    return notas.reduce((total, nota) => total + nota, 0) / notas.length;
  });

  /** Tempo médio entre o pedido chegar e a cooperativa responder (aceitar ou recusar), no mês. */
  readonly tempoRespostaMedio = computed(() => {
    const respondidas = this.respondidasNoMes();
    if (respondidas.length === 0) return null;
    const mediaMinutos =
      respondidas.reduce((total, s) => {
        const diffMs = new Date(s.atualizadoEm).getTime() - new Date(s.criadoEm).getTime();
        return total + Math.max(0, diffMs) / 60_000;
      }, 0) / respondidas.length;

    if (mediaMinutos < 60) return `${Math.round(mediaMinutos)}min`;
    const horas = Math.floor(mediaMinutos / 60);
    const minutos = Math.round(mediaMinutos % 60);
    return `${horas}h${String(minutos).padStart(2, '0')}`;
  });

  private readonly respondidasNoMes = signal<{ criadoEm: string; atualizadoEm: string }[]>([]);

  readonly materialPorCategoria = signal<MaterialBarra[]>([]);
  readonly maiorMaterial = computed(() => Math.max(1, ...this.materialPorCategoria().map(m => m.kg)));

  readonly rotaDeHoje = signal<ParadaRota[]>([]);
  readonly bairroPrincipal = signal('');

  // ===== Agenda do próximo dia =====

  private readonly proximoDia = somarDias(new Date(), 1);
  readonly rotuloProximoDia = computed(() =>
    this.proximoDia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  );
  readonly capacidadeDiaria = computed(() => this.cooperativaService.cooperativa()?.coletasPorDia ?? 0);
  readonly capacidadeProximoDiaUsada = computed(() => {
    const dia = paraISO(this.proximoDia);
    return this.aceitas().filter(s => s.dataAgendada === dia).length;
  });
  readonly percentualCapacidade = computed(() => {
    const total = this.capacidadeDiaria();
    if (total <= 0) return 0;
    return Math.min(100, (this.capacidadeProximoDiaUsada() / total) * 100);
  });
  readonly textoCapacidade = computed(() => {
    const total = this.capacidadeDiaria();
    if (total <= 0) {
      return 'Defina quantas coletas cabem por dia em Equipe e veículos para acompanhar as vagas aqui.';
    }
    const vagas = Math.max(0, total - this.capacidadeProximoDiaUsada());
    const bairro = this.bairroPrincipal();
    const complemento = bairro
      ? ` A IA oferece essa data para quem pedir coleta no ${bairro}.`
      : ' Depois disso a IA passa a oferecer a data seguinte.';
    if (vagas === 0) return `Agenda cheia para esse dia.${complemento}`;
    return `${vagas === 1 ? 'Sobra 1 vaga' : `Sobram ${vagas} vagas`}.${complemento}`;
  });

  readonly nomeCurto = computed(() => {
    const nome = this.cooperativaService.cooperativa()?.nome ?? 'sua cooperativa';
    return nome.replace(/^cooperativa\s+/i, '');
  });

  constructor() {
    this.store.carregar();
    this.carregarIndicadores();
  }

  larguraBarra(kg: number): number {
    return Math.round((kg / this.maiorMaterial()) * 100);
  }

  resumoDe(s: Solicitacao): string {
    const partes = [
      s.categoria,
      `≈ ${s.pesoEstimadoKg} kg`,
      s.solicitante,
      s.bairro,
      `${s.distanciaKm.toFixed(1).replace('.', ',')} km`,
      s.janela,
    ];
    return partes.filter(Boolean).join(' · ');
  }

  /** O aceite e a recusa moram na tela de Solicitações — aqui o botão leva direto para o modal certo. */
  aceitar(s: Solicitacao): void {
    this.router.navigate(['/cooperativa/solicitacoes'], { queryParams: { acao: 'aceitar', id: s.id } });
  }

  recusar(s: Solicitacao): void {
    this.router.navigate(['/cooperativa/solicitacoes'], { queryParams: { acao: 'recusar', id: s.id } });
  }

  private async carregarIndicadores(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const desde = inicioDoMes().toISOString();
    const hoje = hojeISO();

    const [{ data: concluidasMes }, { data: respondidasMes }, { data: rota }, { data: bairros }] =
      await Promise.all([
        this.client
          .from('solicitacoes')
          .select('id')
          .eq('cooperativa_id', cooperativa.id)
          .eq('status', 'concluida')
          .gte('confirmado_em', desde),
        this.client
          .from('solicitacoes')
          .select('criado_em, atualizado_em')
          .eq('cooperativa_id', cooperativa.id)
          .in('status', ['aceita', 'concluida', 'recusada'])
          .gte('criado_em', desde),
        this.client
          .from('solicitacoes')
          .select('id, categoria, solicitante_nome, janela_confirmada, status')
          .eq('cooperativa_id', cooperativa.id)
          .eq('data_agendada', hoje)
          .order('janela_confirmada'),
        this.client
          .from('bairros_atendidos')
          .select('nome')
          .eq('cooperativa_id', cooperativa.id)
          .eq('atendido', true)
          .order('nome')
          .limit(1),
      ]);

    this.respondidasNoMes.set(
      (respondidasMes ?? []).map((r: any) => ({ criadoEm: r.criado_em, atualizadoEm: r.atualizado_em }))
    );
    this.bairroPrincipal.set(bairros?.[0]?.nome ?? '');

    const idsConcluidas = (concluidasMes ?? []).map((s: any) => s.id);
    if (idsConcluidas.length > 0) {
      const { data: triagem } = await this.client
        .from('solicitacao_triagem')
        .select('material, kg')
        .in('solicitacao_id', idsConcluidas);

      const porMaterial = new Map<string, number>();
      for (const t of triagem ?? []) {
        porMaterial.set(t.material, (porMaterial.get(t.material) ?? 0) + Number(t.kg));
      }
      this.materialPorCategoria.set(
        [...porMaterial.entries()]
          .map(([material, kg]) => ({ material, kg }))
          .sort((a, b) => b.kg - a.kg)
          .slice(0, 5)
      );
    }

    let proximaMarcada = false;
    this.rotaDeHoje.set(
      (rota ?? []).map((r: any) => {
        const concluida = r.status === 'concluida';
        const proxima = !concluida && !proximaMarcada;
        if (proxima) proximaMarcada = true;
        return {
          id: r.id,
          categoria: maiuscula(r.categoria ?? ''),
          solicitante: r.solicitante_nome,
          janela: r.janela_confirmada ?? '',
          concluida,
          proxima,
        };
      })
    );
  }
}
