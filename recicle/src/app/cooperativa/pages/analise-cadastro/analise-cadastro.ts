import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../shared/data/auth.service';
import { CooperativaService } from '../../data/cooperativa.service';
import { SupabaseService } from '../../../supabase.service';
import { NOME_TIPO_DOCUMENTO, ordenarPorTipoDocumento, TipoDocumentoDb } from '../../shared/documento-tipos';

/** Reconferido nesse intervalo pra tela sair sozinha de "em análise" assim que o admin aprovar ou reprovar. */
const INTERVALO_VERIFICACAO_MS = 10_000;

type StatusDocumentoAnalise = 'em-conferencia' | 'validado' | 'reprovado';

interface DocumentoAnalise {
  nome: string;
  status: StatusDocumentoAnalise;
  motivo: string | null;
}

@Component({
  selector: 'app-analise-cadastro',
  imports: [RouterLink],
  templateUrl: './analise-cadastro.html',
  styleUrls: ['../../../shared/ui/design-system.css', './analise-cadastro.css'],
})
export class AnaliseCadastro {
  private readonly auth = inject(AuthService);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly client = inject(SupabaseService).client;

  readonly documentos = signal<DocumentoAnalise[]>([]);

  /** Hora real do envio (criado_em da cooperativa) — não pode mudar a cada F5. */
  readonly enviadoEm = computed(() => {
    const iso = this.cooperativaService.cooperativa()?.criadoEm;
    if (!iso) return '';

    const data = new Date(iso);
    const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const mesmoDia = data.toDateString() === new Date().toDateString();
    return mesmoDia ? `hoje, ${hora}` : `${data.toLocaleDateString('pt-BR')}, ${hora}`;
  });

  readonly reprovado = computed(() => this.cooperativaService.cooperativa()?.statusCadastro === 'reprovado');
  readonly aprovado = computed(() => this.cooperativaService.cooperativa()?.statusCadastro === 'aprovado');
  readonly algumDocumentoReprovado = computed(() => this.documentos().some(d => d.status === 'reprovado'));

  readonly statusLabel: Record<StatusDocumentoAnalise, string> = {
    'em-conferencia': 'Em conferência',
    validado: 'Validado',
    reprovado: 'Reprovado',
  };

  constructor() {
    this.verificarStatus();

    const intervalId = setInterval(() => this.verificarStatus(), INTERVALO_VERIFICACAO_MS);
    this.destroyRef.onDestroy(() => clearInterval(intervalId));
  }

  /**
   * Reconfere status do cadastro e dos documentos no Supabase. Se o admin aprovou (ou
   * validou/reprovou algum documento) enquanto a pessoa estava parada nessa tela, os sinais
   * são atualizados e a UI (incluindo os 3 estágios do progresso) reage sozinha. Não navega
   * pro painel automaticamente — quem decide ir é a pessoa, clicando no botão que aparece
   * quando `aprovado()` vira true.
   */
  private async verificarStatus(): Promise<void> {
    const sessao = await this.auth.sessaoAtual();
    if (!sessao) return;

    const cooperativa = await this.cooperativaService.carregar();
    if (!cooperativa) {
      // Sessão válida mas sem cadastro associado (ex.: um envio anterior travou antes
      // de gravar a linha) — não faz sentido continuar mostrando "em análise".
      this.router.navigate(['/cooperativa/cadastro']);
      return;
    }

    const { data } = await this.client
      .from('documentos')
      .select('tipo, status, motivo_recusa')
      .eq('cooperativa_id', cooperativa.id)
      .neq('tipo', 'outro');

    this.documentos.set(
      ordenarPorTipoDocumento(data ?? []).map((d: any) => ({
        nome: NOME_TIPO_DOCUMENTO[d.tipo as Exclude<TipoDocumentoDb, 'outro'>] ?? d.tipo,
        status: d.status === 'validado' || d.status === 'reprovado' ? d.status : 'em-conferencia',
        motivo: d.motivo_recusa ?? null,
      }))
    );
  }

  async sair(): Promise<void> {
    await this.auth.sair();
    this.router.navigate(['/cooperativa/entrar']);
  }
}
