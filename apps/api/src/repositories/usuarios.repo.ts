import type { Perfil, Usuario } from '@pitanga/shared';
import type { Db } from '../db/connection';
import { agora, escalar, executar, todos, um } from '../db/util';

interface LinhaUsuario {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
  ativo: number;
}
const COLUNAS = `id, nome, login, perfil, ativo`;
const paraUsuario = (l: LinhaUsuario): Usuario => ({ ...l, ativo: l.ativo === 1 });

export const contarUsuarios = (db: Db): number =>
  escalar<number>(db, `SELECT COUNT(*) FROM usuarios`);

export function buscarPorLogin(
  db: Db,
  login: string,
): (Usuario & { senhaHash: string }) | undefined {
  const l = um<LinhaUsuario & { senhaHash: string }>(
    db,
    `SELECT ${COLUNAS}, senha_hash AS senhaHash FROM usuarios WHERE login = ?`,
    login,
  );
  return l ? { ...paraUsuario(l), senhaHash: l.senhaHash } : undefined;
}

export function buscarUsuario(db: Db, id: number): (Usuario & { senhaHash: string }) | undefined {
  const l = um<LinhaUsuario & { senhaHash: string }>(
    db,
    `SELECT ${COLUNAS}, senha_hash AS senhaHash FROM usuarios WHERE id = ?`,
    id,
  );
  return l ? { ...paraUsuario(l), senhaHash: l.senhaHash } : undefined;
}

export function primeiraAdministradoraAtiva(db: Db): Usuario | undefined {
  const l = um<LinhaUsuario>(
    db,
    `SELECT ${COLUNAS} FROM usuarios WHERE perfil = 'administradora' AND ativo = 1 ORDER BY id LIMIT 1`,
  );
  return l ? paraUsuario(l) : undefined;
}

export const listarUsuarios = (db: Db): Usuario[] =>
  todos<LinhaUsuario>(db, `SELECT ${COLUNAS} FROM usuarios ORDER BY nome`).map(paraUsuario);

export function inserirUsuario(
  db: Db,
  u: { nome: string; login: string; senhaHash: string; perfil: Perfil },
): number {
  return executar(
    db,
    `INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?,?,?,?)`,
    u.nome,
    u.login,
    u.senhaHash,
    u.perfil,
  ).id;
}

export function atualizarSenha(db: Db, id: number, senhaHash: string): void {
  executar(
    db,
    `UPDATE usuarios SET senha_hash = ?, atualizado_em = ? WHERE id = ?`,
    senhaHash,
    agora(),
    id,
  );
}

export function definirAtivo(db: Db, id: number, ativo: boolean): void {
  executar(
    db,
    `UPDATE usuarios SET ativo = ?, atualizado_em = ? WHERE id = ?`,
    ativo ? 1 : 0,
    agora(),
    id,
  );
}

/* -------------------------------- sessões -------------------------------- */

export function inserirSessao(
  db: Db,
  tokenHash: string,
  usuarioId: number,
  expiraEm: string,
): void {
  executar(
    db,
    `INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?,?,?)`,
    tokenHash,
    usuarioId,
    expiraEm,
  );
}

export function buscarSessao(
  db: Db,
  tokenHash: string,
): (Usuario & { expiraEm: string }) | undefined {
  const l = um<LinhaUsuario & { expiraEm: string }>(
    db,
    `SELECT u.id, u.nome, u.login, u.perfil, u.ativo, s.expira_em AS expiraEm
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ?`,
    tokenHash,
  );
  return l ? { ...paraUsuario(l), expiraEm: l.expiraEm } : undefined;
}

export function removerSessao(db: Db, tokenHash: string): void {
  executar(db, `DELETE FROM sessoes WHERE token_hash = ?`, tokenHash);
}

export function removerSessoesDoUsuario(db: Db, usuarioId: number): void {
  executar(db, `DELETE FROM sessoes WHERE usuario_id = ?`, usuarioId);
}

export function limparSessoesExpiradas(db: Db): void {
  executar(db, `DELETE FROM sessoes WHERE expira_em < ?`, agora());
}
