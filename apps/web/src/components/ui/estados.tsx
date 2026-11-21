import { CircleAlert, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Botao } from './botao';
import { mensagemDoErro } from '../../lib/api';

export function EstadoVazio({
  titulo,
  descricao,
  acao,
  icone,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  icone?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 rounded-full bg-creme-200 p-3 text-tinta-500">
        {icone ?? <Inbox className="h-6 w-6" />}
      </div>
      <p className="font-titulo text-lg text-tinta-700">{titulo}</p>
      {descricao && <p className="max-w-md text-sm text-tinta-500">{descricao}</p>}
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}

export function Esqueleto({ linhas = 3, className }: { linhas?: number; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-3', className)} role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="esqueleto h-9" style={{ width: `${100 - (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}

export function ErroDeCarregamento({ erro, aoTentar }: { erro: unknown; aoTentar?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center" role="alert">
      <CircleAlert className="h-8 w-8 text-pitanga-600" />
      <p className="font-titulo text-lg text-tinta-700">Não consegui carregar isto</p>
      <p className="max-w-md text-sm text-tinta-500">{mensagemDoErro(erro)}</p>
      {aoTentar && (
        <Botao className="mt-2" onClick={aoTentar}>
          Tentar de novo
        </Botao>
      )}
    </div>
  );
}

type TomAlerta = 'pitanga' | 'folha' | 'ambar' | 'neutro';
const tonsAlerta: Record<TomAlerta, string> = {
  pitanga: 'border-pitanga-200 bg-pitanga-50 text-pitanga-800',
  folha: 'border-folha-100 bg-folha-50 text-folha-700',
  ambar: 'border-ambar-100 bg-ambar-50 text-ambar-700',
  neutro: 'border-creme-300 bg-creme-50 text-tinta-600',
};

export function Alerta({
  tom = 'neutro',
  titulo,
  children,
  acao,
}: {
  tom?: TomAlerta;
  titulo?: string;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-cartao border px-4 py-3 text-sm',
        tonsAlerta[tom],
      )}
      role={tom === 'pitanga' ? 'alert' : 'status'}
    >
      <div className="flex-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className={titulo ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {acao}
    </div>
  );
}
