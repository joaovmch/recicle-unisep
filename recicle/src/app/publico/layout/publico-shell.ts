import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Moldura das telas públicas (home, como funciona): topbar + rodapé em volta do
 * conteúdo projetado. Fica como componente de projeção em vez de rota-pai porque
 * as rotas do morador também moram na raiz — um layout com children em path ''
 * dependeria do backtracking do router pra deixar /chat, /painel etc. passarem.
 */
@Component({
  selector: 'app-publico-shell',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './publico-shell.html',
  styleUrls: ['../../shared/ui/design-system.css', './publico-shell.css'],
})
export class PublicoShell {}
