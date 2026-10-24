import { Directive, ElementRef, PLATFORM_ID, effect, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Número que "conta" de 0 até o valor quando chega (ex.: total de cooperativas).
 * Enquanto o valor é null mostra o traço; no servidor escreve o número direto.
 *
 *   <strong [rcContador]="total()"></strong>
 */
@Directive({ selector: '[rcContador]' })
export class Contador {
  readonly rcContador = input<number | null>(null);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly noBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private quadro = 0;

  constructor() {
    effect(onCleanup => {
      const alvo = this.rcContador();
      if (alvo === null) {
        this.el.textContent = '—';
        return;
      }

      const semMovimento = this.noBrowser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!this.noBrowser || semMovimento || alvo === 0) {
        this.el.textContent = String(alvo);
        return;
      }

      const duracao = Math.min(1400, 500 + alvo * 40);
      const inicio = performance.now();
      const passo = (agora: number) => {
        const t = Math.min(1, (agora - inicio) / duracao);
        const suave = 1 - Math.pow(1 - t, 3);
        this.el.textContent = String(Math.round(alvo * suave));
        if (t < 1) this.quadro = requestAnimationFrame(passo);
      };
      this.quadro = requestAnimationFrame(passo);
      onCleanup(() => cancelAnimationFrame(this.quadro));
    });
  }
}
