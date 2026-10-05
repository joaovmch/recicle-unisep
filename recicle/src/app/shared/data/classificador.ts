/**
 * Classificador de resíduo.
 *
 * `classificar()` é a regra determinística por palavra-chave original — síncrona, sem
 * rede, usada como base de comparação e como fallback. `classificarComIA()` é o caminho
 * real usado pelo chat: chama `/api/classificar` (que fala com o Gemini no servidor,
 * guardando a chave fora do navegador) e, se a chamada falhar por qualquer motivo (sem
 * internet, servidor fora, chave não configurada), cai de volta nesta mesma regra local —
 * o chat nunca trava por causa da IA.
 */

export interface PassoPreparo {
  titulo: string;
  descricao: string;
}

export interface Classificacao {
  categoria: string;
  materiais: string;
  reciclavel: 'Sim' | 'Parcialmente' | 'Não';
  pesoEstimadoKg: number;
  aceitaColetaComum: boolean;
  atencao: string | null;
  passos: PassoPreparo[];
  /** pontos por kg usados no cálculo da previsão */
  pontosPorKg: number;
}

interface Regra {
  termos: string[];
  categoria: string;
  materiais: string;
  reciclavel: Classificacao['reciclavel'];
  pesoPadraoKg: number;
  aceitaColetaComum: boolean;
  atencao: string | null;
  passos: PassoPreparo[];
}

const PASSO_JUNTAR: PassoPreparo = {
  titulo: 'Junte tudo em um lugar só',
  descricao: 'Deixe as peças agrupadas e acessíveis para a pesagem no recebimento.',
};

const REGRAS: Regra[] = [
  {
    termos: ['cadeira', 'sofá', 'sofa', 'mesa', 'colchão', 'colchao', 'armário', 'armario', 'estante', 'móvel', 'movel', 'poltrona'],
    categoria: 'Volumoso / mobiliário',
    materiais: 'Madeira, metal, espuma',
    reciclavel: 'Parcialmente',
    pesoPadraoKg: 12,
    aceitaColetaComum: false,
    atencao: 'A espuma do estofado é rejeito na maioria das cooperativas. Separe antes de entregar.',
    passos: [
      { titulo: 'Separe os materiais', descricao: 'Tire o estofado e a espuma. Madeira/plástico e metal vão para fluxos diferentes.' },
      { titulo: 'Desmonte o que der', descricao: 'Remova rodinhas e pistão a gás — o pistão é pressurizado e vai separado.' },
      { titulo: 'Limpe o que for reciclável', descricao: 'Peças com resíduo orgânico ou óleo são recusadas na triagem.' },
      PASSO_JUNTAR,
    ],
  },
  {
    termos: ['geladeira', 'fogão', 'fogao', 'máquina de lavar', 'maquina de lavar', 'micro-ondas', 'microondas', 'ar condicionado', 'eletrodoméstico', 'eletrodomestico'],
    categoria: 'Eletrodoméstico',
    materiais: 'Metal, plástico, componentes elétricos',
    reciclavel: 'Parcialmente',
    pesoPadraoKg: 45,
    aceitaColetaComum: false,
    atencao: 'Aparelho com gás refrigerante precisa de cooperativa licenciada — não desmonte por conta própria.',
    passos: [
      { titulo: 'Esvazie o aparelho', descricao: 'Retire alimentos, prateleiras soltas e qualquer líquido.' },
      { titulo: 'Não remova o compressor', descricao: 'O gás precisa ser recolhido por quem tem licença específica.' },
      { titulo: 'Enrole o cabo', descricao: 'Prenda o cabo de força junto ao aparelho para não enroscar no transporte.' },
      PASSO_JUNTAR,
    ],
  },
  {
    termos: ['eletrônico', 'eletronico', 'computador', 'notebook', 'celular', 'tv', 'televisão', 'televisao', 'monitor', 'impressora'],
    categoria: 'Eletrônico',
    materiais: 'Plástico, metais, placa eletrônica',
    reciclavel: 'Parcialmente',
    pesoPadraoKg: 7,
    aceitaColetaComum: false,
    atencao: 'Apague seus dados antes de entregar. Placa eletrônica só pode ir para quem tem licença de resíduo perigoso.',
    passos: [
      { titulo: 'Apague seus dados', descricao: 'Faça o reset de fábrica ou remova o disco antes de entregar.' },
      { titulo: 'Separe as pilhas e baterias', descricao: 'Elas seguem um fluxo próprio, diferente do resto do aparelho.' },
      { titulo: 'Junte os cabos', descricao: 'Cabos e fontes também são recicláveis e entram na mesma entrega.' },
      PASSO_JUNTAR,
    ],
  },
  {
    termos: ['pilha', 'bateria', 'lâmpada', 'lampada'],
    categoria: 'Resíduo perigoso',
    materiais: 'Metais pesados',
    reciclavel: 'Sim',
    pesoPadraoKg: 1,
    aceitaColetaComum: false,
    atencao: 'Nunca vá no lixo comum: o material contamina solo e água. Só cooperativa licenciada recebe.',
    passos: [
      { titulo: 'Não perfure nem queime', descricao: 'Pilha estufada ou vazando deve ir em saco plástico separado.' },
      { titulo: 'Guarde em recipiente rígido', descricao: 'Uma caixa ou pote fechado evita contato entre os polos.' },
      { titulo: 'Confirme quem recebe', descricao: 'Só leve a locais marcados como licenciados para resíduo perigoso.' },
    ],
  },
  {
    termos: ['óleo', 'oleo', 'gordura'],
    categoria: 'Óleo de cozinha',
    materiais: 'Óleo vegetal usado',
    reciclavel: 'Sim',
    pesoPadraoKg: 5,
    aceitaColetaComum: false,
    atencao: 'Óleo na pia entope a rede e contamina a água. Nunca descarte no ralo.',
    passos: [
      { titulo: 'Espere esfriar', descricao: 'Nunca transfira o óleo ainda quente para a garrafa.' },
      { titulo: 'Coe os resíduos sólidos', descricao: 'Restos de comida estragam o lote inteiro na reciclagem.' },
      { titulo: 'Use garrafa PET fechada', descricao: 'Encha até pouco antes do gargalo e feche bem a tampa.' },
    ],
  },
  {
    termos: ['entulho', 'tijolo', 'cimento', 'reforma', 'azulejo', 'concreto'],
    categoria: 'Entulho classe A',
    materiais: 'Alvenaria, concreto, cerâmica',
    reciclavel: 'Parcialmente',
    pesoPadraoKg: 400,
    aceitaColetaComum: false,
    atencao: 'Entulho exige caçamba e nem toda cooperativa aceita. Confira antes de agendar.',
    passos: [
      { titulo: 'Separe do resto', descricao: 'Entulho misturado com madeira ou gesso costuma ser recusado.' },
      { titulo: 'Ensaque o material fino', descricao: 'Poeira e cacos soltos dificultam a pesagem e o transporte.' },
      { titulo: 'Deixe em local acessível', descricao: 'O veículo precisa encostar perto do ponto de carga.' },
    ],
  },
  {
    termos: ['papelão', 'papelao', 'papel', 'caixa', 'revista', 'jornal'],
    categoria: 'Papel e papelão',
    materiais: 'Papel, papelão',
    reciclavel: 'Sim',
    pesoPadraoKg: 8,
    aceitaColetaComum: true,
    atencao: null,
    passos: [
      { titulo: 'Desmonte as caixas', descricao: 'Papelão aberto e achatado rende muito mais espaço no transporte.' },
      { titulo: 'Tire fitas e etiquetas', descricao: 'Fita adesiva e plástico atrapalham a reciclagem do papel.' },
      { titulo: 'Mantenha seco', descricao: 'Papel molhado ou engordurado perde valor e vira rejeito.' },
    ],
  },
  {
    termos: ['plástico', 'plastico', 'garrafa', 'pet', 'embalagem'],
    categoria: 'Plástico',
    materiais: 'Plástico',
    reciclavel: 'Sim',
    pesoPadraoKg: 4,
    aceitaColetaComum: true,
    atencao: null,
    passos: [
      { titulo: 'Enxágue a embalagem', descricao: 'Resto de comida ou bebida contamina o lote na triagem.' },
      { titulo: 'Amasse para ocupar menos', descricao: 'Garrafas amassadas rendem mais por saco.' },
      { titulo: 'Junte as tampas', descricao: 'Tampas são de outro plástico — separe em um saquinho.' },
    ],
  },
  {
    termos: ['vidro', 'garrafa de vidro', 'pote de vidro'],
    categoria: 'Vidro',
    materiais: 'Vidro',
    reciclavel: 'Sim',
    pesoPadraoKg: 6,
    aceitaColetaComum: true,
    atencao: 'Vidro quebrado precisa ir embalado — avise quem vai receber.',
    passos: [
      { titulo: 'Enxágue e escorra', descricao: 'Retire restos do conteúdo antes de guardar.' },
      { titulo: 'Embale o que estiver quebrado', descricao: 'Jornal grosso ou caixa de papelão evita corte na triagem.' },
      { titulo: 'Separe das tampas', descricao: 'Tampas metálicas e plásticas vão em fluxos diferentes.' },
    ],
  },
  {
    termos: ['metal', 'alumínio', 'aluminio', 'lata', 'ferro'],
    categoria: 'Metal',
    materiais: 'Metal',
    reciclavel: 'Sim',
    pesoPadraoKg: 5,
    aceitaColetaComum: true,
    atencao: null,
    passos: [
      { titulo: 'Enxágue as latas', descricao: 'Sobra de alimento atrai insetos no galpão de triagem.' },
      { titulo: 'Amasse o que der', descricao: 'Latas amassadas ocupam bem menos espaço.' },
      { titulo: 'Separe ferro de alumínio', descricao: 'São vendidos por preços diferentes — ajuda a cooperativa.' },
    ],
  },
];

const PADRAO: Omit<Regra, 'termos'> = {
  categoria: 'A conferir',
  materiais: 'Não identificado',
  reciclavel: 'Parcialmente',
  pesoPadraoKg: 5,
  aceitaColetaComum: false,
  atencao: 'Não consegui identificar com certeza. Descreva o material e o tamanho para eu confirmar o destino.',
  passos: [
    { titulo: 'Descreva o material', descricao: 'Diga do que é feito (plástico, metal, madeira, vidro) e o tamanho aproximado.' },
    { titulo: 'Separe do lixo comum', descricao: 'Enquanto o destino não estiver confirmado, guarde em local seco.' },
  ],
};

/** Pontos por kg conforme a tabela mostrada em "Meus pontos". */
const PONTOS_POR_KG_ENTREGA = 5;
const PONTOS_POR_LITRO_OLEO = 16;

/**
 * Pontuação é política do produto, não julgamento da IA — por isso é calculada aqui,
 * por categoria, tanto para a classificação local quanto para a resposta da IA remota
 * (veja `classificador-ia.server.ts`), em vez de vir embutida na resposta do modelo.
 */
export function pontosPorKgDe(categoria: string): number {
  return categoria === 'Óleo de cozinha' ? PONTOS_POR_LITRO_OLEO : PONTOS_POR_KG_ENTREGA;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Tira um peso do texto ("mais ou menos 12 kg", "5 litros") quando a pessoa informa. */
function pesoInformado(texto: string): number | null {
  const m = normalizar(texto).match(/(\d+[.,]?\d*)\s*(kg|quilos?|litros?|l)\b/);
  if (!m) return null;
  const valor = Number(m[1].replace(',', '.'));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/**
 * Radical de cada palavra, para "embalagens" casar com "embalagem" e "plásticas" com
 * "plástico": tira o plural (s / ns→m) e a vogal final. Comparar palavras inteiras evita
 * falsos positivos de substring ("tapete" contém "pet", "automóvel" contém "movel").
 */
function radicais(texto: string): string {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(p => p.replace(/s$/, '').replace(/[nm]$/, '').replace(/[aeo]$/, ''))
    .join(' ');
}

/** Tamanho do termo mais longo da regra que aparece no texto (0 = nenhum). */
function forcaDaRegra(regra: Regra, alvo: string): number {
  let melhor = 0;
  for (const termo of regra.termos) {
    const r = radicais(termo);
    if (r && ` ${alvo} `.includes(` ${r} `)) melhor = Math.max(melhor, r.length);
  }
  return melhor;
}

export function classificar(descricao: string): Classificacao {
  const alvo = radicais(descricao);

  // O termo mais específico vence: "garrafa de vidro" é Vidro, não Plástico por causa de "garrafa".
  let regra: Regra = { ...PADRAO, termos: [] };
  let melhor = 0;
  for (const r of REGRAS) {
    const forca = forcaDaRegra(r, alvo);
    if (forca > melhor) {
      melhor = forca;
      regra = r;
    }
  }

  const peso = pesoInformado(descricao) ?? regra.pesoPadraoKg;
  const pontosPorKg = pontosPorKgDe(regra.categoria);

  return {
    categoria: regra.categoria,
    materiais: regra.materiais,
    reciclavel: regra.reciclavel,
    pesoEstimadoKg: peso,
    aceitaColetaComum: regra.aceitaColetaComum,
    atencao: regra.atencao,
    passos: regra.passos,
    pontosPorKg,
  };
}

/** Texto de abertura da resposta, adaptado ao que foi identificado. */
export function respostaDaIa(c: Classificacao): string {
  if (c.categoria === 'A conferir') {
    return 'Ainda não consegui identificar esse item. Me conta do que ele é feito e o tamanho aproximado.';
  }
  const tipo = c.aceitaColetaComum
    ? 'dá para reciclar na coleta comum, mas rende mais numa cooperativa'
    : 'não vai na coleta comum';
  return `Identifiquei: ${c.categoria.toLowerCase()} (${c.materiais.toLowerCase()}). Esse resíduo ${tipo}. Faz assim antes de entregar:`;
}

export function pontosPrevistos(c: Classificacao, destino: 'coleta_casa' | 'entrega_ecoponto'): number {
  // Coleta em casa rende 75% do valor da entrega — a cooperativa gasta viagem.
  const fator = destino === 'entrega_ecoponto' ? 1 : 0.75;
  return Math.round(c.pesoEstimadoKg * c.pontosPorKg * fator);
}

function ehClassificacaoValida(v: unknown): v is Classificacao {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c['categoria'] === 'string' &&
    typeof c['materiais'] === 'string' &&
    (c['reciclavel'] === 'Sim' || c['reciclavel'] === 'Parcialmente' || c['reciclavel'] === 'Não') &&
    typeof c['pesoEstimadoKg'] === 'number' &&
    typeof c['aceitaColetaComum'] === 'boolean' &&
    (c['atencao'] === null || typeof c['atencao'] === 'string') &&
    Array.isArray(c['passos']) &&
    typeof c['pontosPorKg'] === 'number'
  );
}

/**
 * Chamado pelo chat de verdade: pede a classificação ao endpoint `/api/classificar`
 * (IA real, no servidor) e só usa a regra local se a chamada falhar ou vier com um
 * formato inesperado — assim a conversa nunca fica sem resposta.
 */
export async function classificarComIA(descricao: string): Promise<Classificacao> {
  try {
    const resposta = await fetch('/api/classificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descricao }),
    });
    if (!resposta.ok) throw new Error(`classificar: ${resposta.status}`);

    const dados = await resposta.json();
    if (!ehClassificacaoValida(dados)) throw new Error('classificar: formato inesperado');
    return dados;
  } catch {
    return classificar(descricao);
  }
}
