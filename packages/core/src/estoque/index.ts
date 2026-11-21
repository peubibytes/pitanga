import { FATOR_QTD_CUSTO, custoUnitarioMicro, mulDiv } from '@pitanga/shared';

/** Estado de estoque de um item: quantidade em mili-unidades e custo médio em micro-reais/unidade. */
export interface EstadoEstoque {
  estoque: number;
  custoMedio: number;
}

function divisaoArredondada(numerador: bigint, denominador: bigint): number {
  if (denominador === 0n) throw new RangeError('Divisão por zero');
  const negativo = numerador < 0n !== denominador < 0n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = denominador < 0n ? -denominador : denominador;
  const q = (n * 2n + d) / (2n * d);
  return Number(negativo ? -q : q);
}

/**
 * Custo médio móvel após uma entrada (seção 6.1):
 *   novo = (estoque × custo_médio + valor_da_entrada) ÷ (estoque + quantidade)
 * `valorTotalCentavos` já inclui a despesa rateada. Com estoque zerado ou negativo, o custo
 * médio passa a ser o custo unitário da própria entrada.
 */
export function custoMedioAposEntrada(
  estado: EstadoEstoque,
  quantidade: number,
  valorTotalCentavos: number,
): number {
  if (quantidade <= 0) return estado.custoMedio;
  if (estado.estoque <= 0) return custoUnitarioMicro(valorTotalCentavos, quantidade);
  const numerador =
    BigInt(estado.estoque) * BigInt(estado.custoMedio) +
    BigInt(valorTotalCentavos) * BigInt(FATOR_QTD_CUSTO);
  return divisaoArredondada(numerador, BigInt(estado.estoque + quantidade));
}

/** Saída ao custo médio vigente: o custo médio não muda; devolve o valor da baixa em centavos. */
export function valorDaBaixa(estado: EstadoEstoque, quantidade: number): number {
  return mulDiv(quantidade, estado.custoMedio, FATOR_QTD_CUSTO);
}

/**
 * Desfaz uma entrada (estorno de compra ou de produção) pelo valor original. Se sobrar estoque,
 * recompõe o custo médio sem o lote desfeito; se zerar, mantém o custo médio anterior.
 */
export function custoMedioAposEstornoDeEntrada(
  estado: EstadoEstoque,
  quantidade: number,
  valorOriginalCentavos: number,
): number {
  const restante = estado.estoque - quantidade;
  if (restante <= 0) return estado.custoMedio;
  const numerador =
    BigInt(estado.estoque) * BigInt(estado.custoMedio) -
    BigInt(valorOriginalCentavos) * BigInt(FATOR_QTD_CUSTO);
  if (numerador <= 0n) return 0;
  return divisaoArredondada(numerador, BigInt(restante));
}

export interface Necessidade {
  materialId: number;
  nome: string;
  unidade: string;
  necessario: number;
  disponivel: number;
}
export interface Falta extends Necessidade {
  falta: number;
}

/** Quanto falta de cada material (lista vazia = tudo disponível). */
export function verificarDisponibilidade(necessidades: Necessidade[]): Falta[] {
  return necessidades
    .filter((n) => n.necessario > n.disponivel)
    .map((n) => ({ ...n, falta: n.necessario - n.disponivel }));
}

/** Necessidade de material para um lote: quantidade da ficha × lote ÷ rendimento. */
export function necessidadeDoLote(
  quantidadeNaFicha: number,
  quantidadeLote: number,
  rendimento: number,
): number {
  return mulDiv(quantidadeNaFicha, quantidadeLote, rendimento);
}
