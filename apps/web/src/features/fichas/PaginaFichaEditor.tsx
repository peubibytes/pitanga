import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { calcularCustoFicha } from '@pitanga/core';
import {
  MODOS_MAO_OBRA,
  TIPOS_EXTRA_FICHA,
  fichaSchema,
  formatarMicro,
  formatarMoeda,
  formatarQuantidade,
  mulDiv,
  type Ficha,
  type FichaEntrada,
  type Configuracoes,
  type CustoFichaResposta,
  type ModoMaoObra,
  type Produto,
  type TipoExtraFicha,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorMaterial, useMateriais } from '../../components/selecionadores';
import {
  Alerta,
  AreaDeTexto,
  Botao,
  Campo,
  CampoMoeda,
  CampoNumero,
  Cartao,
  Entrada,
  ErroDeCarregamento,
  Esqueleto,
  Selecao,
} from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useDados, useItem, useMutacao } from '../../lib/query';

interface FichaForm {
  rendimento: number | null;
  maoObraModo: ModoMaoObra;
  maoObraValorHora: number | null;
  maoObraMinutos: number | null;
  maoObraValorFixo: number | null;
  observacao: string;
  itens: { materialId: number | null; quantidade: number | null }[];
  extras: { descricao: string; valor: number | null; tipo: TipoExtraFicha; porUnidade: boolean }[];
}

const rotuloModo: Record<ModoMaoObra, string> = {
  nenhuma: 'Sem mão de obra',
  hora: 'Por hora trabalhada',
  fixo: 'Valor fixo por lote',
};

export default function PaginaFichaEditor() {
  const produtoId = Number(useParams().id);
  const navegar = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const produto = useItem<Produto>('produto', `/produtos/${produtoId}`, produtoId);
  const config = useDados<Configuracoes>(['configuracoes'], '/configuracoes');
  const materiais = useMateriais();
  const porId = useMemo(
    () => new Map((materiais.data?.itens ?? []).map((m) => [m.id, m])),
    [materiais.data],
  );
  const ficha = useDados<Ficha | null>(
    ['produto-ficha-ativa', produtoId],
    `/produtos/${produtoId}/ficha-ativa`,
  );
  const existente = ficha.data ?? undefined;
  // 404 = ainda não há ficha: é o caminho normal para um produto novo.
  const semFicha =
    (ficha.error instanceof ApiError && ficha.error.status === 404) ||
    (ficha.isSuccess && !ficha.data);
  const custoServidor = useDados<CustoFichaResposta>(
    ['ficha-custo', existente?.id],
    existente ? `/fichas/${existente.id}/custo` : null,
  );
  const rateiosPendentes = custoServidor.data?.rateiosPendentes ?? 0;

  const f = useForm<FichaForm>({
    defaultValues: {
      rendimento: 1,
      maoObraModo: 'nenhuma',
      maoObraValorHora: null,
      maoObraMinutos: null,
      maoObraValorFixo: null,
      observacao: '',
      itens: [{ materialId: null, quantidade: null }],
      extras: [],
    },
  });
  useAvisoDeSaida(f.formState.isDirty);
  const itens = useFieldArray({ control: f.control, name: 'itens' });
  const extras = useFieldArray({ control: f.control, name: 'extras' });

  useEffect(() => {
    if (existente) {
      f.reset({
        rendimento: existente.rendimento,
        maoObraModo: existente.maoObraModo,
        maoObraValorHora: existente.maoObraValorHora,
        maoObraMinutos: existente.maoObraMinutos,
        maoObraValorFixo: existente.maoObraValorFixo,
        observacao: existente.observacao ?? '',
        itens: existente.itens.length
          ? existente.itens.map((i) => ({ materialId: i.materialId, quantidade: i.quantidade }))
          : [{ materialId: null, quantidade: null }],
        extras: existente.extras.map((e) => ({
          descricao: e.descricao,
          valor: e.valor,
          tipo: e.tipo,
          porUnidade: e.porUnidade,
        })),
      });
    } else if (semFicha && config.data?.valor_hora_padrao) {
      f.setValue('maoObraValorHora', Number(config.data.valor_hora_padrao));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existente?.id, semFicha, config.data?.valor_hora_padrao]);

  const v = useWatch({ control: f.control });
  const modo = v.maoObraModo ?? 'nenhuma';

  // Custo em tempo real, com o custo médio vigente de cada material (mesmas fórmulas do servidor).
  const custo = useMemo(() => {
    const linhas = (v.itens ?? []).map((i) => ({
      materialId: i?.materialId ?? 0,
      quantidade: i?.quantidade ?? 0,
      custoMedio: porId.get(i?.materialId ?? 0)?.custoMedio ?? 0,
    }));
    return calcularCustoFicha(
      {
        rendimento: v.rendimento || 1,
        maoObraModo: modo,
        maoObraValorHora: v.maoObraValorHora,
        maoObraMinutos: v.maoObraMinutos,
        maoObraValorFixo: v.maoObraValorFixo,
        itens: linhas,
        extras: (v.extras ?? []).map((e) => ({
          valor: e?.valor ?? 0,
          porUnidade: e?.porUnidade ?? true,
        })),
      },
      { rateiosCentavos: rateiosPendentes },
    );
  }, [v, modo, porId, rateiosPendentes]);

  const salvar = useMutacao(
    (corpo: FichaEntrada) =>
      existente
        ? api.put<Ficha>(`/fichas/${existente.id}`, corpo)
        : api.post<Ficha>(`/produtos/${produtoId}/fichas`, corpo),
    {
      sucesso: (fi) =>
        fi.versao > 1 ? `Ficha salva (versão ${fi.versao}).` : 'Ficha técnica salva.',
      aoConcluir: () => navegar(`/produtos/${produtoId}`),
    },
  );

  const enviar = f.handleSubmit((d) => {
    setErro(null);
    const itensValidos = d.itens.filter((i) => i.materialId);
    if (itensValidos.length === 0) return setErro('Inclua ao menos um material na ficha.');
    if (itensValidos.some((i) => !i.quantidade))
      return setErro('Informe a quantidade de cada material.');
    const corpo: FichaEntrada = {
      rendimento: d.rendimento ?? 1,
      maoObraModo: d.maoObraModo,
      maoObraValorHora: d.maoObraModo === 'hora' ? d.maoObraValorHora : null,
      maoObraMinutos: d.maoObraModo === 'hora' ? d.maoObraMinutos : null,
      maoObraValorFixo: d.maoObraModo === 'fixo' ? d.maoObraValorFixo : null,
      observacao: d.observacao || null,
      itens: itensValidos.map((i) => ({ materialId: i.materialId!, quantidade: i.quantidade! })),
      extras: d.extras
        .filter((e) => e.descricao.trim())
        .map((e) => ({
          descricao: e.descricao,
          valor: e.valor ?? 0,
          tipo: e.tipo,
          porUnidade: e.porUnidade,
        })),
    };
    const r = fichaSchema.safeParse(corpo);
    if (!r.success) return setErro(r.error.issues[0]?.message ?? 'Confira os dados da ficha.');
    salvar.mutate(corpo);
  });

  if (produto.isLoading || (ficha.isLoading && !semFicha)) return <Esqueleto linhas={5} />;
  if (produto.isError) return <ErroDeCarregamento erro={produto.error} />;
  if (ficha.isError && !semFicha)
    return <ErroDeCarregamento erro={ficha.error} aoTentar={() => void ficha.refetch()} />;
  const p = produto.data!;
  const rendimento = v.rendimento || 1;

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: `/produtos/${produtoId}`, rotulo: p.nome }}
        titulo={existente ? `Ficha técnica — versão ${existente.versao}` : 'Nova ficha técnica'}
        subtitulo={`${p.nome}. Informe o que entra em ${rendimento === 1 ? 'uma peça' : `${rendimento} peças`}; o custo é calculado enquanto você digita.`}
      />
      {existente && (
        <div className="mb-4">
          <Alerta tom="neutro">
            Fichas já usadas em produção nunca são alteradas: ao salvar, criamos a versão seguinte e
            o custo dos lotes antigos continua como foi.
          </Alerta>
        </div>
      )}
      <form onSubmit={enviar} className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {erro && <Alerta tom="pitanga">{erro}</Alerta>}
          <Cartao titulo="Rendimento">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo
                rotulo="Esta ficha produz quantas peças?"
                dica="As quantidades abaixo valem para este lote."
                obrigatorio
                className="sm:col-span-2"
              >
                {({ id }) => (
                  <Controller
                    control={f.control}
                    name="rendimento"
                    render={({ field }) => (
                      <CampoNumero
                        id={id}
                        escala={1}
                        sufixo="peças"
                        valor={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                )}
              </Campo>
            </div>
          </Cartao>

          <Cartao
            titulo="Materiais"
            acao={
              <Botao
                tamanho="p"
                icone={<Plus className="h-4 w-4" />}
                onClick={() => itens.append({ materialId: null, quantidade: null })}
              >
                Adicionar material
              </Botao>
            }
          >
            <div className="space-y-3">
              {itens.fields.map((campo, idx) => {
                const linha = v.itens?.[idx];
                const m = linha?.materialId ? porId.get(linha.materialId) : undefined;
                const custoLinha =
                  m && linha?.quantidade ? mulDiv(linha.quantidade, m.custoMedio, 1000) : 0;
                return (
                  <div key={campo.id} className="grid items-end gap-3 md:grid-cols-12">
                    <Campo rotulo={idx === 0 ? 'Material' : undefined} className="md:col-span-5">
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`itens.${idx}.materialId`}
                          render={({ field }) => (
                            <SeletorMaterial
                              id={id}
                              valor={field.value}
                              onChange={field.onChange}
                              excluir={(v.itens ?? []).map((i) => i?.materialId ?? 0)}
                            />
                          )}
                        />
                      )}
                    </Campo>
                    <Campo rotulo={idx === 0 ? 'Quantidade' : undefined} className="md:col-span-3">
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`itens.${idx}.quantidade`}
                          render={({ field }) => (
                            <CampoNumero
                              id={id}
                              escala={1000}
                              sufixo={m?.unidade}
                              valor={field.value}
                              onChange={field.onChange}
                            />
                          )}
                        />
                      )}
                    </Campo>
                    <div className="numero pb-2 text-right text-sm md:col-span-3">
                      {m && (
                        <>
                          <span className="block text-tinta-700">{formatarMicro(custoLinha)}</span>
                          <span className="text-xs text-tinta-400">
                            estoque {formatarQuantidade(m.estoqueAtual, m.unidade)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="md:col-span-1">
                      <Botao
                        variante="fantasma"
                        disabled={itens.fields.length === 1}
                        onClick={() => itens.remove(idx)}
                        aria-label={`Remover material ${idx + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Botao>
                    </div>
                  </div>
                );
              })}
            </div>
          </Cartao>

          <Cartao titulo="Mão de obra">
            <div className="space-y-4">
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Como contar a mão de obra</legend>
                {MODOS_MAO_OBRA.map((m) => (
                  <label
                    key={m}
                    className={`cursor-pointer rounded-campo border px-4 py-2 text-sm font-medium ${modo === m ? 'border-pitanga-600 bg-pitanga-50 text-pitanga-700' : 'border-creme-300 bg-white text-tinta-600 hover:border-tinta-400'}`}
                  >
                    <input
                      type="radio"
                      value={m}
                      className="sr-only"
                      {...f.register('maoObraModo')}
                    />
                    {rotuloModo[m]}
                  </label>
                ))}
              </fieldset>
              {modo === 'hora' && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Campo rotulo="Valor da sua hora" obrigatorio>
                    {({ id }) => (
                      <Controller
                        control={f.control}
                        name="maoObraValorHora"
                        render={({ field }) => (
                          <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                        )}
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Minutos para fazer o lote" obrigatorio>
                    {({ id }) => (
                      <Controller
                        control={f.control}
                        name="maoObraMinutos"
                        render={({ field }) => (
                          <CampoNumero
                            id={id}
                            escala={1}
                            sufixo="min"
                            valor={field.value}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    )}
                  </Campo>
                </div>
              )}
              {modo === 'fixo' && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Campo rotulo="Valor da mão de obra do lote" obrigatorio>
                    {({ id }) => (
                      <Controller
                        control={f.control}
                        name="maoObraValorFixo"
                        render={({ field }) => (
                          <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                        )}
                      />
                    )}
                  </Campo>
                </div>
              )}
              <p className="text-sm text-tinta-500">
                Seu trabalho entra no preço de venda. No estoque ele só aparece se você registrar o
                pagamento da mão de obra (Configurações).
              </p>
            </div>
          </Cartao>

          <Cartao
            titulo="Outros custos"
            acao={
              <Botao
                tamanho="p"
                icone={<Plus className="h-4 w-4" />}
                onClick={() =>
                  extras.append({ descricao: '', valor: null, tipo: 'embalagem', porUnidade: true })
                }
              >
                Adicionar custo
              </Botao>
            }
          >
            {extras.fields.length === 0 ? (
              <p className="text-sm text-tinta-500">
                Embalagem, transporte, estacionamento… Custos que não são materiais controlados em
                estoque.
              </p>
            ) : (
              <div className="space-y-3">
                {extras.fields.map((campo, idx) => (
                  <div key={campo.id} className="grid items-end gap-3 md:grid-cols-12">
                    <Campo rotulo="Descrição" className="md:col-span-4">
                      {({ id }) => <Entrada id={id} {...f.register(`extras.${idx}.descricao`)} />}
                    </Campo>
                    <Campo rotulo="Tipo" className="md:col-span-2">
                      {({ id }) => (
                        <Selecao id={id} {...f.register(`extras.${idx}.tipo`)}>
                          {TIPOS_EXTRA_FICHA.map((t) => (
                            <option key={t} value={t}>
                              {t[0]!.toUpperCase() + t.slice(1)}
                            </option>
                          ))}
                        </Selecao>
                      )}
                    </Campo>
                    <Campo rotulo="Valor" className="md:col-span-2">
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`extras.${idx}.valor`}
                          render={({ field }) => (
                            <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                          )}
                        />
                      )}
                    </Campo>
                    <Campo rotulo="Vale para" className="md:col-span-3">
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`extras.${idx}.porUnidade`}
                          render={({ field }) => (
                            <Selecao
                              id={id}
                              value={field.value ? 'un' : 'lote'}
                              onChange={(e) => field.onChange(e.target.value === 'un')}
                            >
                              <option value="un">Cada peça</option>
                              <option value="lote">O lote inteiro</option>
                            </Selecao>
                          )}
                        />
                      )}
                    </Campo>
                    <div className="md:col-span-1">
                      <Botao
                        variante="fantasma"
                        onClick={() => extras.remove(idx)}
                        aria-label={`Remover custo ${idx + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Botao>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Cartao>

          <Cartao titulo="Observações">
            <AreaDeTexto
              aria-label="Observações da ficha"
              placeholder="Modo de preparo, tempo de cura, cuidados…"
              {...f.register('observacao')}
            />
          </Cartao>
        </div>

        <aside className="xl:sticky xl:top-0 xl:self-start">
          <Cartao titulo="Custo por peça" className="border-pitanga-200">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-tinta-600">Materiais</dt>
                <dd className="numero">{formatarMicro(custo.unitarioMateriaisMicro)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-tinta-600">Mão de obra</dt>
                <dd className="numero">{formatarMicro(custo.unitarioMaoObraMicro)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-tinta-600">Outros custos</dt>
                <dd className="numero">{formatarMicro(custo.unitarioExtrasMicro)}</dd>
              </div>
              {custo.unitarioRateiosMicro > 0 && (
                <div className="flex justify-between">
                  <dt className="text-tinta-600">Despesas rateadas</dt>
                  <dd className="numero">{formatarMicro(custo.unitarioRateiosMicro)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-creme-300 pt-3">
                <dt className="font-semibold">Custo da peça</dt>
                <dd className="numero font-titulo text-3xl text-pitanga-700">
                  {formatarMoeda(custo.custoUnitarioCentavos)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-tinta-500">
              Custo do lote de {rendimento}:{' '}
              <span className="numero">
                {formatarMoeda(custo.custoUnitarioCentavos * rendimento)}
              </span>
              . Usa o custo médio atual de cada material.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Botao
                type="submit"
                variante="primario"
                icone={<Save className="h-4 w-4" />}
                carregando={salvar.isPending}
              >
                Salvar ficha
              </Botao>
              {existente && (
                <Link to={`/produtos/${produtoId}/precificacao`}>
                  <Botao className="w-full">Ir para a precificação</Botao>
                </Link>
              )}
            </div>
          </Cartao>
        </aside>
      </form>
    </>
  );
}
