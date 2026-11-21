import { Router } from 'express';
import { loginSchema, trocaSenhaSchema, usuarioSchema } from '@pitanga/shared';
import { z } from 'zod';
import { exigirAdministradora, exigirSessao } from '../middleware';
import * as auth from '../services/auth.service';
import { COOKIE_SESSAO } from '../services/auth.service';
import { type Dependencias, idDe, ok } from './helpers';

export function sessaoRoutes(deps: Dependencias): Router {
  const r = Router();
  const opcoesCookie = (expira?: Date) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false, // a API escuta só em 127.0.0.1, sem HTTPS
    path: '/',
    ...(expira ? { expires: expira } : {}),
  });

  r.get('/sessao', (_req, res) => {
    ok(res, auth.estadoDaSessao(deps.conexao.db));
  });

  r.post('/sessao', async (req, res) => {
    const { login, senha } = loginSchema.parse(req.body);
    const { usuario, token, expira } = await auth.entrar(
      deps.conexao.db,
      login,
      senha,
      deps.config.sessaoDias,
    );
    res.cookie(COOKIE_SESSAO, token, opcoesCookie(expira));
    ok(res, { usuario, precisaCriarAdministradora: false });
  });

  r.delete('/sessao', (req, res) => {
    auth.sair(deps.conexao.db, req.cookies?.[COOKIE_SESSAO]);
    res.clearCookie(COOKIE_SESSAO, opcoesCookie());
    ok(res, { sucesso: true });
  });

  /** Primeiro acesso: cria a administradora enquanto não há nenhum usuário. */
  r.post('/sessao/primeiro-acesso', async (req, res) => {
    const dados = usuarioSchema.omit({ perfil: true }).parse(req.body);
    await auth.criarPrimeiraAdministradora(deps.conexao.db, dados);
    const { usuario, token, expira } = await auth.entrar(
      deps.conexao.db,
      dados.login,
      dados.senha,
      deps.config.sessaoDias,
    );
    res.cookie(COOKIE_SESSAO, token, opcoesCookie(expira));
    ok(res, { usuario, precisaCriarAdministradora: false }, 201);
  });

  r.post('/sessao/senha', exigirSessao(deps.conexao), async (req, res) => {
    const dados = trocaSenhaSchema.parse(req.body);
    await auth.trocarSenha(deps.conexao.db, req.usuario!.id, dados.senhaAtual, dados.novaSenha);
    ok(res, { sucesso: true });
  });

  // Gestão de usuários (somente administradora)
  r.get('/usuarios', exigirSessao(deps.conexao), exigirAdministradora, (_req, res) => {
    ok(res, auth.listarUsuarios(deps.conexao.db));
  });
  r.post('/usuarios', exigirSessao(deps.conexao), exigirAdministradora, async (req, res) => {
    const dados = usuarioSchema.parse(req.body);
    ok(res, await auth.criarUsuario(deps.conexao.db, dados, req.usuario!.id), 201);
  });
  r.put('/usuarios/:id/ativo', exigirSessao(deps.conexao), exigirAdministradora, (req, res) => {
    const { ativo } = z.object({ ativo: z.boolean() }).parse(req.body);
    auth.alternarUsuario(deps.conexao.db, idDe(req), ativo, req.usuario!.id);
    ok(res, auth.listarUsuarios(deps.conexao.db));
  });
  return r;
}
