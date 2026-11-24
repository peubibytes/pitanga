import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { encerrarFilho, vigiar } from './encerrar-filho';

let filho: ChildProcess | null = null;
afterEach(() => {
  filho?.kill();
});

/** Processo de verdade que roda o trecho dado e avisa quando está pronto. */
async function criar(codigo: string): Promise<ChildProcess> {
  const p = spawn(process.execPath, ['-e', `${codigo}; process.send({ tipo: 'pronto' })`], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
  filho = p;
  await new Promise((r) => p.once('message', r));
  return p;
}

const sairQuandoPedirem = `process.on('message', (m) => { if (m.tipo === 'encerrar') process.exit(0) })`;

describe('encerrarFilho', () => {
  it('espera a saída limpa', async () => {
    const p = await criar(sairQuandoPedirem);
    expect(await encerrarFilho(p, vigiar(p))).toBe('limpo');
    expect(p.exitCode).toBe(0);
  });

  it('recorre ao kill quando o tempo acaba', async () => {
    const p = await criar(`setInterval(() => {}, 1000)`);
    const limites = { limiteMs: 400, limiteOcupadoMs: 5_000 };
    expect(await encerrarFilho(p, vigiar(p), limites)).toBe('forcado');
  });

  it('não corta uma operação em andamento, mesmo que passe do limite', async () => {
    // Igual ao backup: avisa, trava o processo e só depois atende o pedido.
    const p = await criar(
      `${sairQuandoPedirem};
       setTimeout(() => {
         process.send({ tipo: 'ocupado' });
         const fim = Date.now() + 2000; while (Date.now() < fim);
         process.send({ tipo: 'livre' });
       }, 200)`,
    );
    const vigia = vigiar(p);
    while (!vigia.ocupado()) await new Promise((r) => setTimeout(r, 10));
    const limites = { limiteMs: 500, limiteOcupadoMs: 10_000 };
    expect(await encerrarFilho(p, vigia, limites)).toBe('limpo');
    expect(p.exitCode).toBe(0);
  });

  it('tem teto para uma operação que nunca termina', async () => {
    const p = await criar(
      `setTimeout(() => { process.send({ tipo: 'ocupado' }); for (;;); }, 100)`,
    );
    const vigia = vigiar(p);
    while (!vigia.ocupado()) await new Promise((r) => setTimeout(r, 10));
    const limites = { limiteMs: 10_000, limiteOcupadoMs: 400 };
    expect(await encerrarFilho(p, vigia, limites)).toBe('forcado');
  });

  it('não faz nada se o processo já saiu', async () => {
    const p = await criar(`setTimeout(() => process.exit(3), 50)`);
    await new Promise((r) => p.once('exit', r));
    expect(await encerrarFilho(p, vigiar(p))).toBe('limpo');
  });
});
