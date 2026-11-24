import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Paginacao } from '@pitanga/shared';
import { Botao } from './botao';
import { EstadoVazio, Esqueleto } from './estados';

export interface Coluna<T> {
  titulo: ReactNode;
  celula: (linha: T) => ReactNode;
  alinhar?: 'esquerda' | 'direita' | 'centro';
  largura?: string;
  /** Esconde a coluna em telas estreitas. */
  ocultarEmPequeno?: boolean;
}

interface Props<T> {
  colunas: Coluna<T>[];
  linhas: T[] | undefined;
  chave: (linha: T) => string | number;
  carregando?: boolean;
  vazio?: ReactNode;
  aoClicar?: (linha: T) => void;
  rodape?: ReactNode;
  legenda?: string;
  classeLinha?: (linha: T) => string | undefined;
}

const alinhamento = {
  esquerda: 'text-left',
  direita: 'text-right',
  centro: 'text-center',
} as const;

export function Tabela<T>({
  colunas,
  linhas,
  chave,
  carregando,
  vazio,
  aoClicar,
  rodape,
  legenda,
  classeLinha,
}: Props<T>) {
  if (carregando && !linhas) return <Esqueleto linhas={6} />;
  if (linhas && linhas.length === 0)
    return <>{vazio ?? <EstadoVazio titulo="Nada por aqui ainda" />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {legenda && <caption className="sr-only">{legenda}</caption>}
        <thead>
          <tr className="border-b border-creme-300 text-xs uppercase tracking-wide text-tinta-500">
            {colunas.map((c, i) => (
              <th
                key={i}
                scope="col"
                style={c.largura ? { width: c.largura } : undefined}
                className={clsx(
                  'px-3 py-2.5 font-semibold',
                  alinhamento[c.alinhar ?? 'esquerda'],
                  c.ocultarEmPequeno && 'hidden lg:table-cell',
                )}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas?.map((l) => (
            <tr
              key={chave(l)}
              onClick={aoClicar ? () => aoClicar(l) : undefined}
              onKeyDown={
                // Só quando o foco está na própria linha: Enter num botão da linha é do botão.
                aoClicar
                  ? (e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) aoClicar(l);
                    }
                  : undefined
              }
              tabIndex={aoClicar ? 0 : undefined}
              className={clsx(
                'border-b border-creme-200 last:border-0',
                aoClicar && 'cursor-pointer hover:bg-creme-50 focus-visible:bg-creme-50',
                classeLinha?.(l),
              )}
            >
              {colunas.map((c, i) => (
                <td
                  key={i}
                  className={clsx(
                    'px-3 py-3 align-middle',
                    alinhamento[c.alinhar ?? 'esquerda'],
                    c.ocultarEmPequeno && 'hidden lg:table-cell',
                  )}
                >
                  {c.celula(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape && <tfoot className="border-t-2 border-creme-300 font-semibold">{rodape}</tfoot>}
      </table>
    </div>
  );
}

export function PaginacaoControles({
  paginacao,
  aoMudar,
}: {
  paginacao?: Paginacao;
  aoMudar: (pagina: number) => void;
}) {
  if (!paginacao || paginacao.total <= paginacao.porPagina) return null;
  const inicio = (paginacao.pagina - 1) * paginacao.porPagina + 1;
  const fim = Math.min(paginacao.pagina * paginacao.porPagina, paginacao.total);
  const ultima = Math.ceil(paginacao.total / paginacao.porPagina);
  return (
    <nav
      aria-label="Paginação"
      className="nao-imprimir mt-3 flex items-center justify-between text-sm text-tinta-600"
    >
      <span className="numero">
        {inicio}–{fim} de {paginacao.total}
      </span>
      <div className="flex items-center gap-1">
        <Botao
          tamanho="p"
          variante="fantasma"
          disabled={paginacao.pagina <= 1}
          onClick={() => aoMudar(paginacao.pagina - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Botao>
        <span className="numero px-2">
          {paginacao.pagina} / {ultima}
        </span>
        <Botao
          tamanho="p"
          variante="fantasma"
          disabled={paginacao.pagina >= ultima}
          onClick={() => aoMudar(paginacao.pagina + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </Botao>
      </div>
    </nav>
  );
}
