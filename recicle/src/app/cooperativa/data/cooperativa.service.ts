import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';

export type TipoOrganizacao = 'cooperativa' | 'associacao' | 'empresa';
export type StatusCadastro = 'em_analise' | 'aprovado' | 'reprovado';

export interface Cooperativa {
  id: string;
  userId: string;
  tipo: TipoOrganizacao;
  nome: string;
  cnpj: string;
  anoFundacao: string | null;
  pessoasOperacao: string | null;
  responsavelNome: string;
  responsavelCargo: string | null;
  responsavelEmail: string;
  responsavelTelefone: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  raioKm: number;
  diasFuncionamento: string | null;
  horaAbre: string | null;
  horaFecha: string | null;
  pesoMaximoKg: number;
  coletasPorDia: number;
  volumeMaximoM3: number;
  confirmaVeracidade: boolean;
  avisoEmail: boolean;
  avisoWhatsapp: boolean;
  avisoPainel: boolean;
  statusCadastro: StatusCadastro;
}

export interface NovaCooperativa {
  tipo: TipoOrganizacao;
  nome: string;
  cnpj: string;
  anoFundacao: string;
  pessoasOperacao: string;
  responsavelNome: string;
  responsavelCargo: string;
  responsavelEmail: string;
  responsavelTelefone: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  raioKm: number;
  diasFuncionamento: string;
  horaAbre: string;
  horaFecha: string;
  pesoMaximoKg: number;
  coletasPorDia: number;
  confirmaVeracidade: boolean;
  residuosMarcados: string[];
}

interface CadastroPendente {
  userId: string;
  dados: NovaCooperativa;
}

const PENDENTE_STORAGE_KEY = 'recicle-cooperativa-cadastro-pendente';

function paraCooperativa(row: any): Cooperativa {
  return {
    id: row.id,
    userId: row.user_id,
    tipo: row.tipo,
    nome: row.nome,
    cnpj: row.cnpj,
    anoFundacao: row.ano_fundacao,
    pessoasOperacao: row.pessoas_operacao,
    responsavelNome: row.responsavel_nome,
    responsavelCargo: row.responsavel_cargo,
    responsavelEmail: row.responsavel_email,
    responsavelTelefone: row.responsavel_telefone,
    cep: row.cep,
    rua: row.rua,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    raioKm: Number(row.raio_km),
    diasFuncionamento: row.dias_funcionamento,
    horaAbre: row.hora_abre,
    horaFecha: row.hora_fecha,
    pesoMaximoKg: Number(row.peso_maximo_kg),
    coletasPorDia: Number(row.coletas_por_dia),
    volumeMaximoM3: Number(row.volume_maximo_m3),
    confirmaVeracidade: row.confirma_veracidade,
    avisoEmail: row.aviso_email,
    avisoWhatsapp: row.aviso_whatsapp,
    avisoPainel: row.aviso_painel,
    statusCadastro: row.status_cadastro,
  };
}

@Injectable({ providedIn: 'root' })
export class CooperativaService {
  private readonly client = inject(SupabaseService).client;

  private readonly _cooperativa = signal<Cooperativa | null>(null);
  readonly cooperativa = this._cooperativa.asReadonly();

  /**
   * Cria a conta de autenticação e, se possível, a linha da cooperativa (fim do wizard).
   * Quando o projeto exige confirmação de e-mail, o Supabase não devolve sessão no signUp
   * — nesse caso os dados ficam guardados localmente e a linha é criada de fato na próxima
   * vez que `carregar()` rodar com uma sessão válida (ou seja, depois que a pessoa confirmar
   * o e-mail e entrar no painel).
   */
  async criar(dados: NovaCooperativa, senha: string): Promise<{ erro: string | null; pendenteConfirmacao: boolean }> {
    const { data: signUpData, error: signUpError } = await this.client.auth.signUp({
      email: dados.responsavelEmail,
      password: senha,
    });
    if (signUpError || !signUpData.user) {
      return { erro: signUpError?.message ?? 'Não foi possível criar a conta.', pendenteConfirmacao: false };
    }

    if (!signUpData.session) {
      this.salvarPendente({ userId: signUpData.user.id, dados });
      return { erro: null, pendenteConfirmacao: true };
    }

    const erro = await this.inserirLinha(signUpData.user.id, dados);
    if (!erro) await this.carregar();
    return { erro, pendenteConfirmacao: false };
  }

  /** Busca (ou recarrega) a cooperativa do usuário autenticado no momento. */
  async carregar(): Promise<Cooperativa | null> {
    const { data: sessao } = await this.client.auth.getSession();
    const userId = sessao.session?.user.id;
    if (!userId) {
      this._cooperativa.set(null);
      return null;
    }

    let row = await this.buscarLinha(userId);

    if (!row) {
      const pendente = this.lerPendente();
      if (pendente && pendente.userId === userId) {
        const erro = await this.inserirLinha(userId, pendente.dados);
        this.limparPendente();
        if (!erro) row = await this.buscarLinha(userId);
      }
    }

    const cooperativa = row ? paraCooperativa(row) : null;
    this._cooperativa.set(cooperativa);
    return cooperativa;
  }

  async atualizar(patch: Record<string, unknown>): Promise<{ erro: string | null }> {
    const atual = this._cooperativa();
    if (!atual) return { erro: 'Nenhuma cooperativa carregada.' };

    const { error } = await this.client.from('cooperativas').update(patch).eq('id', atual.id);
    if (error) return { erro: error.message };

    await this.carregar();
    return { erro: null };
  }

  limpar(): void {
    this._cooperativa.set(null);
  }

  private async buscarLinha(userId: string): Promise<any | null> {
    const { data } = await this.client.from('cooperativas').select('*').eq('user_id', userId).maybeSingle();
    return data ?? null;
  }

  private async inserirLinha(userId: string, dados: NovaCooperativa): Promise<string | null> {
    const { data: coopRow, error: insertError } = await this.client
      .from('cooperativas')
      .insert({
        user_id: userId,
        tipo: dados.tipo,
        nome: dados.nome,
        cnpj: dados.cnpj,
        ano_fundacao: dados.anoFundacao || null,
        pessoas_operacao: dados.pessoasOperacao || null,
        responsavel_nome: dados.responsavelNome,
        responsavel_cargo: dados.responsavelCargo || null,
        responsavel_email: dados.responsavelEmail,
        responsavel_telefone: dados.responsavelTelefone || null,
        cep: dados.cep || null,
        rua: dados.rua || null,
        numero: dados.numero || null,
        complemento: dados.complemento || null,
        bairro: dados.bairro || null,
        cidade: dados.cidade || null,
        uf: dados.uf || null,
        raio_km: dados.raioKm || 2,
        dias_funcionamento: dados.diasFuncionamento || null,
        hora_abre: dados.horaAbre || null,
        hora_fecha: dados.horaFecha || null,
        peso_maximo_kg: dados.pesoMaximoKg || 0,
        coletas_por_dia: dados.coletasPorDia || 0,
        confirma_veracidade: dados.confirmaVeracidade,
      })
      .select()
      .single();

    if (insertError || !coopRow) {
      return insertError?.message ?? 'Não foi possível criar o cadastro.';
    }

    if (dados.residuosMarcados.length > 0) {
      const { data: tipos } = await this.client
        .from('tipos_residuo')
        .select('id, nome')
        .in('nome', dados.residuosMarcados);

      if (tipos && tipos.length > 0) {
        await this.client.from('cooperativa_tipos_residuo').upsert(
          tipos.map((t: { id: string; nome: string }) => ({
            cooperativa_id: coopRow.id,
            tipo_residuo_id: t.id,
            ligado: true,
          })),
          { onConflict: 'cooperativa_id,tipo_residuo_id' }
        );
      }
    }

    if (dados.responsavelNome.trim()) {
      await this.client.from('equipe').insert({
        cooperativa_id: coopRow.id,
        nome: dados.responsavelNome.trim(),
        telefone: dados.responsavelTelefone || null,
        funcao: 'Presidente',
        pode_confirmar: true,
      });
    }

    return null;
  }

  private salvarPendente(pendente: CadastroPendente): void {
    try {
      localStorage.setItem(PENDENTE_STORAGE_KEY, JSON.stringify(pendente));
    } catch {
      /* navegador sem localStorage disponível */
    }
  }

  private lerPendente(): CadastroPendente | null {
    try {
      const bruto = localStorage.getItem(PENDENTE_STORAGE_KEY);
      return bruto ? (JSON.parse(bruto) as CadastroPendente) : null;
    } catch {
      return null;
    }
  }

  private limparPendente(): void {
    try {
      localStorage.removeItem(PENDENTE_STORAGE_KEY);
    } catch {
      /* navegador sem localStorage disponível */
    }
  }
}
