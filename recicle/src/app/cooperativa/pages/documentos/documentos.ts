import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';

type StatusDocumento = 'validado' | 'em-analise' | 'nao-enviado';
type IconeDocumento = 'doc' | 'clock' | 'upload';
type TipoDocumentoDb =
  | 'licenca_operacao'
  | 'licenca_residuo_perigoso'
  | 'cartao_cnpj'
  | 'ata_eleicao_diretoria'
  | 'comprovante_endereco'
  | 'outro';

interface Documento {
  id: string | null;
  tipo: TipoDocumentoDb;
  nome: string;
  meta: string;
  status: StatusDocumento;
  acaoLabel: string;
  icone: IconeDocumento;
  caminhoArquivo: string | null;
}

interface ItemAnalise {
  titulo: string;
  descricao: string;
}

interface EventoHistorico {
  titulo: string;
  data: string;
  autor?: string;
  recente: boolean;
}

const TIPOS_FIXOS: { tipo: TipoDocumentoDb; nome: string; metaVazia: string }[] = [
  { tipo: 'licenca_operacao', nome: 'Licença ambiental de operação', metaVazia: '' },
  { tipo: 'licenca_residuo_perigoso', nome: 'Licença para resíduo perigoso', metaVazia: '' },
  { tipo: 'cartao_cnpj', nome: 'Cartão CNPJ', metaVazia: '' },
  { tipo: 'ata_eleicao_diretoria', nome: 'Ata de eleição da diretoria', metaVazia: '' },
  {
    tipo: 'comprovante_endereco',
    nome: 'Comprovante de endereço do galpão',
    metaVazia: 'opcional · ajuda quando a licença estiver perto de vencer',
  },
];

const STATUS_DB_PARA_UI: Record<string, StatusDocumento> = {
  validado: 'validado',
  em_analise: 'em-analise',
  nao_enviado: 'nao-enviado',
};

const ANALISE_CONFERE: ItemAnalise[] = [
  { titulo: 'CNPJ ativo', descricao: 'situação cadastral na Receita Federal' },
  { titulo: 'Licença dentro da validade', descricao: 'número conferido no sistema do órgão emissor' },
  { titulo: 'Resíduo x licença', descricao: 'se o que vocês marcaram está autorizado no documento' },
];

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

@Component({
  selector: 'app-documentos',
  imports: [],
  templateUrl: './documentos.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './documentos.css'],
})
export class Documentos {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  @ViewChild('listaDocumentos') private listaDocumentosRef?: ElementRef<HTMLElement>;

  readonly documentos = signal<Documento[]>([]);
  readonly analiseConfere = ANALISE_CONFERE;
  readonly historico = signal<EventoHistorico[]>([]);

  readonly avisoEmail = signal(true);
  readonly avisoWhatsapp = signal(true);
  readonly avisoPainel = signal(true);

  readonly destacarEmAnalise = signal(false);

  readonly statusLabel: Record<StatusDocumento, string> = {
    validado: 'Validado',
    'em-analise': 'Em análise',
    'nao-enviado': 'Não enviado',
  };

  private uploadAlvo: number | 'novo' | null = null;

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
        };
      }
      const status = STATUS_DB_PARA_UI[row.status] ?? 'nao-enviado';
      return {
        id: row.id,
        tipo: fixo.tipo,
        nome: row.nome_arquivo ?? fixo.nome,
        meta: row.tamanho_bytes ? `${formatarTamanho(row.tamanho_bytes)} · enviado` : fixo.metaVazia,
        status,
        acaoLabel: status === 'nao-enviado' ? 'Enviar' : 'Ver arquivo',
        icone: status === 'em-analise' ? 'clock' : status === 'validado' ? 'doc' : 'upload',
        caminhoArquivo: row.arquivo_url,
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
          meta: row.tamanho_bytes ? `${formatarTamanho(row.tamanho_bytes)} · enviado` : '',
          status,
          acaoLabel: 'Ver arquivo',
          icone: status === 'em-analise' ? ('clock' as const) : ('doc' as const),
          caminhoArquivo: row.arquivo_url,
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

  acionarNovoDocumento(inputRef: HTMLInputElement): void {
    this.uploadAlvo = 'novo';
    inputRef.value = '';
    inputRef.click();
  }

  async acaoDocumento(doc: Documento, index: number, inputRef: HTMLInputElement): Promise<void> {
    if (doc.acaoLabel === 'Ver arquivo') {
      if (doc.caminhoArquivo) {
        const { data } = await this.client.storage
          .from('documentos-cooperativa')
          .createSignedUrl(doc.caminhoArquivo, 60);
        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
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

    const alvo = this.uploadAlvo;
    this.uploadAlvo = null;

    const documentoAtual = alvo === 'novo' ? null : this.documentos()[alvo];
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
      enviado_em: new Date().toISOString(),
    };

    if (tipo === 'outro') {
      await this.client.from('documentos').insert(payload);
    } else {
      await this.client.from('documentos').upsert(payload, { onConflict: 'cooperativa_id,tipo' });
    }

    await this.client.from('cooperativa_eventos').insert({
      cooperativa_id: cooperativa.id,
      titulo: `Documento enviado: ${arquivo.name}`,
    });

    this.toast.mostrar(`${arquivo.name} enviado para análise.`);
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
