import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../supabase.service';

interface Passo {
  numero: string;
  titulo: string;
  descricao: string;
}

const COMO_FUNCIONA: Passo[] = [
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
  selector: 'app-publico-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrls: ['../../shared/ui/design-system.css', './home.css'],
})
export class Home {
  private readonly client = inject(SupabaseService).client;
  private readonly router = inject(Router);

  readonly passos = COMO_FUNCIONA;

  /** Números reais do projeto — sem dado inventado na vitrine. */
  readonly cooperativasAtivas = signal<number | null>(null);
  readonly ecopontosAtivos = signal<number | null>(null);

  constructor() {
    this.carregarNumeros();
  }

  private async carregarNumeros(): Promise<void> {
    const [{ count: cooperativas }, { count: ecopontos }] = await Promise.all([
      // View pública: a tabela cooperativas não é legível por visitante (tem dados do responsável).
      this.client.from('cooperativas_publicas').select('id', { count: 'exact', head: true }),
      this.client.from('ecopontos').select('id', { count: 'exact', head: true }).eq('ativo', true),
    ]);

    this.cooperativasAtivas.set(cooperativas ?? 0);
    this.ecopontosAtivos.set(ecopontos ?? 0);
  }

  comecar(): void {
    this.router.navigate(['/entrar']);
  }
}
