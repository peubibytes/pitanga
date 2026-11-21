import express, { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { restauracaoSchema } from '@pitanga/shared';
import { z } from 'zod';
import {
  criarBackup,
  excluirBackup,
  listarBackups,
  restaurarBackup,
  verificarBackup,
  reconciliarBackups,
} from '../backup';
import { ErroDeValidacao } from '../erros';
import { exigirAdministradora } from '../middleware';
import { nomeDeFotoValido, caminhoDaFoto } from '../arquivos/fotos';
import { verificarSaude } from '../services/saude.service';
import { verificarInvariantes } from '../services/invariantes.service';
import { type Dependencias, ctxDe, ok } from './helpers';

/** Rotas públicas de diagnóstico. */
export function saudeRoutes(deps: Dependencias): Router {
  const r = Router();
  r.get('/saude', (_req, res) => ok(res, verificarSaude(deps.conexao.db, deps.config)));
  return r;
}

export function sistemaRoutes(deps: Dependencias): Router {
  const r = Router();
  const { config } = deps;

  r.get('/fotos/:arquivo', (req, res) => {
    const nome = String(req.params.arquivo);
    const caminho = nomeDeFotoValido(nome) ? caminhoDaFoto(config.fotosDir, nome) : '';
    if (!caminho || !fs.existsSync(caminho)) {
      res
        .status(404)
        .json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Foto não encontrada.' } });
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.sendFile(caminho);
  });

  /* ---------------------------------- backup ---------------------------------- */
  r.get('/backup', (req, res) => ok(res, listarBackups(ctxDe(deps, req).db, config)));
  r.post('/backup', (req, res) => ok(res, criarBackup(ctxDe(deps, req).db, config, 'manual'), 201));
  // Baixar o .zip (para copiar em pendrive ou numa nuvem — fechado, ele sincroniza sem risco).
  r.get('/backup/baixar/:arquivo', (req, res) => {
    const nome = String(req.params.arquivo);
    const caminho = path.join(config.backupsDir, nome);
    if (!/^[\w.-]+\.zip$/.test(nome) || !fs.existsSync(caminho)) {
      res.status(404).json({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Arquivo de backup não encontrado.' },
      });
      return;
    }
    res.download(caminho, nome);
  });
  r.delete('/backup/:arquivo', exigirAdministradora, (req, res) => {
    const ctx = ctxDe(deps, req);
    excluirBackup(ctx.db, config, String(req.params.arquivo), ctx.usuarioId);
    ok(res, { arquivo: String(req.params.arquivo) });
  });
  r.post('/backup/verificar', (req, res) => {
    const { arquivo } = z.object({ arquivo: z.string().min(1) }).parse(req.body);
    ok(res, verificarBackup(config, arquivo));
  });
  r.post('/backup/restaurar', exigirAdministradora, (req, res) => {
    const { arquivo } = restauracaoSchema.parse(req.body);
    const resultado = restaurarBackup(deps.conexao, config, arquivo);
    ok(res, { ...resultado, mensagem: 'Backup restaurado. Entre novamente para continuar.' });
  });
  // Importa um .zip de backup trazido de outra máquina (corpo binário) para a pasta de backups.
  r.post(
    '/backup/importar',
    exigirAdministradora,
    express.raw({
      type: ['application/zip', 'application/octet-stream', 'application/x-zip-compressed'],
      limit: '1gb',
    }),
    (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0)
        throw new ErroDeValidacao('Nenhum arquivo foi enviado.');
      const nome = String(req.query.nome ?? `importado-${Date.now()}.zip`).replace(/[^\w.-]/g, '_');
      if (!nome.endsWith('.zip'))
        throw new ErroDeValidacao('O backup precisa ser um arquivo .zip.');
      fs.mkdirSync(config.backupsDir, { recursive: true });
      fs.writeFileSync(path.join(config.backupsDir, nome), req.body);
      reconciliarBackups(ctxDe(deps, req).db, config);
      ok(res, verificarBackup(config, nome), 201);
    },
  );

  /* ------------------------------- consistência ------------------------------- */
  r.get('/consistencia', (req, res) => ok(res, verificarInvariantes(ctxDe(deps, req).db)));
  return r;
}
