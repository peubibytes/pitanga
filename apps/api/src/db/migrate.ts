import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './connection';

export interface Migracao {
  numero: number;
  nome: string;
  sql: string;
  checksum: string;
}

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** Em desenvolvimento as migrations ficam ao lado; no build são copiadas para dist/migrations. */
export function pastaDeMigracoes(): string {
  const candidatas = [path.join(aqui, 'migrations'), path.join(aqui, 'db', 'migrations')];
  const achada = candidatas.find((c) => fs.existsSync(c));
  if (!achada) throw new Error('Pasta de migrations não encontrada.');
  return achada;
}

export function checksumDe(sql: string): string {
  // Normaliza quebras de linha: o checksum não pode mudar entre Windows e Linux.
  return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export function listarMigracoes(dir: string = pastaDeMigracoes()): Migracao[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((arquivo) => {
      const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
      return {
        numero: Number(arquivo.slice(0, 4)),
        nome: arquivo.replace(/\.sql$/, ''),
        sql,
        checksum: checksumDe(sql),
      };
    });
}

export interface OpcoesMigracao {
  dir?: string;
  /** Chamado antes de aplicar a primeira migration pendente em um banco que já tinha dados. */
  antesDeMigrar?: (pendentes: Migracao[]) => void;
}

/**
 * Aplica as migrations pendentes, cada uma em sua transação. Recusa rodar se o checksum de uma
 * migration já aplicada mudou — migration aplicada nunca é editada, corrige-se com uma nova.
 */
export function migrar(db: Db, opcoes: OpcoesMigracao = {}): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migracoes (
      id          INTEGER PRIMARY KEY,
      nome        TEXT    NOT NULL UNIQUE,
      aplicada_em TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      checksum    TEXT    NOT NULL
    )`);
  const arquivos = listarMigracoes(opcoes.dir);
  const aplicadas = db.prepare('SELECT id, nome, checksum FROM _migracoes ORDER BY id').all() as {
    id: number;
    nome: string;
    checksum: string;
  }[];

  for (const ap of aplicadas) {
    const arquivo = arquivos.find((a) => a.nome === ap.nome);
    if (!arquivo) {
      throw new Error(
        `A migration já aplicada "${ap.nome}" não existe mais na pasta de migrations.`,
      );
    }
    if (arquivo.checksum !== ap.checksum) {
      throw new Error(
        `A migration "${ap.nome}" foi alterada depois de aplicada (checksum diferente). ` +
          'Reverta a edição e crie uma nova migration.',
      );
    }
  }

  const jaAplicadas = new Set(aplicadas.map((a) => a.nome));
  const pendentes = arquivos.filter((a) => !jaAplicadas.has(a.nome));
  if (pendentes.length === 0) return [];
  if (aplicadas.length > 0) opcoes.antesDeMigrar?.(pendentes);

  const inserir = db.prepare('INSERT INTO _migracoes (id, nome, checksum) VALUES (?, ?, ?)');
  for (const m of pendentes) {
    db.transaction(() => {
      db.exec(m.sql);
      inserir.run(m.numero, m.nome, m.checksum);
    })();
  }
  return pendentes.map((p) => p.nome);
}

export function estadoDasMigracoes(db: Db): { aplicadas: number; ultima: string | null } {
  try {
    const linhas = db.prepare('SELECT nome FROM _migracoes ORDER BY id').all() as {
      nome: string;
    }[];
    return { aplicadas: linhas.length, ultima: linhas.at(-1)?.nome ?? null };
  } catch {
    return { aplicadas: 0, ultima: null };
  }
}
