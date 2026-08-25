import { Component, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../supabase.service';
import { ToastService } from '../../../cooperativa/shared/toast.service';
import { formatarData } from '../../../cooperativa/shared/format';
import {
  NOME_TIPO_DOCUMENTO,
  ordenarPorTipoDocumento,
  StatusDocumentoDb,
  TipoDocumentoDb,
} from '../../../cooperativa/shared/documento-tipos';

type StatusCadastro = 'em_analise' | 'aprovado' | 'reprovado';
type Aba = 'todas' | StatusCadastro;

interface DocumentoAdmin {
  id: string;
  tipo: TipoDocumentoDb;
  nome: string;
  nomeArquivo: string | null;
  arquivoUrl: string | null;
  status: StatusDocumentoDb;
  motivoRecusa: string | null;
}

function paraDocumentoAdmin(row: any): DocumentoAdmin {
  const tipo = row.tipo as TipoDocumentoDb;
  return {
    id: row.id,
    tipo,
    nome: tipo === 'outro' ? row.nome_arquivo ?? 'Documento' : NOME_TIPO_DOCUMENTO[tipo],
    nomeArquivo: row.nome_arquivo,
    arquivoUrl: row.arquivo_url,
    status: row.status,
    motivoRecusa: row.motivo_recusa,
  };
}

interface CooperativaAdmin {
  id: string;
  nome: string;
  tipo: string;
  cnpj: string;
  responsavelNome: string;
  responsavelEmail: string;
  responsavelTelefone: string | null;
  cidade: string | null;
  uf: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  raioKm: number;
  pesoMaximoKg: number;
  statusCadastro: StatusCadastro;
  criadoEm: string;
}

function paraCooperativaAdmin(row: any): CooperativaAdmin {
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo,
    cnpj: row.cnpj,
    responsavelNome: row.responsavel_nome,
    responsavelEmail: row.responsavel_email,
    responsavelTelefone: row.responsavel_telefone,
    cidade: row.cidade,
    uf: row.uf,
    rua: row.rua,
    numero: row.numero,
    bairro: row.bairro,
    raioKm: Number(row.raio_km),
    pesoMaximoKg: Number(row.peso_maximo_kg),
    statusCadastro: row.status_cadastro,
    criadoEm: row.criado_em,
  };
}

@Component({
  selector: 'app-admin-cooperativas',
  imports: [],
  templateUrl: './cooperativas.html',
  styleUrls: ['../../../cooperativa/shared/cooperativa-shared.css'],
})
export class Cooperativas {
  private readonly client = inject(SupabaseService).client;
  private readonly toast = inject(ToastService);

  readonly abaAtiva = signal<Aba>('todas');
  private readonly cooperativas = signal<CooperativaAdmin[]>([]);
  readonly carregando = signal(true);

  readonly listaAtiva = computed(() => {
    const aba = this.abaAtiva();
    if (aba === 'todas') return this.cooperativas();
    return this.cooperativas().filter(c => c.statusCadastro === aba);
  });

  readonly detalheAberto = signal<CooperativaAdmin | null>(null);
  readonly documentosDetalhe = signal<DocumentoAdmin[]>([]);
  readonly carregandoDocumentos = signal(false);

  readonly statusLabel: Record<StatusCadastro, string> = {
    em_analise: 'Em análise',
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
  };

  readonly statusDocumentoLabel: Record<StatusDocumentoDb, string> = {
    nao_enviado: 'Não enviado',
    em_analise: 'Em conferência',
    validado: 'Validado',
    reprovado: 'Reprovado',
  };

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    this.carregando.set(true);
    const { data } = await this.client.from('cooperativas').select('*').order('criado_em', { ascending: false });
    this.cooperativas.set((data ?? []).map(paraCooperativaAdmin));
    this.carregando.set(false);
  }

  setAba(aba: Aba): void {
    this.abaAtiva.set(aba);
  }

  abrirDetalhe(cooperativa: CooperativaAdmin): void {
    this.detalheAberto.set(cooperativa);
    this.carregarDocumentos(cooperativa.id);
  }

  fecharDetalhe(): void {
    this.detalheAberto.set(null);
    this.documentosDetalhe.set([]);
  }

  private async carregarDocumentos(cooperativaId: string): Promise<void> {
    this.carregandoDocumentos.set(true);
    const { data } = await this.client.from('documentos').select('*').eq('cooperativa_id', cooperativaId);
    this.documentosDetalhe.set(ordenarPorTipoDocumento(data ?? []).map(paraDocumentoAdmin));
    this.carregandoDocumentos.set(false);
  }

  async verDocumento(doc: DocumentoAdmin): Promise<void> {
    if (!doc.arquivoUrl) return;
    const { data } = await this.client.storage.from('documentos-cooperativa').createSignedUrl(doc.arquivoUrl, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async validarDocumento(doc: DocumentoAdmin): Promise<void> {
    const { error } = await this.client
      .from('documentos')
      .update({ status: 'validado', motivo_recusa: null })
      .eq('id', doc.id);
    if (error) {
      this.toast.mostrar('Não foi possível validar esse documento.');
      return;
    }
    this.documentosDetalhe.update(lista =>
      lista.map(d => (d.id === doc.id ? { ...d, status: 'validado', motivoRecusa: null } : d))
    );
    this.toast.mostrar(`${doc.nome}: validado.`);
  }

  async reprovarDocumento(doc: DocumentoAdmin): Promise<void> {
    const motivo = window.prompt(`Por que "${doc.nome}" está sendo reprovado? (a cooperativa vai ver esse texto)`);
    if (motivo === null) return;

    const { error } = await this.client
      .from('documentos')
      .update({ status: 'reprovado', motivo_recusa: motivo.trim() || null })
      .eq('id', doc.id);
    if (error) {
      this.toast.mostrar('Não foi possível reprovar esse documento.');
      return;
    }
    this.documentosDetalhe.update(lista =>
      lista.map(d => (d.id === doc.id ? { ...d, status: 'reprovado', motivoRecusa: motivo.trim() || null } : d))
    );
    this.toast.mostrar(`${doc.nome}: reprovado.`);
  }

  async definirStatus(cooperativa: CooperativaAdmin, status: StatusCadastro): Promise<void> {
    const { error } = await this.client
      .from('cooperativas')
      .update({ status_cadastro: status })
      .eq('id', cooperativa.id);

    if (error) {
      this.toast.mostrar('Não foi possível atualizar o status.');
      return;
    }

    await this.client.from('cooperativa_eventos').insert({
      cooperativa_id: cooperativa.id,
      titulo: `Cadastro marcado como "${this.statusLabel[status]}" pelo admin`,
    });

    // Aprovar o cadastro inteiro também valida de uma vez os documentos que ainda
    // estavam em conferência — não obriga o admin a validar item por item antes.
    if (status === 'aprovado') {
      await this.client
        .from('documentos')
        .update({ status: 'validado' })
        .eq('cooperativa_id', cooperativa.id)
        .eq('status', 'em_analise');

      if (this.detalheAberto()?.id === cooperativa.id) {
        this.documentosDetalhe.update(lista =>
          lista.map(d => (d.status === 'em_analise' ? { ...d, status: 'validado' } : d))
        );
      }
    }

    this.cooperativas.update(lista =>
      lista.map(c => (c.id === cooperativa.id ? { ...c, statusCadastro: status } : c))
    );
    if (this.detalheAberto()?.id === cooperativa.id) {
      this.detalheAberto.update(c => (c ? { ...c, statusCadastro: status } : c));
    }
    this.toast.mostrar(`${cooperativa.nome}: cadastro ${this.statusLabel[status].toLowerCase()}.`);
  }

  readonly formatarData = formatarData;
}
