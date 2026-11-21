import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_STATUS_VENDA,
  STATUS_VENDA,
  formatarData,
  formatarMoeda,
  type StatusVenda,
  type Venda,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import {
  Botao,
  Campo,
  CampoData,
  Cartao,
  Chip,
  Entrada,
  EstadoVazio,
  PaginacaoControles,
  Selecao,
  Tabela,
} from '../../components/ui';
import { useLista } from '../../lib/query';
import { periodoDoMes, useDebounce } from '../../lib/util';

export const tomDaVenda = (s: StatusVenda) =>
  s === 'concluida' ? 'folha' : s === 'pendente' ? 'ambar' : 'neutro';

export default function PaginaVendas() {
  const [periodo, setPeriodo] = useState(periodoDoMes());
  const [status, setStatus] = useState<StatusVenda | ''>('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const termo = useDebounce(busca);
  const navegar = useNavigate();
  const { data, isLoading } = useLista<Venda>('vendas', '/vendas', {
    ...periodo,
    status: status || undefined,
    busca: termo,
    pagina,
    porPagina: 25,
  });
  const validas = (data?.itens ?? []).filter((v) => v.status !== 'cancelada');
  const total = validas.reduce((s, v) => s + v.total, 0);
  const lucro = validas.reduce((s, v) => s + v.lucroEstimado, 0);

  return (
    <>
      <PaginaCabecalho
        titulo="Vendas"
        subtitulo="Cada venda baixa o estoque, registra o custo real e entra no financeiro."
        acoes={
          <Botao
            variante="primario"
            icone={<Plus className="h-4 w-4" />}
            onClick={() => navegar('/vendas/nova')}
          >
            Nova venda
          </Botao>
        }
      />
      <Cartao semPadding>
        <div className="flex flex-wrap items-end gap-3 border-b border-creme-200 p-4">
          <Campo rotulo="De">
            {({ id }) => (
              <CampoData
                id={id}
                valor={periodo.de}
                onChange={(de) => {
                  setPeriodo({ ...periodo, de });
                  setPagina(1);
                }}
              />
            )}
          </Campo>
          <Campo rotulo="Até">
            {({ id }) => (
              <CampoData
                id={id}
                valor={periodo.ate}
                onChange={(ate) => {
                  setPeriodo({ ...periodo, ate });
                  setPagina(1);
                }}
              />
            )}
          </Campo>
          <Campo rotulo="Situação">
            {({ id }) => (
              <Selecao
                id={id}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as StatusVenda | '');
                  setPagina(1);
                }}
              >
                <option value="">Todas</option>
                {STATUS_VENDA.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_VENDA[s]}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-400" />
            <Entrada
              className="pl-9"
              placeholder="Buscar por cliente"
              aria-label="Buscar vendas"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
            />
          </div>
        </div>
        <div className="p-2">
          <Tabela<Venda>
            legenda="Vendas"
            linhas={data?.itens}
            carregando={isLoading}
            chave={(v) => v.id}
            aoClicar={(v) => navegar(`/vendas/${v.id}`)}
            vazio={
              <EstadoVazio
                titulo="Nenhuma venda encontrada"
                descricao="Ajuste os filtros ou registre uma nova venda."
                acao={
                  <Botao variante="primario" onClick={() => navegar('/vendas/nova')}>
                    Nova venda
                  </Botao>
                }
              />
            }
            colunas={[
              { titulo: 'Data', celula: (v) => formatarData(v.data) },
              { titulo: 'Venda', celula: (v) => <span className="font-medium">#{v.id}</span> },
              {
                titulo: 'Cliente',
                celula: (v) =>
                  v.clienteNome ?? (
                    <span className="text-tinta-400">Consumidor não identificado</span>
                  ),
              },
              {
                titulo: 'Pagamento',
                ocultarEmPequeno: true,
                celula: (v) => ROTULO_FORMA_PAGAMENTO[v.formaPagamento] ?? v.formaPagamento,
              },
              {
                titulo: 'Total',
                alinhar: 'direita',
                celula: (v) => (
                  <span
                    className={`numero font-semibold ${v.status === 'cancelada' ? 'text-tinta-400 line-through' : ''}`}
                  >
                    {formatarMoeda(v.total)}
                  </span>
                ),
              },
              {
                titulo: 'Lucro estimado',
                alinhar: 'direita',
                ocultarEmPequeno: true,
                celula: (v) => (
                  <span className="numero text-tinta-600">
                    {v.status === 'cancelada' ? '—' : formatarMoeda(v.lucroEstimado)}
                  </span>
                ),
              },
              {
                titulo: 'Situação',
                alinhar: 'direita',
                celula: (v) => (
                  <Chip tom={tomDaVenda(v.status)}>
                    {ROTULO_STATUS_VENDA[v.status]}
                    {v.status === 'pendente'
                      ? ` · falta ${formatarMoeda(v.total - v.recebido)}`
                      : ''}
                  </Chip>
                ),
              },
            ]}
            rodape={
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-2.5 text-right text-xs uppercase tracking-wide text-tinta-500"
                >
                  Nesta página (sem canceladas)
                </td>
                <td className="numero px-3 py-2.5 text-right">{formatarMoeda(total)}</td>
                <td className="numero hidden px-3 py-2.5 text-right text-tinta-600 lg:table-cell">
                  {formatarMoeda(lucro)}
                </td>
                <td />
              </tr>
            }
          />
          <PaginacaoControles paginacao={data?.paginacao} aoMudar={setPagina} />
        </div>
      </Cartao>
    </>
  );
}
