import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { analisarPreco, calcularPreco, consolidarTaxas, ErroDeCalculo } from '@pitanga/core';
import {
  MODOS_PRECO,
  ROTULO_MODO_PRECO,
  formatarMoeda,
  formatarPercentual,
  type Ficha,
  type CustoFichaResposta,
  type ModoPreco,
  type Precificacao,
  type Produto,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { useTaxas } from '../../components/selecionadores';
import {
  Alerta,
  Botao,
  Campo,
  CampoMoeda,
  CampoNumero,
  Cartao,
  ErroDeCarregamento,
  Esqueleto,
} from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { useDados, useItem, useMutacao } from '../../lib/query';

const padroes: Record<ModoPreco, number> = {
  lucro_valor: 1500,
  acrescimo_percentual: 7000,
  margem_percentual: 4000,
};

export default function PaginaPrecificacao() {
  const produtoId = Number(useParams().id);
  const navegar = useNavigate();
  const produto = useItem<Produto>('produto', `/produtos/${produtoId}`, produtoId);
  const ficha = useDados<Ficha>(
    ['produto-ficha-ativa', produtoId],
    `/produtos/${produtoId}/ficha-ativa`,
  );
  const custoSrv = useDados<CustoFichaResposta>(
    ['ficha-custo', ficha.data?.id],
    ficha.data ? `/fichas/${ficha.data.id}/custo` : null,
  );
  const taxas = useTaxas();

  const [modo, setModo] = useState<ModoPreco>('margem_percentual');
  const [parametros, setParametros] = useState<Record<ModoPreco, number | null>>(padroes);
  const [taxaIds, setTaxaIds] = useState<number[] | null>(null);
  const [precoEditado, setPrecoEditado] = useState<number | null>(null);

  const taxasAtivas = (taxas.data ?? []).filter((t) => t.ativo);
  const escolhidas = taxaIds ?? taxasAtivas.filter((t) => t.padrao).map((t) => t.id);
  const custoBase = custoSrv.data?.custo.custoUnitarioCentavos ?? 0;

  // Tudo calculado no navegador com as mesmas funções do servidor; o servidor refaz ao gravar.
  const calculo = useMemo(() => {
    const { taxasFixas, taxasPercentuais } = consolidarTaxas(
      taxasAtivas.filter((t) => escolhidas.includes(t.id)),
      custoBase,
    );
    try {
      const sugerido = calcularPreco({
        custoBase,
        taxasFixas,
        taxasPercentuais,
        modo,
        parametro: parametros[modo] ?? 0,
      });
      const precoFinal = precoEditado ?? sugerido;
      return {
        taxasFixas,
        taxasPercentuais,
        sugerido,
        precoFinal,
        analise: analisarPreco({ custoBase, taxasFixas, taxasPercentuais, precoFinal }),
        erro: null as string | null,
      };
    } catch (e) {
      if (e instanceof ErroDeCalculo)
        return {
          taxasFixas,
          taxasPercentuais,
          sugerido: 0,
          precoFinal: precoEditado ?? 0,
          analise: null,
          erro: e.message,
        };
      throw e;
    }
  }, [taxasAtivas, escolhidas, custoBase, modo, parametros, precoEditado]);

  const salvar = useMutacao(
    (aplicar: boolean) =>
      api.post<Precificacao>('/precificacao', {
        produtoId,
        modo,
        parametro: parametros[modo] ?? 0,
        taxaIds: escolhidas,
        precoFinal: calculo.precoFinal,
        aplicarAoProduto: aplicar,
      }),
    {
      sucesso: (p) =>
        p.aplicadoAoProduto ? 'Preço aplicado ao produto.' : 'Simulação guardada no histórico.',
      aoConcluir: (p) => p.aplicadoAoProduto && navegar(`/produtos/${produtoId}`),
    },
  );

  if (produto.isLoading || ficha.isLoading) return <Esqueleto linhas={5} />;
  if (
    (ficha.error instanceof ApiError && ficha.error.status === 404) ||
    (ficha.isSuccess && !ficha.data)
  ) {
    return (
      <>
        <PaginaCabecalho
          voltar={{ para: `/produtos/${produtoId}`, rotulo: 'Produto' }}
          titulo="Precificação"
        />
        <Alerta
          tom="ambar"
          titulo="Falta a ficha técnica"
          acao={
            <Link to={`/produtos/${produtoId}/ficha`}>
              <Botao tamanho="p" variante="primario">
                Montar ficha
              </Botao>
            </Link>
          }
        >
          Para sugerir um preço precisamos saber o custo da peça.
        </Alerta>
      </>
    );
  }
  if (produto.isError) return <ErroDeCarregamento erro={produto.error} />;
  if (ficha.isError) return <ErroDeCarregamento erro={ficha.error} />;
  const p = produto.data!;
  const a = calculo.analise;

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: `/produtos/${produtoId}`, rotulo: p.nome }}
        titulo="Precificação"
        subtitulo={`${p.nome} — custo da peça ${formatarMoeda(custoBase)} (ficha v${ficha.data!.versao}). Escolha como quer chegar ao preço.`}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Cartao titulo="1. Como você quer calcular?">
            <fieldset className="grid gap-3 md:grid-cols-3">
              <legend className="sr-only">Método de formação do preço</legend>
              {MODOS_PRECO.map((m) => (
                <label
                  key={m}
                  className={`cursor-pointer rounded-campo border p-4 transition ${modo === m ? 'border-pitanga-600 bg-pitanga-50' : 'border-creme-300 bg-white hover:border-tinta-400'}`}
                >
                  <input
                    type="radio"
                    name="modo"
                    className="sr-only"
                    checked={modo === m}
                    onChange={() => {
                      setModo(m);
                      setPrecoEditado(null);
                    }}
                  />
                  <span className="block font-medium">{ROTULO_MODO_PRECO[m]}</span>
                  <span className="mt-1 block text-xs text-tinta-500">
                    {m === 'lucro_valor' && 'Quanto você quer ganhar em reais por peça.'}
                    {m === 'acrescimo_percentual' && 'Quantos % somar ao custo, antes das taxas.'}
                    {m === 'margem_percentual' && 'Quantos % do preço final devem ser lucro.'}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="mt-4 max-w-xs">
              <Campo
                rotulo={
                  modo === 'lucro_valor'
                    ? 'Lucro desejado por peça'
                    : modo === 'acrescimo_percentual'
                      ? 'Acréscimo sobre o custo'
                      : 'Margem desejada sobre o preço'
                }
              >
                {({ id }) =>
                  modo === 'lucro_valor' ? (
                    <CampoMoeda
                      id={id}
                      valor={parametros[modo]}
                      onChange={(v) => {
                        setParametros({ ...parametros, [modo]: v });
                        setPrecoEditado(null);
                      }}
                    />
                  ) : (
                    <CampoNumero
                      id={id}
                      escala={100}
                      sufixo="%"
                      valor={parametros[modo]}
                      onChange={(v) => {
                        setParametros({ ...parametros, [modo]: v });
                        setPrecoEditado(null);
                      }}
                    />
                  )
                }
              </Campo>
            </div>
          </Cartao>

          <Cartao titulo="2. Taxas que incidem sobre a venda">
            {taxasAtivas.length === 0 ? (
              <p className="text-sm text-tinta-500">
                Nenhuma taxa cadastrada. Cadastre taxa de cartão ou comissão em Configurações.
              </p>
            ) : (
              <ul className="space-y-2">
                {taxasAtivas.map((t) => (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-campo border border-creme-200 px-4 py-2.5 hover:bg-creme-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-pitanga-600"
                        checked={escolhidas.includes(t.id)}
                        onChange={(e) => {
                          setTaxaIds(
                            e.target.checked
                              ? [...escolhidas, t.id]
                              : escolhidas.filter((x) => x !== t.id),
                          );
                          setPrecoEditado(null);
                        }}
                      />
                      <span className="flex-1 text-sm font-medium">{t.nome}</span>
                      <span className="numero text-sm text-tinta-600">
                        {t.tipo === 'percentual'
                          ? `${formatarPercentual(t.valor)} do ${t.aplicaEm === 'preco' ? 'preço' : 'custo'}`
                          : formatarMoeda(t.valor)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao titulo="3. Preço final">
            {calculo.erro ? (
              <Alerta tom="pitanga" titulo="Não dá para calcular com estes números">
                {calculo.erro}
              </Alerta>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-tinta-600">
                  Preço sugerido:{' '}
                  <strong className="numero text-lg text-tinta-900">
                    {formatarMoeda(calculo.sugerido)}
                  </strong>
                  . Pode ajustar à mão (por exemplo, arredondar para R$ …,90) — o lucro e a margem
                  se recalculam.
                </p>
                <div className="max-w-xs">
                  <Campo rotulo="Preço de venda">
                    {({ id }) => (
                      <CampoMoeda
                        id={id}
                        valor={calculo.precoFinal}
                        onChange={(v) => setPrecoEditado(v)}
                      />
                    )}
                  </Campo>
                </div>
                {precoEditado !== null && precoEditado !== calculo.sugerido && (
                  <Botao tamanho="p" variante="fantasma" onClick={() => setPrecoEditado(null)}>
                    Voltar ao sugerido
                  </Botao>
                )}
              </div>
            )}
          </Cartao>
        </div>

        <aside className="xl:sticky xl:top-0 xl:self-start">
          <Cartao
            titulo="Resultado por peça"
            className={a?.prejuizo ? 'border-pitanga-400' : 'border-folha-100'}
          >
            {a ? (
              <div className="space-y-4">
                {a.prejuizo && (
                  <Alerta tom="pitanga" titulo="Prejuízo!">
                    <span className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Com este preço cada peça
                      dá {formatarMoeda(Math.abs(a.lucroPrevisto))} de prejuízo. O preço mínimo para
                      empatar é {formatarMoeda(a.precoDeEquilibrio)}.
                    </span>
                  </Alerta>
                )}
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-tinta-600">Preço de venda</dt>
                    <dd className="numero font-medium">{formatarMoeda(calculo.precoFinal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-tinta-600">Taxas sobre o preço</dt>
                    <dd className="numero text-pitanga-700">
                      − {formatarMoeda(a.taxasSobrePreco)}
                    </dd>
                  </div>
                  {calculo.taxasFixas > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-tinta-600">Taxas fixas</dt>
                      <dd className="numero text-pitanga-700">
                        − {formatarMoeda(calculo.taxasFixas)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-tinta-600">Custo da peça</dt>
                    <dd className="numero text-pitanga-700">− {formatarMoeda(custoBase)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-creme-300 pt-3">
                    <dt className="font-semibold">Lucro previsto</dt>
                    <dd
                      className={`numero font-titulo text-3xl ${a.prejuizo ? 'text-pitanga-700' : 'text-folha-700'}`}
                    >
                      {formatarMoeda(a.lucroPrevisto)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-tinta-600">Margem efetiva</dt>
                    <dd className={`numero font-semibold ${a.prejuizo ? 'text-pitanga-700' : ''}`}>
                      {formatarPercentual(a.margemEfetiva)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-tinta-600">Preço de equilíbrio</dt>
                    <dd className="numero">{formatarMoeda(a.precoDeEquilibrio)}</dd>
                  </div>
                </dl>
                <div className="flex flex-col gap-2 pt-1">
                  <Botao
                    variante="primario"
                    disabled={calculo.precoFinal <= 0}
                    carregando={salvar.isPending}
                    onClick={() => salvar.mutate(true)}
                  >
                    Salvar e aplicar ao produto
                  </Botao>
                  <Botao disabled={calculo.precoFinal <= 0} onClick={() => salvar.mutate(false)}>
                    Só guardar a simulação
                  </Botao>
                </div>
                {p.precoVenda ? (
                  <p className="text-xs text-tinta-500">
                    Preço atual do produto: {formatarMoeda(p.precoVenda)}.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-tinta-500">Ajuste os parâmetros para ver o resultado.</p>
            )}
          </Cartao>
        </aside>
      </div>
    </>
  );
}
