/**
 * Dinheiro em inteiros — ADR 0003.
 *
 *  - totais monetários: centavos
 *  - valores unitários: micro-reais (R$ × 10⁻⁶)
 *  - percentuais: centésimos de ponto percentual (12,5% → 1250)
 *
 * O cálculo é sempre em inteiros; o arredondamento (meio para longe do zero,
 * "meio para cima" para positivos) só acontece em `mulDiv`, na fronteira.
 */

/** 1 centavo = 10.000 micro-reais. */
export const MICRO_POR_CENTAVO = 10_000;
/** Fator entre (mili-unidades × micro-reais) e centavos: 1000 × 10.000. */
export const FATOR_QTD_CUSTO = 10_000_000;
/** 100% em centésimos de ponto percentual. */
export const CEM_POR_CENTO = 10_000;

/** Calcula round(a × b ÷ d) sem perder precisão (usa BigInt internamente). */
export function mulDiv(a: number, b: number, d: number): number {
  if (d === 0) throw new RangeError('Divisão por zero');
  const n = BigInt(Math.trunc(a)) * BigInt(Math.trunc(b));
  const den = BigInt(Math.trunc(d));
  const negativo = n < 0n !== den < 0n;
  const an = n < 0n ? -n : n;
  const ad = den < 0n ? -den : den;
  const q = (an * 2n + ad) / (2n * ad);
  return Number(negativo ? -q : q);
}

export const centavosParaMicro = (centavos: number): number => centavos * MICRO_POR_CENTAVO;
export const microParaCentavos = (micro: number): number => mulDiv(micro, 1, MICRO_POR_CENTAVO);

/** Valor (centavos) de `qtdMili` mili-unidades ao custo de `custoMicro` micro-reais por unidade. */
export const valorEmCentavos = (qtdMili: number, custoMicro: number): number =>
  mulDiv(qtdMili, custoMicro, FATOR_QTD_CUSTO);

/** Custo unitário (micro-reais por unidade) de um total em centavos para `qtdMili` mili-unidades. */
export const custoUnitarioMicro = (totalCentavos: number, qtdMili: number): number =>
  mulDiv(totalCentavos, FATOR_QTD_CUSTO, qtdMili);

/** Aplica um percentual (centésimos de ponto percentual) a um valor inteiro. */
export const aplicarPercentual = (valor: number, centesimos: number): number =>
  mulDiv(valor, centesimos, CEM_POR_CENTO);

/**
 * Reparte `total` proporcionalmente a `pesos`. A diferença de arredondamento vai para a
 * maior parcela (primeira em caso de empate), de modo que a soma das partes seja exatamente o total.
 */
export function ratear(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const soma = pesos.reduce((s, p) => s + p, 0);
  const efetivos = soma > 0 ? pesos : pesos.map(() => 1);
  const somaEfetiva = efetivos.reduce((s, p) => s + p, 0);
  const partes = efetivos.map((p) => mulDiv(total, p, somaEfetiva));
  const diferenca = total - partes.reduce((s, p) => s + p, 0);
  if (diferenca !== 0) {
    let idx = 0;
    efetivos.forEach((p, i) => {
      if (p > (efetivos[idx] ?? 0)) idx = i;
    });
    partes[idx] = (partes[idx] ?? 0) + diferenca;
  }
  return partes;
}

export const somar = (valores: number[]): number => valores.reduce((s, v) => s + v, 0);
