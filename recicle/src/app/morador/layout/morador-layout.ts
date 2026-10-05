import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/data/auth.service';
import { MoradorService } from '../data/morador.service';
import { PontosStore } from '../data/pontos.store';

@Component({
  selector: 'app-morador-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './morador-layout.html',
  styleUrls: ['../../shared/ui/design-system.css', './morador-layout.css'],
})
export class MoradorLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly moradorService = inject(MoradorService);
  private readonly pontosStore = inject(PontosStore);

  readonly morador = this.moradorService.morador;
  readonly saldo = this.pontosStore.saldo;
  readonly menuAberto = signal(false);

  readonly iniciais = computed(() => {
    const nome = this.morador()?.nome?.trim() ?? '';
    if (!nome) return '';
    const partes = nome.split(/\s+/);
    const primeira = partes[0]?.[0] ?? '';
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (primeira + ultima).toUpperCase();
  });

  constructor() {
    this.pontosStore.carregar();
  }

  alternarMenu(): void {
    this.menuAberto.update(v => !v);
  }

  fecharMenu(): void {
    this.menuAberto.set(false);
  }

  async sair(): Promise<void> {
    this.fecharMenu();
    await this.auth.sair();
    this.router.navigate(['/entrar']);
  }
}
