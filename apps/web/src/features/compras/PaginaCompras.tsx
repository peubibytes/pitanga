import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ROTULO_FORMA_PAGAMENTO, formatarData, formatarMoeda, type Compra } from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorFornecedor } from '../../components/selecionadores';
import {
  Botao,
  Campo,
  CampoData,
  Cartao,
  Chip,
  EstadoVazio,
  PaginacaoControles,
  Tabela,
} from '../../components/ui';
import { useLista } from '../../lib/query';
import { periodoDoMes } from '../../lib/util';

export default function PaginaCompras() {
  const [periodo, setPeriodo] = useState(periodoDoMes());
  const [fornecedor, setFornecedor] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const navegar = useNavigate();
  const { data, isLoading } = useLista<Compra>('compras', '/compras', {
    ...periodo,
    fornecedor,
    pagina,
    porPagina: 25,
  });
  const totalPagina = (data?.itens ?? [])
    .filter((c) => c.status === 'registrada')
    .reduce((s, c) => s + c.total, 0);

  return (
    <>
      <PaginaCabecalho
        titulo="Compras"
        subtitulo="Compras de materiais. Cada compra atualiza o estoque e o custo médio."
        acoes={
          <Botao
            variante="primario"
            icone={<Plus className="h-4 w-4" />}
            onClick={() => navegar('/compras/nova')}
          >
            Registrar compra
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
          <Campo rotulo="Fornecedor" className="min-w-[14rem]">
            {({ id }) => (
              <SeletorFornecedor
                id={id}
                valor={fornecedor}
                onChange={(v) => {
                  setFornecedor(v);
                  setPagina(1);
                }}
                placeholder="Todos"
              />
            )}
          </Campo>
        </div>
        <div className="p-2">
          <Tabela<Compra>
            legenda="Compras"
            linhas={data?.itens}
            carregando={isLoading}
            chave={(c) => c.id}
            aoClicar={(c) => navegar(`/compras/${c.id}`)}
            vazio={
              <EstadoVazio
                titulo="Nenhuma compra no período"
                descricao="Ajuste as datas ou registre uma nova compra."
                acao={
                  <Botao variante="primario" onClick={() => navegar('/compras/nova')}>
                    Registrar compra
                  </Botao>
                }
              />
            }
            colunas={[
              { titulo: 'Data', celula: (c) => formatarData(c.data) },
              { titulo: 'Compra', celula: (c) => <span className="font-medium">#{c.id}</span> },
              {
                titulo: 'Fornecedor',
                celula: (c) => c.fornecedorNome ?? <span className="text-tinta-400">—</span>,
              },
              {
                titulo: 'Pagamento',
                ocultarEmPequeno: true,
                celula: (c) => ROTULO_FORMA_PAGAMENTO[c.formaPagamento] ?? c.formaPagamento,
              },
              {
                titulo: 'Itens',
                alinhar: 'direita',
                ocultarEmPequeno: true,
                celula: (c) => <span className="numero">{formatarMoeda(c.totalItens)}</span>,
              },
              {
                titulo: 'Despesas',
                alinhar: 'direita',
                ocultarEmPequeno: true,
                celula: (c) => <span className="numero">{formatarMoeda(c.totalDespesas)}</span>,
              },
              {
                titulo: 'Total',
                alinhar: 'direita',
                celula: (c) => (
                  <span
                    className={`numero font-semibold ${c.status === 'cancelada' ? 'text-tinta-400 line-through' : ''}`}
                  >
                    {formatarMoeda(c.total)}
                  </span>
                ),
              },
              {
                titulo: '',
                alinhar: 'direita',
                celula: (c) => (c.status === 'cancelada' ? <Chip>Cancelada</Chip> : null),
              },
            ]}
            rodape={
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-2.5 text-right text-xs uppercase tracking-wide text-tinta-500"
                >
                  Total desta página (sem canceladas)
                </td>
                <td className="numero px-3 py-2.5 text-right">{formatarMoeda(totalPagina)}</td>
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
