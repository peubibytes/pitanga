import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backupAutomaticoSeNecessario, copiaPreMigracao, verificarBackup } from '../backup';
import { verificarInvariantes } from '../services/invariantes.service';
import { criar, criarAmbiente, obter, type Ambiente } from './ambiente';

describe('backup, restauração e fotos', () => {
  let amb: Ambiente;
  beforeAll(async () => {
    amb = await criarAmbiente();
  });
  afterAll(() => amb.limpar());

  it('foto do produto: redimensiona para WebP ≤ 1024 px e serve o arquivo', async () => {
    const produto = await criar(amb.api, '/api/produtos', { nome: 'Difusor com foto' });
    const png = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#c2263a' },
    })
      .png()
      .toBuffer();
    const r = await amb.api
      .post(`/api/produtos/${produto.id}/foto`)
      .set('Content-Type', 'image/png')
      .send(png);
    expect(r.status).toBe(200);
    const nome: string = r.body.dados.fotoArquivo;
    expect(nome).toMatch(/^[a-f0-9-]{36}\.webp$/);
    const arquivo = path.join(amb.config.fotosDir, nome);
    const meta = await sharp(arquivo).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1024);
    const servida = await amb.api.get(`/api/fotos/${nome}`);
    expect(servida.status).toBe(200);
    expect((await amb.api.get('/api/fotos/..%2Fsegredo.txt')).status).toBe(404);
    const invalida = await amb.api
      .post(`/api/produtos/${produto.id}/foto`)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('não sou imagem'));
    expect(invalida.status).toBe(400);
  });

  it('gera o .zip com banco, fotos e manifesto (versão, schema, contagens, sha256) e registra', async () => {
    const b = await criar(amb.api, '/api/backup', {});
    expect(b).toMatchObject({ origem: 'manual', integridadeOk: true, existe: true });
    expect(b.arquivo).toMatch(/^flor-de-pitanga-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/);
    const zip = new AdmZip(path.join(amb.config.backupsDir, b.arquivo));
    const nomes = zip.getEntries().map((e) => e.entryName);
    expect(nomes).toContain('flor-de-pitanga.db');
    expect(nomes).toContain('manifesto.json');
    expect(nomes.some((n) => n.startsWith('fotos/') && n.endsWith('.webp'))).toBe(true);
    const manifesto = JSON.parse(zip.readAsText('manifesto.json'));
    expect(manifesto).toMatchObject({ aplicativo: 'flor-de-pitanga', fotos: 1 });
    expect(manifesto.sha256Banco).toMatch(/^[a-f0-9]{64}$/);
    expect(manifesto.registros.produtos).toBe(1);
    expect(manifesto.schema.aplicadas).toBeGreaterThan(0);

    const lista = await obter<any[]>(amb.api, '/api/backup');
    expect(lista[0].arquivo).toBe(b.arquivo);
    expect((await obter(amb.api, '/api/painel')).ultimoBackupEm).toBeTruthy();
    // nenhum arquivo temporário deve sobrar
    expect(fs.readdirSync(amb.config.backupsDir).filter((f) => f.startsWith('temp-'))).toEqual([]);
  });

  it('verifica o backup e detecta adulteração do banco', async () => {
    const b = (await obter<any[]>(amb.api, '/api/backup'))[0];
    expect(verificarBackup(amb.config, b.arquivo)).toMatchObject({ ok: true, problemas: [] });

    const adulterado = 'adulterado.zip';
    const zip = new AdmZip(path.join(amb.config.backupsDir, b.arquivo));
    const banco = zip.getEntry('flor-de-pitanga.db')!.getData();
    banco[banco.length - 1] = banco[banco.length - 1]! ^ 0xff;
    zip.updateFile('flor-de-pitanga.db', banco);
    zip.writeZip(path.join(amb.config.backupsDir, adulterado));
    const r = verificarBackup(amb.config, adulterado);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/sha256/);
    const restaurar = await amb.api
      .post('/api/backup/restaurar')
      .send({ arquivo: adulterado, confirmacao: 'RESTAURAR' });
    expect(restaurar.status).toBe(400);
  });

  it('remove um backup: apaga o arquivo e o registro; rejeita nome inválido e arquivo inexistente', async () => {
    const b = (await obter<any[]>(amb.api, '/api/backup'))[0];
    const nome = 'para-excluir.zip';
    fs.copyFileSync(
      path.join(amb.config.backupsDir, b.arquivo),
      path.join(amb.config.backupsDir, nome),
    );
    expect((await obter<any[]>(amb.api, '/api/backup')).some((x) => x.arquivo === nome)).toBe(true);

    expect((await amb.api.delete(`/api/backup/${nome}`)).status).toBe(200);
    expect(fs.existsSync(path.join(amb.config.backupsDir, nome))).toBe(false);
    expect((await obter<any[]>(amb.api, '/api/backup')).some((x) => x.arquivo === nome)).toBe(
      false,
    );

    expect((await amb.api.delete(`/api/backup/${nome}`)).status).toBe(404);
    expect((await amb.api.delete('/api/backup/invalido.txt')).status).toBe(400);
  });

  it('restaurar exige confirmação por digitação e volta ao estado do backup (com cópia de segurança)', async () => {
    const b = (await obter<any[]>(amb.api, '/api/backup')).find((x) =>
      x.arquivo.startsWith('flor-de-pitanga'),
    )!;
    await criar(amb.api, '/api/clientes', { nome: 'Cliente criado depois do backup' });
    expect(
      (await obter<any[]>(amb.api, '/api/clientes')).some((c) =>
        c.nome.includes('depois do backup'),
      ),
    ).toBe(true);

    const semConfirmar = await amb.api
      .post('/api/backup/restaurar')
      .send({ arquivo: b.arquivo, confirmacao: 'sim' });
    expect(semConfirmar.status).toBe(422);

    const r = await criar(
      amb.api,
      '/api/backup/restaurar',
      { arquivo: b.arquivo, confirmacao: 'RESTAURAR' },
      200,
    );
    expect(r.integridade).toBe('ok');

    // a conexão foi reaberta: o dado posterior ao backup sumiu, o anterior permanece
    expect(
      amb.conexao.db
        .prepare(`SELECT COUNT(*) AS n FROM clientes WHERE nome LIKE '%depois do backup%'`)
        .get(),
    ).toEqual({ n: 0 });
    expect(amb.conexao.db.prepare(`SELECT COUNT(*) AS n FROM produtos`).get()).toEqual({ n: 1 });
    expect(verificarInvariantes(amb.conexao.db).every((i) => i.ok)).toBe(true);
    // fotos restauradas e cópia de segurança do estado anterior guardada
    expect(fs.readdirSync(amb.config.fotosDir).length).toBe(1);
    expect(
      fs
        .readdirSync(amb.config.backupsDir)
        .some((f) => f.startsWith('pre-restauracao') && f.endsWith('.zip')),
    ).toBe(true);
  });

  it('rotina automática: faz backup se o último passou de 24 h; senão, não', () => {
    const db = amb.conexao.db;
    expect(backupAutomaticoSeNecessario(db, amb.config)).toBeNull(); // há um backup manual recente
    db.prepare(`UPDATE backups SET data = datetime('now','localtime','-2 days')`).run();
    const auto = backupAutomaticoSeNecessario(db, amb.config);
    expect(auto?.origem).toBe('automatico');
  });

  it('cópia antes de migração gera um .db íntegro', () => {
    const destino = copiaPreMigracao(amb.conexao.db, amb.config);
    expect(path.basename(destino)).toMatch(/^pre-migracao-.*\.db$/);
    expect(fs.statSync(destino).size).toBeGreaterThan(0);
  });

  it('retenção: mantém apenas os N backups mais recentes', () => {
    const config = { ...amb.config, retencaoBackups: 2 };
    const db = amb.conexao.db;
    const nomes = [1, 2, 3].map(() => {
      db.prepare(`UPDATE backups SET data = datetime('now','localtime','-3 days')`).run();
      return backupAutomaticoSeNecessario(db, config)?.arquivo;
    });
    expect(nomes.every(Boolean)).toBe(true);
    const registros = db
      .prepare(`SELECT arquivo FROM backups WHERE origem IN ('manual','automatico')`)
      .all() as { arquivo: string }[];
    expect(registros).toHaveLength(2);
    for (const r of registros)
      expect(fs.existsSync(path.join(config.backupsDir, r.arquivo))).toBe(true);
  });
});
