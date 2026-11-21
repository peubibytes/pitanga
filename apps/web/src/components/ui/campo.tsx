import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { clsx } from 'clsx';
import { lerNumero, paraCampo } from '@pitanga/shared';

const baseEntrada =
  'w-full rounded-campo border bg-white px-3 py-2 text-sm text-tinta-900 placeholder:text-tinta-400 transition-colors ' +
  'focus:border-pitanga-500 focus:outline-none focus:ring-2 focus:ring-pitanga-200 disabled:bg-creme-100 disabled:text-tinta-500';

const classeEntrada = (erro?: boolean, extra?: string) =>
  clsx(baseEntrada, erro ? 'border-pitanga-500' : 'border-creme-300 hover:border-tinta-400', extra);

interface CampoProps {
  rotulo?: string;
  erro?: string;
  dica?: string;
  obrigatorio?: boolean;
  className?: string;
  /** Recebe o id gerado para ligar o rótulo ao controle. */
  children: (ids: { id: string; descricao?: string }) => ReactNode;
}

/** Rótulo + controle + dica/erro, ligados por `id` e `aria-describedby`. */
export function Campo({ rotulo, erro, dica, obrigatorio, className, children }: CampoProps) {
  const id = useId();
  const descricaoId = erro || dica ? `${id}-d` : undefined;
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {rotulo && (
        <label htmlFor={id} className="text-sm font-medium text-tinta-700">
          {rotulo}
          {obrigatorio && (
            <span className="ml-0.5 text-pitanga-600" aria-hidden>
              {' '}
              *
            </span>
          )}
        </label>
      )}
      {children({ id, descricao: descricaoId })}
      {(erro || dica) && (
        <p
          id={descricaoId}
          className={clsx('text-xs', erro ? 'text-pitanga-700' : 'text-tinta-500')}
          role={erro ? 'alert' : undefined}
        >
          {erro ?? dica}
        </p>
      )}
    </div>
  );
}

interface EntradaProps extends InputHTMLAttributes<HTMLInputElement> {
  erro?: boolean;
}
export const Entrada = forwardRef<HTMLInputElement, EntradaProps>(function Entrada(
  { erro, className, ...resto },
  ref,
) {
  return (
    <input
      ref={ref}
      className={classeEntrada(erro, className)}
      aria-invalid={erro || undefined}
      {...resto}
    />
  );
});

interface SelecaoProps extends SelectHTMLAttributes<HTMLSelectElement> {
  erro?: boolean;
}
export const Selecao = forwardRef<HTMLSelectElement, SelecaoProps>(function Selecao(
  { erro, className, children, ...resto },
  ref,
) {
  return (
    <select
      ref={ref}
      className={classeEntrada(erro, clsx('pr-8', className))}
      aria-invalid={erro || undefined}
      {...resto}
    >
      {children}
    </select>
  );
});

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  erro?: boolean;
}
export const AreaDeTexto = forwardRef<HTMLTextAreaElement, AreaProps>(function AreaDeTexto(
  { erro, className, ...resto },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={3}
      className={classeEntrada(erro, className)}
      aria-invalid={erro || undefined}
      {...resto}
    />
  );
});

/* ------------------------------ entradas numéricas ------------------------------ */

interface BaseNumerica {
  id?: string;
  valor: number | null;
  onChange: (valor: number | null) => void;
  erro?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-label'?: string;
}

const selecionar = (e: React.FocusEvent<HTMLInputElement>) => e.target.select();

/**
 * Valor em reais com máscara "caixa registradora": digitar 1, 5, 9, 0 mostra 15,90.
 * O valor interno é sempre em centavos inteiros.
 */
export function CampoMoeda({ valor, onChange, erro, className, ...resto }: BaseNumerica) {
  const texto =
    valor === null
      ? ''
      : new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(valor / 100);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-tinta-500">
        R$
      </span>
      <input
        inputMode="numeric"
        autoComplete="off"
        className={classeEntrada(erro, clsx('numero pl-9 text-right', className))}
        value={texto}
        onFocus={selecionar}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '').slice(0, 12);
          onChange(digitos === '' ? null : parseInt(digitos, 10));
        }}
        placeholder={resto.placeholder ?? '0,00'}
        aria-invalid={erro || undefined}
        {...resto}
      />
    </div>
  );
}

interface NumericoProps extends BaseNumerica {
  /** 1000 = mili-unidades; 100 = centavos/centésimos de %; 1_000_000 = micro-reais. */
  escala: number;
  sufixo?: string;
}

/** Número com vírgula decimal (quantidades, percentuais). Guarda o valor inteiro escalado. */
export function CampoNumero({
  valor,
  onChange,
  escala,
  sufixo,
  erro,
  className,
  ...resto
}: NumericoProps) {
  const [texto, setTexto] = useState(() => paraCampo(valor, escala));
  useEffect(() => {
    const lido = lerNumero(texto);
    const atual = lido === null ? null : Math.round(lido * escala);
    if (atual !== valor) setTexto(paraCampo(valor, escala));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, escala]);
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        autoComplete="off"
        className={classeEntrada(erro, clsx('numero text-right', className))}
        style={
          sufixo ? { paddingRight: `${Math.max(2.5, sufixo.length * 0.6 + 1.5)}rem` } : undefined
        }
        value={texto}
        onFocus={selecionar}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d,.-]/g, '');
          setTexto(t);
          const n = lerNumero(t);
          onChange(n === null ? null : Math.round(n * escala));
        }}
        onBlur={() => setTexto(paraCampo(valor, escala))}
        placeholder={resto.placeholder ?? '0'}
        aria-invalid={erro || undefined}
        {...resto}
      />
      {sufixo && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-tinta-500">
          {sufixo}
        </span>
      )}
    </div>
  );
}

interface DataProps {
  id?: string;
  valor: string;
  onChange: (iso: string) => void;
  erro?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  'aria-describedby'?: string;
}

/** Calendário nativo do navegador (em português, digitação DD/MM/AAAA); o valor é ISO AAAA-MM-DD. */
export function CampoData({ valor, onChange, erro, className, ...resto }: DataProps) {
  return (
    <input
      type="date"
      lang="pt-BR"
      className={classeEntrada(erro, className)}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={erro || undefined}
      {...resto}
    />
  );
}
