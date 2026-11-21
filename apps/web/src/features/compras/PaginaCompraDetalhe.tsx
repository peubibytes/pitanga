import { Ban } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_RATEIO_COMPRA,
  formatarData,
  formatarMicro,
  formatarMoeda,
  formatarQuantidade,
  type Compra,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import {
  Alerta,
  AreaDeTexto,
  Botao,
  Cartao,
  Chip,
  Confirmar,
  Dado,
  ErroDeCarregamento,
  Esqueleto,
  Tabela,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useItem, useMutacao } from '../../lib/query';

export default function PaginaCompraDetalhe() {
  const id = Number(useParams().id);
  const compra = useItem<Compra>('compra', `/compras/${id}`, id);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const cancelar = useMutacao(
    () => api.post<Compra>(`/compras/${id}/cancelar`, { motivo: motivo || null }),
    {
      sucesso: 'Compra cancelada. O estoque e o caixa foram estornados.',
      aoConcluir: () => setCancelando(false),
    },
  );

  if (compra.isLoading) return <Esqueleto linhas={4} />;
  if (compra.isError)
    return <ErroDeCarregamento erro={compra.error} aoTentar={() => void compra.refetch()} />;
  const c = compra.data!;
  const cancelada = c.status === 'cancelada';

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: '/compras', rotulo: 'Compras' }}
        titulo={
          <>
            Compra #{c.id} {cancelada && <Chip className="ml-2 align-middle">Cancelada</Chip>}
          </>
        }
        subtitulo={`${formatarData(c.data)} · ${c.fornecedorNome ?? 'sem fornecedor informado'} · ${ROTULO_FORMA_PAGAMENTO[c.formaPagamento] ?? c.formaPagamento}`}
        acoes={
          !cancelada && (
            <Botao
              variante="perigo"
              icone={<Ban className="h-4 w-4" />}
              onClick={() => setCancelando(true)}
            >
              Cancelar compra
            </Botao>
          )
        }
      />
      {cancelada && (
        <div className="mb-4">
          <Alerta tom="neutro">
            Esta compra foi cancelada: o material saiu do estoque e o pagamento foi estornado no
            caixa.
          </Alerta>
        </div>
      )}
      <div className="space-y-6">
        <Cartao titulo="Itens" semPadding>
          <div className="p-2">
            <Tabela
              legenda="Itens da compra"
              linhas={c.itens}
              chave={(i) => i.id}
              colunas={[
                {
                  titulo: 'Material',
                  celula: (i) => (
                    <Link
                      className="font-medium text-pitanga-700 hover:underline"
                      to={`/materiais/${i.materialId}`}
                    >
                      {i.materialNome}
                    </Link>
                  ),
                },
                {
                  titulo: 'Comprado',
                  alinhar: 'direita',
                  celula: (i) => (
                    <span className="numero">
                      {formatarQuantidade(i.quantidadeInformada, i.unidadeInformada)}
                    </span>
                  ),
                },
                {
                  titulo: 'No estoque',
                  alinhar: 'direita',
                  ocultarEmPequeno: true,
                  celula: (i) => (
                    <span className="numero">
                      {formatarQuantidade(i.quantidadeBase, i.unidadeBase)}
                    </span>
                  ),
                },
                {
                  titulo: 'Valor pago',
                  alinhar: 'direita',
                  celula: (i) => <span className="numero">{formatarMoeda(i.valorTotal)}</span>,
                },
                {
                  titulo: 'Despesas rateadas',
                  alinhar: 'direita',
                  ocultarEmPequeno: true,
                  celula: (i) => <span className="numero">{formatarMoeda(i.despesaRateada)}</span>,
                },
                {
                  titulo: 'Custo unitário final',
                  alinhar: 'direita',
                  celula: (i) => (
                    <span className="numero font-medium">
                      {formatarMicro(i.custoUnitarioFinal)}/{i.unidadeBase}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </Cartao>
        {(c.despesas?.length ?? 0) > 0 && (
          <Cartao titulo="Despesas" semPadding>
            <div className="p-2">
              <Tabela
                legenda="Despesas da compra"
                linhas={c.despesas}
                chave={(d) => d.id}
                colunas={[
                  { titulo: 'Tipo', celula: (d) => <span className="capitalize">{d.tipo}</span> },
                  { titulo: 'Descrição', celula: (d) => d.descricao ?? '—' },
                  { titulo: 'Tratamento', celula: (d) => ROTULO_RATEIO_COMPRA[d.rateio] },
                  {
                    titulo: 'Valor',
                    alinhar: 'direita',
                    celula: (d) => <span className="numero">{formatarMoeda(d.valor)}</span>,
                  },
                ]}
              />
            </div>
          </Cartao>
        )}
        <Cartao>
          <dl className="grid gap-5 sm:grid-cols-4">
            <Dado rotulo="Itens">
              <span className="numero">{formatarMoeda(c.totalItens)}</span>
            </Dado>
            <Dado rotulo="Despesas">
              <span className="numero">{formatarMoeda(c.totalDespesas)}</span>
            </Dado>
            <Dado rotulo="Total pago">
              <span className="numero font-titulo text-xl text-pitanga-700">
                {formatarMoeda(c.total)}
              </span>
            </Dado>
            <Dado rotulo="Observação">{c.observacao ?? '—'}</Dado>
          </dl>
        </Cartao>
      </div>
      <Confirmar
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        aoConfirmar={() => cancelar.mutate(undefined)}
        carregando={cancelar.isPending}
        titulo="Cancelar esta compra?"
        rotuloConfirmar="Cancelar compra"
        mensagem={
          <div className="space-y-3">
            <p>
              O material volta ao fornecedor (sai do estoque) e o pagamento é estornado. Nada é
              apagado: o histórico fica registrado.
            </p>
            <AreaDeTexto
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-label="Motivo do cancelamento"
            />
          </div>
        }
      />
    </>
  );
}
