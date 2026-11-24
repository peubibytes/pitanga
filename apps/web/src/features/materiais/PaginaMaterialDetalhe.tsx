import { Pencil, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Controller, useForm } from 'react-hook-form';
import {
  ajusteEstoqueSchema,
  formatarData,
  formatarMicro,
  formatarMoeda,
  formatarQuantidade,
  hojeISO,
  type HistoricoCustoMaterial,
  type Material,
  type MovimentoMaterial,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import {
  Abas,
  Alerta,
  AreaDeTexto,
  Botao,
  Campo,
  CampoNumero,
  Cartao,
  Chip,
  Dado,
  ErroDeCarregamento,
  EstadoVazio,
  Esqueleto,
  Indicador,
  Modal,
  PaginacaoControles,
  Selecao,
  Tabela,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useDados, useItem, useLista, useMutacao } from '../../lib/query';
import { ModalMaterial } from './PaginaMateriais';

const rotuloTipo: Record<MovimentoMaterial['tipo'], string> = {
  compra: 'Compra',
  consumo: 'Consumo na produção',
  ajuste: 'Ajuste manual',
  estorno: 'Estorno',
};

function ModalAjuste({
  aberto,
  aoFechar,
  material,
}: {
  aberto: boolean;
  aoFechar: () => void;
  material: Material;
}) {
  const f = useForm<{
    tipo: 'entrada' | 'saida';
    quantidade: number | null;
    custoUnitario: number | null;
    justificativa: string;
  }>({
    values: { tipo: 'saida', quantidade: null, custoUnitario: null, justificativa: '' },
  });
  useAvisoDeSaida(aberto && f.formState.isDirty);
  const tipo = f.watch('tipo');
  const salvar = useMutacao(
    (d: {
      tipo: 'entrada' | 'saida';
      quantidade: number;
      custoUnitario?: number;
      justificativa: string;
    }) =>
      api.post<Material>(`/materiais/${material.id}/ajuste`, {
        ...d,
        unidade: material.unidade,
        data: hojeISO(),
      }),
    {
      sucesso: 'Ajuste registrado.',
      naJanela: aberto,
      aoConcluir: () => fechar(),
    },
  );
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const fechar = () => {
    f.reset();
    setErroLocal(null);
    aoFechar();
  };
  const enviar = f.handleSubmit((d) => {
    const parse = ajusteEstoqueSchema.safeParse({
      tipo: d.tipo,
      quantidade: d.quantidade ?? 0,
      custoUnitario: d.custoUnitario ?? undefined,
      justificativa: d.justificativa,
    });
    if (!parse.success) return setErroLocal(parse.error.issues[0]?.message ?? 'Confira os dados.');
    setErroLocal(null);
    salvar.mutate({
      tipo: d.tipo,
      quantidade: d.quantidade!,
      custoUnitario: d.custoUnitario ?? undefined,
      justificativa: d.justificativa,
    });
  });
  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo={`Ajustar estoque — ${material.nome}`}
      erro={erroLocal ?? salvar.error}
      rodape={
        <>
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvar.isPending} onClick={enviar}>
            Registrar ajuste
          </Botao>
        </>
      }
    >
      <form className="space-y-4" onSubmit={enviar}>
        <Alerta tom="ambar">
          Use o ajuste para perdas, sobras e correções de contagem. Ele fica registrado com a
          justificativa e aparece no financeiro.
        </Alerta>
        <p className="text-sm text-tinta-500">
          Estoque atual:{' '}
          <strong className="numero text-tinta-900">
            {formatarQuantidade(material.estoqueAtual, material.unidade)}
          </strong>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="O que aconteceu?">
            {({ id }) => (
              <Selecao id={id} {...f.register('tipo')}>
                <option value="saida">Saída (perda, quebra, uso)</option>
                <option value="entrada">Entrada (sobra, achado)</option>
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Quantidade" obrigatorio>
            {({ id }) => (
              <Controller
                control={f.control}
                name="quantidade"
                render={({ field }) => (
                  <CampoNumero
                    id={id}
                    escala={1000}
                    sufixo={material.unidade}
                    valor={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
          </Campo>
        </div>
        {tipo === 'entrada' && material.custoMedio === 0 && (
          <Campo
            rotulo="Custo por unidade"
            dica="Este material ainda não tem custo médio."
            obrigatorio
          >
            {({ id }) => (
              <Controller
                control={f.control}
                name="custoUnitario"
                render={({ field }) => (
                  <CampoNumero
                    id={id}
                    escala={1_000_000}
                    sufixo="R$"
                    valor={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
          </Campo>
        )}
        <Campo rotulo="Justificativa" obrigatorio dica="Obrigatória — fica no histórico.">
          {({ id }) => <AreaDeTexto id={id} {...f.register('justificativa')} />}
        </Campo>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export default function PaginaMaterialDetalhe() {
  const id = Number(useParams().id);
  const [aba, setAba] = useState<'movimentos' | 'custos' | 'dados'>('movimentos');
  const [editar, setEditar] = useState(false);
  const [ajustar, setAjustar] = useState(false);
  const [pagina, setPagina] = useState(1);
  const material = useItem<Material>('material', `/materiais/${id}`, id);
  const movimentos = useLista<MovimentoMaterial>(
    'material-movimentos',
    `/materiais/${id}/movimentos`,
    { pagina, porPagina: 15 },
    aba === 'movimentos',
  );
  const historico = useDados<HistoricoCustoMaterial[]>(
    ['material-custos', id],
    `/materiais/${id}/compras`,
  );

  if (material.isLoading) return <Esqueleto linhas={4} />;
  if (material.isError)
    return <ErroDeCarregamento erro={material.error} aoTentar={() => void material.refetch()} />;
  const m = material.data!;
  const serie = (historico.data ?? []).map((h) => ({
    data: formatarData(h.data),
    custo: h.custoUnitarioFinal / 1_000_000,
  }));

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: '/materiais', rotulo: 'Materiais' }}
        titulo={m.nome}
        subtitulo={`${m.categoriaNome ?? 'Sem categoria'} · controlado em ${m.unidade}`}
        acoes={
          <>
            <Botao
              icone={<SlidersHorizontal className="h-4 w-4" />}
              onClick={() => setAjustar(true)}
            >
              Ajustar estoque
            </Botao>
            <Botao icone={<Pencil className="h-4 w-4" />} onClick={() => setEditar(true)}>
              Editar
            </Botao>
            <Link to="/compras/nova">
              <Botao variante="primario">Registrar compra</Botao>
            </Link>
          </>
        }
      />
      {m.estoqueBaixo && (
        <div className="mb-4">
          <Alerta tom="pitanga" titulo="Estoque baixo">
            Restam {formatarQuantidade(m.estoqueAtual, m.unidade)}; o mínimo definido é{' '}
            {formatarQuantidade(m.estoqueMinimo ?? 0, m.unidade)}.
          </Alerta>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador
          rotulo="Em estoque"
          valor={formatarQuantidade(m.estoqueAtual, m.unidade)}
          tom={m.estoqueBaixo ? 'pitanga' : 'neutro'}
        />
        <Indicador
          rotulo="Custo médio"
          valor={m.custoMedio ? `${formatarMicro(m.custoMedio)}/${m.unidade}` : '—'}
          detalhe="Média ponderada das compras"
        />
        <Indicador
          rotulo="Valor em estoque"
          valor={formatarMoeda(
            Math.round((Math.max(0, m.estoqueAtual) * m.custoMedio) / 10_000_000),
          )}
        />
      </div>
      <Abas
        ativa={aba}
        aoMudar={setAba}
        abas={[
          { id: 'movimentos', rotulo: 'Movimentos' },
          { id: 'custos', rotulo: 'Compras e custo' },
          { id: 'dados', rotulo: 'Dados' },
        ]}
      />
      {aba === 'movimentos' && (
        <Cartao semPadding>
          <div className="p-2">
            <Tabela<MovimentoMaterial>
              legenda="Movimentos do material"
              linhas={movimentos.data?.itens}
              carregando={movimentos.isLoading}
              chave={(x) => x.id}
              vazio={
                <EstadoVazio
                  titulo="Sem movimentos"
                  descricao="Compras, consumos e ajustes aparecem aqui."
                />
              }
              colunas={[
                { titulo: 'Data', celula: (x) => formatarData(x.data) },
                {
                  titulo: 'Tipo',
                  celula: (x) => (
                    <Chip tom={x.quantidade > 0 ? 'folha' : 'neutro'}>{rotuloTipo[x.tipo]}</Chip>
                  ),
                },
                {
                  titulo: 'Quantidade',
                  alinhar: 'direita',
                  celula: (x) => (
                    <span
                      className={`numero ${x.quantidade < 0 ? 'text-pitanga-700' : 'text-folha-700'}`}
                    >
                      {x.quantidade > 0 ? '+' : ''}
                      {formatarQuantidade(x.quantidade, m.unidade)}
                    </span>
                  ),
                },
                {
                  titulo: 'Valor',
                  alinhar: 'direita',
                  ocultarEmPequeno: true,
                  celula: (x) => <span className="numero">{formatarMoeda(x.custoTotal)}</span>,
                },
                {
                  titulo: 'Saldo',
                  alinhar: 'direita',
                  celula: (x) => (
                    <span className="numero">{formatarQuantidade(x.saldoApos, m.unidade)}</span>
                  ),
                },
                {
                  titulo: 'Origem / motivo',
                  ocultarEmPequeno: true,
                  celula: (x) =>
                    x.referenciaTipo === 'compra' && x.referenciaId ? (
                      <Link
                        className="text-pitanga-700 hover:underline"
                        to={`/compras/${x.referenciaId}`}
                      >
                        Compra #{x.referenciaId}
                      </Link>
                    ) : x.referenciaTipo === 'producao' && x.referenciaId ? (
                      <Link
                        className="text-pitanga-700 hover:underline"
                        to={`/producao/${x.referenciaId}`}
                      >
                        Produção #{x.referenciaId}
                      </Link>
                    ) : (
                      <span className="text-tinta-500">{x.justificativa ?? '—'}</span>
                    ),
                },
              ]}
            />
            <PaginacaoControles paginacao={movimentos.data?.paginacao} aoMudar={setPagina} />
          </div>
        </Cartao>
      )}
      {aba === 'custos' && (
        <div className="space-y-4">
          <Cartao titulo="Evolução do custo unitário">
            {serie.length < 2 ? (
              <EstadoVazio
                titulo="Poucas compras para um gráfico"
                descricao="Com duas ou mais compras mostramos como o custo por unidade evoluiu."
              />
            ) : (
              <div
                className="h-64"
                role="img"
                aria-label="Gráfico da evolução do custo unitário por compra"
              >
                <ResponsiveContainer>
                  <LineChart data={serie} margin={{ left: 8, right: 16, top: 8 }}>
                    <CartesianGrid stroke="rgb(226 211 191)" strokeDasharray="3 3" />
                    <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v: number) => `R$ ${v.toFixed(3).replace('.', ',')}`}
                      width={80}
                    />
                    <Tooltip
                      formatter={(v) => [
                        `R$ ${Number(v).toFixed(6).replace('.', ',')}/${m.unidade}`,
                        'Custo unitário',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="custo"
                      stroke="rgb(200 55 45)"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Cartao>
          <Cartao titulo="Compras deste material" semPadding>
            <div className="p-2">
              <Tabela<HistoricoCustoMaterial>
                legenda="Compras do material"
                linhas={[...(historico.data ?? [])].reverse()}
                carregando={historico.isLoading}
                chave={(h) => h.compraId}
                vazio={<EstadoVazio titulo="Nenhuma compra registrada" />}
                colunas={[
                  { titulo: 'Data', celula: (h) => formatarData(h.data) },
                  {
                    titulo: 'Compra',
                    celula: (h) => (
                      <Link
                        className="text-pitanga-700 hover:underline"
                        to={`/compras/${h.compraId}`}
                      >
                        #{h.compraId}
                      </Link>
                    ),
                  },
                  {
                    titulo: 'Fornecedor',
                    celula: (h) => h.fornecedorNome ?? '—',
                    ocultarEmPequeno: true,
                  },
                  {
                    titulo: 'Quantidade',
                    alinhar: 'direita',
                    celula: (h) => (
                      <span className="numero">
                        {formatarQuantidade(h.quantidadeBase, m.unidade)}
                      </span>
                    ),
                  },
                  {
                    titulo: 'Custo unitário final',
                    alinhar: 'direita',
                    celula: (h) => (
                      <span className="numero">{formatarMicro(h.custoUnitarioFinal)}</span>
                    ),
                  },
                  {
                    titulo: 'Total pago',
                    alinhar: 'direita',
                    celula: (h) => <span className="numero">{formatarMoeda(h.valorTotal)}</span>,
                  },
                ]}
              />
            </div>
          </Cartao>
        </div>
      )}
      {aba === 'dados' && (
        <Cartao>
          <dl className="grid gap-5 sm:grid-cols-3">
            <Dado rotulo="Categoria">{m.categoriaNome ?? '—'}</Dado>
            <Dado rotulo="Unidade de controle">{m.unidade}</Dado>
            <Dado rotulo="Estoque mínimo">
              {m.estoqueMinimo === null
                ? 'Sem aviso'
                : formatarQuantidade(m.estoqueMinimo, m.unidade)}
            </Dado>
            <Dado rotulo="Situação">
              <Chip tom={m.ativo ? 'folha' : 'neutro'}>{m.ativo ? 'Ativo' : 'Inativo'}</Chip>
            </Dado>
          </dl>
        </Cartao>
      )}
      <ModalMaterial aberto={editar} aoFechar={() => setEditar(false)} material={m} />
      <ModalAjuste aberto={ajustar} aoFechar={() => setAjustar(false)} material={m} />
    </>
  );
}
