import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export interface Aba<T extends string> {
  id: T;
  rotulo: ReactNode;
}

/** Abas com semântica de ARIA e navegação por setas. */
export function Abas<T extends string>({
  abas,
  ativa,
  aoMudar,
}: {
  abas: Aba<T>[];
  ativa: T;
  aoMudar: (id: T) => void;
}) {
  return (
    <div role="tablist" className="nao-imprimir mb-4 flex gap-1 border-b border-creme-300">
      {abas.map((a, i) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={a.id === ativa}
          tabIndex={a.id === ativa ? 0 : -1}
          onClick={() => aoMudar(a.id)}
          onKeyDown={(e) => {
            const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (delta) aoMudar(abas[(i + delta + abas.length) % abas.length]!.id);
          }}
          className={clsx(
            '-mb-px rounded-t-campo border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            a.id === ativa
              ? 'border-pitanga-600 text-pitanga-700'
              : 'border-transparent text-tinta-500 hover:text-tinta-700',
          )}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}
