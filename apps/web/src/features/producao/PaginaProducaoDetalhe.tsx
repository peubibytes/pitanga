import { Ban } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  formatarData,
  formatarMicro,
  formatarMoeda,
  formatarQuantidade,
  type Producao,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import {
  Alerta,
  AreaDeTexto,
  Botao,
  Cartao,
  Chip,
  Confirmar,
  ErroDeCarregamento,
  Esqueleto,
  Tabela,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useItem, useMutacao } from '../../lib/query';

export default function PaginaProducaoDetalhe() {
  const id = Number(useParams().id);
  const producao = useItem<Producao>('producao', `/producoes/${id}`, id);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const cancelar = useMutacao(
    () => api.post<Producao>(`/producoes/${id}/cancelar`, { motivo: motivo || null }),
    {
      sucesso: 'Produção cancelada: materiais devolvidos e peças retiradas do estoque.',
      aoConcluir: () => setCancelando(false),
    },
  );

  if (producao.isLoading) return <Esqueleto linhas={4} />;
  if (producao.isError)
    return <ErroDeCarregamento erro={producao.error} aoTentar={() => void producao.refetch()} />;
  const p = producao.data!;
  const cancelada = p.status === 'cancelada';

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: '/producao', rotulo: 'Produção' }}
        titulo={
          <>
            Lote #{p.id} {cancelada && <Chip className="ml-2 align-middle">Cancelado</Chip>}
          </>
        }
        subtitulo={
          <>
            {formatarData(p.data)} · {p.quantidade} ×{' '}
            <Link className="text-pitanga-700 hover:underline" to={`/produtos/${p.produtoId}`}>
              {p.produtoNome}
            </Link>{' '}
            · ficha v{p.fichaVersao}
          </>
        }
        acoes={
          !cancelada && (
            <Botao
              variante="perigo"
              icone={<Ban className="h-4 w-4" />}
              onClick={() => setCancelando(true)}
            >
              Cancelar produção
            </Botao>
          )
        }
      />
      {p.autorizouEstoqueNegativo && (
        <div className="mb-4">
          <Alerta tom="ambar" titulo="Produzido com estoque negativo">
            Este lote foi autorizado mesmo sem todo o material em estoque.
          </Alerta>
        </div>
      )}
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao titulo="Custo gerencial (formação de preço)">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt>Materiais consumidos</dt>
                <dd className="numero">{formatarMoeda(p.custoMateriais)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Mão de obra</dt>
                <dd className="numero">{formatarMoeda(p.custoMaoObra)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Outros custos</dt>
                <dd className="numero">{formatarMoeda(p.custoExtras)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Despesas rateadas</dt>
                <dd className="numero">{formatarMoeda(p.custoRateios)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-creme-300 pt-3">
                <dt className="font-semibold">Custo total do lote</dt>
                <dd className="numero font-titulo text-2xl">{formatarMoeda(p.custoTotal)}</dd>
              </div>
              <div className="flex justify-between text-tinta-600">
                <dt>Por peça</dt>
                <dd className="numero">{formatarMicro(p.custoUnitario)}</dd>
              </div>
            </dl>
          </Cartao>
          <Cartao titulo="Custo de estoque (o que entrou nos acabados)">
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="font-semibold">Entrou no estoque</dt>
                <dd className="numero font-titulo text-2xl text-pitanga-700">
                  {formatarMoeda(p.custoEstoqueTotal)}
                </dd>
              </div>
              <div className="flex justify-between text-tinta-600">
                <dt>Por peça</dt>
                <dd className="numero">{formatarMicro(p.custoEstoqueUnitario)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-tinta-500">
              {p.remunerouMaoObra
                ? 'A mão de obra deste lote foi paga e integra o valor do estoque.'
                : 'A mão de obra (e custos já lançados como despesa) entra no preço, mas não infla o valor do estoque. É esse custo que vira “custo dos produtos vendidos” na venda.'}
            </p>
          </Cartao>
        </div>
        <Cartao titulo="Materiais consumidos" semPadding>
          <div className="p-2">
            <Tabela
              legenda="Materiais consumidos"
              linhas={p.consumos}
              chave={(c) => c.id}
              colunas={[
                {
                  titulo: 'Material',
                  celula: (c) => (
                    <Link
                      className="font-medium text-pitanga-700 hover:underline"
                      to={`/materiais/${c.materialId}`}
                    >
                      {c.materialNome}
                    </Link>
                  ),
                },
                {
                  titulo: 'Quantidade',
                  alinhar: 'direita',
                  celula: (c) => (
                    <span className="numero">{formatarQuantidade(c.quantidade, c.unidade)}</span>
                  ),
                },
                {
                  titulo: 'Custo unitário (no dia)',
                  alinhar: 'direita',
                  celula: (c) => <span className="numero">{formatarMicro(c.custoUnitario)}</span>,
                },
                {
                  titulo: 'Custo',
                  alinhar: 'direita',
                  celula: (c) => <span className="numero">{formatarMoeda(c.custoTotal)}</span>,
                },
              ]}
            />
          </div>
        </Cartao>
        {p.observacao && (
          <Cartao titulo="Observação">
            <p className="text-sm">{p.observacao}</p>
          </Cartao>
        )}
      </div>
      <Confirmar
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        aoConfirmar={() => cancelar.mutate(undefined)}
        carregando={cancelar.isPending}
        titulo="Cancelar esta produção?"
        rotuloConfirmar="Cancelar produção"
        mensagem={
          <div className="space-y-3">
            <p>
              Os materiais voltam ao estoque pelo custo original e as peças saem do estoque de
              acabados. Só é possível se nenhuma peça do lote foi vendida.
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
