import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

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
  readonly documentos = DOCUMENTOS_ANALISE;
  readonly tarefas = TAREFAS;

  readonly enviadoEm = `hoje, ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  readonly statusLabel: Record<StatusDocumentoAnalise, string> = {
    'em-conferencia': 'Em conferência',
    validado: 'Validado',
  };
}
