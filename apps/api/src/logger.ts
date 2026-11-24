import path from 'node:path';
import pino, { type Logger } from 'pino';
import type { Config } from './config';

/** Logger do processo. Começa só no console; `iniciarLogger` acrescenta o arquivo com rotação diária. */
export let logger: Logger = pino({
  level: process.env.FDP_LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
});

let arquivoDeLog: { flushSync?: () => void } | null = null;

/** Grava o que ainda estiver na memória; chamar antes de `process.exit`. */
export function descarregarLog(): void {
  try {
    arquivoDeLog?.flushSync?.();
  } catch {
    /* arquivo ainda não aberto: nada a gravar */
  }
}

export async function iniciarLogger(config: Config): Promise<Logger> {
  if (process.env.NODE_ENV === 'test') return logger;
  try {
    const { default: pinoRoll } = await import('pino-roll');
    const arquivo = await pinoRoll({
      file: path.join(config.logsDir, 'api'),
      extension: '.log',
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      mkdir: true,
      limit: { count: 14 },
    });
    arquivoDeLog = arquivo as { flushSync?: () => void };
    logger = pino(
      { level: 'info' },
      pino.multistream([{ stream: process.stdout }, { stream: arquivo }]),
    );
  } catch (erro) {
    logger.warn({ erro }, 'Não foi possível abrir o arquivo de log; seguindo só com o console.');
  }
  return logger;
}
