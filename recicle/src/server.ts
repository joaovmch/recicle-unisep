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
import { classificar } from './app/shared/data/classificador';
import { classificarComGemini } from './app/shared/data/classificador-ia.server';

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
        imgSrc: ["'self'", 'data:', 'blob:'],
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

app.use(express.json({ limit: '10kb' }));

/** Descrição de um item cabe folgada nisso; texto maior só gastaria cota da IA. */
const DESCRICAO_MAX_CARACTERES = 500;

/**
 * Limite simples por IP para a rota de IA: ela é pública e cada chamada consome a cota
 * gratuita do Gemini. Em memória basta para um servidor só; com várias instâncias,
 * trocar por um store compartilhado.
 */
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 20;
const chamadasPorIp = new Map<string, { inicio: number; total: number }>();

function excedeuLimite(ip: string): boolean {
  const agora = Date.now();
  const registro = chamadasPorIp.get(ip);
  if (!registro || agora - registro.inicio > JANELA_MS) {
    chamadasPorIp.set(ip, { inicio: agora, total: 1 });
    if (chamadasPorIp.size > 10_000) {
      for (const [chave, r] of chamadasPorIp) if (agora - r.inicio > JANELA_MS) chamadasPorIp.delete(chave);
    }
    return false;
  }
  registro.total++;
  return registro.total > MAX_POR_JANELA;
}

/**
 * Classifica a descrição de um resíduo com o Gemini. A chave (GEMINI_API_KEY) só existe
 * aqui no servidor — o navegador nunca a vê. Se a IA falhar por qualquer motivo (sem
 * chave configurada, sem internet, resposta fora do formato esperado), cai para a regra
 * local em `classificador.ts` em vez de devolver erro: o chat nunca trava por causa disso.
 */
app.post('/api/classificar', async (req, res) => {
  const descricao = typeof req.body?.descricao === 'string' ? req.body.descricao.trim() : '';
  if (!descricao) {
    res.status(400).json({ erro: 'Informe a descrição do resíduo.' });
    return;
  }
  if (descricao.length > DESCRICAO_MAX_CARACTERES) {
    res.status(400).json({ erro: `Descreva o item em até ${DESCRICAO_MAX_CARACTERES} caracteres.` });
    return;
  }

  // Acima do limite não é erro para quem usa: cai na regra local, sem gastar cota da IA.
  if (excedeuLimite(req.ip ?? 'desconhecido')) {
    res.json(classificar(descricao));
    return;
  }

  try {
    res.json(await classificarComGemini(descricao));
  } catch (erro) {
    console.warn('[classificar] IA indisponível, usando regra local:', erro);
    res.json(classificar(descricao));
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
