import { CEM_POR_CENTO, mulDiv, type ModoPreco } from '@pitanga/shared';
import { ErroDeCalculo } from '../erros';

/**
 * Formação do preço (seção 6.4).
 *   C = custo base · F = taxas fixas · p = taxas percentuais sobre o preço
 *   lucro(P) = P × (1 − p) − (C + F)
 * Tudo em inteiros: centavos e centésimos de ponto percentual (10000 = 100%).
 */
export interface EntradaPreco {
  custoBase: number;
  taxasFixas?: number;
  taxasPercentuais?: number;
  modo: ModoPreco;
  /** Centavos (lucro em valor) ou centésimos de ponto percentual. */
  parametro: number;
}

export function calcularPreco(e: EntradaPreco): number {
  const base = e.custoBase + (e.taxasFixas ?? 0);
  const p = e.taxasPercentuais ?? 0;
  const livre = CEM_POR_CENTO - p;
  if (livre <= 0) {
    throw new ErroDeCalculo('As taxas somam 100% ou mais do preço; não há preço que as cubra.');
  }
  switch (e.modo) {
    case 'lucro_valor':
      return mulDiv(base + e.parametro, CEM_POR_CENTO, livre);
    case 'acrescimo_percentual':
      return mulDiv(base, CEM_POR_CENTO + e.parametro, livre);
    case 'margem_percentual': {
      const denominador = livre - e.parametro;
      if (denominador <= 0) {
        throw new ErroDeCalculo(
          'A margem desejada mais as taxas passam de 100% do preço. Reduza a margem.',
        );
      }
      return mulDiv(base, CEM_POR_CENTO, denominador);
    }
  }
}

export interface AnalisePreco {
  /** Valor das taxas percentuais sobre o preço (centavos). */
  taxasSobrePreco: number;
  lucroPrevisto: number;
  /** Lucro ÷ preço, em centésimos de ponto percentual. */
  margemEfetiva: number;
  prejuizo: boolean;
  /** Menor preço que cobre custo e taxas, sem lucro. */
  precoDeEquilibrio: number;
}

export function analisarPreco(e: {
  custoBase: number;
  taxasFixas?: number;
  taxasPercentuais?: number;
  precoFinal: number;
}): AnalisePreco {
  const base = e.custoBase + (e.taxasFixas ?? 0);
  const p = e.taxasPercentuais ?? 0;
  const liquido = mulDiv(e.precoFinal, CEM_POR_CENTO - p, CEM_POR_CENTO);
  const lucroPrevisto = liquido - base;
  const livre = CEM_POR_CENTO - p;
  return {
    taxasSobrePreco: e.precoFinal - liquido,
    lucroPrevisto,
    margemEfetiva: e.precoFinal > 0 ? mulDiv(lucroPrevisto, CEM_POR_CENTO, e.precoFinal) : 0,
    prejuizo: lucroPrevisto < 0,
    precoDeEquilibrio: livre > 0 ? mulDiv(base, CEM_POR_CENTO, livre) : 0,
  };
}

export interface TaxaParaCalculo {
  tipo: 'percentual' | 'fixo';
  valor: number;
  aplicaEm: 'preco' | 'custo';
}

/**
 * Consolida as taxas cadastradas em F (fixas) e p (percentuais sobre o preço):
 * fixa → F; percentual sobre o preço → p; percentual sobre o custo → vira valor fixo.
 */
export function consolidarTaxas(
  taxas: TaxaParaCalculo[],
  custoBase: number,
): { taxasFixas: number; taxasPercentuais: number } {
  let taxasFixas = 0;
  let taxasPercentuais = 0;
  for (const t of taxas) {
    if (t.tipo === 'fixo') taxasFixas += t.valor;
    else if (t.aplicaEm === 'preco') taxasPercentuais += t.valor;
    else taxasFixas += mulDiv(custoBase, t.valor, CEM_POR_CENTO);
  }
  return { taxasFixas, taxasPercentuais };
}
