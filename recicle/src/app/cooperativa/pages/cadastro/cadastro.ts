import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ToastHost } from '../../shared/toast-host';
import { ToastService } from '../../shared/toast.service';
import { CooperativaService, NovaCooperativa } from '../../data/cooperativa.service';

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

interface RascunhoCadastro {
  etapaAtual: number;
  etapaMaximaAlcancada: number;
  organizacao: DadosOrganizacao;
  endereco: DadosEndereco;
  residuos: ResiduoOpcao[];
  capacidade: DadosCapacidade;
  licenca: DadosLicenca;
  ataEnviada: boolean;
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

  readonly passos = PASSOS;
  readonly tiposOrganizacao = TIPOS_ORGANIZACAO;
  readonly ctaLabels = CTA_LABELS;
  readonly porQuePedimos = POR_QUE_PEDIMOS;

  readonly etapaAtual = signal(1);
  readonly etapaMaximaAlcancada = signal(1);

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

  readonly ataEnviada = signal(false);
  readonly confirmaVeracidade = signal(false);

  readonly senha = signal('');
  readonly enviando = signal(false);
  readonly erroEnvio = signal<string | null>(null);

  readonly licencaArquivo = signal<{ nome: string; meta: string } | null>(null);
  readonly cnpjArquivo = signal<{ nome: string; meta: string } | null>(null);
  private uploadAlvo: 'licenca' | 'cnpj' | null = null;

  constructor() {
    this.carregarRascunho();
  }

  readonly residuosPerigososMarcados = () =>
    this.residuos().filter(r => RESIDUOS_PERIGOSOS.includes(r.nome) && r.marcado);

  atualizarOrganizacao<K extends keyof DadosOrganizacao>(campo: K, valor: DadosOrganizacao[K]): void {
    this.organizacao.update(o => ({ ...o, [campo]: valor }));
  }

  atualizarEndereco<K extends keyof DadosEndereco>(campo: K, valor: DadosEndereco[K]): void {
    this.endereco.update(e => ({ ...e, [campo]: valor }));
  }

  atualizarRaio(valor: string): void {
    this.atualizarEndereco('raioKm', Number(valor) || 0);
  }

  atualizarCapacidade<K extends keyof DadosCapacidade>(campo: K, valor: DadosCapacidade[K]): void {
    this.capacidade.update(c => ({ ...c, [campo]: valor }));
  }

  atualizarPesoMaximo(valor: string): void {
    const numero = Number(valor.replace(/[^0-9.]/g, ''));
    this.atualizarCapacidade('pesoMaximoKg', numero || 0);
  }

  atualizarLicenca<K extends keyof DadosLicenca>(campo: K, valor: DadosLicenca[K]): void {
    this.licenca.update(l => ({ ...l, [campo]: valor }));
  }

  alternarResiduo(index: number): void {
    this.residuos.update(lista => lista.map((r, i) => (i === index ? { ...r, marcado: !r.marcado } : r)));
  }

  irParaEtapa(etapa: number): void {
    if (etapa <= this.etapaMaximaAlcancada()) this.etapaAtual.set(etapa);
  }

  avancar(): void {
    const proxima = Math.min(4, this.etapaAtual() + 1);
    this.etapaAtual.set(proxima);
    this.etapaMaximaAlcancada.update(max => Math.max(max, proxima));
  }

  voltar(): void {
    this.etapaAtual.set(Math.max(1, this.etapaAtual() - 1));
  }

  alternarAta(): void {
    this.ataEnviada.set(!this.ataEnviada());
  }

  async enviarParaAnalise(): Promise<void> {
    if (!this.confirmaVeracidade() || this.enviando()) return;

    if (this.senha().length < 6) {
      this.erroEnvio.set('A senha precisa ter pelo menos 6 caracteres.');
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
    };

    const { erro, pendenteConfirmacao } = await this.cooperativaService.criar(dados, this.senha());

    this.enviando.set(false);

    if (erro) {
      this.erroEnvio.set(erro);
      this.toast.mostrar(erro);
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

  salvarRascunho(): void {
    const rascunho: RascunhoCadastro = {
      etapaAtual: this.etapaAtual(),
      etapaMaximaAlcancada: this.etapaMaximaAlcancada(),
      organizacao: this.organizacao(),
      endereco: this.endereco(),
      residuos: this.residuos(),
      capacidade: this.capacidade(),
      licenca: this.licenca(),
      ataEnviada: this.ataEnviada(),
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
      this.ataEnviada.set(rascunho.ataEnviada);
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

  arquivoSelecionado(event: Event): void {
    const arquivo = (event.target as HTMLInputElement).files?.[0];
    if (!arquivo || !this.uploadAlvo) return;

    const meta = arquivo.size < 1024 * 1024
      ? `${Math.max(1, Math.round(arquivo.size / 1024))} KB · enviado agora`
      : `${(arquivo.size / (1024 * 1024)).toFixed(1)} MB · enviado agora`;

    if (this.uploadAlvo === 'licenca') {
      this.licencaArquivo.set({ nome: arquivo.name, meta });
    } else {
      this.cnpjArquivo.set({ nome: arquivo.name, meta });
    }

    this.toast.mostrar(`${arquivo.name} enviado.`);
    this.uploadAlvo = null;
  }
}
