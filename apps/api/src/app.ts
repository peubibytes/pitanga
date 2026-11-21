import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import type { Config } from './config';
import type { Conexao } from './backup';
import {
  exigirSessao,
  idempotencia,
  tratarErros,
  verificarHost,
  verificarOrigem,
} from './middleware';
import { cadastrosRoutes } from './routes/cadastros.routes';
import { estoqueRoutes } from './routes/estoque.routes';
import { type Dependencias } from './routes/helpers';
import { producaoRoutes } from './routes/producao.routes';
import { sessaoRoutes } from './routes/sessao.routes';
import { saudeRoutes, sistemaRoutes } from './routes/sistema.routes';
import { vendasRoutes } from './routes/vendas.routes';

export function criarApp(deps: Dependencias): Express {
  const { conexao, config } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.use(verificarHost(config));

  app.use(cors({ origin: config.origensPermitidas, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.use(verificarOrigem(config));
  api.use(saudeRoutes(deps));
  api.use(sessaoRoutes(deps));

  // Daqui em diante, tudo age como a administradora local (sem tela de entrada).
  api.use(exigirSessao(conexao));
  api.use(idempotencia(conexao));
  api.use(cadastrosRoutes(deps));
  api.use(estoqueRoutes(deps));
  api.use(producaoRoutes(deps));
  api.use(vendasRoutes(deps));
  api.use(sistemaRoutes(deps));
  api.use((_req, res) => {
    res.status(404).json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Rota não encontrada.' } });
  });
  app.use('/api', api);

  // Em produção a própria API serve o front compilado: um processo, uma porta.
  const indice = path.join(config.webDir, 'index.html');
  if (fs.existsSync(indice)) {
    app.use(express.static(config.webDir, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(indice));
  }

  app.use(tratarErros);
  return app;
}

export type { Config, Conexao };
