/** Encerramento do processo da API, sem depender do Electron (testável com qualquer processo filho). */
import type { ChildProcess } from 'node:child_process';

export interface Vigia {
  /** A API está no meio de algo que não pode ser cortado (backup, restauração). */
  ocupado: () => boolean;
}

/** Acompanha os avisos "ocupado"/"livre" que a API manda por IPC. */
export function vigiar(filho: ChildProcess): Vigia {
  let ocupado = false;
  filho.on('message', (m: unknown) => {
    const tipo = (m as { tipo?: string } | null)?.tipo;
    if (tipo === 'ocupado') ocupado = true;
    if (tipo === 'livre') ocupado = false;
  });
  return { ocupado: () => ocupado };
}

export interface Limites {
  /** Tempo para sair depois do pedido, sem contar o tempo em que está ocupada. */
  limiteMs: number;
  /** Teto para uma operação que nunca termina. */
  limiteOcupadoMs: number;
}

/** 8 s para fechar; um backup grande pode levar mais, então ele não consome esse tempo. */
export const LIMITES: Limites = { limiteMs: 8_000, limiteOcupadoMs: 10 * 60_000 };

const PASSO = 100;

/** Pede para a API sair e espera. Só recorre ao `kill()` quando o tempo acaba. */
export async function encerrarFilho(
  filho: ChildProcess,
  vigia: Vigia,
  limites: Limites = LIMITES,
): Promise<'limpo' | 'forcado'> {
  const saiu = () => filho.exitCode !== null || filho.signalCode !== null;
  if (saiu()) return 'limpo';
  try {
    if (filho.connected) filho.send({ tipo: 'encerrar' });
  } catch {
    /* canal já fechado: ao perdê-lo, a API encerra sozinha */
  }
  let livreMs = 0;
  let ocupadoMs = 0;
  while (!saiu()) {
    await new Promise((r) => setTimeout(r, PASSO));
    if (vigia.ocupado()) ocupadoMs += PASSO;
    else livreMs += PASSO;
    if (livreMs >= limites.limiteMs || ocupadoMs >= limites.limiteOcupadoMs) {
      filho.kill();
      return 'forcado';
    }
  }
  return 'limpo';
}
