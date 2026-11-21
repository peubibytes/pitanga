import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

/** Minúsculas e sem acentos, para buscas que ignoram diferenças de grafia. */
export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Abre o arquivo SQLite e aplica os PRAGMAs do plano (seção 4.1). A API é a única dona do arquivo.
 * `:memory:` abre um banco descartável (testes).
 */
export function abrirBanco(arquivo: string): Db {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new Database(arquivo);
  db.pragma('journal_mode = WAL'); // leituras não bloqueiam a escrita
  db.pragma('foreign_keys = ON'); // integridade referencial de fato
  db.pragma('synchronous = FULL'); // dado financeiro: durabilidade acima de velocidade
  db.pragma('busy_timeout = 5000'); // espera em vez de falhar
  db.pragma('temp_store = MEMORY');
  db.function('norm', { deterministic: true }, (v) => normalizar(v));
  return db;
}

/** Executa `fn` dentro de uma transação única (commit se retornar, rollback se lançar). */
export function emTransacao<T>(db: Db, fn: () => T): T {
  return db.transaction(fn)();
}
