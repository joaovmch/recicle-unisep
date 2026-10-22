import 'dotenv/config';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import helmet from 'helmet';
import { join } from 'node:path';
import { environment } from './environments/environment';
import { respostaLocal } from './app/shared/data/classificador';
import {
  MAX_CARACTERES_POR_MENSAGEM,
  MAX_MENSAGENS_HISTORICO,
  MensagemHistorico,
  conversarComGemini,
} from './app/shared/data/classificador-ia.server';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Cabeçalhos de segurança (OWASP): CSP restrita a este domínio + Supabase,
 * sem permitir iframe de terceiros embutir o painel (clickjacking) e forçando HTTPS.
 * script-src/style-src precisam de 'unsafe-inline' porque o Angular SSR injeta
 * o estado transferido (TransferState) e o CSS crítico como tags inline na página.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // tile.openstreetmap.org: os quadradinhos do mapa (Leaflet) são imagens vindas de lá.
        imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
        connectSrc: ["'self'", environment.supabaseUrl, environment.supabaseUrl.replace('https://', 'wss://')],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

/**
 * Atrás de proxy (Nginx, Render, Railway…) o IP real vem no X-Forwarded-For; sem isto,
 * todo mundo teria o IP do proxy e dividiria o mesmo limite da IA. Só ligue quando houver
 * proxy na frente — senão qualquer um forja o cabeçalho e foge do limite.
 * Ex.: TRUST_PROXY=1 (um proxy na frente).
 */
const trustProxy = process.env['TRUST_PROXY']?.trim();
if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

// Cabe a mensagem nova mais o histórico recente da conversa que vai junto para a IA.
app.use(express.json({ limit: '48kb' }));

/** Uma mensagem do chat cabe folgada nisso; texto maior só gastaria cota da IA. */
const MENSAGEM_MAX_CARACTERES = 500;

/** Aceita só o formato esperado; qualquer coisa estranha no histórico é descartada. */
function lerHistorico(valor: unknown): MensagemHistorico[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .slice(-MAX_MENSAGENS_HISTORICO)
    .filter((m): m is MensagemHistorico => (m?.autor === 'morador' || m?.autor === 'ia') && typeof m?.texto === 'string')
    .map(m => ({ autor: m.autor, texto: m.texto.slice(0, MAX_CARACTERES_POR_MENSAGEM) }))
    .filter(m => m.texto.trim());
}

/**
 * Limite simples por IP para a rota de IA: ela é pública e cada chamada consome a cota
 * gratuita do Gemini. Em memória basta para um servidor só; com várias instâncias,
 * trocar por um store compartilhado.
 */
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 20;
const chamadasPorIp = new Map<string, { inicio: number; total: number }>();

function excedeuLimite(chave: string): boolean {
  const agora = Date.now();
  const registro = chamadasPorIp.get(chave);
  if (!registro || agora - registro.inicio > JANELA_MS) {
    chamadasPorIp.set(chave, { inicio: agora, total: 1 });
    if (chamadasPorIp.size > 10_000) {
      for (const [chave, r] of chamadasPorIp) if (agora - r.inicio > JANELA_MS) chamadasPorIp.delete(chave);
    }
    return false;
  }
  registro.total++;
  return registro.total > MAX_POR_JANELA;
}

let avisouSemChave = false;

/** Sem chave é configuração, não falha: avisa uma vez só em vez de a cada mensagem do chat. */
function avisarFalhaDaIa(erro: unknown): void {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  if (mensagem.includes('GEMINI_API_KEY')) {
    if (!avisouSemChave) console.warn('[conversar] GEMINI_API_KEY não configurada — usando só a regra local.');
    avisouSemChave = true;
    return;
  }
  console.warn('[conversar] IA indisponível, usando regra local:', mensagem);
}

/**
 * Responde a mensagem do chat com o Gemini, levando o histórico recente da conversa. A chave
 * (GEMINI_API_KEY) só existe aqui no servidor — o navegador nunca a vê. Se a IA falhar por
 * qualquer motivo (sem chave configurada, sem internet, resposta fora do formato esperado),
 * cai para a regra local em `classificador.ts` em vez de devolver erro: o chat nunca trava.
 */
app.post('/api/conversar', async (req, res) => {
  const mensagem = typeof req.body?.mensagem === 'string' ? req.body.mensagem.trim() : '';
  if (!mensagem) {
    res.status(400).json({ erro: 'Escreva uma mensagem.' });
    return;
  }
  if (mensagem.length > MENSAGEM_MAX_CARACTERES) {
    res.status(400).json({ erro: `Escreva em até ${MENSAGEM_MAX_CARACTERES} caracteres.` });
    return;
  }

  // Acima do limite não é erro para quem usa: cai na regra local, sem gastar cota da IA.
  // Limite com prefixo "ia:" para não dividir a cota por IP com o /api/geocodificar ("geo:").
  if (excedeuLimite(`ia:${req.ip ?? 'desconhecido'}`)) {
    res.json(respostaLocal(mensagem));
    return;
  }

  try {
    res.json(await conversarComGemini(lerHistorico(req.body?.historico), mensagem));
  } catch (erro) {
    avisarFalhaDaIa(erro);
    res.json(respostaLocal(mensagem));
  }
});

/**
 * Geocodificação (endereço -> latitude/longitude) para os mapas.
 *
 * Passa pelo servidor em vez de o navegador chamar o Nominatim direto por três motivos:
 * a CSP da página não precisa liberar um domínio externo, dá para respeitar a política de
 * uso do serviço (um pedido por segundo, com User-Agent identificando o projeto) e o
 * resultado fica em cache — o mesmo endereço de galpão não é consultado duas vezes.
 */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const CAMPO_MAX_CARACTERES = 200;
const INTERVALO_NOMINATIM_MS = 1100;
const CACHE_GEOCODIFICACAO_MAX = 500;

/**
 * Quão perto do endereço pedido o ponto devolvido realmente está. O OpenStreetMap é
 * mapeado por voluntários e muita rua de cidade pequena simplesmente não está lá — sem
 * esse degrau, um endereço real como "Rua Léo Tedesco, Dois Vizinhos" não devolve nada e
 * o mapa fica vazio. Com ele, cai no bairro ou na cidade e a tela avisa a diferença.
 */
type Precisao = 'endereco' | 'rua' | 'bairro' | 'cidade';

interface Coordenada {
  latitude: number;
  longitude: number;
  precisao: Precisao;
}

interface EnderecoBusca {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/** `null` guardado de propósito: endereço que não existe não deve ser reconsultado toda hora. */
const cacheGeocodificacao = new Map<string, Coordenada | null>();
let proximaChamadaNominatim = 0;

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().slice(0, CAMPO_MAX_CARACTERES) : '';
}

async function consultarNominatim(parametros: Record<string, string>): Promise<Coordenada | null> {
  // Fila simples: as chamadas se enfileiram com pelo menos 1,1s entre elas.
  const agora = Date.now();
  const espera = Math.max(0, proximaChamadaNominatim - agora);
  proximaChamadaNominatim = agora + espera + INTERVALO_NOMINATIM_MS;
  if (espera > 0) await new Promise(resolve => setTimeout(resolve, espera));

  const busca = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'br', ...parametros });
  const resposta = await fetch(`${NOMINATIM_URL}?${busca}`, {
    headers: {
      'User-Agent': 'Recicle/1.0 (projeto academico UNISEP)',
      'Accept-Language': 'pt-BR',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);

  const resultados = (await resposta.json()) as { lat?: string; lon?: string }[];
  const primeiro = resultados[0];
  if (!primeiro?.lat || !primeiro?.lon) return null;
  return { latitude: Number(primeiro.lat), longitude: Number(primeiro.lon), precisao: 'endereco' };
}

/**
 * Tenta do mais específico ao mais genérico e para na primeira tentativa que acerta.
 * A busca estruturada (street/city/state) acerta bem mais que jogar o endereço inteiro
 * num campo de texto livre, que é onde a versão anterior falhava.
 */
async function geocodificar(endereco: EnderecoBusca): Promise<Coordenada | null> {
  const { rua, numero, bairro, cidade, uf } = endereco;
  const regiao = [cidade, uf].filter(Boolean).join(', ');

  const tentativas: { parametros: Record<string, string>; precisao: Precisao }[] = [];
  if (rua && cidade) {
    if (numero) {
      tentativas.push({ parametros: { street: `${numero} ${rua}`, city: cidade, state: uf }, precisao: 'endereco' });
    }
    tentativas.push({ parametros: { street: rua, city: cidade, state: uf }, precisao: 'rua' });
  }
  if (bairro && regiao) tentativas.push({ parametros: { q: `${bairro}, ${regiao}` }, precisao: 'bairro' });
  if (regiao) tentativas.push({ parametros: { q: regiao }, precisao: 'cidade' });
  if (tentativas.length === 0) return null;

  const chave = JSON.stringify(endereco).toLowerCase();
  const emCache = cacheGeocodificacao.get(chave);
  if (emCache !== undefined) return emCache;

  let encontrada: Coordenada | null = null;
  for (const tentativa of tentativas) {
    const resultado = await consultarNominatim(tentativa.parametros);
    if (resultado) {
      encontrada = { ...resultado, precisao: tentativa.precisao };
      break;
    }
  }

  if (cacheGeocodificacao.size >= CACHE_GEOCODIFICACAO_MAX) {
    cacheGeocodificacao.delete(cacheGeocodificacao.keys().next().value!);
  }
  cacheGeocodificacao.set(chave, encontrada);
  return encontrada;
}

app.post('/api/geocodificar', async (req, res) => {
  const endereco: EnderecoBusca = {
    rua: texto(req.body?.rua),
    numero: texto(req.body?.numero),
    bairro: texto(req.body?.bairro),
    cidade: texto(req.body?.cidade),
    uf: texto(req.body?.uf),
  };
  if (!endereco.cidade) {
    res.status(400).json({ erro: 'Informe ao menos a cidade a localizar.' });
    return;
  }
  if (excedeuLimite(`geo:${req.ip ?? 'desconhecido'}`)) {
    res.status(429).json({ erro: 'Muitas buscas seguidas. Tente de novo em um minuto.' });
    return;
  }

  try {
    const coordenada = await geocodificar(endereco);
    if (!coordenada) {
      res.status(404).json({ erro: 'Endereço não encontrado no mapa.' });
      return;
    }
    res.json(coordenada);
  } catch (erro) {
    console.warn('[geocodificar] servico indisponivel:', erro instanceof Error ? erro.message : erro);
    res.status(503).json({ erro: 'Serviço de mapas indisponível agora.' });
  }
});

// JSON malformado ou corpo grande demais: responde JSON curto em vez da página de erro
// padrão do Express (que, fora de produção, expõe o stack trace do servidor).
app.use('/api', (erro: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = erro.status === 413 ? 413 : 400;
  res.status(status).json({ erro: status === 413 ? 'Requisição grande demais.' : 'Requisição inválida.' });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
