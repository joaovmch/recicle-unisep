import { Component, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../supabase.service';
import { ToastService } from '../../../cooperativa/shared/toast.service';

type StatusCadastro = 'em_analise' | 'aprovado' | 'reprovado';
type Aba = 'todas' | StatusCadastro;

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

  readonly statusLabel: Record<StatusCadastro, string> = {
    em_analise: 'Em análise',
    aprovado: 'Aprovado',
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
  }

  fecharDetalhe(): void {
    this.detalheAberto.set(null);
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

    this.cooperativas.update(lista =>
      lista.map(c => (c.id === cooperativa.id ? { ...c, statusCadastro: status } : c))
    );
    if (this.detalheAberto()?.id === cooperativa.id) {
      this.detalheAberto.update(c => (c ? { ...c, statusCadastro: status } : c));
    }
    this.toast.mostrar(`${cooperativa.nome}: cadastro ${this.statusLabel[status].toLowerCase()}.`);
  }

  formatarData(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }
}
