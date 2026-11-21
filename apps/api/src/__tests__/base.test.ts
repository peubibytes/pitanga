import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarConexao } from '../backup';
import { criarConfig } from '../config';
import { abrirBanco } from '../db/connection';
import { listarMigracoes, migrar } from '../db/migrate';
import { criarAmbiente, criar, obter, type Ambiente } from './ambiente';

describe('migrations', () => {
  it('aplica todas, é idempotente e recusa migration alterada', () => {
    const db = abrirBanco(':memory:');
    expect(migrar(db)).toHaveLength(listarMigracoes().length);
    expect(migrar(db)).toEqual([]);
    db.prepare(`UPDATE _migracoes SET checksum = 'adulterado' WHERE id = 1`).run();
    expect(() => migrar(db)).toThrow(/foi alterada depois de aplicada/);
  });

  it('cria cópia de segurança antes de migrar um banco que já tinha dados', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdp-mig-'));
    const antigas = listarMigracoes();
    const pasta = path.join(dir, 'migrations');
    fs.mkdirSync(pasta);
    fs.writeFileSync(path.join(pasta, antigas[0]!.nome + '.sql'), antigas[0]!.sql);
    const db = abrirBanco(':memory:');
    migrar(db, { dir: pasta });
    fs.writeFileSync(path.join(pasta, '0002_extra.sql'), 'CREATE TABLE extra (id INTEGER);');
    let chamado = false;
    expect(migrar(db, { dir: pasta, antesDeMigrar: () => (chamado = true) })).toEqual([
      '0002_extra',
    ]);
    expect(chamado).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('o banco sai das migrations com as chaves estrangeiras e a unidade base', () => {
    const db = abrirBanco(':memory:');
    migrar(db);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare(`SELECT base, fator FROM unidades WHERE codigo = 'l'`).get()).toEqual({
      base: 'ml',
      fator: 1000,
    });
    expect(() =>
      db.prepare(`INSERT INTO materiais (nome, unidade) VALUES ('x', 'inexistente')`).run(),
    ).toThrow();
  });
});

describe('sessão e cadastros', () => {
  let amb: Ambiente;
  beforeAll(async () => {
    amb = await criarAmbiente();
  });
  afterAll(() => amb.limpar());

  it('GET /saude é público e informa versão, migrations e integridade', async () => {
    const r = await request(amb.app).get('/api/saude');
    expect(r.status).toBe(200);
    expect(r.body.dados).toMatchObject({ status: 'ok', integridade: 'ok' });
    expect(r.body.dados.schema.aplicadas).toBe(listarMigracoes().length);
  });

  it('funciona sem login: toda requisição age como a administradora local', async () => {
    expect((await request(amb.app).get('/api/clientes')).status).toBe(200);
    const r = await request(amb.app).get('/api/sessao');
    expect(r.status).toBe(200);
    expect(r.body.dados).toMatchObject({
      usuario: { login: 'flor', perfil: 'administradora' },
      precisaCriarAdministradora: false,
    });
  });

  it('recusa requisições com Host de fora da máquina (DNS rebinding)', async () => {
    const r = await request(amb.app).get('/api/clientes').set('Host', 'site-malicioso.example');
    expect(r.status).toBe(403);
    const local = await request(amb.app).get('/api/clientes').set('Host', 'localhost:1971');
    expect(local.status).toBe(200);
  });

  it('o primeiro acesso só funciona uma vez', async () => {
    const r = await request(amb.app)
      .post('/api/sessao/primeiro-acesso')
      .send({ nome: 'Outra', login: 'outra', senha: 'segredo123' });
    expect(r.status).toBe(409);
  });

  it('recusa escrita vinda de outra origem', async () => {
    const r = await amb.api
      .post('/api/clientes')
      .set('Origin', 'http://site-malicioso.example')
      .send({ nome: 'X' });
    expect(r.status).toBe(403);
  });

  it('clientes: valida, cria, edita e busca sem diferenciar acentos', async () => {
    const invalido = await amb.api.post('/api/clientes').send({ nome: '   ' });
    expect(invalido.status).toBe(422);
    expect(invalido.body.erro.codigo).toBe('VALIDACAO');

    const c = await criar(amb.api, '/api/clientes', {
      nome: 'João da Silva',
      telefone: '11988887777',
    });
    await criar(amb.api, '/api/clientes', { nome: 'Maria Flor' });
    const edit = await amb.api
      .put(`/api/clientes/${c.id}`)
      .send({ nome: 'João Silva', telefone: '11988887777', ativo: true });
    expect(edit.body.dados.nome).toBe('João Silva');

    const busca = await amb.api.get('/api/clientes').query({ busca: 'joao' });
    expect(busca.body.dados).toHaveLength(1);
    expect(busca.body.paginacao).toMatchObject({ pagina: 1, total: 1 });
    const busca2 = await amb.api.get('/api/clientes').query({ busca: '9888' });
    expect(busca2.body.dados).toHaveLength(1);
  });

  it('fornecedores e categorias/unidades', async () => {
    const f = await criar(amb.api, '/api/fornecedores', {
      nomeLoja: 'Casa das Essências',
      contato: '11 3333-0001',
    });
    expect(f.nomeLoja).toBe('Casa das Essências');
    const cats = await obter<any[]>(amb.api, '/api/categorias?tipo=material');
    expect(cats.length).toBeGreaterThan(3);
    const unidades = await obter<any[]>(amb.api, '/api/unidades');
    expect(unidades.map((u) => u.codigo)).toContain('kg');
    const dup = await amb.api
      .post('/api/categorias')
      .send({ nome: cats[0].nome, tipo: 'material' });
    expect(dup.status).toBe(400);
  });

  it('rota inexistente responde 404 em JSON', async () => {
    const r = await amb.api.get('/api/nao-existe');
    expect(r.status).toBe(404);
    expect(r.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });
});

describe('segurança do início', () => {
  it('a API escuta só em 127.0.0.1', () => {
    expect(criarConfig().host).toBe('127.0.0.1');
  });
  it('nova conexão encontra o mesmo arquivo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdp-conn-'));
    const config = criarConfig({ dadosDir: dir });
    const c = criarConexao(config);
    migrar(c.db);
    c.db.close();
    const c2 = criarConexao(config);
    expect(c2.db.prepare('SELECT COUNT(*) AS n FROM _migracoes').get()).toMatchObject({
      n: listarMigracoes().length,
    });
    c2.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
