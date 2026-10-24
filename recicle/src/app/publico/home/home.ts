import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../supabase.service';
import { PublicoShell } from '../layout/publico-shell';
import { Reveal } from '../../shared/ui/reveal';
import { Contador } from '../../shared/ui/contador';

@Component({
  selector: 'app-publico-home',
  imports: [PublicoShell, RouterLink, Reveal, Contador],
  templateUrl: './home.html',
  styleUrls: ['../../shared/ui/design-system.css', './home.css'],
})
export class Home {
  private readonly client = inject(SupabaseService).client;
  private readonly router = inject(Router);

  /** Números reais do projeto — sem dado inventado na vitrine. */
  readonly cooperativasAtivas = signal<number | null>(null);
  readonly ecopontosAtivos = signal<number | null>(null);

  readonly materiais = [
    {
      nome: 'Plástico',
      exemplos: 'Garrafas PET, potes, embalagens limpas',
      foto: '/img/garrafas-latas.webp',
      alt: 'Monte de garrafas plásticas coloridas',
    },
    {
      nome: 'Papel e papelão',
      exemplos: 'Caixas desmontadas, jornal, folhas',
      foto: '/img/papelao.webp',
      alt: 'Caixas de papelão amassadas e empilhadas',
    },
    {
      nome: 'Metal',
      exemplos: 'Latas de alumínio, tampas, sucata leve',
      foto: '/img/latas.webp',
      alt: 'Pilha de latas de alumínio prensadas',
    },
    {
      nome: 'Vidro e misturados',
      exemplos: 'Garrafas, potes de vidro, tampinhas',
      foto: '/img/balde-garrafas.webp',
      alt: 'Baldes com garrafas de vidro e tampinhas separadas',
    },
  ];

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
