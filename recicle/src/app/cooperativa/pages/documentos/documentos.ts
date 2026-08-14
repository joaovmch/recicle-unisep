import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/toast.service';

type StatusDocumento = 'validado' | 'em-analise' | 'nao-enviado';
type IconeDocumento = 'doc' | 'clock' | 'upload';

interface Documento {
  nome: string;
  meta: string;
  status: StatusDocumento;
  acaoLabel: string;
  icone: IconeDocumento;
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

const DOCUMENTOS_INICIAL: Documento[] = [
  {
    nome: 'Licença ambiental de operação',
    meta: '',
    status: 'nao-enviado',
    acaoLabel: 'Enviar',
    icone: 'upload',
  },
  {
    nome: 'Licença para resíduo perigoso',
    meta: '',
    status: 'nao-enviado',
    acaoLabel: 'Enviar',
    icone: 'upload',
  },
  {
    nome: 'Cartão CNPJ',
    meta: '',
    status: 'nao-enviado',
    acaoLabel: 'Enviar',
    icone: 'upload',
  },
  {
    nome: 'Ata de eleição da diretoria',
    meta: '',
    status: 'nao-enviado',
    acaoLabel: 'Enviar',
    icone: 'upload',
  },
  {
    nome: 'Comprovante de endereço do galpão',
    meta: 'opcional · ajuda quando a licença estiver perto de vencer',
    status: 'nao-enviado',
    acaoLabel: 'Enviar',
    icone: 'upload',
  },
];

const ANALISE_CONFERE: ItemAnalise[] = [
  { titulo: 'CNPJ ativo', descricao: 'situação cadastral na Receita Federal' },
  { titulo: 'Licença dentro da validade', descricao: 'número conferido no sistema do órgão emissor' },
  { titulo: 'Resíduo x licença', descricao: 'se o que vocês marcaram está autorizado no documento' },
];

const HISTORICO: EventoHistorico[] = [];

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

  @ViewChild('listaDocumentos') private listaDocumentosRef?: ElementRef<HTMLElement>;

  readonly documentos = signal(DOCUMENTOS_INICIAL);
  readonly analiseConfere = ANALISE_CONFERE;
  readonly historico = HISTORICO;

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

  acionarNovoDocumento(inputRef: HTMLInputElement): void {
    this.uploadAlvo = 'novo';
    inputRef.value = '';
    inputRef.click();
  }

  acaoDocumento(doc: Documento, index: number, inputRef: HTMLInputElement): void {
    if (doc.acaoLabel === 'Ver arquivo') {
      this.toast.mostrar('Documento em conferência — aguarde o retorno da equipe.');
      return;
    }
    this.uploadAlvo = index;
    inputRef.value = '';
    inputRef.click();
  }

  arquivoSelecionado(event: Event): void {
    const arquivo = (event.target as HTMLInputElement).files?.[0];
    if (!arquivo || this.uploadAlvo === null) return;

    const meta = `${formatarTamanho(arquivo.size)} · enviado agora`;

    if (this.uploadAlvo === 'novo') {
      this.documentos.update(lista => [
        ...lista,
        { nome: arquivo.name, meta, status: 'em-analise', acaoLabel: 'Ver arquivo', icone: 'clock' },
      ]);
    } else {
      const index = this.uploadAlvo;
      this.documentos.update(lista =>
        lista.map((d, i) =>
          i === index ? { ...d, nome: arquivo.name, meta, status: 'em-analise', acaoLabel: 'Ver arquivo' } : d
        )
      );
    }

    this.toast.mostrar(`${arquivo.name} enviado para análise.`);
    this.uploadAlvo = null;
  }

  verOQueEnviamos(): void {
    this.listaDocumentosRef?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.destacarEmAnalise.set(true);
    setTimeout(() => this.destacarEmAnalise.set(false), 1800);
  }
}
