import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { Perfil, Sessao, Usuario } from '@pitanga/shared';
import type { Db } from '../db/connection';
import { ErroDeValidacao, NaoAutenticado, OperacaoNaoPermitida } from '../erros';
import * as repo from '../repositories/usuarios.repo';
import { inserirAuditoria } from '../repositories/sistema.repo';

export const COOKIE_SESSAO = 'fdp_sessao';

// type 2 = argon2id
const OPCOES_ARGON = { type: 2 as const, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const gerarHash = (senha: string): Promise<string> => argon2.hash(senha, OPCOES_ARGON);

const hashDoToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

function dataLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function precisaCriarAdministradora(db: Db): boolean {
  return repo.contarUsuarios(db) === 0;
}

export async function criarUsuario(
  db: Db,
  dados: { nome: string; login: string; senha: string; perfil: Perfil },
  autorId: number | null,
): Promise<Usuario> {
  if (repo.buscarPorLogin(db, dados.login)) {
    throw new ErroDeValidacao(`Já existe um usuário com o login "${dados.login}".`);
  }
  const senhaHash = await gerarHash(dados.senha);
  const id = repo.inserirUsuario(db, { ...dados, senhaHash });
  inserirAuditoria(db, { usuarioId: autorId, acao: 'criar', entidade: 'usuario', entidadeId: id });
  const { senhaHash: _omitido, ...usuario } = repo.buscarUsuario(db, id)!;
  return usuario;
}

/** Primeiro acesso: só funciona enquanto não existe nenhum usuário. */
export async function criarPrimeiraAdministradora(
  db: Db,
  dados: { nome: string; login: string; senha: string },
): Promise<Usuario> {
  if (!precisaCriarAdministradora(db)) {
    throw new OperacaoNaoPermitida('O primeiro acesso já foi configurado.');
  }
  return criarUsuario(db, { ...dados, perfil: 'administradora' }, null);
}

export async function entrar(
  db: Db,
  login: string,
  senha: string,
  sessaoDias: number,
): Promise<{ usuario: Usuario; token: string; expira: Date }> {
  const encontrado = repo.buscarPorLogin(db, login.trim().toLowerCase());
  // Verifica o hash mesmo sem usuário, para não revelar por tempo de resposta se o login existe.
  const hash = encontrado?.senhaHash ?? (await gerarHash('senha-inexistente'));
  const confere = await argon2.verify(hash, senha).catch(() => false);
  if (!encontrado || !confere || !encontrado.ativo) {
    throw new NaoAutenticado('Usuário ou senha incorretos.');
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + sessaoDias * 24 * 3600 * 1000);
  repo.inserirSessao(db, hashDoToken(token), encontrado.id, dataLocal(expira));
  repo.limparSessoesExpiradas(db);
  const { senhaHash: _omitido, ...usuario } = encontrado;
  inserirAuditoria(db, {
    usuarioId: usuario.id,
    acao: 'entrar',
    entidade: 'sessao',
    entidadeId: null,
  });
  return { usuario, token, expira };
}

export function sair(db: Db, token: string | undefined): void {
  if (token) repo.removerSessao(db, hashDoToken(token));
}

/** Resolve o usuário de um token de sessão; `undefined` se inválido ou expirado. */
export function usuarioDaSessao(db: Db, token: string | undefined): Usuario | undefined {
  if (!token) return undefined;
  const s = repo.buscarSessao(db, hashDoToken(token));
  if (!s || !s.ativo) return undefined;
  if (s.expiraEm < dataLocal(new Date())) {
    repo.removerSessao(db, hashDoToken(token));
    return undefined;
  }
  const { expiraEm: _omitido, ...usuario } = s;
  return usuario;
}

/** Login da administradora criada automaticamente quando o banco ainda não tem nenhum usuário. */
export const LOGIN_LOCAL = 'atelie';

/**
 * Modo local (sem tela de entrada): o app só escuta em 127.0.0.1, então quem está na máquina é a
 * dona do ateliê. Toda requisição age como a primeira administradora ativa; se o banco ainda não tem
 * nenhuma, cria uma. O hash de senha fica inválido de propósito: ninguém entra por senha nesse usuário.
 */
export function usuarioLocal(db: Db): Usuario {
  const existente = repo.primeiraAdministradoraAtiva(db);
  if (existente) return existente;
  const id = repo.inserirUsuario(db, {
    nome: 'Ateliê',
    login: repo.buscarPorLogin(db, LOGIN_LOCAL) ? `${LOGIN_LOCAL}-${Date.now()}` : LOGIN_LOCAL,
    senhaHash: '!sem-senha',
    perfil: 'administradora',
  });
  inserirAuditoria(db, { usuarioId: null, acao: 'criar', entidade: 'usuario', entidadeId: id });
  const { senhaHash: _omitido, ...usuario } = repo.buscarUsuario(db, id)!;
  return usuario;
}

export function estadoDaSessao(db: Db): Sessao {
  return { usuario: usuarioLocal(db), precisaCriarAdministradora: false };
}

export async function trocarSenha(
  db: Db,
  usuarioId: number,
  senhaAtual: string,
  novaSenha: string,
): Promise<void> {
  const u = repo.buscarUsuario(db, usuarioId);
  if (!u || !(await argon2.verify(u.senhaHash, senhaAtual).catch(() => false))) {
    throw new ErroDeValidacao('A senha atual está incorreta.');
  }
  repo.atualizarSenha(db, usuarioId, await gerarHash(novaSenha));
  inserirAuditoria(db, {
    usuarioId,
    acao: 'trocar_senha',
    entidade: 'usuario',
    entidadeId: usuarioId,
  });
}

/** Redefinição de senha pelo CLI (esquecimento da senha local). */
export async function redefinirSenha(db: Db, login: string, novaSenha: string): Promise<void> {
  const u = repo.buscarPorLogin(db, login.trim().toLowerCase());
  if (!u) throw new ErroDeValidacao(`Usuário "${login}" não encontrado.`);
  repo.atualizarSenha(db, u.id, await gerarHash(novaSenha));
  repo.removerSessoesDoUsuario(db, u.id);
  inserirAuditoria(db, {
    usuarioId: null,
    acao: 'redefinir_senha_cli',
    entidade: 'usuario',
    entidadeId: u.id,
  });
}

export const listarUsuarios = (db: Db): Usuario[] => repo.listarUsuarios(db);

export function alternarUsuario(db: Db, id: number, ativo: boolean, autorId: number): void {
  if (id === autorId && !ativo)
    throw new OperacaoNaoPermitida('Você não pode desativar o seu próprio usuário.');
  repo.definirAtivo(db, id, ativo);
  if (!ativo) repo.removerSessoesDoUsuario(db, id);
}
