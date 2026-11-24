import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FORMAS_PAGAMENTO,
  NATUREZAS,
  NATUREZAS_MANUAIS,
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_NATUREZA,
  TIPOS_DESPESA_COMPARTILHADA,
  formatarData,
  formatarMoeda,
  hojeISO,
  type DespesaCompartilhada,
  type FormaPagamento,
  type Lancamento,
  type Natureza,
  type PontoCaixa,
  type ResumoFinanceiro,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorPeriodo, intervaloPredefinido } from '../../components/SeletorPeriodo';
import { useProdutos } from '../../components/selecionadores';
import {
  Abas,
  Alerta,
  Botao,
  Campo,
  CampoData,
  CampoMoeda,
  CampoNumero,
  Cartao,
  Chip,
  Confirmar,
  Entrada,
  EstadoVazio,
  Indicador,
  Modal,
  PaginacaoControles,
  Selecao,
  Tabela,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useDados, useLista, useMutacao } from '../../lib/query';
import { classeValor, useDebounce, type Periodo } from '../../lib/util';

/* ------------------------------- extrato ------------------------------- */

function ModalLancamento({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const f = useForm<{
    natureza: (typeof NATUREZAS_MANUAIS)[number];
    descricao: string;
    valor: number | null;
    dataCompetencia: string;
    pago: boolean;
    dataCaixa: string;
  }>({
    values: {
      natureza: 'despesa_operacional',
      descricao: '',
      valor: null,
      dataCompetencia: hojeISO(),
      pago: true,
      dataCaixa: hojeISO(),
    },
  });
  useAvisoDeSaida(aberto && f.formState.isDirty);
  const [erro, setErro] = useState<string | null>(null);
  const natureza = f.watch('natureza');
  const pago = f.watch('pago');
  const tipoDa = {
    despesa_operacional: 'despesa',
    ajuste: 'receita',
    aporte: 'receita',
    retirada: 'despesa',
  } as const;
  const salvar = useMutacao(
    (corpo: object) => api.post<Lancamento>('/financeiro/lancamentos', corpo),
    {
      sucesso: 'Lançamento registrado.',
      naJanela: aberto,
      aoConcluir: () => fechar(),
    },
  );
  const fechar = () => {
    f.reset();
    setErro(null);
    aoFechar();
  };
  const enviar = f.handleSubmit((d) => {
    if (d.descricao.trim().length === 0) return setErro('Descreva o lançamento.');
    if (!d.valor) return setErro('Informe o valor.');
    setErro(null);
    salvar.mutate({
      tipo: tipoDa[d.natureza],
      natureza: d.natureza,
      descricao: d.descricao,
      valor: d.valor,
      dataCompetencia: d.dataCompetencia,
      dataCaixa: d.pago ? d.dataCaixa : null,
    });
  });
  const rotulos: Record<(typeof NATUREZAS_MANUAIS)[number], string> = {
    despesa_operacional: 'Despesa (aluguel, internet, taxas…)',
    ajuste: 'Outra receita',
    aporte: 'Aporte da sócia',
    retirada: 'Retirada da sócia',
  };
  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo="Novo lançamento"
      erro={erro ?? salvar.error}
      rodape={
        <>
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvar.isPending} onClick={enviar}>
            Registrar
          </Botao>
        </>
      }
    >
      <form className="space-y-4" onSubmit={enviar}>
        <Campo rotulo="Tipo">
          {({ id }) => (
            <Selecao id={id} {...f.register('natureza')}>
              {NATUREZAS_MANUAIS.map((n) => (
                <option key={n} value={n}>
                  {rotulos[n]}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Descrição" obrigatorio>
          {({ id }) => <Entrada id={id} autoFocus {...f.register('descricao')} />}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Valor" obrigatorio>
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
          <Campo rotulo="Data do fato">
            {({ id }) => (
              <Controller
                control={f.control}
                name="dataCompetencia"
                render={({ field }) => (
                  <CampoData id={id} valor={field.value} onChange={field.onChange} />
                )}
              />
            )}
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-pitanga-600" {...f.register('pago')} />{' '}
          {tipoDa[natureza] === 'despesa' ? 'Já paguei' : 'Já recebi'}
        </label>
        {pago ? (
          <Campo
            rotulo={tipoDa[natureza] === 'despesa' ? 'Data do pagamento' : 'Data do recebimento'}
          >
            {({ id }) => (
              <Controller
                control={f.control}
                name="dataCaixa"
                render={({ field }) => (
                  <CampoData id={id} valor={field.value} onChange={field.onChange} />
                )}
              />
            )}
          </Campo>
        ) : (
          <p className="text-sm text-tinta-500">
            Ficará como “previsto” e só entra nas contas quando você marcar como realizado.
          </p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function Extrato({ periodo }: { periodo: Periodo }) {
  const [natureza, setNatureza] = useState<Natureza | ''>('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);
  const [realizando, setRealizando] = useState<Lancamento | null>(null);
  const [dataCaixa, setDataCaixa] = useState(hojeISO());
  const [cancelando, setCancelando] = useState<Lancamento | null>(null);
  const termo = useDebounce(busca);
  const { data, isLoading } = useLista<Lancamento>('lancamentos', '/financeiro/lancamentos', {
    ...periodo,
    natureza: natureza || undefined,
    busca: termo,
    pagina,
    porPagina: 30,
  });
  const realizar = useMutacao(
    () => api.post(`/financeiro/lancamentos/${realizando!.id}/realizar`, { dataCaixa }),
    {
      sucesso: 'Lançamento realizado.',
      naJanela: !!realizando,
      aoConcluir: () => fecharRealizar(),
    },
  );
  const fecharRealizar = () => {
    setDataCaixa(hojeISO());
    setRealizando(null);
  };
  const cancelar = useMutacao(
    () => api.post(`/financeiro/lancamentos/${cancelando!.id}/cancelar`),
    {
      sucesso: 'Lançamento cancelado.',
      naJanela: !!cancelando,
      aoConcluir: () => setCancelando(null),
    },
  );

  return (
    <>
      <Cartao semPadding>
        <div className="flex flex-wrap items-end gap-3 border-b border-creme-200 p-4">
          <Campo rotulo="Natureza">
            {({ id }) => (
              <Selecao
                id={id}
                value={natureza}
                onChange={(e) => {
                  setNatureza(e.target.value as Natureza | '');
                  setPagina(1);
                }}
              >
                <option value="">Todas</option>
                {NATUREZAS.map((n) => (
                  <option key={n} value={n}>
                    {ROTULO_NATUREZA[n]}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Buscar" className="min-w-[14rem] flex-1">
            {({ id }) => (
              <Entrada
                id={id}
                placeholder="Descrição"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(1);
                }}
              />
            )}
          </Campo>
          <Botao
            variante="primario"
            icone={<Plus className="h-4 w-4" />}
            onClick={() => setNovo(true)}
          >
            Novo lançamento
          </Botao>
        </div>
        <div className="p-2">
          <Tabela<Lancamento>
            legenda="Extrato de lançamentos"
            linhas={data?.itens}
            carregando={isLoading}
            chave={(l) => l.id}
            vazio={
              <EstadoVazio
                titulo="Nenhum lançamento no período"
                descricao="Vendas, compras, produções e despesas geram lançamentos automaticamente."
              />
            }
            classeLinha={(l) => (l.status !== 'realizado' ? 'opacity-70' : undefined)}
            colunas={[
              { titulo: 'Data', celula: (l) => formatarData(l.dataCaixa ?? l.dataCompetencia) },
              {
                titulo: 'Descrição',
                celula: (l) => (
                  <div>
                    <span className="font-medium">{l.descricao}</span>
                    <div className="text-xs text-tinta-500">{ROTULO_NATUREZA[l.natureza]}</div>
                  </div>
                ),
              },
              {
                titulo: 'Efeito',
                ocultarEmPequeno: true,
                celula: (l) => (
                  <span className="flex flex-wrap gap-1">
                    {l.afetaCaixa && <Chip tom="neutro">Caixa</Chip>}
                    {l.afetaResultado && <Chip tom="neutro">Resultado</Chip>}
                    {l.status !== 'realizado' && (
                      <Chip tom="ambar">{l.status === 'previsto' ? 'Previsto' : 'Cancelado'}</Chip>
                    )}
                  </span>
                ),
              },
              {
                titulo: 'Valor',
                alinhar: 'direita',
                celula: (l) => (
                  <span
                    className={`numero font-semibold ${l.tipo === 'despesa' ? 'text-pitanga-700' : 'text-folha-700'}`}
                  >
                    {l.tipo === 'despesa' ? '− ' : '+ '}
                    {formatarMoeda(l.valor)}
                  </span>
                ),
              },
              {
                titulo: '',
                alinhar: 'direita',
                celula: (l) => (
                  <span className="flex justify-end gap-1">
                    {l.status === 'previsto' && (
                      <Botao tamanho="p" onClick={() => setRealizando(l)}>
                        Realizar
                      </Botao>
                    )}
                    {l.referenciaTipo === 'manual' &&
                      l.status !== 'cancelado' &&
                      !l.estornaLancamentoId && (
                        <Botao tamanho="p" variante="fantasma" onClick={() => setCancelando(l)}>
                          Cancelar
                        </Botao>
                      )}
                  </span>
                ),
              },
            ]}
          />
          <PaginacaoControles paginacao={data?.paginacao} aoMudar={setPagina} />
        </div>
      </Cartao>
      <ModalLancamento aberto={novo} aoFechar={() => setNovo(false)} />
      <Modal
        aberto={!!realizando}
        aoFechar={fecharRealizar}
        titulo="Marcar como realizado"
        tamanho="p"
        erro={realizar.error}
        rodape={
          <>
            <Botao onClick={fecharRealizar}>Voltar</Botao>
            <Botao
              variante="primario"
              carregando={realizar.isPending}
              onClick={() => realizar.mutate(undefined)}
            >
              Confirmar
            </Botao>
          </>
        }
      >
        <Campo rotulo="Data em que o dinheiro entrou/saiu">
          {({ id }) => <CampoData id={id} valor={dataCaixa} onChange={setDataCaixa} />}
        </Campo>
      </Modal>
      <Confirmar
        aberto={!!cancelando}
        aoFechar={() => setCancelando(null)}
        aoConfirmar={() => cancelar.mutate(undefined)}
        carregando={cancelar.isPending}
        erro={cancelar.error}
        titulo="Cancelar lançamento?"
        rotuloConfirmar="Cancelar lançamento"
        mensagem={
          <p>“{cancelando?.descricao}” será anulado por um estorno. O histórico é mantido.</p>
        }
      />
    </>
  );
}

/* -------------------------------- resumo -------------------------------- */

function Resumo({ periodo }: { periodo: Periodo }) {
  const { data } = useDados<ResumoFinanceiro>(['resumo', periodo], '/financeiro/resumo', periodo);
  const r = data;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Faturamento"
          valor={formatarMoeda(r?.faturamento ?? 0)}
          detalhe="Vendas do período"
        />
        <Indicador
          rotulo="Recebido"
          valor={formatarMoeda(r?.recebido ?? 0)}
          detalhe="Dinheiro que entrou"
          tom="folha"
        />
        <Indicador
          rotulo="Despesas pagas"
          valor={formatarMoeda(r?.despesasPagas ?? 0)}
          detalhe="Sem compra de material"
        />
        <Indicador
          rotulo="Custo dos produtos vendidos"
          valor={formatarMoeda(r?.custoProdutosVendidos ?? 0)}
          detalhe="Material que virou venda"
        />
        <Indicador
          rotulo={(r?.lucroPrejuizo ?? 0) < 0 ? 'Prejuízo' : 'Lucro'}
          valor={formatarMoeda(r?.lucroPrejuizo ?? 0)}
          tom={(r?.lucroPrejuizo ?? 0) < 0 ? 'pitanga' : 'folha'}
          detalhe="Receitas menos custos e despesas"
        />
        <Indicador
          rotulo="Saldo de caixa"
          valor={formatarMoeda(r?.saldoCaixa ?? 0)}
          tom={(r?.saldoCaixa ?? 0) < 0 ? 'pitanga' : 'neutro'}
          detalhe={`Variação no período: ${formatarMoeda(r?.variacaoCaixa ?? 0)}`}
        />
        <Indicador
          rotulo="Contas a receber"
          valor={formatarMoeda(r?.contasAReceber ?? 0)}
          tom={(r?.contasAReceber ?? 0) > 0 ? 'ambar' : 'neutro'}
          detalhe="Vendas ainda não quitadas"
        />
        <Indicador
          rotulo="Lucro após seu trabalho"
          valor={formatarMoeda(r?.lucroAposMaoObra ?? 0)}
          tom={(r?.lucroAposMaoObra ?? 0) < 0 ? 'pitanga' : 'neutro'}
          detalhe={`Descontando ${formatarMoeda(r?.maoObraNaoRemunerada ?? 0)} da sua mão de obra`}
        />
      </div>
      <Cartao titulo="Como ler estes números">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-tinta-600">
          <li>
            <strong>Comprar material não é despesa:</strong> é troca de dinheiro por estoque. Ele só
            vira custo quando o produto é vendido.
          </li>
          <li>
            <strong>Caixa negativo com lucro positivo</strong> é comum em artesanato: o dinheiro
            está parado em estoque. Por isso mostramos caixa e lucro separados.
          </li>
          <li>
            O <strong>faturamento</strong> conta a venda no dia em que ela acontece; o{' '}
            <strong>recebido</strong> conta quando o dinheiro entra.
          </li>
          <li>
            A <strong>conta fecha</strong>: variação do caixa + variação do estoque + contas a
            receber = lucro do período.
          </li>
        </ul>
      </Cartao>
    </div>
  );
}

/* --------------------------------- caixa --------------------------------- */

function Caixa({ periodo }: { periodo: Periodo }) {
  const { data } = useDados<{ saldoInicial: number; pontos: PontoCaixa[] }>(
    ['caixa', periodo],
    '/financeiro/caixa',
    periodo,
  );
  const pontos = data?.pontos ?? [];
  return (
    <div className="space-y-6">
      <Cartao titulo="Saldo do caixa ao longo do período">
        {pontos.length === 0 ? (
          <EstadoVazio titulo="Sem movimento de caixa no período" />
        ) : (
          <div className="h-72" role="img" aria-label="Gráfico do saldo de caixa por dia">
            <ResponsiveContainer>
              <AreaChart
                data={pontos.map((p) => ({
                  data: formatarData(p.data).slice(0, 5),
                  saldo: p.saldo / 100,
                }))}
                margin={{ left: 8, right: 16, top: 8 }}
              >
                <CartesianGrid stroke="rgb(226 211 191)" strokeDasharray="3 3" />
                <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={72}
                  tickFormatter={(v: number) => `R$ ${Math.round(v)}`}
                />
                <Tooltip formatter={(v) => [formatarMoeda(Math.round(Number(v) * 100)), 'Saldo']} />
                <Area
                  type="monotone"
                  dataKey="saldo"
                  stroke="rgb(200 55 45)"
                  fill="rgb(252 190 183)"
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Cartao>
      <Cartao titulo="Movimento diário" semPadding>
        <div className="p-2">
          <Tabela<PontoCaixa>
            legenda="Movimento diário do caixa"
            linhas={pontos}
            chave={(p) => p.data}
            vazio={<EstadoVazio titulo="Sem movimento" />}
            rodape={
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-2.5 text-right text-xs uppercase tracking-wide text-tinta-500"
                >
                  Saldo inicial do período
                </td>
                <td className="numero px-3 py-2.5 text-right">
                  {formatarMoeda(data?.saldoInicial ?? 0)}
                </td>
              </tr>
            }
            colunas={[
              { titulo: 'Dia', celula: (p) => formatarData(p.data) },
              {
                titulo: 'Entradas',
                alinhar: 'direita',
                celula: (p) => (
                  <span className="numero text-folha-700">{formatarMoeda(p.entradas)}</span>
                ),
              },
              {
                titulo: 'Saídas',
                alinhar: 'direita',
                celula: (p) => (
                  <span className="numero text-pitanga-700">{formatarMoeda(p.saidas)}</span>
                ),
              },
              {
                titulo: 'Saldo',
                alinhar: 'direita',
                celula: (p) => (
                  <span className={`numero font-medium ${classeValor(p.saldo)}`}>
                    {formatarMoeda(p.saldo)}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </Cartao>
    </div>
  );
}

/* ----------------------- despesas compartilhadas ----------------------- */

interface Destino {
  chave: string;
  tipo: 'produto' | 'producao';
  id: number;
  rotulo: string;
}

function ModalRateio({
  despesa,
  aoFechar,
}: {
  despesa: DespesaCompartilhada | null;
  aoFechar: () => void;
}) {
  const produtos = useProdutos();
  const lotes = useLista<{
    id: number;
    produtoNome: string;
    quantidade: number;
    data: string;
    status: string;
  }>('producoes', '/producoes', { porPagina: 30 });
  const [valores, setValores] = useState<Record<string, number | null>>({});
  const [erro, setErro] = useState<string | null>(null);
  const destinos: Destino[] = [
    ...(produtos.data?.itens ?? []).map((p) => ({
      chave: `p${p.id}`,
      tipo: 'produto' as const,
      id: p.id,
      rotulo: `${p.nome} (próxima produção)`,
    })),
    ...(lotes.data?.itens ?? [])
      .filter((l) => l.status === 'concluida')
      .map((l) => ({
        chave: `l${l.id}`,
        tipo: 'producao' as const,
        id: l.id,
        rotulo: `Lote #${l.id} — ${l.produtoNome} (${l.quantidade} un., ${formatarData(l.data)})`,
      })),
  ];
  const manual = despesa?.criterio === 'manual';
  useAvisoDeSaida(!!despesa && Object.keys(valores).length > 0);
  const escolhidos = destinos.filter((d) => valores[d.chave] !== undefined);
  const soma = escolhidos.reduce((s, d) => s + (valores[d.chave] ?? 0), 0);
  const ratear = useMutacao(
    () =>
      api.post(`/despesas-compartilhadas/${despesa!.id}/rateio`, {
        destinos: escolhidos.map((d) => ({
          destinoTipo: d.tipo,
          destinoId: d.id,
          ...(manual ? { valor: valores[d.chave] ?? 0 } : { peso: valores[d.chave] ?? 0 }),
        })),
      }),
    {
      sucesso: 'Despesa rateada.',
      naJanela: !!despesa,
      aoConcluir: () => fechar(),
    },
  );
  const fechar = () => {
    setValores({});
    setErro(null);
    aoFechar();
  };
  if (!despesa) return null;
  const confirmar = () => {
    if (escolhidos.length === 0) return setErro('Escolha ao menos um destino.');
    if (manual && soma !== despesa.valorTotal)
      return setErro(
        `A soma (${formatarMoeda(soma)}) precisa ser igual ao valor da despesa (${formatarMoeda(despesa.valorTotal)}).`,
      );
    setErro(null);
    ratear.mutate(undefined);
  };
  return (
    <Modal
      aberto
      aoFechar={fechar}
      titulo={`Ratear: ${despesa.descricao}`}
      tamanho="g"
      erro={erro ?? ratear.error}
      rodape={
        <>
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={ratear.isPending} onClick={confirmar}>
            Ratear
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <Alerta tom="neutro">
          O rateio só distribui o custo entre produtos — <strong>não gera outro pagamento</strong>.
          Para “produto”, o valor entra no custo da próxima produção; para “lote”, soma ao custo de
          um lote já produzido.
        </Alerta>
        <p className="text-sm text-tinta-600">
          Valor da despesa: <strong className="numero">{formatarMoeda(despesa.valorTotal)}</strong>{' '}
          · critério:{' '}
          {despesa.criterio === 'manual'
            ? 'valores informados por você'
            : despesa.criterio === 'por_producao'
              ? 'proporcional à quantidade informada'
              : 'proporcional ao valor informado'}
          .
        </p>
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {destinos.map((d) => {
            const marcado = valores[d.chave] !== undefined;
            return (
              <li
                key={d.chave}
                className="grid grid-cols-[1fr_9rem] items-center gap-3 rounded-campo border border-creme-200 px-3 py-2"
              >
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-pitanga-600"
                    checked={marcado}
                    onChange={(e) =>
                      setValores((v) => {
                        const n = { ...v };
                        if (e.target.checked) n[d.chave] = null;
                        else delete n[d.chave];
                        return n;
                      })
                    }
                  />
                  {d.rotulo}
                </label>
                {marcado &&
                  (manual ? (
                    <CampoMoeda
                      valor={valores[d.chave] ?? null}
                      onChange={(x) => setValores({ ...valores, [d.chave]: x })}
                      aria-label={`Valor para ${d.rotulo}`}
                    />
                  ) : (
                    <CampoNumero
                      escala={1}
                      valor={valores[d.chave] ?? null}
                      onChange={(x) => setValores({ ...valores, [d.chave]: x })}
                      aria-label={`Peso de ${d.rotulo}`}
                      placeholder="peso"
                    />
                  ))}
              </li>
            );
          })}
        </ul>
        {manual && (
          <p
            className={`text-sm ${soma === despesa.valorTotal ? 'text-folha-700' : 'text-pitanga-700'}`}
          >
            Soma dos rateios: <strong className="numero">{formatarMoeda(soma)}</strong> de{' '}
            {formatarMoeda(despesa.valorTotal)}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Compartilhadas() {
  const { data, isLoading } = useDados<DespesaCompartilhada[]>(
    ['despesas-compartilhadas'],
    '/despesas-compartilhadas',
  );
  const [nova, setNova] = useState(false);
  const [ratear, setRatear] = useState<DespesaCompartilhada | null>(null);
  const [cancelando, setCancelando] = useState<DespesaCompartilhada | null>(null);
  const f = useForm<{
    descricao: string;
    data: string;
    valorTotal: number | null;
    tipo: (typeof TIPOS_DESPESA_COMPARTILHADA)[number];
    criterio: 'manual' | 'por_producao' | 'por_valor';
    formaPagamento: FormaPagamento;
  }>({
    values: {
      descricao: '',
      data: hojeISO(),
      valorTotal: null,
      tipo: 'transporte',
      criterio: 'manual',
      formaPagamento: 'pix',
    },
  });
  useAvisoDeSaida(nova && f.formState.isDirty);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useMutacao(
    (corpo: object) => api.post<DespesaCompartilhada>('/despesas-compartilhadas', corpo),
    {
      sucesso: 'Despesa registrada. Agora distribua o custo entre os produtos.',
      naJanela: nova,
      aoConcluir: (d) => {
        fecharNova();
        setRatear(d);
      },
    },
  );
  const fecharNova = () => {
    f.reset();
    setErro(null);
    setNova(false);
  };
  const cancelar = useMutacao(
    () => api.post(`/despesas-compartilhadas/${cancelando!.id}/cancelar`),
    {
      sucesso: 'Despesa cancelada e pagamento estornado.',
      naJanela: !!cancelando,
      aoConcluir: () => setCancelando(null),
    },
  );
  const enviar = f.handleSubmit((d) => {
    if (!d.descricao.trim()) return setErro('Descreva a despesa.');
    if (!d.valorTotal) return setErro('Informe o valor.');
    setErro(null);
    criar.mutate({ ...d, valorTotal: d.valorTotal });
  });
  return (
    <>
      <Alerta tom="neutro">
        Uma despesa que serve a vários produtos (frete de feira, embalagens, estacionamento…) é paga{' '}
        <strong>uma vez</strong> e depois distribuída entre eles só para o cálculo de custo.
      </Alerta>
      <div className="mt-4">
        <Cartao
          titulo="Despesas compartilhadas"
          acao={
            <Botao
              variante="primario"
              tamanho="p"
              icone={<Plus className="h-4 w-4" />}
              onClick={() => setNova(true)}
            >
              Nova despesa
            </Botao>
          }
          semPadding
        >
          <div className="p-2">
            <Tabela<DespesaCompartilhada>
              legenda="Despesas compartilhadas"
              linhas={data}
              carregando={isLoading}
              chave={(d) => d.id}
              vazio={<EstadoVazio titulo="Nenhuma despesa compartilhada" />}
              colunas={[
                { titulo: 'Data', celula: (d) => formatarData(d.data) },
                {
                  titulo: 'Descrição',
                  celula: (d) => (
                    <div>
                      <span className="font-medium">{d.descricao}</span>
                      {d.rateios && d.rateios.length > 0 && (
                        <div className="text-xs text-tinta-500">
                          {d.rateios
                            .map(
                              (r) => `${r.destinoNome ?? r.destinoId}: ${formatarMoeda(r.valor)}`,
                            )
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  titulo: 'Valor',
                  alinhar: 'direita',
                  celula: (d) => (
                    <span className="numero font-medium">{formatarMoeda(d.valorTotal)}</span>
                  ),
                },
                {
                  titulo: 'Situação',
                  celula: (d) => (
                    <Chip
                      tom={
                        d.status === 'rateada'
                          ? 'folha'
                          : d.status === 'aberta'
                            ? 'ambar'
                            : 'neutro'
                      }
                    >
                      {d.status === 'rateada'
                        ? 'Rateada'
                        : d.status === 'aberta'
                          ? 'Aguardando rateio'
                          : 'Cancelada'}
                    </Chip>
                  ),
                },
                {
                  titulo: '',
                  alinhar: 'direita',
                  celula: (d) => (
                    <span className="flex justify-end gap-1">
                      {d.status === 'aberta' && (
                        <Botao tamanho="p" onClick={() => setRatear(d)}>
                          Ratear
                        </Botao>
                      )}
                      {d.status !== 'cancelada' && (
                        <Botao tamanho="p" variante="fantasma" onClick={() => setCancelando(d)}>
                          Cancelar
                        </Botao>
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </Cartao>
      </div>
      <Modal
        aberto={nova}
        aoFechar={fecharNova}
        titulo="Nova despesa compartilhada"
        erro={erro ?? criar.error}
        rodape={
          <>
            <Botao onClick={fecharNova}>Cancelar</Botao>
            <Botao variante="primario" carregando={criar.isPending} onClick={enviar}>
              Registrar
            </Botao>
          </>
        }
      >
        <form className="space-y-4" onSubmit={enviar}>
          <Campo rotulo="Descrição" obrigatorio>
            {({ id }) => <Entrada id={id} autoFocus {...f.register('descricao')} />}
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Valor total" obrigatorio>
              {({ id }) => (
                <Controller
                  control={f.control}
                  name="valorTotal"
                  render={({ field }) => (
                    <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                  )}
                />
              )}
            </Campo>
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
            <Campo rotulo="Tipo">
              {({ id }) => (
                <Selecao id={id} {...f.register('tipo')}>
                  {TIPOS_DESPESA_COMPARTILHADA.map((t) => (
                    <option key={t} value={t}>
                      {t[0]!.toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Pagamento">
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
          <Campo rotulo="Como ratear">
            {({ id }) => (
              <Selecao id={id} {...f.register('criterio')}>
                <option value="manual">Valores informados por mim</option>
                <option value="por_producao">Proporcional à quantidade produzida</option>
                <option value="por_valor">Proporcional ao valor</option>
              </Selecao>
            )}
          </Campo>
          <button type="submit" className="hidden" />
        </form>
      </Modal>
      <ModalRateio despesa={ratear} aoFechar={() => setRatear(null)} />
      <Confirmar
        aberto={!!cancelando}
        aoFechar={() => setCancelando(null)}
        aoConfirmar={() => cancelar.mutate(undefined)}
        carregando={cancelar.isPending}
        erro={cancelar.error}
        titulo="Cancelar despesa?"
        rotuloConfirmar="Cancelar despesa"
        mensagem={
          <p>
            O pagamento de “{cancelando?.descricao}” será estornado. Só é possível se ela ainda não
            compõe o custo de uma produção.
          </p>
        }
      />
    </>
  );
}

/* --------------------------------- página --------------------------------- */

export default function PaginaFinanceiro() {
  const [periodo, setPeriodo] = useState<Periodo>(intervaloPredefinido('mes'));
  const [aba, setAba] = useState<'resumo' | 'extrato' | 'caixa' | 'compartilhadas'>('resumo');
  return (
    <>
      <PaginaCabecalho
        titulo="Financeiro"
        subtitulo="Resultado e caixa, sem contar a mesma coisa duas vezes."
        acoes={
          aba !== 'compartilhadas' && <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} />
        }
      />
      <Abas
        ativa={aba}
        aoMudar={setAba}
        abas={[
          { id: 'resumo', rotulo: 'Resumo' },
          { id: 'extrato', rotulo: 'Extrato' },
          { id: 'caixa', rotulo: 'Caixa' },
          { id: 'compartilhadas', rotulo: 'Despesas compartilhadas' },
        ]}
      />
      {aba === 'resumo' && <Resumo periodo={periodo} />}
      {aba === 'extrato' && <Extrato periodo={periodo} />}
      {aba === 'caixa' && <Caixa periodo={periodo} />}
      {aba === 'compartilhadas' && <Compartilhadas />}
      <p className="nao-imprimir mt-6 text-xs text-tinta-400">
        Precisa de mais detalhe?{' '}
        <Link className="underline" to="/relatorios">
          Veja os relatórios
        </Link>
        .
      </p>
    </>
  );
}
