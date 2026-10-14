import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../../shared/ui/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';
import { erroArquivoInvalido, formatarTamanhoArquivo } from '../../../shared/util/upload';
import { lerMesAno, licencaVencida } from '../../../shared/util/validators';
import { NOME_TIPO_DOCUMENTO, TipoDocumentoDb } from '../../shared/documento-tipos';

type StatusDocumento = 'validado' | 'em-analise' | 'nao-enviado' | 'reprovado';
type IconeDocumento = 'doc' | 'clock' | 'upload';

interface Documento {
  id: string | null;
  tipo: TipoDocumentoDb;
  nome: string;
  meta: string;
  status: StatusDocumento;
  acaoLabel: string;
  icone: IconeDocumento;
  caminhoArquivo: string | null;
  motivoRecusa: string | null;
}

interface EventoHistorico {
  titulo: string;
  data: string;
  autor?: string;
  recente: boolean;
}

const TIPOS_FIXOS: { tipo: TipoDocumentoDb; nome: string; metaVazia: string }[] = [
  { tipo: 'licenca_operacao', nome: NOME_TIPO_DOCUMENTO.licenca_operacao, metaVazia: '' },
  { tipo: 'licenca_residuo_perigoso', nome: NOME_TIPO_DOCUMENTO.licenca_residuo_perigoso, metaVazia: '' },
  { tipo: 'cartao_cnpj', nome: NOME_TIPO_DOCUMENTO.cartao_cnpj, metaVazia: '' },
  { tipo: 'ata_eleicao_diretoria', nome: NOME_TIPO_DOCUMENTO.ata_eleicao_diretoria, metaVazia: '' },
  {
    tipo: 'comprovante_endereco',
    nome: NOME_TIPO_DOCUMENTO.comprovante_endereco,
    metaVazia: 'Opcional · ajuda quando a licença estiver perto de vencer',
  },
];

/** Tipos que o responsável pode enviar pelo painel (US13, campos obrigatórios). */
const TIPOS_ENVIAVEIS: { valor: TipoDocumentoDb | 'renovacao_licenca'; label: string }[] = [
  { valor: 'renovacao_licenca', label: 'Renovação da licença' },
  { valor: 'ata_eleicao_diretoria', label: 'Estatuto social ou ata de constituição' },
  { valor: 'cartao_cnpj', label: 'Cartão CNPJ' },
  { valor: 'comprovante_endereco', label: 'Documento do responsável' },
];

/** A partir de quantos dias antes do vencimento o painel cobra a renovação (US13). */
const AVISO_RENOVACAO_DIAS = 60;

const STATUS_DB_PARA_UI: Record<string, StatusDocumento> = {
  validado: 'validado',
  em_analise: 'em-analise',
  nao_enviado: 'nao-enviado',
  reprovado: 'reprovado',
};

@Component({
  selector: 'app-documentos',
  imports: [],
  templateUrl: './documentos.html',
  styleUrls: ['../../../shared/ui/design-system.css', './documentos.css'],
})
export class Documentos {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  @ViewChild('listaDocumentos') private listaDocumentosRef?: ElementRef<HTMLElement>;

  readonly documentos = signal<Documento[]>([]);
  readonly historico = signal<EventoHistorico[]>([]);

  readonly avisoEmail = signal(true);
  readonly avisoWhatsapp = signal(true);
  readonly avisoPainel = signal(true);

  readonly destacarEmAnalise = signal(false);

  readonly statusLabel: Record<StatusDocumento, string> = {
    validado: 'Validado',
    'em-analise': 'Em análise',
    'nao-enviado': 'Não enviado',
    reprovado: 'Reprovado',
  };

  readonly licencaOperacaoStatus = computed<StatusDocumento>(
    () => this.documentos().find(d => d.tipo === 'licenca_operacao')?.status ?? 'nao-enviado'
  );

  readonly licencaOperacaoTitulo: Record<StatusDocumento, string> = {
    validado: 'Validada',
    'em-analise': 'Em análise',
    'nao-enviado': 'Ainda não enviada',
    reprovado: 'Reprovada — reenvie',
  };

  readonly cooperativa = this.cooperativaService.cooperativa;

  /** A licença de operação ganhou card próprio no topo — estes atalhos apontam para ela. */
  readonly licencaDoc = computed(() => this.documentos().find(d => d.tipo === 'licenca_operacao') ?? null);

  readonly licencaValidadeFormatada = computed(() => {
    const bruto = this.cooperativa()?.licencaValidade;
    if (!bruto) return '—';
    const validade = lerMesAno(bruto);
    return validade ? `${String(validade.mes).padStart(2, '0')}/${validade.ano}` : bruto;
  });

  readonly tiposEnviaveis = TIPOS_ENVIAVEIS;

  /**
   * Quantos dias faltam para a licença vencer. Null quando não há validade cadastrada
   * ou quando ela não está em formato legível.
   */
  readonly diasParaVencer = computed(() => {
    const validade = lerMesAno(this.cooperativa()?.licencaValidade);
    if (!validade) return null;
    // A licença vale até o último dia do mês informado.
    const fim = new Date(validade.ano, validade.mes, 0, 23, 59, 59);
    return Math.ceil((fim.getTime() - Date.now()) / 86_400_000);
  });

  readonly licencaVencida = computed(() => {
    const validade = lerMesAno(this.cooperativa()?.licencaValidade);
    return validade ? licencaVencida(validade) : false;
  });

  readonly avisoRenovacao = computed(() => {
    const dias = this.diasParaVencer();
    if (dias === null) return '';
    if (dias < 0) {
      return 'A licença está vencida. Enquanto a renovação não for enviada e conferida, a cooperativa não recebe pedidos novos — as coletas já aceitas continuam.';
    }
    if (dias <= AVISO_RENOVACAO_DIAS) {
      return `A licença vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}. Envie a renovação para não parar de receber pedidos.`;
    }
    return '';
  });

  readonly totalEntregues = computed(() => this.documentos().filter(d => d.status !== 'nao-enviado').length);
  readonly todosEntregues = computed(
    () => this.documentos().length > 0 && this.totalEntregues() === this.documentos().length
  );

  async verArquivoLicenca(inputRef: HTMLInputElement): Promise<void> {
    const indice = this.documentos().findIndex(d => d.tipo === 'licenca_operacao');
    const doc = this.documentos()[indice];
    if (!doc) return;
    await this.acaoDocumento({ ...doc, acaoLabel: 'Ver arquivo' }, indice, inputRef);
  }

  // ===== Enviar documento (US13, passos 3 a 8) =====

  readonly modalEnvioAberto = signal(false);
  readonly tipoEscolhido = signal<string>(TIPOS_ENVIAVEIS[0].valor);
  readonly licencaNumeroNovo = signal('');
  readonly licencaOrgaoNovo = signal('');
  readonly licencaValidadeNova = signal('');
  readonly resumoEnvio = signal('');

  readonly ehRenovacao = computed(() => this.tipoEscolhido() === 'renovacao_licenca');

  /** A validade da renovação precisa ser um mês posterior ao atual (US13). */
  readonly erroValidade = computed(() => {
    if (!this.ehRenovacao()) return '';
    const validade = lerMesAno(this.licencaValidadeNova());
    if (!validade) return 'Informe a validade no formato MM/AAAA.';
    const agora = new Date();
    const posterior =
      validade.ano > agora.getFullYear() ||
      (validade.ano === agora.getFullYear() && validade.mes > agora.getMonth() + 1);
    return posterior ? '' : 'A validade precisa ser posterior ao mês atual.';
  });

  readonly envioIncompleto = computed(() => {
    if (!this.ehRenovacao()) return false;
    return !this.licencaNumeroNovo().trim() || !this.licencaOrgaoNovo().trim() || !!this.erroValidade();
  });

  abrirEnvio(tipoInicial?: string): void {
    this.tipoEscolhido.set(tipoInicial ?? TIPOS_ENVIAVEIS[0].valor);
    const cooperativa = this.cooperativa();
    this.licencaNumeroNovo.set(cooperativa?.licencaNumero ?? '');
    this.licencaOrgaoNovo.set(cooperativa?.licencaOrgao ?? '');
    this.licencaValidadeNova.set('');
    this.resumoEnvio.set('');
    this.modalEnvioAberto.set(true);
  }

  fecharEnvio(): void {
    this.modalEnvioAberto.set(false);
    this.resumoEnvio.set('');
  }

  enviarRenovacao(): void {
    this.abrirEnvio('renovacao_licenca');
  }

  /** Dispara o seletor de arquivo já sabendo em qual documento o upload vai cair. */
  escolherArquivoDoEnvio(inputRef: HTMLInputElement): void {
    if (this.envioIncompleto()) {
      this.toast.mostrar(this.erroValidade() || 'Preencha os dados da licença antes de enviar o arquivo.');
      return;
    }

    const tipo: TipoDocumentoDb =
      this.tipoEscolhido() === 'renovacao_licenca' ? 'licenca_operacao' : (this.tipoEscolhido() as TipoDocumentoDb);

    const indice = this.documentos().findIndex(d => d.tipo === tipo);
    if (indice < 0) return;

    this.uploadAlvo = indice;
    inputRef.value = '';
    inputRef.click();
  }

  private uploadAlvo: number | null = null;

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    this.avisoEmail.set(cooperativa.avisoEmail);
    this.avisoWhatsapp.set(cooperativa.avisoWhatsapp);
    this.avisoPainel.set(cooperativa.avisoPainel);

    const [{ data: docRows }, { data: eventoRows }] = await Promise.all([
      this.client.from('documentos').select('*').eq('cooperativa_id', cooperativa.id),
      this.client
        .from('cooperativa_eventos')
        .select('*')
        .eq('cooperativa_id', cooperativa.id)
        .order('criado_em', { ascending: false })
        .limit(20),
    ]);

    const porTipo = new Map((docRows ?? []).map((d: any) => [d.tipo, d]));

    const fixos: Documento[] = TIPOS_FIXOS.map(fixo => {
      const row = porTipo.get(fixo.tipo);
      if (!row) {
        return {
          id: null,
          tipo: fixo.tipo,
          nome: fixo.nome,
          meta: fixo.metaVazia,
          status: 'nao-enviado',
          acaoLabel: 'Enviar',
          icone: 'upload',
          caminhoArquivo: null,
          motivoRecusa: null,
        };
      }
      const status = STATUS_DB_PARA_UI[row.status] ?? 'nao-enviado';
      return {
        id: row.id,
        tipo: fixo.tipo,
        nome: row.nome_arquivo ?? fixo.nome,
        meta: row.tamanho_bytes ? `${formatarTamanhoArquivo(row.tamanho_bytes)} · enviado` : fixo.metaVazia,
        status,
        acaoLabel: status === 'nao-enviado' || status === 'reprovado' ? 'Enviar' : 'Ver arquivo',
        icone: status === 'em-analise' ? 'clock' : status === 'validado' ? 'doc' : 'upload',
        caminhoArquivo: row.arquivo_url,
        motivoRecusa: row.motivo_recusa ?? null,
      };
    });

    const avulsos: Documento[] = (docRows ?? [])
      .filter((d: any) => d.tipo === 'outro')
      .map((row: any) => {
        const status = STATUS_DB_PARA_UI[row.status] ?? 'nao-enviado';
        return {
          id: row.id,
          tipo: 'outro' as const,
          nome: row.nome_arquivo ?? 'Documento',
          meta: row.tamanho_bytes ? `${formatarTamanhoArquivo(row.tamanho_bytes)} · enviado` : '',
          status,
          acaoLabel: 'Ver arquivo',
          icone: status === 'em-analise' ? ('clock' as const) : ('doc' as const),
          caminhoArquivo: row.arquivo_url,
          motivoRecusa: row.motivo_recusa ?? null,
        };
      });

    this.documentos.set([...fixos, ...avulsos]);

    this.historico.set(
      (eventoRows ?? []).map((e: any, i: number) => ({
        titulo: e.titulo,
        data: new Date(e.criado_em).toLocaleDateString('pt-BR'),
        autor: e.autor_nome ?? undefined,
        recente: i === 0,
      }))
    );
  }

  async acaoDocumento(doc: Documento, index: number, inputRef: HTMLInputElement): Promise<void> {
    if (doc.acaoLabel === 'Ver arquivo') {
      if (doc.caminhoArquivo) {
        const { data } = await this.client.storage
          .from('documentos-cooperativa')
          .createSignedUrl(doc.caminhoArquivo, 60);
        if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        this.toast.mostrar('Documento em conferência — aguarde o retorno da equipe.');
      }
      return;
    }
    this.uploadAlvo = index;
    inputRef.value = '';
    inputRef.click();
  }

  async arquivoSelecionado(event: Event): Promise<void> {
    const arquivo = (event.target as HTMLInputElement).files?.[0];
    const cooperativa = this.cooperativaService.cooperativa();
    if (!arquivo || this.uploadAlvo === null || !cooperativa) return;

    const erroArquivo = erroArquivoInvalido(arquivo);
    if (erroArquivo) {
      this.toast.mostrar(erroArquivo);
      this.uploadAlvo = null;
      return;
    }

    const alvo = this.uploadAlvo;
    this.uploadAlvo = null;

    const documentoAtual = this.documentos()[alvo];
    const tipo: TipoDocumentoDb = documentoAtual?.tipo ?? 'outro';
    const caminho = `${cooperativa.id}/${Date.now()}-${arquivo.name}`;

    const { error: uploadError } = await this.client.storage
      .from('documentos-cooperativa')
      .upload(caminho, arquivo, { upsert: true });

    if (uploadError) {
      this.toast.mostrar('Não foi possível enviar o arquivo.');
      return;
    }

    const payload = {
      cooperativa_id: cooperativa.id,
      tipo,
      nome_arquivo: arquivo.name,
      arquivo_url: caminho,
      tamanho_bytes: arquivo.size,
      status: 'em_analise',
      motivo_recusa: null,
      enviado_em: new Date().toISOString(),
    };

    const { error: erroRegistro } =
      tipo === 'outro'
        ? await this.client.from('documentos').insert(payload)
        : await this.client.from('documentos').upsert(payload, { onConflict: 'cooperativa_id,tipo' });

    if (erroRegistro) {
      // O arquivo subiu mas a linha não: remove do bucket para não sobrar arquivo órfão.
      await this.client.storage.from('documentos-cooperativa').remove([caminho]);
      this.toast.mostrar('Não foi possível registrar o documento. Tente novamente.');
      return;
    }

    await this.client.from('cooperativa_eventos').insert({
      cooperativa_id: cooperativa.id,
      titulo: `Documento enviado: ${arquivo.name}`,
    });

    // Renovação também atualiza os dados da licença no cadastro.
    if (this.ehRenovacao() && tipo === 'licenca_operacao') {
      await this.cooperativaService.atualizar({
        licenca_numero: this.licencaNumeroNovo().trim(),
        licenca_orgao: this.licencaOrgaoNovo().trim(),
        licenca_validade: this.licencaValidadeNova().trim(),
      });
    }

    // Passo 8: resumo do envio com o prazo de conferência.
    this.resumoEnvio.set(
      `${arquivo.name} (${formatarTamanhoArquivo(arquivo.size)}) enviado em ${new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })}. A equipe do Re-cicle confere em até 2 dias úteis.`
    );

    await this.carregar();
  }

  verOQueEnviamos(): void {
    this.listaDocumentosRef?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.destacarEmAnalise.set(true);
    setTimeout(() => this.destacarEmAnalise.set(false), 1800);
  }

  async atualizarAvisoEmail(): Promise<void> {
    this.avisoEmail.set(!this.avisoEmail());
    await this.cooperativaService.atualizar({ aviso_email: this.avisoEmail() });
  }

  async atualizarAvisoWhatsapp(): Promise<void> {
    this.avisoWhatsapp.set(!this.avisoWhatsapp());
    await this.cooperativaService.atualizar({ aviso_whatsapp: this.avisoWhatsapp() });
  }

  async atualizarAvisoPainel(): Promise<void> {
    this.avisoPainel.set(!this.avisoPainel());
    await this.cooperativaService.atualizar({ aviso_painel: this.avisoPainel() });
  }
}
