import type { Paginacao } from '@pitanga/shared';
import type { Db } from './connection';

/** Contexto de uma operação: banco, configuração e quem está operando. */
export interface Contexto {
  db: Db;
  usuarioId: number | null;
}

export function um<T>(db: Db, sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function todos<T>(db: Db, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function executar(
  db: Db,
  sql: string,
  ...params: unknown[]
): { alteradas: number; id: number } {
  const r = db.prepare(sql).run(...params);
  return { alteradas: r.changes, id: Number(r.lastInsertRowid) };
}

export function escalar<T>(db: Db, sql: string, ...params: unknown[]): T {
  const linha = db
    .prepare(sql)
    .pluck()
    .get(...params) as T;
  return linha;
}

/** Data e hora locais no formato do SQLite (AAAA-MM-DD HH:MM:SS). */
export function agora(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Ajuda a montar cláusulas WHERE com parâmetros posicionais. */
export class Filtros {
  private partes: string[] = [];
  readonly params: unknown[] = [];

  adicionar(condicao: string, ...valores: unknown[]): this {
    this.partes.push(condicao);
    this.params.push(...valores);
    return this;
  }

  /** Busca por texto sem acento e sem distinção de maiúsculas, em uma ou mais colunas. */
  busca(texto: string | undefined, colunas: string[]): this {
    const t = texto?.trim();
    if (!t) return this;
    const cond = colunas.map((c) => `norm(${c}) LIKE norm(?)`).join(' OR ');
    return this.adicionar(`(${cond})`, ...colunas.map(() => `%${t}%`));
  }

  get where(): string {
    return this.partes.length ? `WHERE ${this.partes.join(' AND ')}` : '';
  }
}

export function paginacao(pagina: number, porPagina: number, total: number): Paginacao {
  return { pagina, porPagina, total };
}

export const comoBooleano = (v: unknown): boolean => v === 1 || v === true;
