import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Config } from '../config';
import type { Conexao } from '../backup';
import type { Contexto } from '../db/util';
import { paginacao } from '../db/util';
import { ErroDeValidacao } from '../erros';

export interface Dependencias {
  conexao: Conexao;
  config: Config;
}

/** Contexto da operação: o banco atual (pode ser trocado por uma restauração) e quem opera. */
export const ctxDe = (deps: Dependencias, req: Request): Contexto => ({
  db: deps.conexao.db,
  usuarioId: req.usuario?.id ?? null,
});

export const ok = (res: Response, dados: unknown, status = 200): void => {
  res.status(status).json({ dados });
};

export function lista<T>(
  res: Response,
  r: { itens: T[]; total: number },
  pagina: number,
  porPagina: number,
): void {
  res.json({ dados: r.itens, paginacao: paginacao(pagina, porPagina, r.total) });
}

export const idDe = (req: Request, nome = 'id'): number => {
  const id = Number(req.params[nome]);
  if (!Number.isInteger(id) || id <= 0) throw new ErroDeValidacao('Identificador inválido.');
  return id;
};

const booleano = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();
const inteiroOpcional = z.coerce.number().int().positive().optional();
const dataQuery = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)')
  .optional();

export const consulta = {
  booleano,
  inteiroOpcional,
  data: dataQuery,
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(500).default(50),
  texto: z.string().trim().max(200).optional(),
};

export const paginaPadrao = z.object({ pagina: consulta.pagina, porPagina: consulta.porPagina });
export type Pagina = z.infer<typeof paginaPadrao>;
