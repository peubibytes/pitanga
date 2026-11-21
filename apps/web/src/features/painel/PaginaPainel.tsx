import {
  AlertTriangle,
  DatabaseBackup,
  HandCoins,
  Package,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatarData, formatarMoeda, formatarQuantidade, type Painel } from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import {
  Alerta,
  Botao,
  Cartao,
  EstadoVazio,
  ErroDeCarregamento,
  Esqueleto,
  Indicador,
} from '../../components/ui';
import { useDados } from '../../lib/query';

type Periodo = 'hoje' | 'semana' | 'mes' | 'ano';
const rotulos: Record<Periodo, string> = {
  hoje: 'Hoje',
  semana: 'Últimos 7 dias',
  mes: 'Este mês',
  ano: 'Este ano',
};

const PITANGA = 'rgb(200 55 45)';
const FOLHA = 'rgb(77 150 96)';
const AMBAR = 'rgb(214 160 60)';

export default function PaginaPainel() {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const { data, isLoading, isError, error, refetch } = useDados<Painel>(
    ['painel', periodo],
    '/painel',
    { periodo },
  );

  if (isLoading)
    return (
      <>
        <PaginaCabecalho titulo="Painel" />
        <Esqueleto linhas={6} />
      </>
    );
  if (isError || !data) return <ErroDeCarregamento erro={error} aoTentar={() => void refetch()} />;
  const p = data;
  const r = p.resumo;
  const semBackup = p.diasDesdeBackup === null || p.diasDesdeBackup > 7;
  const prejuizo = r.lucroPrejuizo < 0;

  const rosca = [
    { nome: 'Custo dos produtos', valor: r.custoProdutosVendidos, cor: AMBAR },
    { nome: 'Despesas', valor: r.despesasPagas, cor: PITANGA },
    { nome: 'Lucro', valor: Math.max(0, r.lucroPrejuizo), cor: FOLHA },
  ].filter((x) => x.valor > 0);

  return (
    <>
      <PaginaCabecalho
        titulo="Painel"
        subtitulo={`${formatarData(p.periodo.de)} a ${formatarData(p.periodo.ate)}`}
        acoes={
          <div
            role="group"
            aria-label="Período do painel"
            className="flex rounded-campo border border-creme-300 bg-white p-0.5"
          >
            {(Object.keys(rotulos) as Periodo[]).map((k) => (
              <button
                key={k}
                aria-pressed={periodo === k}
                onClick={() => setPeriodo(k)}
                className={`rounded-[8px] px-3 py-1.5 text-sm font-medium ${periodo === k ? 'bg-pitanga-600 text-white' : 'text-tinta-600 hover:bg-creme-200'}`}
              >
                {rotulos[k]}
              </button>
            ))}
          </div>
        }
      />
      <div className="space-y-6">
        {semBackup && (
          <Alerta
            tom="pitanga"
            titulo={
              p.diasDesdeBackup === null
                ? 'Ainda não há backup'
                : `Último backup há ${p.diasDesdeBackup} dias`
            }
            acao={
              <Link to="/backup">
                <Botao
                  tamanho="p"
                  variante="primario"
                  icone={<DatabaseBackup className="h-4 w-4" />}
                >
                  Fazer backup
                </Botao>
              </Link>
            }
          >
            Faça uma cópia de segurança para não perder seus dados se algo acontecer com o
            computador.
          </Alerta>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Indicador
            rotulo="Vendas no período"
            valor={p.vendasNoPeriodo}
            detalhe={
              p.vendasPendentes > 0
                ? `${p.vendasPendentes} pendente${p.vendasPendentes > 1 ? 's' : ''} de pagamento`
                : 'Nenhuma pendente'
            }
            icone={<TrendingUp className="h-4 w-4" />}
          />
          <Indicador
            rotulo="Faturamento"
            valor={formatarMoeda(r.faturamento)}
            detalhe={`Recebido: ${formatarMoeda(r.recebido)}`}
            tom="folha"
          />
          <Indicador
            rotulo={prejuizo ? 'Prejuízo' : 'Lucro'}
            valor={formatarMoeda(r.lucroPrejuizo)}
            tom={prejuizo ? 'pitanga' : 'folha'}
            detalhe="Já descontados custos e despesas"
          />
          <Indicador
            rotulo="Saldo de caixa"
            valor={formatarMoeda(r.saldoCaixa)}
            tom={r.saldoCaixa < 0 ? 'pitanga' : 'neutro'}
            detalhe={
              r.saldoCaixa < 0 && !prejuizo ? 'Dinheiro parado em estoque' : 'Dinheiro disponível'
            }
            icone={<Wallet className="h-4 w-4" />}
          />
          <Indicador
            rotulo="A receber"
            valor={formatarMoeda(r.contasAReceber)}
            tom={r.contasAReceber > 0 ? 'ambar' : 'neutro'}
            detalhe="Vendas não quitadas"
            icone={<HandCoins className="h-4 w-4" />}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Cartao titulo="Faturamento por dia" className="xl:col-span-2">
            {p.faturamentoPorDia.every((d) => d.valor === 0) ? (
              <EstadoVazio
                titulo="Sem vendas no período"
                descricao="Quando houver vendas, o gráfico aparece aqui."
                acao={
                  <Link to="/vendas/nova">
                    <Botao variante="primario">Registrar venda</Botao>
                  </Link>
                }
              />
            ) : (
              <div
                className="h-64"
                role="img"
                aria-label="Gráfico de barras do faturamento por dia"
              >
                <ResponsiveContainer>
                  <BarChart
                    data={p.faturamentoPorDia.map((d) => ({
                      dia: formatarData(d.data).slice(0, 5),
                      valor: d.valor / 100,
                    }))}
                    margin={{ left: 4, right: 8, top: 8 }}
                  >
                    <CartesianGrid
                      stroke="rgb(226 211 191)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      width={60}
                      tickFormatter={(v: number) => `R$ ${Math.round(v)}`}
                    />
                    <Tooltip
                      formatter={(v) => [formatarMoeda(Math.round(Number(v) * 100)), 'Faturamento']}
                    />
                    <Bar dataKey="valor" fill={PITANGA} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Cartao>

          <Cartao titulo="Para onde vai o faturamento">
            {rosca.length === 0 ? (
              <EstadoVazio titulo="Sem dados ainda" />
            ) : (
              <>
                <div
                  className="h-48"
                  role="img"
                  aria-label="Gráfico de rosca: custo dos produtos, despesas e lucro"
                >
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={rosca}
                        dataKey="valor"
                        nameKey="nome"
                        innerRadius={50}
                        outerRadius={78}
                        paddingAngle={2}
                      >
                        {rosca.map((x) => (
                          <Cell key={x.nome} fill={x.cor} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatarMoeda(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {rosca.map((x) => (
                    <li key={x.nome} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: x.cor }} />
                        {x.nome}
                      </span>
                      <span className="numero">{formatarMoeda(x.valor)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Cartao>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao titulo="Produtos mais vendidos">
            {p.produtosMaisVendidos.length === 0 ? (
              <EstadoVazio titulo="Nenhuma venda no período" />
            ) : (
              <ol className="space-y-3">
                {p.produtosMaisVendidos.map((x, i) => {
                  const maximo = p.produtosMaisVendidos[0]!.quantidade;
                  return (
                    <li key={x.produtoId}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <Link
                          to={`/produtos/${x.produtoId}`}
                          className="font-medium hover:text-pitanga-700"
                        >
                          <span className="mr-2 text-tinta-400">{i + 1}.</span>
                          {x.nome}
                        </Link>
                        <span className="numero text-tinta-600">
                          {x.quantidade} un. · {formatarMoeda(x.total)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-creme-200">
                        <div
                          className="h-2 rounded-full bg-pitanga-500"
                          style={{ width: `${(x.quantidade / maximo) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Cartao>

          <Cartao
            titulo="Materiais com estoque baixo"
            acao={
              <Link to="/materiais" className="text-sm text-pitanga-700 hover:underline">
                Ver materiais
              </Link>
            }
          >
            {p.materiaisEstoqueBaixo.length === 0 ? (
              <EstadoVazio
                titulo="Estoque em dia"
                descricao="Nenhum material chegou ao mínimo definido."
                icone={<Package className="h-6 w-6" />}
              />
            ) : (
              <ul className="divide-y divide-creme-200">
                {p.materiaisEstoqueBaixo.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link
                      to={`/materiais/${m.id}`}
                      className="flex items-center gap-2 font-medium hover:text-pitanga-700"
                    >
                      <AlertTriangle className="h-4 w-4 text-pitanga-600" />
                      {m.nome}
                    </Link>
                    <span className="numero text-pitanga-700">
                      {formatarQuantidade(m.estoqueAtual, m.unidade)}{' '}
                      <span className="text-tinta-400">
                        / mín. {formatarQuantidade(m.estoqueMinimo, m.unidade)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
