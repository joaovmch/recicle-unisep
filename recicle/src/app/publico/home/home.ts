import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../supabase.service';
import { PublicoShell } from '../layout/publico-shell';

@Component({
  selector: 'app-publico-home',
  imports: [PublicoShell, RouterLink],
  templateUrl: './home.html',
  styleUrls: ['../../shared/ui/design-system.css', './home.css'],
})
export class Home {
  private readonly client = inject(SupabaseService).client;
  private readonly router = inject(Router);

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
