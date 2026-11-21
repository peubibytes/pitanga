/** Auditoria, idempotência, configurações e backups registrados. */
import type { BackupRegistro, OrigemBackup } from '@pitanga/shared';
import type { Db } from '../db/connection';
import { executar, todos, um } from '../db/util';

export function inserirAuditoria(
  db: Db,
  a: {
    usuarioId: number | null;
    acao: string;
    entidade: string;
    entidadeId: number | null;
    dados?: unknown;
  },
): void {
  executar(
    db,
    `INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, dados_json) VALUES (?,?,?,?,?)`,
    a.usuarioId,
    a.acao,
    a.entidade,
    a.entidadeId,
    a.dados === undefined ? null : JSON.stringify(a.dados),
  );
}

export function buscarIdempotencia(
  db: Db,
  chave: string,
  rota: string,
): { statusHttp: number; resposta: string } | undefined {
  return um(
    db,
    `SELECT status_http AS statusHttp, resposta FROM idempotencia WHERE chave = ? AND rota = ?`,
    chave,
    rota,
  );
}

export function salvarIdempotencia(
  db: Db,
  chave: string,
  rota: string,
  usuarioId: number | null,
  statusHttp: number,
  resposta: string,
): void {
  executar(
    db,
    `INSERT OR IGNORE INTO idempotencia (chave, rota, usuario_id, status_http, resposta) VALUES (?,?,?,?,?)`,
    chave,
    rota,
    usuarioId,
    statusHttp,
    resposta,
  );
}

export function limparIdempotenciaAntiga(db: Db): void {
  executar(db, `DELETE FROM idempotencia WHERE criado_em < datetime('now','localtime','-2 days')`);
}

export function lerConfiguracoes(db: Db): Record<string, string> {
  const linhas = todos<{ chave: string; valor: string }>(
    db,
    `SELECT chave, valor FROM configuracoes`,
  );
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}

export function lerConfiguracao(db: Db, chave: string): string | undefined {
  return um<{ valor: string }>(db, `SELECT valor FROM configuracoes WHERE chave = ?`, chave)?.valor;
}

export function gravarConfiguracao(db: Db, chave: string, valor: string): void {
  executar(
    db,
    `INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
    chave,
    valor,
  );
}

interface LinhaBackup {
  id: number;
  arquivo: string;
  data: string;
  tamanhoBytes: number;
  hashSha256: string;
  integridadeOk: number;
  origem: OrigemBackup;
}

export function inserirBackup(
  db: Db,
  b: {
    arquivo: string;
    tamanhoBytes: number;
    hashSha256: string;
    integridadeOk: boolean;
    origem: OrigemBackup;
  },
): number {
  return executar(
    db,
    `INSERT INTO backups (arquivo, tamanho_bytes, hash_sha256, integridade_ok, origem) VALUES (?,?,?,?,?)`,
    b.arquivo,
    b.tamanhoBytes,
    b.hashSha256,
    b.integridadeOk ? 1 : 0,
    b.origem,
  ).id;
}

export function listarBackups(db: Db): Omit<BackupRegistro, 'existe'>[] {
  return todos<LinhaBackup>(
    db,
    `SELECT id, arquivo, data, tamanho_bytes AS tamanhoBytes, hash_sha256 AS hashSha256,
            integridade_ok AS integridadeOk, origem
       FROM backups ORDER BY id DESC`,
  ).map((l) => ({ ...l, integridadeOk: l.integridadeOk === 1 }));
}

export function removerBackup(db: Db, id: number): void {
  executar(db, `DELETE FROM backups WHERE id = ?`, id);
}
