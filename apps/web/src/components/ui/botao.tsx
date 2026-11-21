import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

export type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'sucesso';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  tamanho?: 'p' | 'm';
  carregando?: boolean;
  icone?: ReactNode;
}

const variantes: Record<VarianteBotao, string> = {
  primario:
    'bg-pitanga-600 text-white hover:bg-pitanga-700 active:bg-pitanga-800 shadow-sm disabled:bg-pitanga-200',
  secundario:
    'border border-creme-300 bg-white text-tinta-700 hover:bg-creme-50 hover:border-tinta-400 disabled:text-tinta-400',
  fantasma: 'text-tinta-600 hover:bg-creme-200 disabled:text-tinta-400',
  perigo:
    'border border-pitanga-200 bg-pitanga-50 text-pitanga-700 hover:bg-pitanga-100 disabled:opacity-50',
  sucesso: 'bg-folha-600 text-white hover:bg-folha-700 disabled:opacity-50',
};

export const Botao = forwardRef<HTMLButtonElement, Props>(function Botao(
  {
    variante = 'secundario',
    tamanho = 'm',
    carregando,
    icone,
    className,
    children,
    disabled,
    type = 'button',
    ...resto
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-campo font-medium transition-colors disabled:cursor-not-allowed',
        tamanho === 'p' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        variantes[variante],
        className,
      )}
      {...resto}
    >
      {carregando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icone}
      {children}
    </button>
  );
});
