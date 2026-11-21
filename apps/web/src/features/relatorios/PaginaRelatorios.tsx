import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import {
  formatarData,
  formatarDataHora,
  formatarMicro,
  formatarMoeda,
  formatarPercentual,
  formatarQuantidade,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorPeriodo, intervaloPredefinido } from '../../components/SeletorPeriodo';
import { Botao, Cartao, EstadoVazio, Esqueleto, ErroDeCarregamento } from '../../components/ui';
import { urlDoRelatorio } from '../../lib/api';
import { useDados } from '../../lib/query';
import type { Periodo } from '../../lib/util';

type Valor = string | number | null;
interface Coluna {
  chave: string;
  rotulo: string;
  tipo: 'texto' | 'moeda' | 'micro' | 'quantidade' | 'data' | 'datahora' | 'inteiro' | 'percentual';
}
interface Relatorio {
  nome: string;
  titulo: string;
  periodo: { de: string | null; ate: string | null };
  colunas: Coluna[];
  linhas: Record<string, Valor>[];
  totais: Record<string, number>;
}

function formatar(v: Valor | undefined, tipo: Coluna['tipo']): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') {
    if (tipo === 'moeda') return formatarMoeda(v);
    if (tipo === 'micro') return formatarMicro(v);
    if (tipo === 'quantidade') return formatarQuantidade(v);
    if (tipo === 'percentual') return formatarPercentual(v);
    return String(v);
  }
  if (tipo === 'data') return formatarData(v);
  if (tipo === 'datahora') return formatarDataHora(v);
  return v;
}

const SEM_PERIODO = new Set(['estoque-materiais', 'catalogo', 'clientes']);

export default function PaginaRelatorios() {
  const lista = useDados<{ nome: string; titulo: string }[]>(['relatorios'], '/relatorios');
  const [nome, setNome] = useState('vendas');
  const [periodo, setPeriodo] = useState<Periodo>(intervaloPredefinido('mes'));
  const usaPeriodo = !SEM_PERIODO.has(nome);
  const params = usaPeriodo ? periodo : {};
  const rel = useDados<Relatorio>(['relatorio', nome, params], `/relatorios/${nome}`, params);
  const r = rel.data;

  return (
    <>
      <PaginaCabecalho
        titulo="Relatórios"
        subtitulo="Escolha um relatório, veja na tela, imprima ou baixe em CSV (abre direto no Excel em português)."
        acoes={
          <>
            <a href={urlDoRelatorio(nome, params)} download>
              <Botao icone={<Download className="h-4 w-4" />}>Baixar CSV</Botao>
            </a>
            <Botao icone={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Imprimir
            </Botao>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Relatórios" className="nao-imprimir">
          <ul className="space-y-1">
            {lista.data?.map((x) => (
              <li key={x.nome}>
                <button
                  onClick={() => setNome(x.nome)}
                  aria-current={nome === x.nome ? 'page' : undefined}
                  className={`w-full rounded-campo px-3 py-2.5 text-left text-sm font-medium transition ${nome === x.nome ? 'bg-pitanga-600 text-white' : 'text-tinta-700 hover:bg-creme-200'}`}
                >
                  {x.titulo}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-4">
          {usaPeriodo && <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} incluirTudo />}
          <Cartao titulo={r?.titulo ?? 'Relatório'} semPadding>
            <div className="so-impressao px-5 pb-2 text-sm">
              Flor de Pitanga
              {usaPeriodo && r?.periodo.de
                ? ` — ${formatarData(r.periodo.de)} a ${formatarData(r.periodo.ate)}`
                : ''}
            </div>
            {rel.isLoading ? (
              <div className="p-5">
                <Esqueleto linhas={6} />
              </div>
            ) : rel.isError ? (
              <ErroDeCarregamento erro={rel.error} aoTentar={() => void rel.refetch()} />
            ) : r && r.linhas.length === 0 ? (
              <EstadoVazio
                titulo="Nada neste período"
                descricao="Troque o período para ver outros dados."
              />
            ) : (
              r && (
                <div className="overflow-x-auto p-2">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-creme-300 text-xs uppercase tracking-wide text-tinta-500">
                        {r.colunas.map((c) => (
                          <th
                            key={c.chave}
                            scope="col"
                            className={`px-3 py-2.5 font-semibold ${['moeda', 'micro', 'quantidade', 'inteiro', 'percentual'].includes(c.tipo) ? 'text-right' : 'text-left'}`}
                          >
                            {c.rotulo}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.linhas.map((l, i) => (
                        <tr key={i} className="border-b border-creme-200 last:border-0">
                          {r.colunas.map((c) => (
                            <td
                              key={c.chave}
                              className={`px-3 py-2 ${['moeda', 'micro', 'quantidade', 'inteiro', 'percentual'].includes(c.tipo) ? 'numero text-right' : ''}`}
                            >
                              {formatar(l[c.chave], c.tipo)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {Object.keys(r.totais).length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-creme-300 font-semibold">
                          {r.colunas.map((c, i) => (
                            <td
                              key={c.chave}
                              className={`px-3 py-2.5 ${c.chave in r.totais ? 'numero text-right' : ''}`}
                            >
                              {i === 0
                                ? 'Total'
                                : c.chave in r.totais
                                  ? formatar(r.totais[c.chave]!, c.tipo)
                                  : ''}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
