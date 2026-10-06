import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PublicoShell } from '../layout/publico-shell';

interface Passo {
  numero: string;
  titulo: string;
  descricao: string;
}

const PASSOS: Passo[] = [
  {
    numero: '01',
    titulo: 'Descreva o resíduo',
    descricao: 'Digite ou envie uma foto. O assistente classifica o tipo, o material e o risco de contaminação.',
  },
  {
    numero: '02',
    titulo: 'Receba o passo a passo',
    descricao: 'Instruções de higienização, separação e desmontagem — específicas para aquele resíduo.',
  },
  {
    numero: '03',
    titulo: 'Escolha o destino',
    descricao: 'Ecoponto ou cooperativa no mapa, ou uma coleta em casa por uma empresa licenciada.',
  },
  {
    numero: '04',
    titulo: 'Confirme e pontue',
    descricao: 'A cooperativa confirma o recebimento e seus pontos entram no histórico.',
  },
];

@Component({
  selector: 'app-publico-como-funciona',
  imports: [PublicoShell, RouterLink],
  templateUrl: './como-funciona.html',
  styleUrls: ['../../shared/ui/design-system.css', './como-funciona.css'],
})
export class ComoFunciona {
  private readonly router = inject(Router);

  readonly passos = PASSOS;

  comecar(): void {
    this.router.navigate(['/entrar']);
  }
}
