import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';

export interface Ecoponto {
  id: string;
  nome: string;
  tipo: 'publico' | 'cooperativa';
  cooperativaId: string | null;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  latitude: number | null;
  longitude: number | null;
  horario: string | null;
  telefone: string | null;
  aceita: string[];
}

function paraEcoponto(row: any): Ecoponto {
  const numero = row.numero ? `, ${row.numero}` : '';
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo,
    cooperativaId: row.cooperativa_id,
    endereco: `${row.rua}${numero}`,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    horario: row.horario,
    telefone: row.telefone,
    aceita: (row.ecoponto_tipos_residuo ?? [])
      .map((t: any) => t.tipos_residuo?.nome)
      .filter((n: unknown): n is string => !!n),
  };
}

@Injectable({ providedIn: 'root' })
export class EcopontosStore {
  private readonly client = inject(SupabaseService).client;

  private readonly _ecopontos = signal<Ecoponto[]>([]);
  readonly ecopontos = this._ecopontos.asReadonly();
  readonly carregando = signal(false);

  async carregar(): Promise<void> {
    this.carregando.set(true);
    const { data } = await this.client
      .from('ecopontos')
      .select('*, ecoponto_tipos_residuo(tipos_residuo(nome))')
      .eq('ativo', true)
      .order('nome');

    this._ecopontos.set((data ?? []).map(paraEcoponto));
    this.carregando.set(false);
  }
}
