import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input, numberAttribute } from '@angular/core';

/**
 * Faz o elemento surgir (fade + leve subida) quando entra na tela ao rolar.
 *
 *   <section rcReveal>…</section>
 *   <article [rcReveal]="i * 80">…</article>   ← atraso em ms, para escalonar listas
 *
 * Só roda no navegador (afterNextRender) e só esconde o que ainda está fora da tela
 * naquele momento: o que já aparece no primeiro paint fica como está, sem piscar.
 * O estilo (.rc-reveal / .rc-visivel) mora no styles.css global.
 */
@Directive({ selector: '[rcReveal]' })
export class Reveal {
  /** Atraso da animação em milissegundos. */
  readonly rcReveal = input(0, { transform: (v: unknown) => numberAttribute(v, 0) });

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;

      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) return;

      el.style.setProperty('--rc-reveal-delay', `${this.rcReveal()}ms`);
      el.classList.add('rc-reveal');

      const observer = new IntersectionObserver(
        entradas => {
          for (const entrada of entradas) {
            if (!entrada.isIntersecting) continue;
            el.classList.add('rc-visivel');
            observer.disconnect();
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
      );
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
