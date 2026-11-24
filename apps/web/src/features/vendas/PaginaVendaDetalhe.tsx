import { Ban, HandCoins } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import {
  FORMAS_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_STATUS_VENDA,
  formatarData,
  formatarMicro,
  formatarMoeda,
  hojeISO,
  type FormaPagamento,
  type Venda,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import {
  Alerta,
  AreaDeTexto,
  Botao,
  Campo,
  CampoData,
  CampoMoeda,
  Cartao,
  Chip,
  Confirmar,
  Dado,
  ErroDeCarregamento,
  Esqueleto,
  Modal,
  Selecao,
  Tabela,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useItem, useMutacao } from '../../lib/query';
import { tomDaVenda } from './PaginaVendas';

function ModalRecebimento({
  aberto,
  aoFechar,
  venda,
}: {
  aberto: boolean;
  aoFechar: () => void;
  venda: Venda;
}) {
  const emAberto = venda.total - venda.recebido;
  const f = useForm<{ data: string; valor: number | null; formaPagamento: FormaPagamento }>({
    values: { data: hojeISO(), valor: emAberto, formaPagamento: 'pix' },
  });
  useAvisoDeSaida(aberto && f.formState.isDirty);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutacao(
    (d: { data: string; valor: number; formaPagamento: FormaPagamento }) =>
      api.post<Venda>(`/vendas/${venda.id}/recebimentos`, d),
    {
      sucesso: 'Recebimento registrado.',
      aoConcluir: aoFechar,
    },
  );
  const enviar = f.handleSubmit((d) => {
    if (!d.valor) return setErro('Informe o valor recebido.');
    if (d.valor > emAberto)
      return setErro(`O valor é maior que o saldo em aberto (${formatarMoeda(emAberto)}).`);
    setErro(null);
    salvar.mutate({ data: d.data, valor: d.valor, formaPagamento: d.formaPagamento });
  });
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Registrar recebimento"
      tamanho="p"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvar.isPending} onClick={enviar}>
            Registrar
          </Botao>
        </>
      }
    >
      <form className="space-y-4" onSubmit={enviar}>
        {erro && <Alerta tom="pitanga">{erro}</Alerta>}
        <p className="text-sm text-tinta-600">
          Falta receber <strong className="numero">{formatarMoeda(emAberto)}</strong>. O recebimento
          entra no caixa; a receita da venda já foi contada no dia da venda.
        </p>
        <Campo rotulo="Valor recebido" obrigatorio>
          {({ id }) => (
            <Controller
              control={f.control}
              name="valor"
              render={({ field }) => (
                <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
              )}
            />
          )}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data">
            {({ id }) => (
              <Controller
                control={f.control}
                name="data"
                render={({ field }) => (
                  <CampoData id={id} valor={field.value} onChange={field.onChange} />
                )}
              />
            )}
          </Campo>
          <Campo rotulo="Forma">
            {({ id }) => (
              <Selecao id={id} {...f.register('formaPagamento')}>
                {FORMAS_PAGAMENTO.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_FORMA_PAGAMENTO[p]}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export default function PaginaVendaDetalhe() {
  const id = Number(useParams().id);
  const venda = useItem<Venda>('venda', `/vendas/${id}`, id);
  const [receber, setReceber] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const cancelar = useMutacao(
    () => api.post<Venda>(`/vendas/${id}/cancelar`, { motivo: motivo || null }),
    {
      sucesso: 'Venda cancelada: estoque devolvido e valores estornados.',
      aoConcluir: () => setCancelando(false),
    },
  );

  if (venda.isLoading) return <Esqueleto linhas={4} />;
  if (venda.isError)
    return <ErroDeCarregamento erro={venda.error} aoTentar={() => void venda.refetch()} />;
  const v = venda.data!;
  const emAberto = v.total - v.recebido;
  const cancelada = v.status === 'cancelada';

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: '/vendas', rotulo: 'Vendas' }}
        titulo={
          <>
            Venda #{v.id}{' '}
            <Chip tom={tomDaVenda(v.status)} className="ml-2 align-middle">
              {ROTULO_STATUS_VENDA[v.status]}
            </Chip>
          </>
        }
        subtitulo={
          <>
            {formatarData(v.data)} ·{' '}
            {v.clienteId ? (
              <Link className="text-pitanga-700 hover:underline" to={`/clientes/${v.clienteId}`}>
                {v.clienteNome}
              </Link>
            ) : (
              'Consumidor não identificado'
            )}{' '}
            · {ROTULO_FORMA_PAGAMENTO[v.formaPagamento] ?? v.formaPagamento}
          </>
        }
        acoes={
          !cancelada && (
            <>
              {emAberto > 0 && (
                <Botao
                  variante="primario"
                  icone={<HandCoins className="h-4 w-4" />}
                  onClick={() => setReceber(true)}
                >
                  Registrar recebimento
                </Botao>
              )}
              <Botao
                variante="perigo"
                icone={<Ban className="h-4 w-4" />}
                onClick={() => setCancelando(true)}
              >
                Cancelar venda
              </Botao>
            </>
          )
        }
      />
      {cancelada && (
        <div className="mb-4">
          <Alerta tom="neutro">
            Venda cancelada: o estoque voltou ao custo original e a receita, o custo e os
            recebimentos foram estornados.
          </Alerta>
        </div>
      )}
      {v.status === 'pendente' && (
        <div className="mb-4">
          <Alerta tom="ambar" titulo={`Falta receber ${formatarMoeda(emAberto)}`}>
            Já recebido: {formatarMoeda(v.recebido)} de {formatarMoeda(v.total)}.
          </Alerta>
        </div>
      )}
      <div className="space-y-6">
        <Cartao titulo="Itens" semPadding>
          <div className="p-2">
            <Tabela
              legenda="Itens da venda"
              linhas={v.itens}
              chave={(i) => i.id}
              colunas={[
                {
                  titulo: 'Produto',
                  celula: (i) => (
                    <Link
                      className="font-medium text-pitanga-700 hover:underline"
                      to={`/produtos/${i.produtoId}`}
                    >
                      {i.produtoNome}
                    </Link>
                  ),
                },
                {
                  titulo: 'Qtd.',
                  alinhar: 'direita',
                  celula: (i) => <span className="numero">{i.quantidade}</span>,
                },
                {
                  titulo: 'Preço unit.',
                  alinhar: 'direita',
                  celula: (i) => <span className="numero">{formatarMoeda(i.precoUnitario)}</span>,
                },
                {
                  titulo: 'Desconto',
                  alinhar: 'direita',
                  ocultarEmPequeno: true,
                  celula: (i) => (
                    <span className="numero">
                      {i.descontoItem ? formatarMoeda(i.descontoItem) : '—'}
                    </span>
                  ),
                },
                {
                  titulo: 'Custo unit.',
                  alinhar: 'direita',
                  ocultarEmPequeno: true,
                  celula: (i) => (
                    <span className="numero text-tinta-500">{formatarMicro(i.custoUnitario)}</span>
                  ),
                },
                {
                  titulo: 'Total',
                  alinhar: 'direita',
                  celula: (i) => (
                    <span className="numero font-medium">{formatarMoeda(i.total)}</span>
                  ),
                },
              ]}
            />
          </div>
        </Cartao>
        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao titulo="Valores">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt>Produtos</dt>
                <dd className="numero">{formatarMoeda(v.subtotal)}</dd>
              </div>
              {v.desconto > 0 && (
                <div className="flex justify-between">
                  <dt>Desconto</dt>
                  <dd className="numero text-pitanga-700">− {formatarMoeda(v.desconto)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-creme-300 pt-3">
                <dt className="font-semibold">Total</dt>
                <dd className="numero font-titulo text-2xl text-pitanga-700">
                  {formatarMoeda(v.total)}
                </dd>
              </div>
              <div className="flex justify-between text-tinta-500">
                <dt>Custo dos produtos vendidos</dt>
                <dd className="numero">{formatarMoeda(v.cmv)}</dd>
              </div>
              <div className="flex justify-between text-tinta-500">
                <dt>Lucro estimado</dt>
                <dd className="numero">{formatarMoeda(v.lucroEstimado)}</dd>
              </div>
            </dl>
            {v.observacao && (
              <Dado rotulo="Observação" className="mt-4">
                {v.observacao}
              </Dado>
            )}
          </Cartao>
          <Cartao titulo="Recebimentos" semPadding>
            <div className="p-2">
              <Tabela
                legenda="Recebimentos"
                linhas={v.recebimentos}
                chave={(r) => r.id}
                vazio={
                  <p className="px-4 py-8 text-center text-sm text-tinta-500">
                    Nenhum recebimento registrado.
                  </p>
                }
                colunas={[
                  { titulo: 'Data', celula: (r) => formatarData(r.data) },
                  {
                    titulo: 'Forma',
                    celula: (r) => ROTULO_FORMA_PAGAMENTO[r.formaPagamento] ?? r.formaPagamento,
                  },
                  {
                    titulo: 'Valor',
                    alinhar: 'direita',
                    celula: (r) => (
                      <span className="numero font-medium">{formatarMoeda(r.valor)}</span>
                    ),
                  },
                ]}
              />
            </div>
          </Cartao>
        </div>
      </div>
      <ModalRecebimento aberto={receber} aoFechar={() => setReceber(false)} venda={v} />
      <Confirmar
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        aoConfirmar={() => cancelar.mutate(undefined)}
        carregando={cancelar.isPending}
        titulo="Cancelar esta venda?"
        rotuloConfirmar="Cancelar venda"
        mensagem={
          <div className="space-y-3">
            <p>
              O estoque volta pelo custo original e a receita, o custo e os recebimentos são
              estornados. Nada é apagado.
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
