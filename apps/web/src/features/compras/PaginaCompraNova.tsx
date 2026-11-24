import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  custoMedioAposEntrada,
  custoUnitarioFinalDoItem,
  ratearDespesasDaCompra,
} from '@pitanga/core';
import {
  CRITERIOS_RATEIO_COMPRA,
  FORMAS_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_RATEIO_COMPRA,
  TIPOS_DESPESA_COMPRA,
  compraSchema,
  fatorDeConversao,
  formatarMicro,
  formatarMoeda,
  formatarQuantidade,
  hojeISO,
  unidadesCompativeis,
  type Compra,
  type CompraEntrada,
  type CriterioRateioCompra,
  type FormaPagamento,
  type Material,
  type TipoDespesaCompra,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorFornecedor, SeletorMaterial, useMateriais } from '../../components/selecionadores';
import {
  Alerta,
  Botao,
  Campo,
  CampoData,
  CampoMoeda,
  CampoNumero,
  Cartao,
  Entrada,
  Selecao,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useChaveIdempotencia, useMutacao } from '../../lib/query';

interface ItemForm {
  materialId: number | null;
  quantidade: number | null;
  unidade: string;
  fator: number | null;
  valorTotal: number | null;
}
interface DespesaForm {
  tipo: TipoDespesaCompra;
  descricao: string;
  valor: number | null;
  rateio: CriterioRateioCompra;
}
interface CompraForm {
  fornecedorId: number | null;
  data: string;
  formaPagamento: FormaPagamento;
  observacao: string;
  itens: ItemForm[];
  despesas: DespesaForm[];
}

const itemVazio = (): ItemForm => ({
  materialId: null,
  quantidade: null,
  unidade: '',
  fator: null,
  valorTotal: null,
});

export default function PaginaCompraNova() {
  const navegar = useNavigate();
  const chave = useChaveIdempotencia();
  const materiais = useMateriais();
  const porId = useMemo(
    () => new Map<number, Material>((materiais.data?.itens ?? []).map((m) => [m.id, m])),
    [materiais.data],
  );
  const [erro, setErro] = useState<string | null>(null);

  const f = useForm<CompraForm>({
    defaultValues: {
      fornecedorId: null,
      data: hojeISO(),
      formaPagamento: 'pix',
      observacao: '',
      itens: [itemVazio()],
      despesas: [],
    },
  });
  useAvisoDeSaida(f.formState.isDirty);
  const itens = useFieldArray({ control: f.control, name: 'itens' });
  const despesas = useFieldArray({ control: f.control, name: 'despesas' });
  const vistos = useWatch({ control: f.control, name: 'itens' });
  const despVistas = useWatch({ control: f.control, name: 'despesas' });

  // Pré-visualização em tempo real, com as mesmas funções do servidor (packages/core).
  const previa = useMemo(() => {
    const linhas = (vistos ?? []).map((i) => {
      const m = i.materialId ? porId.get(i.materialId) : undefined;
      const fator = m && i.unidade ? fatorDeConversao(i.unidade, m.unidade, i.fator) : null;
      const quantidadeBase = fator && i.quantidade ? i.quantidade * fator : 0;
      return { m, fator, quantidadeBase, valorTotal: i.valorTotal ?? 0 };
    });
    const validas = linhas.map((l) => ({
      valorTotal: l.valorTotal,
      quantidadeBase: l.quantidadeBase,
    }));
    const rateio = ratearDespesasDaCompra(
      validas,
      (despVistas ?? []).map((d) => ({ valor: d.valor ?? 0, rateio: d.rateio })),
    );
    const detalhes = linhas.map((l, idx) => {
      const rateada = rateio.rateadaPorItem[idx] ?? 0;
      const custoFinal =
        l.quantidadeBase > 0
          ? custoUnitarioFinalDoItem(l.valorTotal, rateada, l.quantidadeBase)
          : 0;
      const novoMedio =
        l.m && l.quantidadeBase > 0
          ? custoMedioAposEntrada(
              { estoque: l.m.estoqueAtual, custoMedio: l.m.custoMedio },
              l.quantidadeBase,
              l.valorTotal + rateada,
            )
          : null;
      return { ...l, rateada, custoFinal, novoMedio };
    });
    const totalItens = linhas.reduce((s, l) => s + l.valorTotal, 0);
    const totalDespesas = (despVistas ?? []).reduce((s, d) => s + (d.valor ?? 0), 0);
    return { detalhes, totalItens, totalDespesas, naoRateada: rateio.naoRateada };
  }, [vistos, despVistas, porId]);

  const salvar = useMutacao(
    (corpo: CompraEntrada) => api.post<Compra>('/compras', corpo, chave.atual()),
    {
      sucesso: (c) => `Compra #${c.id} registrada. Estoque e custo médio atualizados.`,
      aoConcluir: (c) => {
        chave.renovar();
        navegar(`/compras/${c.id}`);
      },
    },
  );

  const enviar = f.handleSubmit((d) => {
    setErro(null);
    const mensagem = (() => {
      for (const [i, it] of d.itens.entries()) {
        const m = it.materialId ? porId.get(it.materialId) : undefined;
        if (!m) return `Escolha o material do item ${i + 1}.`;
        if (!it.quantidade) return `Informe a quantidade do item ${i + 1} (${m.nome}).`;
        if (it.valorTotal === null) return `Informe o valor pago pelo item ${i + 1} (${m.nome}).`;
        if (!fatorDeConversao(it.unidade, m.unidade, it.fator)) {
          return it.unidade === 'cx'
            ? `Informe quantas unidades de ${m.nome} cabem em cada caixa.`
            : `Escolha uma unidade válida para ${m.nome}.`;
        }
      }
      return null;
    })();
    if (mensagem) return setErro(mensagem);
    const corpo: CompraEntrada = {
      fornecedorId: d.fornecedorId,
      data: d.data,
      formaPagamento: d.formaPagamento,
      observacao: d.observacao || null,
      itens: d.itens.map((i) => ({
        materialId: i.materialId!,
        quantidadeInformada: i.quantidade!,
        unidadeInformada: i.unidade,
        fatorConversao: i.unidade === 'cx' ? (i.fator ?? undefined) : undefined,
        valorTotal: i.valorTotal!,
      })),
      despesas: d.despesas
        .filter((x) => x.valor)
        .map((x) => ({
          tipo: x.tipo,
          descricao: x.descricao || null,
          valor: x.valor!,
          rateio: x.rateio,
        })),
    };
    const v = compraSchema.safeParse(corpo);
    if (!v.success) return setErro(v.error.issues[0]?.message ?? 'Confira os dados.');
    salvar.mutate(corpo);
  });

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: '/compras', rotulo: 'Compras' }}
        titulo="Registrar compra"
        subtitulo="Informe o que comprou e quanto pagou. Transporte e outras despesas podem ser rateados no custo dos materiais."
      />
      <form onSubmit={enviar} className="space-y-6">
        {erro && <Alerta tom="pitanga">{erro}</Alerta>}
        <Cartao titulo="Dados da compra">
          <div className="grid gap-4 md:grid-cols-4">
            <Campo rotulo="Data" obrigatorio>
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
            <Campo rotulo="Fornecedor">
              {({ id }) => (
                <Controller
                  control={f.control}
                  name="fornecedorId"
                  render={({ field }) => (
                    <SeletorFornecedor id={id} valor={field.value} onChange={field.onChange} />
                  )}
                />
              )}
            </Campo>
            <Campo rotulo="Forma de pagamento">
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
            <Campo rotulo="Observação">
              {({ id }) => <Entrada id={id} {...f.register('observacao')} />}
            </Campo>
          </div>
        </Cartao>

        <Cartao
          titulo="Itens comprados"
          acao={
            <Botao
              tamanho="p"
              icone={<Plus className="h-4 w-4" />}
              onClick={() => itens.append(itemVazio())}
            >
              Adicionar item
            </Botao>
          }
        >
          <div className="space-y-4">
            {itens.fields.map((campo, idx) => {
              const detalhe = previa.detalhes[idx];
              const material = detalhe?.m;
              const unidadesOk = material ? unidadesCompativeis(material.unidade) : [];
              const unidade = vistos?.[idx]?.unidade;
              return (
                <div
                  key={campo.id}
                  className="rounded-campo border border-creme-200 bg-creme-50 p-4"
                >
                  <div className="grid items-end gap-3 md:grid-cols-12">
                    <Campo rotulo="Material" obrigatorio className="md:col-span-4">
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`itens.${idx}.materialId`}
                          render={({ field }) => (
                            <SeletorMaterial
                              id={id}
                              valor={field.value}
                              onChange={(v) => {
                                field.onChange(v);
                                const m = v ? porId.get(v) : undefined;
                                f.setValue(`itens.${idx}.unidade`, m?.unidade ?? '');
                              }}
                            />
                          )}
                        />
                      )}
                    </Campo>
                    <Campo rotulo="Quantidade" obrigatorio className="md:col-span-2">
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`itens.${idx}.quantidade`}
                          render={({ field }) => (
                            <CampoNumero
                              id={id}
                              escala={1000}
                              valor={field.value}
                              onChange={field.onChange}
                            />
                          )}
                        />
                      )}
                    </Campo>
                    <Campo rotulo="Unidade" className="md:col-span-2">
                      {({ id }) => (
                        <Selecao
                          id={id}
                          disabled={!material}
                          {...f.register(`itens.${idx}.unidade`)}
                        >
                          {unidadesOk.map((u) => (
                            <option key={u.codigo} value={u.codigo}>
                              {u.nome} ({u.codigo})
                            </option>
                          ))}
                        </Selecao>
                      )}
                    </Campo>
                    {unidade === 'cx' && (
                      <Campo
                        rotulo={`${material?.unidade ?? 'un'} por caixa`}
                        obrigatorio
                        className="md:col-span-2"
                      >
                        {({ id }) => (
                          <Controller
                            control={f.control}
                            name={`itens.${idx}.fator`}
                            render={({ field }) => (
                              <CampoNumero
                                id={id}
                                escala={1}
                                valor={field.value}
                                onChange={field.onChange}
                              />
                            )}
                          />
                        )}
                      </Campo>
                    )}
                    <Campo
                      rotulo="Valor pago"
                      obrigatorio
                      className={unidade === 'cx' ? 'md:col-span-2' : 'md:col-span-3'}
                    >
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`itens.${idx}.valorTotal`}
                          render={({ field }) => (
                            <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                          )}
                        />
                      )}
                    </Campo>
                    <div className="md:col-span-1">
                      <Botao
                        variante="fantasma"
                        disabled={itens.fields.length === 1}
                        onClick={() => itens.remove(idx)}
                        aria-label={`Remover item ${idx + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Botao>
                    </div>
                  </div>
                  {detalhe && material && detalhe.quantidadeBase > 0 && (
                    <p className="mt-3 text-sm text-tinta-600">
                      Entram{' '}
                      <strong className="numero">
                        {formatarQuantidade(detalhe.quantidadeBase, material.unidade)}
                      </strong>{' '}
                      no estoque · custo final{' '}
                      <strong className="numero">
                        {formatarMicro(detalhe.custoFinal)}/{material.unidade}
                      </strong>
                      {detalhe.rateada > 0 && (
                        <> (com {formatarMoeda(detalhe.rateada)} de despesas)</>
                      )}
                      {detalhe.novoMedio !== null && (
                        <>
                          {' '}
                          · custo médio{' '}
                          <span className="numero">
                            {material.custoMedio ? formatarMicro(material.custoMedio) : '—'}
                          </span>{' '}
                          →{' '}
                          <strong className="numero text-pitanga-700">
                            {formatarMicro(detalhe.novoMedio)}
                          </strong>
                        </>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Cartao>

        <Cartao
          titulo="Despesas da compra"
          acao={
            <Botao
              tamanho="p"
              icone={<Plus className="h-4 w-4" />}
              onClick={() =>
                despesas.append({
                  tipo: 'transporte',
                  descricao: '',
                  valor: null,
                  rateio: 'por_valor',
                })
              }
            >
              Adicionar despesa
            </Botao>
          }
        >
          {despesas.fields.length === 0 ? (
            <p className="text-sm text-tinta-500">
              Transporte, estacionamento ou frete? Adicione aqui para incluir no custo dos
              materiais.
            </p>
          ) : (
            <div className="space-y-3">
              {despesas.fields.map((campo, idx) => (
                <div key={campo.id} className="grid items-end gap-3 md:grid-cols-12">
                  <Campo rotulo="Tipo" className="md:col-span-2">
                    {({ id }) => (
                      <Selecao id={id} {...f.register(`despesas.${idx}.tipo`)}>
                        {TIPOS_DESPESA_COMPRA.map((t) => (
                          <option key={t} value={t}>
                            {t[0]!.toUpperCase() + t.slice(1)}
                          </option>
                        ))}
                      </Selecao>
                    )}
                  </Campo>
                  <Campo rotulo="Descrição" className="md:col-span-3">
                    {({ id }) => <Entrada id={id} {...f.register(`despesas.${idx}.descricao`)} />}
                  </Campo>
                  <Campo rotulo="Valor" className="md:col-span-2">
                    {({ id }) => (
                      <Controller
                        control={f.control}
                        name={`despesas.${idx}.valor`}
                        render={({ field }) => (
                          <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                        )}
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Como tratar" className="md:col-span-4">
                    {({ id }) => (
                      <Selecao id={id} {...f.register(`despesas.${idx}.rateio`)}>
                        {CRITERIOS_RATEIO_COMPRA.map((c) => (
                          <option key={c} value={c}>
                            {ROTULO_RATEIO_COMPRA[c]}
                          </option>
                        ))}
                      </Selecao>
                    )}
                  </Campo>
                  <div className="md:col-span-1">
                    <Botao
                      variante="fantasma"
                      onClick={() => despesas.remove(idx)}
                      aria-label={`Remover despesa ${idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Botao>
                  </div>
                </div>
              ))}
              {previa.naoRateada > 0 && (
                <Alerta tom="ambar">
                  {formatarMoeda(previa.naoRateada)} não compõem o custo dos materiais: entram nas
                  despesas do período.
                </Alerta>
              )}
            </div>
          )}
        </Cartao>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-cartao border border-creme-300 bg-white p-5 shadow-cartao">
          <dl className="flex flex-wrap gap-8 text-sm">
            <div>
              <dt className="text-tinta-500">Itens</dt>
              <dd className="numero text-lg">{formatarMoeda(previa.totalItens)}</dd>
            </div>
            <div>
              <dt className="text-tinta-500">Despesas</dt>
              <dd className="numero text-lg">{formatarMoeda(previa.totalDespesas)}</dd>
            </div>
            <div>
              <dt className="text-tinta-500">Total pago</dt>
              <dd className="numero font-titulo text-2xl text-pitanga-700">
                {formatarMoeda(previa.totalItens + previa.totalDespesas)}
              </dd>
            </div>
          </dl>
          <div className="flex gap-2">
            <Botao onClick={() => navegar('/compras')}>Cancelar</Botao>
            <Botao type="submit" variante="primario" carregando={salvar.isPending}>
              Registrar compra
            </Botao>
          </div>
        </div>
      </form>
    </>
  );
}
