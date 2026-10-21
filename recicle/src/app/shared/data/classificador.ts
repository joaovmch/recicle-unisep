/**
 * Classificador de resíduo.
 *
 * `classificar()` é a regra determinística por palavra-chave original — síncrona, sem
 * rede, usada como base de comparação e como fallback. `conversarComIA()` é o caminho
 * real usado pelo chat: chama `/api/conversar` (que fala com o Gemini no servidor,
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

/** Resposta do assistente: texto livre e, só quando a pessoa descreveu um item, a classificação. */
export interface RespostaAssistente {
  texto: string;
  classificacao: Classificacao | null;
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
  /**
   * Vence regras de prioridade menor que também casem: 2 para resíduo perigoso (o alerta não
   * pode se perder), 1 para termos que, quando aparecem, são o próprio item ("isopor da TV" é
   * isopor, não eletrônico). Sem valor = 0.
   */
  prioridade?: number;
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
    prioridade: 2,
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
    // Perfurocortantes e mercúrio: perigo imediato de corte/contaminação, nunca vão na coleta comum.
    termos: ['seringa', 'agulha', 'perfurocortante', 'perfuro cortante', 'termômetro', 'termometro', 'mercúrio', 'mercurio', 'lixo hospitalar', 'bisturi', 'lanceta'],
    prioridade: 2,
    categoria: 'Resíduo perigoso',
    materiais: 'Perfurocortante / contaminante',
    reciclavel: 'Não',
    pesoPadraoKg: 1,
    aceitaColetaComum: false,
    atencao: 'Risco de corte e contaminação. Nunca vá no lixo comum nem na reciclagem. Agulha e seringa vão em recipiente rígido fechado; termômetro de mercúrio e lixo de saúde só em ponto de coleta específico (posto de saúde ou farmácia).',
    passos: [
      { titulo: 'Não desmonte nem reencape', descricao: 'Coloque a agulha ou o perfurocortante direto num recipiente rígido e feche bem.' },
      { titulo: 'Mercúrio: não aspire nem jogue na pia', descricao: 'Recolha com papel, feche num pote de vidro e leve a um ponto de coleta específico.' },
      { titulo: 'Leve a um ponto de coleta de saúde', descricao: 'Posto de saúde, farmácia ou cooperativa licenciada para resíduo perigoso.' },
    ],
  },
  {
    termos: ['remédio', 'remedio', 'medicamento', 'tinta', 'solvente', 'thinner', 'agrotóxico', 'agrotoxico', 'veneno', 'inseticida', 'óleo de motor', 'oleo de motor', 'óleo lubrificante', 'oleo lubrificante', 'lubrificante', 'óleo de carro', 'oleo de carro', 'graxa', 'gasolina', 'querosene', 'combustível', 'combustivel'],
    prioridade: 2,
    categoria: 'Resíduo químico',
    materiais: 'Produto químico ou medicamento',
    reciclavel: 'Não',
    pesoPadraoKg: 1,
    aceitaColetaComum: false,
    atencao: 'Não jogue na pia, no ralo nem no lixo comum. Remédio vai para farmácia com ponto de coleta; tinta, óleo de motor e químicos, só para quem tem licença.',
    passos: [
      { titulo: 'Mantenha na embalagem original', descricao: 'Feche bem e não misture produtos diferentes no mesmo recipiente.' },
      { titulo: 'Não lave nem esvazie', descricao: 'Resto de tinta, óleo de motor ou remédio na água contamina a rede de esgoto.' },
      { titulo: 'Confirme quem recebe', descricao: 'Só leve a locais marcados como licenciados para resíduo perigoso.' },
    ],
  },
  {
    // Só óleo de cozinha/vegetal — óleo de motor é químico (regra acima, que vence por prioridade).
    termos: ['óleo de cozinha', 'oleo de cozinha', 'óleo vegetal', 'oleo vegetal', 'óleo de fritura', 'oleo de fritura', 'óleo', 'oleo', 'gordura'],
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
    termos: ['roupa', 'tecido', 'pano', 'lençol', 'lencol', 'toalha', 'cobertor', 'sapato', 'calçado', 'calcado', 'tênis', 'tenis'],
    categoria: 'Têxteis',
    materiais: 'Tecido, couro, borracha',
    reciclavel: 'Parcialmente',
    pesoPadraoKg: 3,
    aceitaColetaComum: false,
    atencao: 'Peça em bom estado vale mais doada do que reciclada — considere doar antes.',
    passos: [
      { titulo: 'Separe o que ainda dá para usar', descricao: 'Roupa e calçado em bom estado vão para doação, o resto para reciclagem.' },
      { titulo: 'Lave e deixe secar', descricao: 'Tecido úmido mofa no saco e estraga o lote inteiro.' },
      { titulo: 'Ensaque por tipo', descricao: 'Roupas num saco, calçados em outro, amarrados aos pares.' },
    ],
  },
  {
    termos: ['orgânico', 'organico', 'comida', 'casca', 'borra', 'poda', 'composteira'],
    categoria: 'Resíduo orgânico',
    materiais: 'Restos de alimento, folhas, poda',
    reciclavel: 'Não',
    pesoPadraoKg: 3,
    aceitaColetaComum: true,
    atencao: 'Não é reciclável, mas vira adubo. Nunca misture com recicláveis: contamina papel e plástico.',
    passos: [
      { titulo: 'Separe dos recicláveis', descricao: 'Sem plástico, vidro, guardanapo engordurado ou fita no meio.' },
      { titulo: 'Escorra o líquido', descricao: 'Resto molhado demais apodrece rápido e atrai bichos.' },
      { titulo: 'Use recipiente fechado', descricao: 'Balde com tampa ou saco bem amarrado até a entrega.' },
    ],
  },
  {
    termos: ['isopor', 'eps'],
    prioridade: 1,
    categoria: 'Plástico',
    materiais: 'Isopor (EPS)',
    reciclavel: 'Parcialmente',
    pesoPadraoKg: 1,
    aceitaColetaComum: false,
    atencao: 'Isopor é reciclável, mas nem toda cooperativa recebe. Confira antes de levar.',
    passos: [
      { titulo: 'Limpe bem', descricao: 'Isopor com resto de comida (bandeja, marmita) costuma ir para rejeito.' },
      { titulo: 'Não quebre em pedaços', descricao: 'Bolinhas soltas se espalham e não são aproveitadas.' },
      { titulo: 'Junte num saco grande', descricao: 'É leve e volumoso: um saco cheio facilita o transporte.' },
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

/**
 * Categorias que o app conhece — as mesmas das regras locais. A IA remota é obrigada a
 * escolher uma delas (enum no schema), para o pedido casar com os tipos de resíduo das
 * cooperativas e dos ecopontos.
 */
export const CATEGORIAS: readonly string[] = [...new Set([...REGRAS.map(r => r.categoria), PADRAO.categoria])];

/** Tipos de resíduo do cadastro (tabela `tipos_residuo`) que recebem cada categoria. */
const TIPOS_POR_CATEGORIA: Record<string, string[]> = {
  'Plástico': ['Plástico'],
  'Papel e papelão': ['Papel e papelão'],
  'Vidro': ['Vidro'],
  'Metal': ['Metal'],
  'Óleo de cozinha': ['Óleo de cozinha'],
  'Eletrônico': ['Eletrônicos'],
  'Eletrodoméstico': ['Eletrônicos', 'Metal'],
  'Volumoso / mobiliário': ['Móveis e estofados', 'Madeira'],
  'Entulho classe A': ['Entulho classe A'],
  'Têxteis': ['Têxteis'],
  'Resíduo orgânico': ['Resíduo orgânico'],
  'Resíduo perigoso': ['Pilhas e baterias', 'Lâmpadas'],
  'Resíduo químico': [],
};

/**
 * Nomes de tipo de resíduo que aceitam a categoria. Categoria desconhecida (pedido antigo,
 * gravado antes desta lista) devolve ela mesma, para ainda casar pelo nome.
 */
export function tiposDaCategoria(categoria: string): string[] {
  return TIPOS_POR_CATEGORIA[categoria] ?? [categoria];
}

/** Compara nomes de categoria/tipo sem diferença de maiúscula ou acento. */
export function mesmoNome(a: string, b: string): boolean {
  return normalizar(a).trim() === normalizar(b).trim();
}

/** Nunca vão na coleta comum e sempre levam alerta, diga a IA o que disser. */
const CATEGORIAS_PERIGOSAS = new Set(['Resíduo perigoso', 'Resíduo químico', 'Eletrônico']);

/**
 * Regras de segurança são política do produto, como a pontuação: valem por cima da
 * resposta da IA remota, que pode errar.
 */
export function aplicarPolitica(c: Classificacao): Classificacao {
  if (!CATEGORIAS_PERIGOSAS.has(c.categoria)) return c;
  const regra = REGRAS.find(r => r.categoria === c.categoria);
  return { ...c, aceitaColetaComum: false, atencao: c.atencao || regra?.atencao || null };
}

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
  return semNegados(normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean))
    .map(p => p.replace(/s$/, '').replace(/[nm]$/, '').replace(/[aeo]$/, ''))
    .join(' ');
}

const ARTIGOS = new Set(['a', 'o', 'as', 'os', 'um', 'uma']);

/** Tira a palavra negada: "notebook sem bateria" não deve contar "bateria". */
function semNegados(palavras: string[]): string[] {
  const resto: string[] = [];
  for (let i = 0; i < palavras.length; i++) {
    if (palavras[i] !== 'sem') {
      resto.push(palavras[i]);
      continue;
    }
    while (ARTIGOS.has(palavras[i + 1])) i++;
    i++;
  }
  return resto;
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
  // Prioridade maior ganha antes do tamanho: "bateria de celular" é resíduo perigoso.
  let regra: Regra = { ...PADRAO, termos: [] };
  let melhor = 0;
  for (const r of REGRAS) {
    const casou = forcaDaRegra(r, alvo);
    const forca = casou && casou + (r.prioridade ?? 0) * 1000;
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
  const tipo = !c.aceitaColetaComum
    ? 'não vai na coleta comum'
    : c.reciclavel === 'Não'
      ? 'pode ir na coleta comum, mas rende mais na compostagem'
      : 'dá para reciclar na coleta comum, mas rende mais numa cooperativa';
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
    CATEGORIAS.includes(c['categoria']) &&
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
 * Resposta sem IA: a regra por palavra-chave. Item não identificado não vira classificação,
 * para não apagar o que a conversa já tinha identificado.
 */
export function respostaLocal(mensagem: string): RespostaAssistente {
  const c = classificar(mensagem);
  if (c.categoria !== 'A conferir') {
    const destino = !c.aceitaColetaComum
      ? 'Esse não pode ir no lixo comum, tá?'
      : c.reciclavel === 'Não'
        ? 'Dá pra mandar na coleta comum, mas na compostagem ele rende bem mais.'
        : 'Até dá pra mandar na coleta comum, mas numa cooperativa ele é bem mais aproveitado.';
    return {
      texto: `Isso entra como ${c.categoria.toLowerCase()}. ${destino}\nDeixei o passo a passo aqui embaixo, e logo depois você escolhe se leva num ecoponto ou pede a coleta em casa.`,
      classificacao: c,
    };
  }

  const t = normalizar(mensagem);
  if (/\b(obrigad|valeu|vlw|brigad)/.test(t)) {
    return { texto: 'Imagina! Se quiser descartar mais alguma coisa, é só me falar.', classificacao: null };
  }
  if (/^(oi+|ola|opa|e ai|eai|bom dia|boa tarde|boa noite|tudo bem|hey)\b/.test(t)) {
    return { texto: 'Oi! Tudo certo por aqui. Me conta o que você quer descartar que eu te ajudo.', classificacao: null };
  }
  return {
    texto: 'Hmm, não consegui entender qual item é. Pode me contar do que ele é feito e mais ou menos o tamanho?',
    classificacao: null,
  };
}

/**
 * Chamado pelo chat de verdade: manda o histórico e a mensagem nova ao endpoint
 * `/api/conversar` (IA real, no servidor) e só usa a regra local se a chamada falhar ou
 * vier com um formato inesperado — assim a conversa nunca fica sem resposta.
 */
export async function conversarComIA(
  historico: { autor: 'morador' | 'ia'; texto: string }[],
  mensagem: string,
): Promise<RespostaAssistente> {
  try {
    const resposta = await fetch('/api/conversar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ historico, mensagem }),
      // O servidor já desiste do Gemini antes disso; aqui é só para o chat nunca ficar preso.
      signal: AbortSignal.timeout(20_000),
    });
    if (!resposta.ok) throw new Error(`conversar: ${resposta.status}`);

    const dados = await resposta.json();
    if (typeof dados?.texto !== 'string' || !dados.texto.trim()) throw new Error('conversar: formato inesperado');
    if (dados.classificacao !== null && !ehClassificacaoValida(dados.classificacao)) {
      throw new Error('conversar: formato inesperado');
    }
    return { texto: dados.texto, classificacao: dados.classificacao };
  } catch {
    return respostaLocal(mensagem);
  }
}
