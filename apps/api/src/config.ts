import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  host: string;
  porta: number;
  producao: boolean;
  versao: string;
  raiz: string;
  dadosDir: string;
  dbArquivo: string;
  fotosDir: string;
  backupsDir: string;
  logsDir: string;
  /** Pasta do front compilado (servido pela própria API em produção). */
  webDir: string;
  sessaoDias: number;
  /** Quantos backups automáticos manter. */
  retencaoBackups: number;
  /** Origens aceitas para requisições de escrita (proteção contra CSRF). */
  origensPermitidas: string[];
  /** Nomes aceitos no cabeçalho `Host`, sem a porta (proteção contra DNS rebinding). */
  hostsPermitidos: string[];
  /** Desliga rotinas de fundo (backup automático) — usado em testes. */
  semRotinas: boolean;
}

// apps/api/src (dev) e apps/api/dist (build) ficam à mesma profundidade da raiz do repositório.
const aqui = path.dirname(fileURLToPath(import.meta.url));
export const raizRepositorio = path.resolve(aqui, '..', '..', '..');

function lerVersao(raiz: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Pastas sincronizadas na nuvem podem corromper o SQLite em uso (plano, seção 12.3). */
export function verificarPastaDeDados(dir: string): void {
  if (/onedrive|dropbox|google ?drive|icloud|\bbox sync\b/i.test(dir)) {
    throw new Error(
      `A pasta de dados (${dir}) parece estar dentro de uma pasta sincronizada na nuvem ` +
        '(OneDrive, Dropbox, Google Drive ou iCloud). A sincronização pode corromper o banco em uso. ' +
        'Escolha outra pasta definindo FDP_DATA_DIR, por exemplo C:\\FlorDePitanga\\dados.',
    );
  }
}

function resolverDadosDir(raiz: string, producao: boolean): string {
  if (process.env.FDP_DATA_DIR) return path.resolve(process.env.FDP_DATA_DIR);
  if (producao && process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'FlorDePitanga');
  }
  return path.join(raiz, 'dados');
}

/** Porta fixa do app local: http://127.0.0.1:1971 */
export const PORTA_PADRAO = 1971;

export function criarConfig(sobrescritas: Partial<Config> = {}): Config {
  const raiz = raizRepositorio;
  const producao = process.env.NODE_ENV === 'production';
  const porta = Number(process.env.FDP_PORT ?? process.env.PORT ?? PORTA_PADRAO);
  const dadosDir = sobrescritas.dadosDir ?? resolverDadosDir(raiz, producao);
  const base: Config = {
    host: '127.0.0.1',
    porta,
    producao,
    versao: lerVersao(raiz),
    raiz,
    dadosDir,
    dbArquivo: path.join(dadosDir, 'flor-de-pitanga.db'),
    fotosDir: path.join(dadosDir, 'fotos'),
    backupsDir: path.join(dadosDir, 'backups'),
    logsDir: path.join(dadosDir, 'logs'),
    webDir: process.env.FDP_WEB_DIR
      ? path.resolve(process.env.FDP_WEB_DIR)
      : path.join(raiz, 'apps', 'web', 'dist'),
    sessaoDias: 30,
    retencaoBackups: Number(process.env.FDP_RETENCAO_BACKUPS ?? 30),
    origensPermitidas: [],
    hostsPermitidos: ['127.0.0.1', 'localhost', '[::1]'],
    semRotinas: false,
  };
  const config = { ...base, ...sobrescritas };
  if (!sobrescritas.origensPermitidas) {
    config.origensPermitidas = [
      `http://127.0.0.1:${config.porta}`,
      `http://localhost:${config.porta}`,
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ];
  }
  return config;
}
