/**
 * Troca da unidade de controle de um material (ADR 0008). O dinheiro não muda: só a forma de contar.
 * O fator são dois inteiros em mili-unidades — `nova` unidades novas equivalem a `atual` unidades
 * atuais (1 un = 1000 ml, de ml para un → nova 1000, atual 1.000.000) — para nunca usar decimais.
 */
import { mulDiv } from '@pitanga/shared';

export interface FatorDeTroca {
  nova: number;
  atual: number;
}

export const converterQuantidade = (quantidade: number, f: FatorDeTroca): number =>
  mulDiv(quantidade, f.nova, f.atual);

/** Custo unitário anda ao contrário da quantidade: o produto dos dois é o mesmo valor. */
export const converterCusto = (custo: number, f: FatorDeTroca): number =>
  mulDiv(custo, f.atual, f.nova);

export interface MovimentoConvertido {
  quantidade: number;
  saldo: number;
}

/**
 * Converte os movimentos na ordem do razão. Arredondar linha a linha faria a soma fugir do saldo
 * (invariante 1); por isso converte-se o saldo acumulado, e cada movimento é a diferença entre saldos.
 */
export function converterMovimentos(quantidades: number[], f: FatorDeTroca): MovimentoConvertido[] {
  let acumulado = 0;
  let saldoAnterior = 0;
  return quantidades.map((q) => {
    acumulado += q;
    const saldo = converterQuantidade(acumulado, f);
    const quantidade = saldo - saldoAnterior;
    saldoAnterior = saldo;
    return { quantidade, saldo };
  });
}

/** Diferença de uma quantidade já na unidade nova em relação à original, em centésimos de %. */
export function desvioDaConversao(original: number, nova: number, f: FatorDeTroca): number {
  if (original <= 0) return 0;
  const exata = BigInt(original) * BigInt(f.nova);
  const obtida = BigInt(nova) * BigInt(f.atual);
  return arredondar((obtida - exata) * 10_000n, exata);
}

function arredondar(n: bigint, d: bigint): number {
  const negativo = n < 0n;
  const a = negativo ? -n : n;
  const q = (a * 2n + d) / (2n * d);
  return Number(negativo ? -q : q);
}

/** Até 1% a receita passa direto; acima disso (ou se zerar) a usuária decide. */
export const TOLERANCIA_RECEITA = 100;

/** A conversão da receita precisa ser aceita ou corrigida à mão? Comparação exata, sem arredondar. */
export function exigeDecisao(original: number, nova: number, f: FatorDeTroca): boolean {
  if (nova <= 0) return true;
  const exata = BigInt(original) * BigInt(f.nova);
  const obtida = BigInt(nova) * BigInt(f.atual);
  const diferenca = obtida > exata ? obtida - exata : exata - obtida;
  return diferenca * 10_000n > exata * BigInt(TOLERANCIA_RECEITA);
}
