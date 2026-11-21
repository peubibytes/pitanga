import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import type { Usuario } from '@pitanga/shared';
import type { Config } from '../config';
import type { Conexao } from '../backup';
import { ErroDeDominio, SemPermissao } from '../erros';
import { logger } from '../logger';
import { buscarIdempotencia, salvarIdempotencia } from '../repositories/sistema.repo';
import { usuarioLocal } from '../services/auth.service';

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: Usuario;
  }
}

/**
 * Modo local, sem login: toda requisição age como a administradora local (ver `usuarioLocal`).
 * A proteção fica por conta de escutar só em 127.0.0.1 e de `verificarHost`/`verificarOrigem`.
 */
export const exigirSessao =
  (conexao: Conexao): RequestHandler =>
  (req, _res, next) => {
    req.usuario = usuarioLocal(conexao.db);
    next();
  };

/**
 * Proteção contra DNS rebinding: sem login, um site de terceiros que apontasse o próprio domínio para
 * 127.0.0.1 conseguiria ler os dados. Só aceitamos o cabeçalho `Host` de um endereço local conhecido.
 */
export const verificarHost =
  (config: Config): RequestHandler =>
  (req, _res, next) => {
    const host = req.headers.host?.toLowerCase();
    const nome = host?.replace(/:\d+$/, '');
    if (nome && !config.hostsPermitidos.includes(nome)) {
      return next(new SemPermissao('Endereço de acesso não permitido.'));
    }
    next();
  };

export const exigirAdministradora: RequestHandler = (req, _res, next) => {
  if (req.usuario?.perfil !== 'administradora') return next(new SemPermissao());
  next();
};

/**
 * Proteção contra CSRF para escrita: se o navegador enviou `Origin`, ele precisa ser uma origem local
 * conhecida. Combinado com cookie SameSite=Lax e corpo JSON, impede páginas de terceiros de agir.
 */
export const verificarOrigem =
  (config: Config): RequestHandler =>
  (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origem = req.headers.origin;
    if (origem && !config.origensPermitidas.includes(origem)) {
      return next(new SemPermissao('Origem da requisição não permitida.'));
    }
    next();
  };

/**
 * Idempotência: com o cabeçalho `Idempotency-Key`, repetir a mesma escrita (duplo clique, reenvio)
 * devolve a primeira resposta em vez de registrar de novo.
 */
export const idempotencia =
  (conexao: Conexao): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    const chave = req.header('Idempotency-Key');
    if (!chave || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const rota = `${req.method} ${req.baseUrl}${req.path}`;
    const salvo = buscarIdempotencia(conexao.db, chave, rota);
    if (salvo) {
      res
        .status(salvo.statusHttp)
        .setHeader('Idempotent-Replay', 'true')
        .type('json')
        .send(salvo.resposta);
      return;
    }
    const enviar = res.json.bind(res);
    res.json = (corpo: unknown) => {
      if (res.statusCode < 500) {
        try {
          salvarIdempotencia(
            conexao.db,
            chave,
            rota,
            req.usuario?.id ?? null,
            res.statusCode,
            JSON.stringify(corpo),
          );
        } catch (erro) {
          logger.warn({ erro }, 'Não foi possível guardar a chave de idempotência.');
        }
      }
      return enviar(corpo);
    };
    next();
  };

/** Traduz erros de domínio, validação (Zod) e inesperados para o envelope `{ erro }` em português. */
export const tratarErros: ErrorRequestHandler = (erro, req, res, _next) => {
  if (erro instanceof ZodError) {
    const detalhes = erro.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
    const primeira = detalhes[0];
    res.status(422).json({
      erro: {
        codigo: 'VALIDACAO',
        mensagem: primeira?.campo
          ? `${primeira.mensagem} (${primeira.campo})`
          : (primeira?.mensagem ?? 'Dados inválidos.'),
        detalhes,
      },
    });
    return;
  }
  if (erro instanceof ErroDeDominio) {
    res
      .status(erro.status)
      .json({ erro: { codigo: erro.codigo, mensagem: erro.message, detalhes: erro.detalhes } });
    return;
  }
  if ((erro as { type?: string }).type === 'entity.too.large') {
    res
      .status(413)
      .json({ erro: { codigo: 'ARQUIVO_GRANDE', mensagem: 'O arquivo enviado é grande demais.' } });
    return;
  }
  if (erro instanceof SyntaxError && 'body' in erro) {
    res.status(400).json({
      erro: { codigo: 'JSON_INVALIDO', mensagem: 'O corpo da requisição não é um JSON válido.' },
    });
    return;
  }
  // Violações de integridade do SQLite viram conflito de regra de negócio, não erro 500.
  const codigo = (erro as { code?: string }).code;
  if (typeof codigo === 'string' && codigo.startsWith('SQLITE_CONSTRAINT')) {
    logger.warn({ erro: String(erro), rota: req.originalUrl }, 'Violação de restrição do banco');
    res.status(409).json({
      erro: {
        codigo: 'RESTRICAO_DO_BANCO',
        mensagem: 'A operação viola uma regra de integridade dos dados.',
        detalhes: String(erro),
      },
    });
    return;
  }
  logger.error({ erro, rota: req.originalUrl }, 'Erro inesperado');
  res.status(500).json({
    erro: {
      codigo: 'ERRO_INTERNO',
      mensagem: 'Algo deu errado. O problema foi registrado no arquivo de log.',
    },
  });
};
