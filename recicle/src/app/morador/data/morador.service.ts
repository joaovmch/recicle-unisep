import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';
import { AuthService } from '../../shared/data/auth.service';

export interface Morador {
  id: string;
  userId: string;
  nome: string;
  email: string;
  telefone: string | null;
  avatarUrl: string | null;
  avisoEmail: boolean;
  avisoWhatsapp: boolean;
  avisoPainel: boolean;
  criadoEm: string;
}

export interface Endereco {
  id: string;
  apelido: string;
  cep: string | null;
  rua: string;
  numero: string | null;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  referencia: string | null;
  principal: boolean;
}

function paraMorador(row: any): Morador {
  return {
    id: row.id,
    userId: row.user_id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    avatarUrl: row.avatar_url,
    avisoEmail: row.aviso_email,
    avisoWhatsapp: row.aviso_whatsapp,
    avisoPainel: row.aviso_painel,
    criadoEm: row.criado_em,
  };
}

export function paraEndereco(row: any): Endereco {
  return {
    id: row.id,
    apelido: row.apelido,
    cep: row.cep,
    rua: row.rua,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    referencia: row.referencia,
    principal: row.principal,
  };
}

/** "Rua das Flores, 45 — Centro" a partir do endereço salvo. */
export function enderecoResumido(e: Endereco): string {
  const numero = e.numero ? `, ${e.numero}` : '';
  return `${e.rua}${numero} — ${e.bairro}`;
}

@Injectable({ providedIn: 'root' })
export class MoradorService {
  private readonly client = inject(SupabaseService).client;

  private readonly _morador = signal<Morador | null>(null);
  readonly morador = this._morador.asReadonly();

  private readonly _enderecos = signal<Endereco[]>([]);
  readonly enderecos = this._enderecos.asReadonly();

  constructor() {
    inject(AuthService).registrarLimpeza(() => this.limpar());
  }

  /** Busca (ou recarrega) o morador do usuário autenticado. */
  async carregar(): Promise<Morador | null> {
    const { data: sessao } = await this.client.auth.getSession();
    const userId = sessao.session?.user.id;
    if (!userId) {
      this.limpar();
      return null;
    }

    const { data, error } = await this.client.from('moradores').select('*').eq('user_id', userId).maybeSingle();

    // Consulta que falhou (rede, token expirando, erro do banco) não é "esse usuário não
    // tem perfil": o guard lê esse retorno e manda quem vier nulo para a tela de criar
    // conta. Mantendo o perfil que já estava em memória, uma oscilação no meio da sessão
    // não expulsa mais ninguém — só um `data` nulo SEM erro significa perfil inexistente.
    if (error) return this._morador();

    const morador = data ? paraMorador(data) : null;
    this._morador.set(morador);

    if (morador) await this.carregarEnderecos(morador.id);
    return morador;
  }

  async carregarEnderecos(moradorId = this._morador()?.id): Promise<void> {
    if (!moradorId) return;
    const { data } = await this.client
      .from('morador_enderecos')
      .select('*')
      .eq('morador_id', moradorId)
      .order('principal', { ascending: false })
      .order('criado_em');
    this._enderecos.set((data ?? []).map(paraEndereco));
  }

  /**
   * Garante que o usuário logado tem perfil de morador. Normalmente o gatilho do banco já
   * criou no signUp; aqui cobre contas antigas que ficaram órfãs. Idempotente: se o perfil
   * já existe (inclusive criado em paralelo — violação de unicidade 23505), não é erro.
   */
  async garantirPerfil(userId: string, nome: string, email: string): Promise<{ erro: string | null }> {
    if (await this.carregar()) return { erro: null };

    const { error } = await this.client.from('moradores').insert({ user_id: userId, nome, email });
    if (error && error.code !== '23505') {
      return { erro: 'Não foi possível criar seu perfil. Tente novamente.' };
    }

    return (await this.carregar()) ? { erro: null } : { erro: 'Não foi possível carregar seu perfil.' };
  }

  async atualizarPerfil(patch: Record<string, unknown>): Promise<{ erro: string | null }> {
    const atual = this._morador();
    if (!atual) return { erro: 'Nenhum morador carregado.' };

    const { error } = await this.client.from('moradores').update(patch).eq('id', atual.id);
    if (error) return { erro: error.message };

    await this.carregar();
    return { erro: null };
  }

  async salvarEndereco(endereco: Partial<Endereco> & { rua: string; bairro: string; cidade: string; uf: string }) {
    const morador = this._morador();
    if (!morador) return { erro: 'Nenhum morador carregado.' };

    const linha = {
      morador_id: morador.id,
      apelido: endereco.apelido ?? 'Casa',
      cep: endereco.cep ?? null,
      rua: endereco.rua,
      numero: endereco.numero ?? null,
      complemento: endereco.complemento ?? null,
      bairro: endereco.bairro,
      cidade: endereco.cidade,
      uf: endereco.uf,
      referencia: endereco.referencia ?? null,
      principal: endereco.principal ?? this._enderecos().length === 0,
    };

    const { error } = endereco.id
      ? await this.client.from('morador_enderecos').update(linha).eq('id', endereco.id)
      : await this.client.from('morador_enderecos').insert(linha);

    if (error) return { erro: error.message };

    await this.carregarEnderecos();
    return { erro: null };
  }

  async removerEndereco(id: string): Promise<{ erro: string | null }> {
    const { error } = await this.client.from('morador_enderecos').delete().eq('id', id);
    if (error) return { erro: 'Não foi possível remover o endereço.' };
    await this.carregarEnderecos();
    return { erro: null };
  }

  limpar(): void {
    this._morador.set(null);
    this._enderecos.set([]);
  }
}
