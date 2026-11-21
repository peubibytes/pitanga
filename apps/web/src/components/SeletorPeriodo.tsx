import { useState } from 'react';
import { clsx } from 'clsx';
import { dataISO, hojeISO, primeiroDiaDoMes, somarDias, ultimoDiaDoMes } from '@pitanga/shared';
import type { Periodo } from '../lib/util';
import { Campo, CampoData } from './ui';

type Predefinido = 'hoje' | 'semana' | 'mes' | 'ano' | 'tudo' | 'livre';

const rotulos: Record<Predefinido, string> = {
  hoje: 'Hoje',
  semana: '7 dias',
  mes: 'Este mês',
  ano: 'Este ano',
  tudo: 'Tudo',
  livre: 'Período',
};

export function intervaloPredefinido(p: Exclude<Predefinido, 'livre'>, hoje = hojeISO()): Periodo {
  switch (p) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    case 'semana':
      return { de: somarDias(hoje, -6), ate: hoje };
    case 'ano':
      return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
    case 'tudo':
      return { de: '2000-01-01', ate: dataISO(new Date(new Date().getFullYear() + 1, 11, 31)) };
    default:
      return { de: primeiroDiaDoMes(hoje), ate: ultimoDiaDoMes(hoje) };
  }
}

interface Props {
  periodo: Periodo;
  aoMudar: (p: Periodo) => void;
  incluirTudo?: boolean;
}

/** Atalhos de dia, semana, mês e ano, ou período personalizado por calendário. */
export function SeletorPeriodo({ periodo, aoMudar, incluirTudo }: Props) {
  const [ativo, setAtivo] = useState<Predefinido>('mes');
  const opcoes = [
    'hoje',
    'semana',
    'mes',
    'ano',
    ...(incluirTudo ? (['tudo'] as const) : []),
    'livre',
  ] as Predefinido[];
  return (
    <div className="nao-imprimir flex flex-wrap items-end gap-3">
      <div
        role="group"
        aria-label="Período"
        className="flex rounded-campo border border-creme-300 bg-white p-0.5"
      >
        {opcoes.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={ativo === o}
            onClick={() => {
              setAtivo(o);
              if (o !== 'livre') aoMudar(intervaloPredefinido(o));
            }}
            className={clsx(
              'rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors',
              ativo === o ? 'bg-pitanga-600 text-white' : 'text-tinta-600 hover:bg-creme-200',
            )}
          >
            {rotulos[o]}
          </button>
        ))}
      </div>
      {ativo === 'livre' && (
        <>
          <Campo rotulo="De">
            {({ id }) => (
              <CampoData
                id={id}
                valor={periodo.de}
                onChange={(de) => aoMudar({ ...periodo, de })}
              />
            )}
          </Campo>
          <Campo rotulo="Até">
            {({ id }) => (
              <CampoData
                id={id}
                valor={periodo.ate}
                onChange={(ate) => aoMudar({ ...periodo, ate })}
              />
            )}
          </Campo>
        </>
      )}
    </div>
  );
}
