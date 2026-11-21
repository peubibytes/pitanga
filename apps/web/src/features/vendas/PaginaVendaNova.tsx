import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { mulDiv } from '@pitanga/shared';
import {
  FORMAS_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO,
  formatarMoeda,
  hojeISO,
  vendaSchema,
  type FormaPagamento,
  type Venda,
  type VendaEntrada,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorCliente, SeletorProduto, useProdutos } from '../../components/selecionadores';
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
import { ApiError, api } from '../../lib/api';
import { useChaveIdempotencia, useMutacao } from '../../lib/query';

interface VendaForm {
  clienteId: number | null;
  data: string;
  formaPagamento: FormaPagamento;
  desconto: number | null;
  receber: 'tudo' | 'depois' | 'parte';
  valorParcial: number | null;
  observacao: string;
  itens: {
    produtoId: number | null;
    quantidade: number | null;
    precoUnitario: number | null;
    descontoItem: number | null;
  }[];
}

export default function PaginaVendaNova() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const chave = useChaveIdempotencia();
  const produtos = useProdutos();
  const porId = useMemo(
    () => new Map((produtos.data?.itens ?? []).map((p) => [p.id, p])),
    [produtos.data],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [permitirNegativo, setPermitirNegativo] = useState(false);

  const f = useForm<VendaForm>({
    defaultValues: {
      clienteId: params.get('cliente') ? Number(params.get('cliente')) : null,
      data: hojeISO(),
      formaPagamento: 'pix',
      desconto: null,
      receber: 'tudo',
      valorParcial: null,
      observacao: '',
      itens: [{ produtoId: null, quantidade: 1, precoUnitario: null, descontoItem: null }],
    },
  });
  const itens = useFieldArray({ control: f.control, name: 'itens' });
  const v = useWatch({ control: f.control });

  // Totais ao vivo — o servidor recalcula e é a autoridade final.
  const resumo = useMemo(() => {
    const linhas = (v.itens ?? []).map((i) => {
      const bruto = (i?.quantidade ?? 0) * (i?.precoUnitario ?? 0);
      const p = i?.produtoId ? porId.get(i.produtoId) : undefined;
      return {
        total: Math.max(0, bruto - (i?.descontoItem ?? 0)),
        custo: p ? mulDiv(i?.quantidade ?? 0, p.custoProducao, 10_000) : 0,
      };
    });
    const subtotal = linhas.reduce((s, l) => s + l.total, 0);
    const desconto = Math.min(v.desconto ?? 0, subtotal);
    const total = subtotal - desconto;
    const cmv = linhas.reduce((s, l) => s + l.custo, 0);
    return { subtotal, desconto, total, cmv, lucro: total - cmv };
  }, [v, porId]);

  const salvar = useMutacao(
    (corpo: VendaEntrada) => api.post<Venda>('/vendas', corpo, chave.atual()),
    {
      sucesso: (venda) =>
        venda.status === 'pendente'
          ? `Venda #${venda.id} registrada — falta receber ${formatarMoeda(venda.total - venda.recebido)}.`
          : `Venda #${venda.id} registrada.`,
      aoConcluir: (venda) => {
        chave.renovar();
        navegar(`/vendas/${venda.id}`);
      },
      silencioso: true,
    },
  );
  const [erroApi, setErroApi] = useState<ApiError | null>(null);

  const enviar = f.handleSubmit((d) => {
    setErro(null);
    setErroApi(null);
    const validos = d.itens.filter((i) => i.produtoId);
    if (validos.length === 0) return setErro('Inclua ao menos um produto.');
    if (validos.some((i) => !i.quantidade)) return setErro('Informe a quantidade de cada produto.');
    const valorRecebido =
      d.receber === 'tudo' ? undefined : d.receber === 'depois' ? 0 : (d.valorParcial ?? 0);
    if (valorRecebido !== undefined && valorRecebido > resumo.total)
      return setErro('O valor recebido é maior que o total da venda.');
    const corpo: VendaEntrada = {
      clienteId: d.clienteId,
      data: d.data,
      formaPagamento: d.formaPagamento,
      desconto: Math.min(d.desconto ?? 0, resumo.subtotal),
      valorRecebido,
      observacao: d.observacao || null,
      autorizarEstoqueNegativo: permitirNegativo,
      itens: validos.map((i) => ({
        produtoId: i.produtoId!,
        quantidade: i.quantidade!,
        precoUnitario: i.precoUnitario ?? 0,
        descontoItem: i.descontoItem ?? 0,
      })),
    };
    const r = vendaSchema.safeParse(corpo);
    if (!r.success) return setErro(r.error.issues[0]?.message ?? 'Confira os dados.');
    salvar.mutate(corpo, { onError: (e) => setErroApi(e instanceof ApiError ? e : null) });
  });

  const receber = v.receber ?? 'tudo';

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: '/vendas', rotulo: 'Vendas' }}
        titulo="Nova venda"
        subtitulo="Escolha o que foi vendido. O custo e o lucro estimado aparecem na hora."
      />
      <form onSubmit={enviar} className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {erro && <Alerta tom="pitanga">{erro}</Alerta>}
          {erroApi && (
            <Alerta
              tom="pitanga"
              titulo={
                erroApi.codigo === 'ESTOQUE_INSUFICIENTE'
                  ? 'Estoque insuficiente'
                  : 'Não foi possível registrar'
              }
            >
              {erroApi.message}
              {erroApi.codigo === 'ESTOQUE_INSUFICIENTE' && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-pitanga-600"
                    checked={permitirNegativo}
                    onChange={(e) => setPermitirNegativo(e.target.checked)}
                  />{' '}
                  Vender mesmo assim (autorizar estoque negativo — precisa estar liberado em
                  Configurações)
                </label>
              )}
            </Alerta>
          )}
          <Cartao titulo="Cliente e data">
            <div className="grid gap-4 md:grid-cols-3">
              <Campo rotulo="Cliente" className="md:col-span-2">
                {({ id }) => (
                  <Controller
                    control={f.control}
                    name="clienteId"
                    render={({ field }) => (
                      <SeletorCliente id={id} valor={field.value} onChange={field.onChange} />
                    )}
                  />
                )}
              </Campo>
              <Campo rotulo="Data da venda">
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
            </div>
          </Cartao>

          <Cartao
            titulo="Produtos"
            acao={
              <Botao
                tamanho="p"
                icone={<Plus className="h-4 w-4" />}
                onClick={() =>
                  itens.append({
                    produtoId: null,
                    quantidade: 1,
                    precoUnitario: null,
                    descontoItem: null,
                  })
                }
              >
                Adicionar produto
              </Botao>
            }
          >
            <div className="space-y-3">
              {itens.fields.map((campo, idx) => {
                const linha = v.itens?.[idx];
                const p = linha?.produtoId ? porId.get(linha.produtoId) : undefined;
                const total = Math.max(
                  0,
                  (linha?.quantidade ?? 0) * (linha?.precoUnitario ?? 0) -
                    (linha?.descontoItem ?? 0),
                );
                return (
                  <div key={campo.id} className="grid items-end gap-3 md:grid-cols-12">
                    <Campo rotulo={idx === 0 ? 'Produto' : undefined} className="md:col-span-4">
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`itens.${idx}.produtoId`}
                          render={({ field }) => (
                            <SeletorProduto
                              id={id}
                              valor={field.value}
                              comEstoque
                              onChange={(pid) => {
                                field.onChange(pid);
                                const prod = pid ? porId.get(pid) : undefined;
                                f.setValue(`itens.${idx}.precoUnitario`, prod?.precoVenda ?? null);
                              }}
                            />
                          )}
                        />
                      )}
                    </Campo>
                    <Campo rotulo={idx === 0 ? 'Qtd.' : undefined} className="md:col-span-2">
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`itens.${idx}.quantidade`}
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
                    <Campo
                      rotulo={idx === 0 ? 'Preço unitário' : undefined}
                      className="md:col-span-2"
                    >
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`itens.${idx}.precoUnitario`}
                          render={({ field }) => (
                            <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                          )}
                        />
                      )}
                    </Campo>
                    <Campo rotulo={idx === 0 ? 'Desconto' : undefined} className="md:col-span-2">
                      {({ id }) => (
                        <Controller
                          control={f.control}
                          name={`itens.${idx}.descontoItem`}
                          render={({ field }) => (
                            <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                          )}
                        />
                      )}
                    </Campo>
                    <div className="numero pb-2 text-right text-sm font-medium md:col-span-1">
                      {formatarMoeda(total)}
                    </div>
                    <div className="md:col-span-1">
                      <Botao
                        variante="fantasma"
                        disabled={itens.fields.length === 1}
                        onClick={() => itens.remove(idx)}
                        aria-label={`Remover produto ${idx + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Botao>
                    </div>
                    {p && (linha?.quantidade ?? 0) > p.estoqueAtual && (
                      <p className="text-xs font-medium text-pitanga-700 md:col-span-12">
                        Só há {p.estoqueAtual} em estoque.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Cartao>

          <Cartao titulo="Pagamento">
            <div className="grid gap-4 md:grid-cols-3">
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
              <Campo rotulo="Desconto na venda toda">
                {({ id }) => (
                  <Controller
                    control={f.control}
                    name="desconto"
                    render={({ field }) => (
                      <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                    )}
                  />
                )}
              </Campo>
              <Campo rotulo="Recebimento">
                {({ id }) => (
                  <Selecao id={id} {...f.register('receber')}>
                    <option value="tudo">Recebi tudo agora</option>
                    <option value="parte">Recebi só uma parte</option>
                    <option value="depois">Receber depois (pendente)</option>
                  </Selecao>
                )}
              </Campo>
              {receber === 'parte' && (
                <Campo rotulo="Valor recebido agora" className="md:col-start-3">
                  {({ id }) => (
                    <Controller
                      control={f.control}
                      name="valorParcial"
                      render={({ field }) => (
                        <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                      )}
                    />
                  )}
                </Campo>
              )}
              <Campo rotulo="Observação" className="md:col-span-3">
                {({ id }) => <Entrada id={id} {...f.register('observacao')} />}
              </Campo>
            </div>
          </Cartao>
        </div>

        <aside className="xl:sticky xl:top-0 xl:self-start">
          <Cartao titulo="Resumo da venda">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-tinta-600">Produtos</dt>
                <dd className="numero">{formatarMoeda(resumo.subtotal)}</dd>
              </div>
              {resumo.desconto > 0 && (
                <div className="flex justify-between">
                  <dt className="text-tinta-600">Desconto</dt>
                  <dd className="numero text-pitanga-700">− {formatarMoeda(resumo.desconto)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-creme-300 pt-3">
                <dt className="font-semibold">Total</dt>
                <dd className="numero font-titulo text-3xl text-pitanga-700">
                  {formatarMoeda(resumo.total)}
                </dd>
              </div>
              <div className="flex justify-between text-tinta-500">
                <dt>Custo estimado</dt>
                <dd className="numero">{formatarMoeda(resumo.cmv)}</dd>
              </div>
              <div className="flex justify-between text-tinta-500">
                <dt>Lucro estimado</dt>
                <dd
                  className={`numero ${resumo.lucro < 0 ? 'font-semibold text-pitanga-700' : ''}`}
                >
                  {formatarMoeda(resumo.lucro)}
                </dd>
              </div>
            </dl>
            {resumo.lucro < 0 && (
              <div className="mt-3">
                <Alerta tom="pitanga">Esta venda dá prejuízo: o total está abaixo do custo.</Alerta>
              </div>
            )}
            <div className="mt-5 flex flex-col gap-2">
              <Botao type="submit" variante="primario" carregando={salvar.isPending}>
                Registrar venda
              </Botao>
              <Botao onClick={() => navegar('/vendas')}>Cancelar</Botao>
            </div>
          </Cartao>
        </aside>
      </form>
    </>
  );
}
