import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export function Cartao({
  titulo,
  acao,
  children,
  className,
  semPadding,
}: {
  titulo?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
  semPadding?: boolean;
}) {
  return (
    <section
      className={clsx(
        'cartao rounded-cartao border border-creme-200 bg-white shadow-cartao',
        className,
      )}
    >
      {(titulo || acao) && (
        <header className="flex items-center justify-between gap-3 border-b border-creme-200 px-5 py-3.5">
          {titulo && <h2 className="text-lg">{titulo}</h2>}
          {acao}
        </header>
      )}
      <div className={semPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

type Tom = 'neutro' | 'pitanga' | 'folha' | 'ambar';
const tonsValor: Record<Tom, string> = {
  neutro: 'text-tinta-900',
  pitanga: 'text-pitanga-700',
  folha: 'text-folha-700',
  ambar: 'text-ambar-700',
};

/** Indicador numérico do painel e dos resumos. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
  icone,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  tom?: Tom;
  icone?: ReactNode;
}) {
  return (
    <div className="cartao rounded-cartao border border-creme-200 bg-white p-4 shadow-cartao">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-tinta-500">
        <span>{rotulo}</span>
        {icone}
      </div>
      <p className={clsx('numero mt-1.5 font-titulo text-2xl', tonsValor[tom])}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-tinta-500">{detalhe}</p>}
    </div>
  );
}

const tonsChip: Record<Tom, string> = {
  neutro: 'bg-creme-200 text-tinta-600',
  pitanga: 'bg-pitanga-100 text-pitanga-700',
  folha: 'bg-folha-100 text-folha-700',
  ambar: 'bg-ambar-100 text-ambar-700',
};

export function Chip({
  tom = 'neutro',
  children,
  className,
}: {
  tom?: Tom;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        tonsChip[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Linha "rótulo: valor" para fichas e resumos. */
export function Dado({
  rotulo,
  children,
  className,
}: {
  rotulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-tinta-500">{rotulo}</dt>
      <dd className="mt-0.5 text-sm text-tinta-900">{children}</dd>
    </div>
  );
}
