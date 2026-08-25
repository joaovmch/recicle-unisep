import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService, traduzirErroAuth } from '../../supabase.service';

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
  licencaNumero: string | null;
  licencaOrgao: string | null;
  licencaValidade: string | null;
  criadoEm: string;
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
  licencaNumero: string;
  licencaOrgao: string;
  licencaValidade: string;
}

/** Arquivos escolhidos na etapa 4 do cadastro — ficam só em memória, nunca vão pro rascunho salvo. */
export interface ArquivosCadastro {
  licenca: File | null;
  cnpj: File | null;
  ata: File | null;
}

const BUCKET_DOCUMENTOS = 'documentos-cooperativa';

const TIPO_DOCUMENTO_POR_ARQUIVO: Record<keyof ArquivosCadastro, string> = {
  licenca: 'licenca_operacao',
  cnpj: 'cartao_cnpj',
  ata: 'ata_eleicao_diretoria',
};

interface CadastroPendente {
  userId: string;
  dados: NovaCooperativa;
}

const PENDENTE_STORAGE_KEY = 'recicle-cooperativa-cadastro-pendente';

export interface ErroCadastro {
  mensagem: string;
  /** Nome do campo (mesma chave usada em CAMPO_LABELS/etapas do wizard) que precisa ser corrigido, se aplicável. */
  campo?: string;
}

/** Traduz erros do Postgres/PostgREST pra português — sem isso a pessoa via "duplicate key value violates ..." */
function traduzirErroBanco(mensagem: string): ErroCadastro {
  if (mensagem.includes('cooperativas_cnpj_key')) {
    return { mensagem: 'Já existe uma cooperativa cadastrada com esse CNPJ.', campo: 'cnpj' };
  }
  if (mensagem.includes('duplicate key')) {
    return { mensagem: 'Algum dado informado já está em uso por outra cooperativa.' };
  }
  if (mensagem.includes('violates check constraint') || mensagem.includes('violates not-null constraint')) {
    return { mensagem: 'Um dos campos preenchidos não é válido. Confira os dados e tente de novo.' };
  }
  return { mensagem: 'Não foi possível enviar o cadastro. Tente novamente em instantes.' };
}

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
    licencaNumero: row.licenca_numero,
    licencaOrgao: row.licenca_orgao,
    licencaValidade: row.licenca_validade,
    criadoEm: row.criado_em,
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
  async criar(
    dados: NovaCooperativa,
    senha: string,
    arquivos?: ArquivosCadastro
  ): Promise<{ erro: string | null; campo?: string; pendenteConfirmacao: boolean }> {
    const { data: signUpData, error: signUpError } = await this.client.auth.signUp({
      email: dados.responsavelEmail,
      password: senha,
    });

    if (signUpError?.message.includes('already registered')) {
      // Não é necessariamente conta de outra pessoa: se um envio anterior criou a conta
      // mas falhou depois (ex.: CNPJ duplicado), a tentativa de corrigir e reenviar cai
      // aqui de novo. Login com a mesma senha recupera essa conta órfã e continua o
      // cadastro em vez de travar pedindo um e-mail que a pessoa não tem como trocar.
      const { data: signInData } = await this.client.auth.signInWithPassword({
        email: dados.responsavelEmail,
        password: senha,
      });

      if (!signInData?.session) {
        return {
          erro:
            'Já existe uma conta com esse e-mail. Se você já tentou enviar esse cadastro antes, ' +
            'confira se digitou a mesma senha de novo — ou entre pelo painel.',
          campo: 'responsavelEmail',
          pendenteConfirmacao: false,
        };
      }

      const linhaExistente = await this.buscarLinha(signInData.user.id);
      if (linhaExistente) {
        return {
          erro: 'Já existe um cadastro enviado com esse e-mail. Entre pelo painel para acompanhar.',
          campo: 'responsavelEmail',
          pendenteConfirmacao: false,
        };
      }

      const erroInsercao = await this.inserirLinha(signInData.user.id, dados, arquivos);
      if (!erroInsercao) await this.carregar();
      return erroInsercao
        ? { erro: erroInsercao.mensagem, campo: erroInsercao.campo, pendenteConfirmacao: false }
        : { erro: null, pendenteConfirmacao: false };
    }

    if (signUpError || !signUpData.user) {
      const erro = signUpError ? traduzirErroAuth(signUpError.message) : 'Não foi possível criar a conta.';
      return { erro, pendenteConfirmacao: false };
    }

    if (!signUpData.session) {
      // Arquivos ficam de fora de propósito: File não dá pra guardar em localStorage.
      // Quando a pessoa confirmar o e-mail e entrar, a linha é criada sem os documentos —
      // ela reenvia pela tela "Documentos e licença", que já faz esse upload.
      this.salvarPendente({ userId: signUpData.user.id, dados });
      return { erro: null, pendenteConfirmacao: true };
    }

    const erroInsercao = await this.inserirLinha(signUpData.user.id, dados, arquivos);
    if (!erroInsercao) await this.carregar();
    return erroInsercao
      ? { erro: erroInsercao.mensagem, campo: erroInsercao.campo, pendenteConfirmacao: false }
      : { erro: null, pendenteConfirmacao: false };
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
        if (!erro) {
          this.limparPendente();
          row = await this.buscarLinha(userId);
        }
        // Se a inserção falhar, mantemos o rascunho salvo para tentar de novo no
        // próximo login — o e-mail já está confirmado, então signUp() não pode
        // ser refeito, e sem isso os dados do cadastro seriam perdidos de vez.
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

  /**
   * Reenvio do wizard de cadastro por quem já tem conta (ex.: "Revisar cadastro" depois
   * de uma reprovação). Ao contrário de `criar()`, não passa por signUp — atualiza a
   * linha existente e o cadastro volta para "em_analise" pra a equipe reconferir.
   */
  async atualizarCadastroCompleto(
    cooperativaId: string,
    dados: NovaCooperativa,
    arquivos?: ArquivosCadastro
  ): Promise<{ erro: string | null; campo?: string }> {
    const { error } = await this.client
      .from('cooperativas')
      .update({
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
        licenca_numero: dados.licencaNumero || null,
        licenca_orgao: dados.licencaOrgao || null,
        licenca_validade: dados.licencaValidade || null,
        status_cadastro: 'em_analise',
      })
      .eq('id', cooperativaId);

    if (error) {
      const traduzido = traduzirErroBanco(error.message);
      return { erro: traduzido.mensagem, campo: traduzido.campo };
    }

    const { data: todosTipos } = await this.client.from('tipos_residuo').select('id, nome');
    if (todosTipos && todosTipos.length > 0) {
      const marcados = new Set(dados.residuosMarcados);
      await this.client.from('cooperativa_tipos_residuo').upsert(
        todosTipos.map((t: { id: string; nome: string }) => ({
          cooperativa_id: cooperativaId,
          tipo_residuo_id: t.id,
          ligado: marcados.has(t.nome),
        })),
        { onConflict: 'cooperativa_id,tipo_residuo_id' }
      );
    }

    if (arquivos) {
      await this.enviarDocumentosCadastro(cooperativaId, arquivos);
    }

    await this.client.from('cooperativa_eventos').insert({
      cooperativa_id: cooperativaId,
      titulo: 'Cadastro revisado e reenviado para análise',
    });

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

  private async inserirLinha(
    userId: string,
    dados: NovaCooperativa,
    arquivos?: ArquivosCadastro
  ): Promise<ErroCadastro | null> {
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
        licenca_numero: dados.licencaNumero || null,
        licenca_orgao: dados.licencaOrgao || null,
        licenca_validade: dados.licencaValidade || null,
      })
      .select()
      .single();

    if (insertError || !coopRow) {
      return insertError ? traduzirErroBanco(insertError.message) : { mensagem: 'Não foi possível criar o cadastro.' };
    }

    if (arquivos) {
      await this.enviarDocumentosCadastro(coopRow.id, arquivos);
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

  /** Sobe os arquivos da etapa 4 pro mesmo bucket/tabela que a tela "Documentos e licença" usa. */
  private async enviarDocumentosCadastro(cooperativaId: string, arquivos: ArquivosCadastro): Promise<void> {
    const entradas = Object.entries(arquivos) as [keyof ArquivosCadastro, File | null][];

    for (const [chave, arquivo] of entradas) {
      if (!arquivo) continue;

      const caminho = `${cooperativaId}/${Date.now()}-${arquivo.name}`;
      const { error: uploadError } = await this.client.storage
        .from(BUCKET_DOCUMENTOS)
        .upload(caminho, arquivo, { upsert: true });
      if (uploadError) continue;

      await this.client.from('documentos').upsert(
        {
          cooperativa_id: cooperativaId,
          tipo: TIPO_DOCUMENTO_POR_ARQUIVO[chave],
          nome_arquivo: arquivo.name,
          arquivo_url: caminho,
          tamanho_bytes: arquivo.size,
          status: 'em_analise',
          enviado_em: new Date().toISOString(),
        },
        { onConflict: 'cooperativa_id,tipo' }
      );
    }
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
