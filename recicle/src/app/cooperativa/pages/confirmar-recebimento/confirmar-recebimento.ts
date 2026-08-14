import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DadosColeta, Solicitacao, SolicitacoesStore, TriagemItem } from '../../data/solicitacoes.store';
import { ToastService } from '../../shared/toast.service';

const PONTOS_POR_KG = 4.2;
const CODIGO_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MOTIVOS_PROBLEMA = [
  'Endereço não encontrado ou morador ausente',
  'Material divergente do combinado',
  'Risco de segurança no local',
  'Outro',
];

function gerarCodigo(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;

  let codigo = '';
  for (let i = 0; i < 4; i++) {
    codigo += CODIGO_CHARS[hash % CODIGO_CHARS.length];
    hash = Math.floor(hash / CODIGO_CHARS.length);
  }
  return codigo;
}

@Component({
  selector: 'app-confirmar-recebimento',
  imports: [RouterLink],
  templateUrl: './confirmar-recebimento.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './confirmar-recebimento.css'],
})
export class ConfirmarRecebimento {
  private readonly store = inject(SolicitacoesStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly motivosProblema = MOTIVOS_PROBLEMA;

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly solicitacao = signal<Solicitacao | undefined>(this.store.buscarPorId(this.id));
  readonly codigoEsperado = gerarCodigo(this.id);

  readonly codigoDigitado = signal<string[]>(['', '', '', '']);
  readonly codigoCompleto = computed(() => this.codigoDigitado().join(''));
  readonly codigoValido = computed(
    () => this.codigoCompleto().length === 4 && this.codigoCompleto() === this.codigoEsperado
  );

  private readonly dadosIniciais = this.solicitacao()?.dadosColeta;

  readonly pesoRecebido = signal(this.dadosIniciais?.pesoRecebidoKg ?? this.solicitacao()?.pesoEstimadoKg ?? 0);
  readonly rejeitoKg = signal(this.dadosIniciais?.rejeitoKg ?? 0);
  readonly rejeitoNota = signal(this.dadosIniciais ? 'espuma' : '');
  readonly triagem = signal<TriagemItem[]>(
    this.dadosIniciais?.triagem ?? [
      { material: 'Material triado', kg: this.solicitacao()?.pesoEstimadoKg ?? 0, checado: true },
    ]
  );

  readonly pesoEstimado = computed(() => this.solicitacao()?.pesoEstimadoKg ?? 0);

  readonly divergenciaKg = computed(() => +(this.pesoEstimado() - this.pesoRecebido()).toFixed(1));

  readonly pontosCreditados = computed(() =>
    Math.max(0, Math.round((this.pesoRecebido() - this.rejeitoKg()) * PONTOS_POR_KG))
  );

  readonly problemaAberto = signal(false);
  readonly motivoProblema = signal(MOTIVOS_PROBLEMA[0]);
  readonly descricaoProblema = signal('');

  readonly fotoSelecionada = signal(false);

  formatarDivergencia(): string {
    const abs = Math.abs(this.divergenciaKg());
    return abs.toFixed(1).replace('.', ',');
  }

  atualizarDigito(index: number, valor: string, proximo: HTMLInputElement | null): void {
    const caractere = valor.slice(-1).toUpperCase();
    this.codigoDigitado.update(arr => {
      const copia = [...arr];
      copia[index] = caractere;
      return copia;
    });
    if (caractere && proximo) proximo.focus();
  }

  atualizarPesoRecebido(valor: string): void {
    this.pesoRecebido.set(Number(valor) || 0);
  }

  atualizarRejeito(valor: string): void {
    this.rejeitoKg.set(Number(valor) || 0);
  }

  atualizarRejeitoNota(valor: string): void {
    this.rejeitoNota.set(valor);
  }

  alternarTriagem(index: number): void {
    this.triagem.update(itens =>
      itens.map((item, i) => (i === index ? { ...item, checado: !item.checado } : item))
    );
  }

  atualizarTriagemKg(index: number, valor: string): void {
    const kg = Number(valor) || 0;
    this.triagem.update(itens => itens.map((item, i) => (i === index ? { ...item, kg } : item)));
  }

  confirmar(): void {
    if (!this.codigoValido()) return;

    const dados: DadosColeta = {
      pesoRecebidoKg: this.pesoRecebido(),
      rejeitoKg: this.rejeitoKg(),
      triagem: this.triagem(),
    };

    this.store.confirmarRecebimento(this.id, dados);
    this.toast.mostrar('Recebimento confirmado e pontos creditados.');
    this.router.navigate(['/cooperativa/solicitacoes']);
  }

  abrirProblema(): void {
    this.motivoProblema.set(MOTIVOS_PROBLEMA[0]);
    this.descricaoProblema.set('');
    this.problemaAberto.set(true);
  }

  fecharProblema(): void {
    this.problemaAberto.set(false);
  }

  enviarProblema(): void {
    this.store.registrarProblema(this.id, this.motivoProblema(), this.descricaoProblema());
    this.fecharProblema();
    this.toast.mostrar('Problema registrado. Nossa equipe vai revisar.');
    this.router.navigate(['/cooperativa/solicitacoes']);
  }

  selecionarFoto(): void {
    this.fotoSelecionada.set(true);
  }

  confirmarPorFoto(): void {
    if (!this.fotoSelecionada()) return;

    const dados: DadosColeta = {
      pesoRecebidoKg: this.pesoRecebido(),
      rejeitoKg: this.rejeitoKg(),
      triagem: this.triagem(),
      viaFoto: true,
    };

    this.store.confirmarRecebimento(this.id, dados);
    this.toast.mostrar('Enviado por foto. A coleta fica marcada para conferência.');
    this.router.navigate(['/cooperativa/solicitacoes']);
  }
}
