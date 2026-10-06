import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/data/auth.service';
import { CooperativaService } from '../data/cooperativa.service';
import { lerMesAno, licencaVencida } from '../../shared/util/validators';

const STATUS_INFO: Record<string, { classe: string; texto: string }> = {
  aprovado: { classe: 'aprovado', texto: 'cadastro aprovado' },
  reprovado: { classe: 'reprovado', texto: 'cadastro não aprovado' },
  em_analise: { classe: 'pendente', texto: 'cadastro em andamento' },
};


@Component({
  selector: 'app-cooperativa-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './cooperativa-layout.html',
  styleUrls: ['../../shared/ui/design-system.css', './cooperativa-layout.css'],
})
export class CooperativaLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cooperativaService = inject(CooperativaService);

  readonly cooperativa = this.cooperativaService.cooperativa;

  readonly aprovada = computed(() => this.cooperativa()?.statusCadastro === 'aprovado');

  /**
   * Linha de baixo do card da sidebar. Quando a licença está cadastrada é ela que
   * aparece ("licença válida até 03/2027", como nas telas); sem licença preenchida
   * cai no status do cadastro, que é o único dado que sempre existe.
   */
  readonly statusInfo = computed(() => {
    const cooperativa = this.cooperativa();
    const padrao = STATUS_INFO[cooperativa?.statusCadastro ?? 'em_analise'];
    const validade = lerMesAno(cooperativa?.licencaValidade);
    if (cooperativa?.statusCadastro !== 'aprovado' || !validade) return padrao;

    const vencida = licencaVencida(validade);
    const mesAno = `${String(validade.mes).padStart(2, '0')}/${validade.ano}`;
    return {
      classe: vencida ? 'reprovado' : 'aprovado',
      texto: `licença ${vencida ? 'vencida em' : 'válida até'} ${mesAno}`,
    };
  });

  async sair(): Promise<void> {
    await this.auth.sair();
    this.router.navigate(['/cooperativa/entrar']);
  }
}
