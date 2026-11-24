/**
 * Backup, restauração e integridade (plano, seção 10).
 *  - cópia consistente com VACUUM INTO (sem copiar arquivo "a quente");
 *  - .zip com o banco, as fotos e um manifesto (versão, schema, contagens, sha256);
 *  - restauração valida o manifesto e o sha256, guarda o estado atual antes de substituir.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import type { BackupRegistro, OrigemBackup } from '@pitanga/shared';
import type { Config } from '../config';
import { abrirBanco, type Db } from '../db/connection';
import { estadoDasMigracoes, listarMigracoes, migrar } from '../db/migrate';
import { agora, todos } from '../db/util';
import { operacaoIndivisivel } from '../encerramento';
import { ErroDeValidacao, OperacaoNaoPermitida, RegistroNaoEncontrado } from '../erros';
import { logger } from '../logger';
import * as repo from '../repositories/sistema.repo';

export interface Manifesto {
  aplicativo: 'flor-de-pitanga';
  versaoApp: string;
  schema: { aplicadas: number; ultima: string | null };
  criadoEm: string;
  origem: OrigemBackup;
  registros: Record<string, number>;
  sha256Banco: string;
  fotos: number;
}

const BANCO_NO_ZIP = 'flor-de-pitanga.db';
const sha256 = (dados: Buffer | string): string =>
  crypto.createHash('sha256').update(dados).digest('hex');
const sha256Arquivo = (arquivo: string): string => sha256(fs.readFileSync(arquivo));

function carimbo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function nomeLivre(dir: string, base: string, extensao: string): string {
  let nome = `${base}${extensao}`;
  for (let n = 2; fs.existsSync(path.join(dir, nome)); n++) nome = `${base}-${n}${extensao}`;
  return nome;
}

/** Cópia consistente do banco em `destino` (VACUUM INTO) após consolidar o WAL. */
export function copiarBanco(db: Db, destino: string): void {
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.rmSync(destino, { force: true });
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
}

/** `PRAGMA integrity_check` num arquivo SQLite; devolve "ok" ou a primeira mensagem de erro. */
export function verificarIntegridadeDoArquivo(arquivo: string): string {
  const copia = new Database(arquivo, { readonly: true, fileMustExist: true });
  try {
    const linhas = copia.pragma('integrity_check') as { integrity_check: string }[];
    return linhas[0]?.integrity_check ?? 'sem resposta';
  } finally {
    copia.close();
  }
}

function contarRegistros(arquivo: string): Record<string, number> {
  const copia = new Database(arquivo, { readonly: true, fileMustExist: true });
  try {
    const tabelas = copia
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as { name: string }[];
    return Object.fromEntries(
      tabelas.map((t) => [
        t.name,
        (copia.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number }).n,
      ]),
    );
  } finally {
    copia.close();
  }
}

function listarFotos(fotosDir: string): string[] {
  return fs.existsSync(fotosDir)
    ? fs.readdirSync(fotosDir).filter((f) => /\.(webp|jpg|png)$/i.test(f))
    : [];
}

/** Antes de migrar um banco que já tem dados: cópia automática em `pre-migracao-<data>.db`. */
export function copiaPreMigracao(db: Db, config: Config): string {
  const nome = nomeLivre(config.backupsDir, `pre-migracao-${carimbo()}`, '.db');
  const destino = path.join(config.backupsDir, nome);
  operacaoIndivisivel(() => copiarBanco(db, destino));
  logger.info({ destino }, 'Cópia de segurança criada antes da migração.');
  return destino;
}

export function criarBackup(
  db: Db,
  config: Config,
  origem: OrigemBackup,
  prefixo = 'flor-de-pitanga',
): BackupRegistro {
  return operacaoIndivisivel(() => gerarBackup(db, config, origem, prefixo));
}

function gerarBackup(
  db: Db,
  config: Config,
  origem: OrigemBackup,
  prefixo: string,
): BackupRegistro {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const temp = path.join(config.backupsDir, `temp-${process.pid}-${Date.now()}.db`);
  try {
    copiarBanco(db, temp);
    const integridade = verificarIntegridadeDoArquivo(temp);
    if (integridade !== 'ok') {
      throw new Error(`A cópia do banco falhou na verificação de integridade: ${integridade}`);
    }
    const bancoBuffer = fs.readFileSync(temp);
    const fotos = listarFotos(config.fotosDir);
    const manifesto: Manifesto = {
      aplicativo: 'flor-de-pitanga',
      versaoApp: config.versao,
      schema: estadoDasMigracoes(db),
      criadoEm: agora(),
      origem,
      registros: contarRegistros(temp),
      sha256Banco: sha256(bancoBuffer),
      fotos: fotos.length,
    };
    const zip = new AdmZip();
    zip.addFile(BANCO_NO_ZIP, bancoBuffer);
    for (const foto of fotos) zip.addLocalFile(path.join(config.fotosDir, foto), 'fotos');
    zip.addFile('manifesto.json', Buffer.from(JSON.stringify(manifesto, null, 2), 'utf8'));

    const nome = nomeLivre(config.backupsDir, `${prefixo}-${carimbo()}`, '.zip');
    const caminho = path.join(config.backupsDir, nome);
    zip.writeZip(caminho);

    const tamanho = fs.statSync(caminho).size;
    const hash = sha256Arquivo(caminho);
    const id = repo.inserirBackup(db, {
      arquivo: nome,
      tamanhoBytes: tamanho,
      hashSha256: hash,
      integridadeOk: true,
      origem,
    });
    if (origem === 'manual' || origem === 'automatico')
      repo.gravarConfiguracao(db, 'ultimo_backup_em', agora());
    aplicarRetencao(db, config);
    return {
      id,
      arquivo: nome,
      data: agora(),
      tamanhoBytes: tamanho,
      hashSha256: hash,
      integridadeOk: true,
      origem,
      existe: true,
    };
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/** Mantém os N backups mais recentes (manuais e automáticos) e os 10 mais recentes de segurança. */
function aplicarRetencao(db: Db, config: Config): void {
  const todosOsBackups = repo.listarBackups(db);
  const grupos: [OrigemBackup[], number][] = [
    [['manual', 'automatico'], config.retencaoBackups],
    [['pre_migracao', 'pre_restauracao'], 10],
  ];
  for (const [origens, limite] of grupos) {
    for (const antigo of todosOsBackups.filter((b) => origens.includes(b.origem)).slice(limite)) {
      fs.rmSync(path.join(config.backupsDir, antigo.arquivo), { force: true });
      repo.removerBackup(db, antigo.id);
    }
  }
}

/** Inclui na tabela os .zip que existem na pasta mas não estão registrados (ex.: após restaurar). */
export function reconciliarBackups(db: Db, config: Config): void {
  if (!fs.existsSync(config.backupsDir)) return;
  const registrados = new Set(repo.listarBackups(db).map((b) => b.arquivo));
  for (const arquivo of fs.readdirSync(config.backupsDir).filter((f) => f.endsWith('.zip'))) {
    if (registrados.has(arquivo)) continue;
    const caminho = path.join(config.backupsDir, arquivo);
    const origem: OrigemBackup = arquivo.startsWith('pre-restauracao')
      ? 'pre_restauracao'
      : 'manual';
    repo.inserirBackup(db, {
      arquivo,
      tamanhoBytes: fs.statSync(caminho).size,
      hashSha256: sha256Arquivo(caminho),
      integridadeOk: true,
      origem,
    });
  }
}

export function listarBackups(db: Db, config: Config): BackupRegistro[] {
  reconciliarBackups(db, config);
  return repo
    .listarBackups(db)
    .map((b) => ({ ...b, existe: fs.existsSync(path.join(config.backupsDir, b.arquivo)) }));
}

function caminhoDoBackup(config: Config, arquivo: string): string {
  if (!/^[\w.-]+\.zip$/.test(arquivo))
    throw new ErroDeValidacao('Nome de arquivo de backup inválido.');
  const caminho = path.join(config.backupsDir, arquivo);
  if (!fs.existsSync(caminho)) throw new RegistroNaoEncontrado('Arquivo de backup');
  return caminho;
}

/** Remove um backup: apaga o .zip da pasta e o registro da tabela (também limpa registros órfãos). */
export function excluirBackup(
  db: Db,
  config: Config,
  arquivo: string,
  usuarioId: number | null = null,
): void {
  if (!/^[\w.-]+\.zip$/.test(arquivo))
    throw new ErroDeValidacao('Nome de arquivo de backup inválido.');
  const registro = repo.listarBackups(db).find((b) => b.arquivo === arquivo);
  const caminho = path.join(config.backupsDir, arquivo);
  if (!registro && !fs.existsSync(caminho)) throw new RegistroNaoEncontrado('Backup');
  fs.rmSync(caminho, { force: true });
  if (registro) repo.removerBackup(db, registro.id);
  repo.inserirAuditoria(db, {
    usuarioId,
    acao: 'excluir',
    entidade: 'backup',
    entidadeId: registro?.id ?? null,
    dados: { arquivo },
  });
}

export interface ResultadoVerificacao {
  ok: boolean;
  arquivo: string;
  manifesto?: Manifesto;
  problemas: string[];
}

function lerZip(caminho: string): { zip: AdmZip; manifesto: Manifesto; banco: Buffer } {
  let zip: AdmZip;
  try {
    zip = new AdmZip(caminho);
  } catch {
    throw new ErroDeValidacao('O arquivo não é um backup válido (zip ilegível).');
  }
  const m = zip.getEntry('manifesto.json');
  const b = zip.getEntry(BANCO_NO_ZIP);
  if (!m || !b)
    throw new ErroDeValidacao('O backup está incompleto: faltam o manifesto ou o banco de dados.');
  const manifesto = JSON.parse(m.getData().toString('utf8')) as Manifesto;
  if (manifesto.aplicativo !== 'flor-de-pitanga')
    throw new ErroDeValidacao('Este arquivo não é um backup do Flor de Pitanga.');
  return { zip, manifesto, banco: b.getData() };
}

/** Confere manifesto, sha256 e `integrity_check` de um backup, sem alterar nada. */
export function verificarBackup(config: Config, arquivo: string): ResultadoVerificacao {
  const caminho = caminhoDoBackup(config, arquivo);
  const problemas: string[] = [];
  const { manifesto, banco } = lerZip(caminho);
  if (sha256(banco) !== manifesto.sha256Banco)
    problemas.push(
      'O banco de dados não confere com o sha256 do manifesto (arquivo alterado ou corrompido).',
    );
  const temp = path.join(config.backupsDir, `verificacao-${process.pid}-${Date.now()}.db`);
  try {
    fs.writeFileSync(temp, banco);
    const integridade = verificarIntegridadeDoArquivo(temp);
    if (integridade !== 'ok')
      problemas.push(`Falha na verificação de integridade do banco: ${integridade}`);
  } finally {
    fs.rmSync(temp, { force: true });
  }
  return { ok: problemas.length === 0, arquivo, manifesto, problemas };
}

/** Conexão substituível: a restauração fecha o arquivo, troca o banco e reabre. */
export interface Conexao {
  db: Db;
  reabrir(): Db;
}

export function criarConexao(config: Config): Conexao {
  const conexao: Conexao = {
    db: abrirBanco(config.dbArquivo),
    reabrir() {
      conexao.db = abrirBanco(config.dbArquivo);
      return conexao.db;
    },
  };
  return conexao;
}

/**
 * Restaura um backup: valida, guarda o estado atual em `pre-restauracao-*.zip`, substitui o banco
 * e as fotos, reabre a conexão, aplica migrations pendentes e verifica a integridade.
 */
export function restaurarBackup(
  conexao: Conexao,
  config: Config,
  arquivo: string,
): { integridade: string; migracoes: string[] } {
  return operacaoIndivisivel(() => substituirPeloBackup(conexao, config, arquivo));
}

function substituirPeloBackup(
  conexao: Conexao,
  config: Config,
  arquivo: string,
): { integridade: string; migracoes: string[] } {
  if (config.dbArquivo === ':memory:')
    throw new OperacaoNaoPermitida('Restauração não é possível em banco em memória.');
  const verificacao = verificarBackup(config, arquivo);
  if (!verificacao.ok)
    throw new ErroDeValidacao(
      `O backup não passou na validação: ${verificacao.problemas.join(' ')}`,
    );
  const manifesto = verificacao.manifesto!;
  const atual = listarMigracoes().length;
  if (manifesto.schema.aplicadas > atual) {
    throw new OperacaoNaoPermitida(
      `Este backup foi feito por uma versão mais nova do aplicativo (schema ${manifesto.schema.aplicadas}; esta versão conhece ${atual}). Atualize o aplicativo antes de restaurar.`,
      'BACKUP_MAIS_NOVO',
    );
  }

  criarBackup(conexao.db, config, 'pre_restauracao', 'pre-restauracao');

  const { zip, banco } = lerZip(caminhoDoBackup(config, arquivo));
  const novoDb = `${config.dbArquivo}.restaurando`;
  fs.writeFileSync(novoDb, banco);

  conexao.db.close();
  try {
    for (const extra of ['-wal', '-shm']) fs.rmSync(`${config.dbArquivo}${extra}`, { force: true });
    fs.renameSync(novoDb, config.dbArquivo);
    // Esvazia a pasta de fotos sem removê-la (no Windows um arquivo aberto impede apagar o diretório).
    fs.mkdirSync(config.fotosDir, { recursive: true });
    for (const antiga of fs.readdirSync(config.fotosDir))
      fs.rmSync(path.join(config.fotosDir, antiga), { force: true });
    for (const entrada of zip
      .getEntries()
      .filter((e) => e.entryName.startsWith('fotos/') && !e.isDirectory)) {
      fs.writeFileSync(
        path.join(config.fotosDir, path.basename(entrada.entryName)),
        entrada.getData(),
      );
    }
  } finally {
    conexao.reabrir();
  }
  const db = conexao.db;
  // Backup de um schema mais antigo: aplica as migrations que faltam.
  const migracoes = migrar(db);
  // Os registros de backup vindos do arquivo restaurado podem estar desatualizados: reconcilia com a pasta.
  reconciliarBackups(db, config);
  repo.inserirAuditoria(db, {
    usuarioId: null,
    acao: 'restaurar',
    entidade: 'backup',
    entidadeId: null,
    dados: { arquivo },
  });
  const integridade =
    (db.pragma('integrity_check') as { integrity_check: string }[])[0]?.integrity_check ??
    'sem resposta';
  return { integridade, migracoes };
}

/** Backup ao iniciar, se o último passou de 24 h (rotina automática, seção 10.1). */
export function backupAutomaticoSeNecessario(db: Db, config: Config): BackupRegistro | null {
  const ultimo = todos<{ data: string }>(
    db,
    `SELECT data FROM backups WHERE origem IN ('manual','automatico') ORDER BY id DESC LIMIT 1`,
  )[0]?.data;
  const idade = ultimo ? Date.now() - new Date(ultimo.replace(' ', 'T')).getTime() : Infinity;
  if (idade < 24 * 3600 * 1000) return null;
  try {
    return criarBackup(db, config, 'automatico');
  } catch (erro) {
    logger.error({ erro }, 'Falha no backup automático.');
    return null;
  }
}
