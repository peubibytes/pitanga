import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { criarApp } from '../app';
import { criarConexao } from '../backup';
import { criarConfig, type Config } from '../config';
import { migrar } from '../db/migrate';

export interface Ambiente {
  dir: string;
  config: Config;
  conexao: ReturnType<typeof criarConexao>;
  app: ReturnType<typeof criarApp>;
  /** Cliente HTTP já autenticado como administradora. */
  api: ReturnType<typeof request.agent>;
  limpar(): void;
}

/** Sobe API + SQLite em uma pasta temporária e entra como administradora. */
export async function criarAmbiente(): Promise<Ambiente> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdp-teste-'));
  const config = criarConfig({ dadosDir: dir, semRotinas: true });
  const conexao = criarConexao(config);
  migrar(conexao.db);
  const app = criarApp({ conexao, config });
  const api = request.agent(app);
  const r = await api
    .post('/api/sessao/primeiro-acesso')
    .send({ nome: 'Flor', login: 'flor', senha: 'segredo123' });
  if (r.status !== 201) throw new Error(`Falha no primeiro acesso: ${JSON.stringify(r.body)}`);
  return {
    dir,
    config,
    conexao,
    app,
    api,
    limpar() {
      try {
        conexao.db.close();
      } catch {
        /* já fechado */
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

type Agente = Ambiente['api'];

/** Atalhos que falham o teste com a resposta da API quando o status não é o esperado. */
export async function criar<T = any>(
  api: Agente,
  url: string,
  corpo: unknown,
  status = 201,
): Promise<T> {
  const r = await api.post(url).send(corpo as object);
  if (r.status !== status) throw new Error(`POST ${url} → ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.dados as T;
}

export async function obter<T = any>(api: Agente, url: string): Promise<T> {
  const r = await api.get(url);
  if (r.status !== 200) throw new Error(`GET ${url} → ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.dados as T;
}

export async function consistente(api: Agente): Promise<void> {
  const resultados = await obter<{ numero: number; ok: boolean; divergencias: string[] }[]>(
    api,
    '/api/consistencia',
  );
  const falhas = resultados.filter((r) => !r.ok);
  if (falhas.length) throw new Error(`Invariantes violadas: ${JSON.stringify(falhas)}`);
}
