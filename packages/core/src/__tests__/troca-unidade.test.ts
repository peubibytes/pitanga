import { describe, expect, it } from 'vitest';
import {
  converterCusto,
  converterMovimentos,
  converterQuantidade,
  desvioDaConversao,
  exigeDecisao,
  type FatorDeTroca,
} from '../index';

/** 1 un = n da unidade atual (ml → un). */
const umaUnidadeTem = (n: number): FatorDeTroca => ({ nova: 1000, atual: n * 1000 });

describe('troca de unidade (ADR 0008)', () => {
  it('converte quantidade e custo em sentidos opostos', () => {
    const f = umaUnidadeTem(1000);
    expect(converterQuantidade(1_060_000, f)).toBe(1_060); // 1.060 ml → 1,06 un
    expect(converterCusto(28_382, f)).toBe(28_382_000); // R$ 0,028382/ml → R$ 28,382/un
    const volta: FatorDeTroca = { nova: f.atual, atual: f.nova };
    expect(converterQuantidade(1_060, volta)).toBe(1_060_000);
    expect(converterCusto(28_382_000, volta)).toBe(28_382);
  });

  it('a soma dos movimentos convertidos é sempre o saldo convertido, mesmo quando nada é exato', () => {
    const f = umaUnidadeTem(750);
    const movimentos = [1_000_000, -120_000, -140_000, 333_333, -7_500, -2_500, -1, 999];
    const convertidos = converterMovimentos(movimentos, f);
    let soma = 0;
    let original = 0;
    convertidos.forEach((c, i) => {
      soma += c.quantidade;
      original += movimentos[i]!;
      expect(soma).toBe(c.saldo);
      expect(c.saldo).toBe(converterQuantidade(original, f));
    });
    // Linha a linha, a soma fugiria do saldo.
    const ingenua = movimentos.reduce((s, q) => s + converterQuantidade(q, f), 0);
    expect(ingenua).not.toBe(soma);
  });

  it('mantém zerado o que zerou e não troca o sinal do saldo', () => {
    const f = umaUnidadeTem(333);
    const convertidos = converterMovimentos([100_000, -100_000, -50, 50], f);
    expect(convertidos.map((c) => c.saldo)).toEqual([300, 0, 0, 0]);
    expect(converterMovimentos([-100_000], f)[0]!.saldo).toBe(-300);
  });

  it.each([
    // [quantidade em ml, na unidade nova, desvio em centésimos de %, precisa decidir]
    [120_000, 120, 0, false],
    [15_000, 15, 0, false],
    [60_500, 61, 83, false],
    [7_500, 8, 667, true],
    [2_500, 3, 2_000, true],
    [400, 0, -10_000, true],
  ])('receita de %i mili-ml com 1 un = 1000 ml', (original, nova, desvio, decide) => {
    const f = umaUnidadeTem(1000);
    expect(converterQuantidade(original, f)).toBe(nova);
    expect(desvioDaConversao(original, nova, f)).toBe(desvio);
    expect(exigeDecisao(original, nova, f)).toBe(decide);
  });

  it('a tolerância de 1% é exata na fronteira', () => {
    const f: FatorDeTroca = { nova: 1, atual: 1 };
    expect(exigeDecisao(10_000, 10_100, f)).toBe(false);
    expect(exigeDecisao(10_000, 10_101, f)).toBe(true);
    expect(exigeDecisao(10_000, 9_900, f)).toBe(false);
    expect(exigeDecisao(10_000, 9_899, f)).toBe(true);
  });
});
