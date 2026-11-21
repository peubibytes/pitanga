/**
 * Quantidades em mili-unidades (× 10⁻³) e conversão de unidades.
 * Estoque de materiais é controlado na unidade base (un, ml, g, m).
 */

export const MILI = 1000;

/** 250 ml → 250000. Aceita decimais ("1,5" já convertido para número). */
export const paraMili = (valor: number): number => Math.round(valor * MILI);
export const deMili = (mili: number): number => mili / MILI;

export interface UnidadeInfo {
  codigo: string;
  nome: string;
  /** Unidade base em que o estoque é controlado. */
  base: string;
  /** Quanto da base cabe em uma desta. `null` = informado a cada compra (ex.: caixa). */
  fator: number | null;
}

export const UNIDADES: readonly UnidadeInfo[] = [
  { codigo: 'un', nome: 'Unidade', base: 'un', fator: 1 },
  { codigo: 'ml', nome: 'Mililitro', base: 'ml', fator: 1 },
  { codigo: 'l', nome: 'Litro', base: 'ml', fator: 1000 },
  { codigo: 'g', nome: 'Grama', base: 'g', fator: 1 },
  { codigo: 'kg', nome: 'Quilograma', base: 'g', fator: 1000 },
  { codigo: 'cx', nome: 'Caixa', base: 'un', fator: null },
  { codigo: 'm', nome: 'Metro', base: 'm', fator: 1 },
];

/** Unidades em que um material pode ter o estoque controlado. */
export const UNIDADES_BASE = ['un', 'ml', 'g', 'm'] as const;
export type UnidadeBase = (typeof UNIDADES_BASE)[number];

export const infoUnidade = (codigo: string): UnidadeInfo | undefined =>
  UNIDADES.find((u) => u.codigo === codigo);

/** Unidades de compra que podem ser convertidas para a unidade base informada. */
export const unidadesCompativeis = (base: string): UnidadeInfo[] =>
  UNIDADES.filter((u) => u.base === base);

/**
 * Fator de conversão unidade informada → unidade base. Devolve `null` quando as unidades são
 * incompatíveis ou quando o fator precisa ser informado (caixa) e não veio.
 */
export function fatorDeConversao(
  unidadeInformada: string,
  unidadeBase: string,
  fatorInformado?: number | null,
): number | null {
  const info = infoUnidade(unidadeInformada);
  if (!info || info.base !== unidadeBase) return null;
  if (fatorInformado && fatorInformado > 0) return fatorInformado;
  return info.fator;
}
