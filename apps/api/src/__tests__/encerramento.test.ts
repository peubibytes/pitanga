import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarBackup } from '../backup';
import { criarEncerrador, ligarAvisos, operacaoIndivisivel } from '../encerramento';
import { criarAmbiente } from './ambiente';

describe('avisos para a casca desktop', () => {
  const avisos: string[] = [];
  beforeEach(() => {
    avisos.length = 0;
    ligarAvisos((a) => avisos.push(a.tipo));
  });
  afterEach(() => ligarAvisos(null));

  it('avisa uma vez só em operações aninhadas e também quando falham', () => {
    operacaoIndivisivel(() => operacaoIndivisivel(() => 1));
    expect(avisos).toEqual(['ocupado', 'livre']);
    expect(() =>
      operacaoIndivisivel(() => {
        throw new Error('falhou');
      }),
    ).toThrow('falhou');
    expect(avisos).toEqual(['ocupado', 'livre', 'ocupado', 'livre']);
  });

  it('o backup avisa antes de começar e depois de terminar', async () => {
    const amb = await criarAmbiente();
    criarBackup(amb.conexao.db, amb.config, 'manual');
    expect(avisos).toEqual(['ocupado', 'livre']);
    amb.limpar();
  });
});

describe('encerrador', () => {
  it('fecha o banco e sai uma vez só, mesmo com conexão presa e pedidos repetidos', async () => {
    const amb = await criarAmbiente();
    const servidor = amb.app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    const { port } = servidor.address() as net.AddressInfo;
    // Requisição que nunca termina: o corpo prometido não chega.
    const presa = http.request({
      port,
      host: '127.0.0.1',
      method: 'POST',
      path: '/api/clientes',
      headers: { 'Content-Type': 'application/json', 'Content-Length': 100 },
    });
    presa.on('error', () => {});
    presa.write('{');
    await new Promise((r) => setTimeout(r, 200));

    const saidas: number[] = [];
    const registro: string[] = [];
    await new Promise<void>((pronto) => {
      const encerrar = criarEncerrador({
        servidor: () => servidor,
        conexao: () => amb.conexao,
        registrar: (m) => registro.push(m),
        sair: (c) => {
          saidas.push(c);
          pronto();
        },
      });
      encerrar('teste');
      encerrar('teste de novo');
    });
    expect(saidas).toEqual([0]);
    expect(registro[0]).toBe('Recebi teste; encerrando.');
    expect(amb.conexao.db.open).toBe(false);
    amb.limpar();
  });

  it('funciona antes de o servidor subir', () => {
    const saidas: number[] = [];
    criarEncerrador({
      servidor: () => null,
      conexao: () => null,
      registrar: () => {},
      sair: (c) => saidas.push(c),
    })('teste');
    expect(saidas).toEqual([0]);
  });
});

describe('processo real sob a casca', () => {
  let dir: string;
  let filho: ChildProcess | null = null;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdp-casca-'));
  });
  afterEach(() => {
    filho?.kill();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });

  async function portaLivre(): Promise<number> {
    const s = net.createServer().listen(0, '127.0.0.1');
    await new Promise((r) => s.once('listening', r));
    const { port } = s.address() as net.AddressInfo;
    await new Promise((r) => s.close(r));
    return port;
  }

  async function subir(): Promise<{ porta: number; avisos: string[]; saida: Promise<number> }> {
    const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const porta = await portaLivre();
    const avisos: string[] = [];
    const p = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      cwd: raiz,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        FDP_CASCA: '1',
        FDP_PORT: String(porta),
        FDP_DATA_DIR: dir,
      },
    });
    filho = p;
    p.on('message', (m: any) => {
      if (m?.tipo) avisos.push(m.tipo);
    });
    const saida = new Promise<number>((r) => p.once('exit', (c) => r(c ?? -1)));
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${porta}/api/saude`)).ok)
          return { porta, avisos, saida };
      } catch {
        /* ainda subindo */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('a API não subiu');
  }

  const banco = () => path.join(dir, 'flor-de-pitanga.db');
  function conferirBancoFechado() {
    expect(fs.existsSync(`${banco()}-wal`)).toBe(false);
    const db = new Database(banco(), { readonly: true });
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    db.close();
  }

  it('o pedido por IPC encerra limpo, registra no log e libera a porta', async () => {
    const { porta, avisos, saida } = await subir();
    // Backup automático da primeira abertura.
    expect(avisos).toEqual(['ocupado', 'livre']);
    filho!.send({ tipo: 'encerrar' });
    expect(await saida).toBe(0);
    conferirBancoFechado();
    const logs = fs
      .readdirSync(path.join(dir, 'logs'))
      .map((f) => fs.readFileSync(path.join(dir, 'logs', f), 'utf8'))
      .join('');
    expect(logs).toMatch(/encerrando/);
    await expect(fetch(`http://127.0.0.1:${porta}/api/saude`)).rejects.toThrow();
  });

  it('espera o backup em andamento terminar antes de sair', async () => {
    const { porta, avisos, saida } = await subir();
    avisos.length = 0;
    const backup = fetch(`http://127.0.0.1:${porta}/api/backup`, { method: 'POST' }).catch(
      () => null,
    );
    while (!avisos.includes('ocupado')) await new Promise((r) => setTimeout(r, 5));
    filho!.send({ tipo: 'encerrar' });
    expect(await saida).toBe(0);
    await backup;
    expect(avisos).toEqual(['ocupado', 'livre']);
    const zips = fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.endsWith('.zip'));
    expect(zips).toHaveLength(2);
    for (const z of zips) {
      const nomes = new AdmZip(path.join(dir, 'backups', z)).getEntries().map((e) => e.entryName);
      expect(nomes).toContain('manifesto.json');
    }
    expect(fs.readdirSync(path.join(dir, 'backups')).some((f) => f.startsWith('temp-'))).toBe(
      false,
    );
    conferirBancoFechado();
  });

  it('se a casca cair, a API encerra sozinha', async () => {
    const { saida } = await subir();
    filho!.disconnect();
    expect(await saida).toBe(0);
    conferirBancoFechado();
  });
});
