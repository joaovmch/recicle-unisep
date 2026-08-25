import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ToastHost } from '../../shared/toast-host';
import { ToastService } from '../../shared/toast.service';
import { ArquivosCadastro, Cooperativa, CooperativaService, NovaCooperativa } from '../../data/cooperativa.service';
import { AuthService } from '../../data/auth.service';
import { SupabaseService } from '../../../supabase.service';
import { EMAIL_RE, SENHA_MIN_CARACTERES } from '../../shared/validators';
import { erroArquivoInvalido } from '../../shared/upload';

type TipoOrganizacao = 'cooperativa' | 'associacao' | 'empresa';

interface DadosOrganizacao {
  tipo: TipoOrganizacao;
  nome: string;
  cnpj: string;
  anoFundacao: string;
  pessoasOperacao: string;
  responsavelNome: string;
  responsavelCargo: string;
  responsavelEmail: string;
  responsavelTelefone: string;
}

interface DadosEndereco {
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
}

interface ResiduoOpcao {
  nome: string;
  marcado: boolean;
}

interface DadosCapacidade {
  pesoMaximoKg: number;
  veiculosDisponiveis: string;
  coletasPorDia: number;
}

interface DadosLicenca {
  numero: string;
  orgao: string;
  validade: string;
}

const RESIDUOS_INICIAL: ResiduoOpcao[] = [
  { nome: 'Papel e papelão', marcado: false },
  { nome: 'Plástico', marcado: false },
  { nome: 'Metal', marcado: false },
  { nome: 'Vidro', marcado: false },
  { nome: 'Madeira', marcado: false },
  { nome: 'Móveis e estofados', marcado: false },
  { nome: 'Óleo de cozinha', marcado: false },
  { nome: 'Eletrônicos', marcado: false },
  { nome: 'Pilhas e baterias', marcado: false },
  { nome: 'Entulho classe A', marcado: false },
  { nome: 'Resíduo orgânico', marcado: false },
  { nome: 'Têxteis', marcado: false },
];

const RESIDUOS_PERIGOSOS = ['Pilhas e baterias', 'Eletrônicos'];

const PASSOS = [
  { titulo: 'Dados da cooperativa', subtitulo: 'CNPJ, contato e responsável' },
  { titulo: 'Endereço e cobertura', subtitulo: 'onde vocês atuam' },
  { titulo: 'Resíduos aceitos', subtitulo: 'o que a triagem recebe' },
  { titulo: 'Licença e documentos', subtitulo: 'alvará ambiental' },
];

const TIPOS_ORGANIZACAO: { valor: TipoOrganizacao; label: string; descricao: string }[] = [
  { valor: 'cooperativa', label: 'Cooperativa', descricao: 'catadores cooperados' },
  { valor: 'associacao', label: 'Associação', descricao: 'sem fins lucrativos' },
  { valor: 'empresa', label: 'Empresa', descricao: 'transporte ou destinação' },
];

const CTA_LABELS = ['Continuar para endereço', 'Continuar para resíduos', 'Continuar para licença'];

const RASCUNHO_STORAGE_KEY = 'recicle-cooperativa-cadastro-rascunho';

const CAMPO_LABELS: Record<string, string> = {
  nome: 'Nome da organização',
  cnpj: 'CNPJ (14 dígitos)',
  responsavelNome: 'Nome do responsável',
  responsavelTelefone: 'Telefone do responsável',
  responsavelEmail: 'E-mail válido do responsável',
  senha: `Senha com pelo menos ${SENHA_MIN_CARACTERES} caracteres`,
  cep: 'CEP',
  rua: 'Rua',
  numero: 'Número',
  bairro: 'Bairro',
  cidade: 'Cidade',
  uf: 'UF',
  diasFuncionamento: 'Dias de funcionamento',
  horaAbre: 'Horário de abertura',
  horaFecha: 'Horário de fechamento',
  residuos: 'Pelo menos um resíduo aceito',
  licNumero: 'Número da licença',
  licOrgao: 'Órgão emissor da licença',
  licValidade: 'Validade da licença',
  licencaArquivo: 'Arquivo da licença ambiental',
  cnpjArquivo: 'Cartão CNPJ',
  ata: 'Ata de eleição da diretoria',
};

/** Em qual etapa do wizard cada campo mora — usado pra pular direto pra lá quando o envio falha nesse campo. */
const ETAPA_DO_CAMPO: Record<string, number> = {
  nome: 1,
  cnpj: 1,
  responsavelNome: 1,
  responsavelCargo: 1,
  responsavelEmail: 1,
  responsavelTelefone: 1,
  senha: 1,
  cep: 2,
  rua: 2,
  numero: 2,
  bairro: 2,
  cidade: 2,
  uf: 2,
  diasFuncionamento: 2,
  horaAbre: 2,
  horaFecha: 2,
  residuos: 3,
  licNumero: 4,
  licOrgao: 4,
  licValidade: 4,
  licencaArquivo: 4,
  cnpjArquivo: 4,
  ata: 4,
};

interface RascunhoCadastro {
  etapaAtual: number;
  etapaMaximaAlcancada: number;
  organizacao: DadosOrganizacao;
  endereco: DadosEndereco;
  residuos: ResiduoOpcao[];
  capacidade: DadosCapacidade;
  licenca: DadosLicenca;
}

const POR_QUE_PEDIMOS = [
  'O CNPJ é conferido junto ao cadastro municipal antes de liberar o painel. O nome que vocês colocarem aqui é o que o morador vê na hora de escolher quem faz a coleta.',
  'A IA só oferece sua cooperativa para moradores dentro do raio marcado aqui. Raio menor significa menos viagem perdida e resposta mais rápida.',
  'A IA só sugere sua cooperativa para resíduos que vocês realmente aceitam. Isso evita viagem perdida e recusa na triagem.',
  'Só cooperativa com licença válida recebe solicitação pelo Re-cicle. É isso que garante ao morador que o resíduo tem destino legal.',
];

@Component({
  selector: 'app-cadastro',
  imports: [RouterLink, ToastHost],
  templateUrl: './cadastro.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './cadastro.css'],
})
export class Cadastro {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly auth = inject(AuthService);
  private readonly client = inject(SupabaseService).client;

  readonly passos = PASSOS;
  readonly tiposOrganizacao = TIPOS_ORGANIZACAO;
  readonly ctaLabels = CTA_LABELS;
  readonly porQuePedimos = POR_QUE_PEDIMOS;
  readonly senhaMinCaracteres = SENHA_MIN_CARACTERES;

  readonly etapaAtual = signal(1);
  readonly etapaMaximaAlcancada = signal(1);

  /** true quando é uma cooperativa já cadastrada revisando o próprio cadastro (não um signup novo). */
  readonly modoEdicao = signal(false);
  private cooperativaIdEdicao: string | null = null;

  readonly organizacao = signal<DadosOrganizacao>({
    tipo: 'cooperativa',
    nome: '',
    cnpj: '',
    anoFundacao: '',
    pessoasOperacao: '',
    responsavelNome: '',
    responsavelCargo: '',
    responsavelEmail: '',
    responsavelTelefone: '',
  });

  readonly endereco = signal<DadosEndereco>({
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    raioKm: 2,
    diasFuncionamento: '',
    horaAbre: '',
    horaFecha: '',
  });

  readonly residuos = signal<ResiduoOpcao[]>(RESIDUOS_INICIAL);

  readonly capacidade = signal<DadosCapacidade>({
    pesoMaximoKg: 0,
    veiculosDisponiveis: '',
    coletasPorDia: 0,
  });

  readonly licenca = signal<DadosLicenca>({
    numero: '',
    orgao: '',
    validade: '',
  });

  readonly confirmaVeracidade = signal(false);

  readonly senha = signal('');
  readonly enviando = signal(false);
  readonly erroEnvio = signal<string | null>(null);

  readonly erroEtapa = signal<string | null>(null);
  readonly camposInvalidos = signal<Set<string>>(new Set());

  readonly senhaFraca = () => this.senha().length > 0 && this.senha().length < SENHA_MIN_CARACTERES;

  readonly licencaArquivo = signal<{ nome: string; meta: string; arquivo: File } | null>(null);
  readonly cnpjArquivo = signal<{ nome: string; meta: string; arquivo: File } | null>(null);
  readonly ataArquivo = signal<{ nome: string; meta: string; arquivo: File } | null>(null);
  private uploadAlvo: 'licenca' | 'cnpj' | 'ata' | null = null;

  constructor() {
    this.inicializar();
  }

  private async inicializar(): Promise<void> {
    const sessao = await this.auth.sessaoAtual();
    if (sessao) {
      const cooperativa = await this.cooperativaService.carregar();
      if (cooperativa) {
        await this.preencherComCooperativaExistente(cooperativa);
        return;
      }
    }
    this.carregarRascunho();
  }

  /** Pré-preenche o wizard com o que já está salvo — é o que faz "Revisar cadastro" mostrar os dados reais em vez de vir em branco. */
  private async preencherComCooperativaExistente(coop: Cooperativa): Promise<void> {
    this.modoEdicao.set(true);
    this.cooperativaIdEdicao = coop.id;
    this.etapaMaximaAlcancada.set(4);

    this.organizacao.set({
      tipo: coop.tipo,
      nome: coop.nome,
      cnpj: coop.cnpj,
      anoFundacao: coop.anoFundacao ?? '',
      pessoasOperacao: coop.pessoasOperacao ?? '',
      responsavelNome: coop.responsavelNome,
      responsavelCargo: coop.responsavelCargo ?? '',
      responsavelEmail: coop.responsavelEmail,
      responsavelTelefone: coop.responsavelTelefone ?? '',
    });

    this.endereco.set({
      cep: coop.cep ?? '',
      rua: coop.rua ?? '',
      numero: coop.numero ?? '',
      complemento: coop.complemento ?? '',
      bairro: coop.bairro ?? '',
      cidade: coop.cidade ?? '',
      uf: coop.uf ?? '',
      raioKm: coop.raioKm || 2,
      diasFuncionamento: coop.diasFuncionamento ?? '',
      horaAbre: coop.horaAbre ?? '',
      horaFecha: coop.horaFecha ?? '',
    });

    this.capacidade.set({
      pesoMaximoKg: coop.pesoMaximoKg,
      veiculosDisponiveis: '',
      coletasPorDia: coop.coletasPorDia,
    });

    this.licenca.set({
      numero: coop.licencaNumero ?? '',
      orgao: coop.licencaOrgao ?? '',
      validade: coop.licencaValidade ?? '',
    });

    this.confirmaVeracidade.set(coop.confirmaVeracidade);

    const { data: ligados } = await this.client
      .from('cooperativa_tipos_residuo')
      .select('tipos_residuo(nome)')
      .eq('cooperativa_id', coop.id)
      .eq('ligado', true);
    const nomesLigados = new Set(
      (ligados ?? []).map((l: any) => l.tipos_residuo?.nome).filter((nome: unknown): nome is string => !!nome)
    );
    this.residuos.update(lista => lista.map(r => ({ ...r, marcado: nomesLigados.has(r.nome) })));
  }

  readonly residuosPerigososMarcados = () =>
    this.residuos().filter(r => RESIDUOS_PERIGOSOS.includes(r.nome) && r.marcado);

  private limparInvalido(campo: string): void {
    if (!this.camposInvalidos().has(campo)) return;
    this.camposInvalidos.update(atual => {
      const proximo = new Set(atual);
      proximo.delete(campo);
      return proximo;
    });
  }

  atualizarOrganizacao<K extends keyof DadosOrganizacao>(campo: K, valor: DadosOrganizacao[K]): void {
    this.organizacao.update(o => ({ ...o, [campo]: valor }));
    this.limparInvalido(campo);
  }

  atualizarEndereco<K extends keyof DadosEndereco>(campo: K, valor: DadosEndereco[K]): void {
    this.endereco.update(e => ({ ...e, [campo]: valor }));
    this.limparInvalido(campo);
  }

  atualizarRaio(valor: string): void {
    this.atualizarEndereco('raioKm', Number(valor) || 0);
  }

  atualizarCapacidade<K extends keyof DadosCapacidade>(campo: K, valor: DadosCapacidade[K]): void {
    this.capacidade.update(c => ({ ...c, [campo]: valor }));
  }

  atualizarPesoMaximo(valor: string): void {
    this.atualizarCapacidade('pesoMaximoKg', Math.max(0, Number(valor) || 0));
  }

  atualizarColetasPorDia(valor: string): void {
    this.atualizarCapacidade('coletasPorDia', Math.max(0, Math.round(Number(valor) || 0)));
  }

  private readonly LICENCA_CAMPO_INVALIDO: Record<keyof DadosLicenca, string> = {
    numero: 'licNumero',
    orgao: 'licOrgao',
    validade: 'licValidade',
  };

  atualizarLicenca<K extends keyof DadosLicenca>(campo: K, valor: DadosLicenca[K]): void {
    this.licenca.update(l => ({ ...l, [campo]: valor }));
    this.limparInvalido(this.LICENCA_CAMPO_INVALIDO[campo]);
  }

  alternarResiduo(index: number): void {
    this.residuos.update(lista => lista.map((r, i) => (i === index ? { ...r, marcado: !r.marcado } : r)));
    this.limparInvalido('residuos');
  }

  irParaEtapa(etapa: number): void {
    if (etapa <= this.etapaMaximaAlcancada()) {
      this.etapaAtual.set(etapa);
      this.erroEtapa.set(null);
      this.camposInvalidos.set(new Set());
    }
  }

  invalido(campo: string): boolean {
    return this.camposInvalidos().has(campo);
  }

  private validarEtapa1(): string[] {
    const o = this.organizacao();
    const invalidos: string[] = [];
    if (!o.nome.trim()) invalidos.push('nome');
    if (o.cnpj.replace(/\D/g, '').length !== 14) invalidos.push('cnpj');
    if (!o.responsavelNome.trim()) invalidos.push('responsavelNome');
    if (!o.responsavelTelefone.trim()) invalidos.push('responsavelTelefone');
    if (!EMAIL_RE.test(o.responsavelEmail.trim())) invalidos.push('responsavelEmail');
    if (!this.modoEdicao() && this.senha().length < SENHA_MIN_CARACTERES) invalidos.push('senha');
    return invalidos;
  }

  private validarEtapa2(): string[] {
    const e = this.endereco();
    const invalidos: string[] = [];
    if (!e.cep.trim()) invalidos.push('cep');
    if (!e.rua.trim()) invalidos.push('rua');
    if (!e.numero.trim()) invalidos.push('numero');
    if (!e.bairro.trim()) invalidos.push('bairro');
    if (!e.cidade.trim()) invalidos.push('cidade');
    if (!e.uf.trim()) invalidos.push('uf');
    if (!e.diasFuncionamento.trim()) invalidos.push('diasFuncionamento');
    if (!e.horaAbre.trim()) invalidos.push('horaAbre');
    if (!e.horaFecha.trim()) invalidos.push('horaFecha');
    return invalidos;
  }

  private validarEtapa3(): string[] {
    return this.residuos().some(r => r.marcado) ? [] : ['residuos'];
  }

  private validarEtapa4(): string[] {
    const l = this.licenca();
    const invalidos: string[] = [];
    if (!l.numero.trim()) invalidos.push('licNumero');
    if (!l.orgao.trim()) invalidos.push('licOrgao');
    if (!l.validade.trim()) invalidos.push('licValidade');
    if (!this.modoEdicao()) {
      if (!this.licencaArquivo()) invalidos.push('licencaArquivo');
      if (!this.cnpjArquivo()) invalidos.push('cnpjArquivo');
      if (!this.ataArquivo()) invalidos.push('ata');
    }
    return invalidos;
  }

  private validarEtapaAtual(): string[] {
    switch (this.etapaAtual()) {
      case 1: return this.validarEtapa1();
      case 2: return this.validarEtapa2();
      case 3: return this.validarEtapa3();
      case 4: return this.validarEtapa4();
      default: return [];
    }
  }

  private mensagemErro(invalidos: string[]): string {
    if (invalidos.length === 1 && invalidos[0] === 'senha') {
      return `A senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`;
    }
    const labels = invalidos.map(c => CAMPO_LABELS[c]).filter(Boolean);
    return labels.length > 0
      ? `Preencha antes de continuar: ${labels.join(', ')}.`
      : 'Preencha os campos obrigatórios destacados antes de continuar.';
  }

  avancar(): void {
    const invalidos = this.validarEtapaAtual();
    if (invalidos.length > 0) {
      this.camposInvalidos.set(new Set(invalidos));
      this.erroEtapa.set(this.mensagemErro(invalidos));
      return;
    }

    this.camposInvalidos.set(new Set());
    this.erroEtapa.set(null);

    const proxima = Math.min(4, this.etapaAtual() + 1);
    this.etapaAtual.set(proxima);
    this.etapaMaximaAlcancada.update(max => Math.max(max, proxima));
  }

  voltar(): void {
    this.erroEtapa.set(null);
    this.camposInvalidos.set(new Set());
    this.etapaAtual.set(Math.max(1, this.etapaAtual() - 1));
  }

  async enviarParaAnalise(): Promise<void> {
    if (!this.confirmaVeracidade() || this.enviando()) return;

    const invalidosEtapa1 = this.validarEtapa1();
    const invalidosEtapa4 = this.validarEtapa4();
    if (invalidosEtapa1.length > 0 || invalidosEtapa4.length > 0) {
      if (invalidosEtapa1.length > 0) {
        this.etapaAtual.set(1);
        this.camposInvalidos.set(new Set(invalidosEtapa1));
        this.erroEtapa.set(this.mensagemErro(invalidosEtapa1));
      } else {
        this.camposInvalidos.set(new Set(invalidosEtapa4));
        this.erroEtapa.set(this.mensagemErro(invalidosEtapa4));
      }
      return;
    }

    this.enviando.set(true);
    this.erroEnvio.set(null);

    const org = this.organizacao();
    const end = this.endereco();
    const cap = this.capacidade();

    const dados: NovaCooperativa = {
      tipo: org.tipo,
      nome: org.nome,
      cnpj: org.cnpj,
      anoFundacao: org.anoFundacao,
      pessoasOperacao: org.pessoasOperacao,
      responsavelNome: org.responsavelNome,
      responsavelCargo: org.responsavelCargo,
      responsavelEmail: org.responsavelEmail,
      responsavelTelefone: org.responsavelTelefone,
      cep: end.cep,
      rua: end.rua,
      numero: end.numero,
      complemento: end.complemento,
      bairro: end.bairro,
      cidade: end.cidade,
      uf: end.uf,
      raioKm: end.raioKm,
      diasFuncionamento: end.diasFuncionamento,
      horaAbre: end.horaAbre,
      horaFecha: end.horaFecha,
      pesoMaximoKg: cap.pesoMaximoKg,
      coletasPorDia: cap.coletasPorDia,
      confirmaVeracidade: this.confirmaVeracidade(),
      residuosMarcados: this.residuos().filter(r => r.marcado).map(r => r.nome),
      licencaNumero: this.licenca().numero,
      licencaOrgao: this.licenca().orgao,
      licencaValidade: this.licenca().validade,
    };

    const arquivos: ArquivosCadastro = {
      licenca: this.licencaArquivo()?.arquivo ?? null,
      cnpj: this.cnpjArquivo()?.arquivo ?? null,
      ata: this.ataArquivo()?.arquivo ?? null,
    };

    if (this.modoEdicao() && this.cooperativaIdEdicao) {
      const { erro, campo } = await this.cooperativaService.atualizarCadastroCompleto(
        this.cooperativaIdEdicao,
        dados,
        arquivos
      );

      this.enviando.set(false);

      if (erro) {
        this.tratarErroEnvio(erro, campo);
        return;
      }

      this.toast.mostrar('Cadastro atualizado e reenviado para análise.');
      this.router.navigate(['/cooperativa/cadastro/analise']);
      return;
    }

    const { erro, campo, pendenteConfirmacao } = await this.cooperativaService.criar(dados, this.senha(), arquivos);

    this.enviando.set(false);

    if (erro) {
      this.tratarErroEnvio(erro, campo);
      return;
    }

    this.limparRascunho();

    if (pendenteConfirmacao) {
      this.toast.mostrar('Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre no painel.');
      this.router.navigate(['/cooperativa/entrar']);
      return;
    }

    this.router.navigate(['/cooperativa/cadastro/analise']);
  }

  /** Mostra o erro (em português) e, se souber qual campo causou, já pula pra etapa dele e destaca. */
  private tratarErroEnvio(mensagem: string, campo?: string): void {
    this.erroEnvio.set(mensagem);
    this.toast.mostrar(mensagem);

    if (!campo) return;

    const etapa = ETAPA_DO_CAMPO[campo] ?? this.etapaAtual();
    this.etapaAtual.set(etapa);
    this.etapaMaximaAlcancada.update(max => Math.max(max, etapa));
    this.camposInvalidos.set(new Set([campo]));
  }

  salvarRascunho(): void {
    const rascunho: RascunhoCadastro = {
      etapaAtual: this.etapaAtual(),
      etapaMaximaAlcancada: this.etapaMaximaAlcancada(),
      organizacao: this.organizacao(),
      endereco: this.endereco(),
      residuos: this.residuos(),
      capacidade: this.capacidade(),
      licenca: this.licenca(),
    };

    try {
      localStorage.setItem(RASCUNHO_STORAGE_KEY, JSON.stringify(rascunho));
      this.toast.mostrar('Rascunho salvo. Pode continuar de onde parou depois.');
    } catch {
      this.toast.mostrar('Não foi possível salvar o rascunho neste navegador.');
    }
  }

  private limparRascunho(): void {
    try {
      localStorage.removeItem(RASCUNHO_STORAGE_KEY);
    } catch {
      /* navegador sem localStorage disponível */
    }
  }

  private carregarRascunho(): void {
    let bruto: string | null = null;
    try {
      bruto = localStorage.getItem(RASCUNHO_STORAGE_KEY);
    } catch {
      return;
    }
    if (!bruto) return;

    try {
      const rascunho = JSON.parse(bruto) as RascunhoCadastro;
      this.etapaAtual.set(rascunho.etapaAtual);
      this.etapaMaximaAlcancada.set(rascunho.etapaMaximaAlcancada);
      this.organizacao.set(rascunho.organizacao);
      this.endereco.set(rascunho.endereco);
      this.residuos.set(rascunho.residuos);
      this.capacidade.set(rascunho.capacidade);
      this.licenca.set(rascunho.licenca);
    } catch {
      localStorage.removeItem(RASCUNHO_STORAGE_KEY);
    }
  }

  acionarTrocaLicenca(inputRef: HTMLInputElement): void {
    this.uploadAlvo = 'licenca';
    inputRef.value = '';
    inputRef.click();
  }

  acionarTrocaCnpj(inputRef: HTMLInputElement): void {
    this.uploadAlvo = 'cnpj';
    inputRef.value = '';
    inputRef.click();
  }

  acionarTrocaAta(inputRef: HTMLInputElement): void {
    this.uploadAlvo = 'ata';
    inputRef.value = '';
    inputRef.click();
  }

  arquivoSelecionado(event: Event): void {
    const arquivo = (event.target as HTMLInputElement).files?.[0];
    if (!arquivo || !this.uploadAlvo) return;

    const erro = erroArquivoInvalido(arquivo);
    if (erro) {
      this.toast.mostrar(erro);
      this.uploadAlvo = null;
      return;
    }

    const meta = arquivo.size < 1024 * 1024
      ? `${Math.max(1, Math.round(arquivo.size / 1024))} KB · enviado agora`
      : `${(arquivo.size / (1024 * 1024)).toFixed(1)} MB · enviado agora`;

    if (this.uploadAlvo === 'licenca') {
      this.licencaArquivo.set({ nome: arquivo.name, meta, arquivo });
      this.limparInvalido('licencaArquivo');
    } else if (this.uploadAlvo === 'cnpj') {
      this.cnpjArquivo.set({ nome: arquivo.name, meta, arquivo });
      this.limparInvalido('cnpjArquivo');
    } else {
      this.ataArquivo.set({ nome: arquivo.name, meta, arquivo });
      this.limparInvalido('ata');
    }

    this.toast.mostrar(`${arquivo.name} enviado.`);
    this.uploadAlvo = null;
  }

  atualizarSenha(valor: string): void {
    this.senha.set(valor);
    this.limparInvalido('senha');
  }
}
