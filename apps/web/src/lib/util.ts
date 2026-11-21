import { useEffect, useState } from 'react';
import { dataISO, primeiroDiaDoMes, ultimoDiaDoMes } from '@pitanga/shared';

/** Atrasa um valor (busca digitada) para não consultar a API a cada tecla. */
export function useDebounce<T>(valor: T, ms = 300): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

export type Periodo = {
  de: string;
  ate: string;
};

export function periodoDoMes(iso: string = dataISO(new Date())): Periodo {
  return { de: primeiroDiaDoMes(iso), ate: ultimoDiaDoMes(iso) };
}

export const classeValor = (centavos: number): string =>
  centavos < 0 ? 'text-pitanga-700' : 'text-tinta-900';

/** Texto de plural simples: 1 item / 2 itens. */
export const plural = (n: number, singular: string, pluralTexto = `${singular}s`): string =>
  `${n} ${n === 1 ? singular : pluralTexto}`;
