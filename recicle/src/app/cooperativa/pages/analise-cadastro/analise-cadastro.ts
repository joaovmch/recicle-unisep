import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../data/auth.service';
import { CooperativaService } from '../../data/cooperativa.service';

type StatusDocumentoAnalise = 'em-conferencia' | 'validado';

interface DocumentoAnalise {
  nome: string;
  status: StatusDocumentoAnalise;
}

interface TarefaEnquantoIsso {
  texto: string;
  feita: boolean;
}

const DOCUMENTOS_ANALISE: DocumentoAnalise[] = [
  { nome: 'Licença ambiental de operação', status: 'em-conferencia' },
  { nome: 'Cartão CNPJ', status: 'em-conferencia' },
  { nome: 'Ata de eleição da diretoria', status: 'em-conferencia' },
  { nome: 'Licença para resíduo perigoso', status: 'em-conferencia' },
];

const TAREFAS: TarefaEnquantoIsso[] = [
  { texto: 'Marcar os resíduos aceitos', feita: false },
  { texto: 'Definir a área de cobertura', feita: false },
  { texto: 'Cadastrar equipe e veículos', feita: false },
  { texto: 'Definir quem confirma recebimento', feita: false },
];

@Component({
  selector: 'app-analise-cadastro',
  imports: [RouterLink],
  templateUrl: './analise-cadastro.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './analise-cadastro.css'],
})
export class AnaliseCadastro {
  private readonly auth = inject(AuthService);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly router = inject(Router);

  readonly documentos = DOCUMENTOS_ANALISE;
  readonly tarefas = TAREFAS;

  readonly enviadoEm = `hoje, ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  readonly statusLabel: Record<StatusDocumentoAnalise, string> = {
    'em-conferencia': 'Em conferência',
    validado: 'Validado',
  };

  constructor() {
    this.redirecionarSeAprovado();
  }

  private async redirecionarSeAprovado(): Promise<void> {
    const sessao = await this.auth.sessaoAtual();
    if (!sessao) return;

    const cooperativa = await this.cooperativaService.carregar();
    if (cooperativa?.statusCadastro === 'aprovado') {
      this.router.navigate(['/cooperativa/dashboard']);
    }
  }

  async sair(): Promise<void> {
    await this.auth.sair();
    this.router.navigate(['/cooperativa/entrar']);
  }
}
