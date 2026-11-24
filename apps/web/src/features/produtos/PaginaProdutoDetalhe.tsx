import {
  Camera,
  ClipboardList,
  Hammer,
  Pencil,
  SlidersHorizontal,
  Tag,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import {
  ROTULO_MODO_PRECO,
  formatarData,
  formatarMicro,
  formatarMoeda,
  formatarPercentual,
  type Ficha,
  type MovimentoProduto,
  type Precificacao,
  type Produto,
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
import { FotoDoProduto, ModalProduto } from './PaginaProdutos';

const rotuloTipo: Record<MovimentoProduto['tipo'], string> = {
  producao: 'Produção',
  venda: 'Venda',
  ajuste: 'Ajuste manual',
  estorno: 'Estorno',
};

function ModalAjusteProduto({
  aberto,
  aoFechar,
  produto,
}: {
  aberto: boolean;
  aoFechar: () => void;
  produto: Produto;
}) {
  const f = useForm<{
    tipo: 'entrada' | 'saida';
    quantidade: number | null;
    justificativa: string;
  }>({ values: { tipo: 'saida', quantidade: null, justificativa: '' } });
  useAvisoDeSaida(aberto && f.formState.isDirty);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutacao(
    (d: { tipo: 'entrada' | 'saida'; quantidade: number; justificativa: string }) =>
      api.post<Produto>(`/produtos/${produto.id}/ajuste`, d),
    {
      sucesso: 'Ajuste registrado.',
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
    if (!d.quantidade) return setErro('Informe a quantidade.');
    if (d.justificativa.trim().length < 3) return setErro('Explique o motivo do ajuste.');
    setErro(null);
    salvar.mutate({ tipo: d.tipo, quantidade: d.quantidade, justificativa: d.justificativa });
  });
  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo={`Ajustar estoque — ${produto.nome}`}
      erro={erro ?? salvar.error}
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
        <p className="text-sm text-tinta-500">
          Estoque atual: <strong className="text-tinta-900">{produto.estoqueAtual} un.</strong>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="O que aconteceu?">
            {({ id }) => (
              <Selecao id={id} {...f.register('tipo')}>
                <option value="saida">Saída (perda, quebra, brinde)</option>
                <option value="entrada">Entrada (sobra, achado)</option>
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Quantidade (un.)" obrigatorio>
            {({ id }) => (
              <Controller
                control={f.control}
                name="quantidade"
                render={({ field }) => (
                  <CampoNumero id={id} escala={1} valor={field.value} onChange={field.onChange} />
                )}
              />
            )}
          </Campo>
        </div>
        <Campo
          rotulo="Justificativa"
          obrigatorio
          dica="Obrigatória — fica no histórico e no financeiro."
        >
          {({ id }) => <AreaDeTexto id={id} {...f.register('justificativa')} />}
        </Campo>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export default function PaginaProdutoDetalhe() {
  const id = Number(useParams().id);
  const [aba, setAba] = useState<'movimentos' | 'fichas' | 'precos' | 'dados'>('movimentos');
  const [editar, setEditar] = useState(false);
  const [ajustar, setAjustar] = useState(false);
  const [pagina, setPagina] = useState(1);
  const input = useRef<HTMLInputElement>(null);
  const produto = useItem<Produto>('produto', `/produtos/${id}`, id);
  const movimentos = useLista<MovimentoProduto>(
    'produto-movimentos',
    `/produtos/${id}/movimentos`,
    { pagina, porPagina: 15 },
    aba === 'movimentos',
  );
  const fichas = useDados<Ficha[]>(['produto-fichas', id], `/produtos/${id}/fichas`);
  const precificacoes = useDados<Precificacao[]>(
    ['produto-precificacoes', id],
    `/produtos/${id}/precificacoes`,
  );

  const enviarFoto = useMutacao(
    (arquivo: File) =>
      api.enviarArquivo<Produto>(
        `/produtos/${id}/foto`,
        arquivo,
        arquivo.type || 'application/octet-stream',
      ),
    { sucesso: 'Foto atualizada.' },
  );
  const removerFoto = useMutacao(() => api.delete<Produto>(`/produtos/${id}/foto`), {
    sucesso: 'Foto removida.',
  });

  if (produto.isLoading) return <Esqueleto linhas={4} />;
  if (produto.isError)
    return <ErroDeCarregamento erro={produto.error} aoTentar={() => void produto.refetch()} />;
  const p = produto.data!;
  const margem =
    p.precoVenda && p.custoProducao
      ? Math.round(((p.precoVenda - p.custoProducao / 10_000) / p.precoVenda) * 10_000)
      : null;

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: '/produtos', rotulo: 'Produtos' }}
        titulo={p.nome}
        subtitulo={p.categoriaNome ?? 'Sem categoria'}
        acoes={
          <>
            <Link to={`/producao/nova?produto=${p.id}`}>
              <Botao icone={<Hammer className="h-4 w-4" />}>Produzir</Botao>
            </Link>
            <Link to={`/produtos/${p.id}/ficha`}>
              <Botao icone={<ClipboardList className="h-4 w-4" />}>Ficha técnica</Botao>
            </Link>
            <Link to={`/produtos/${p.id}/precificacao`}>
              <Botao icone={<Tag className="h-4 w-4" />}>Precificar</Botao>
            </Link>
            <Botao icone={<Pencil className="h-4 w-4" />} onClick={() => setEditar(true)}>
              Editar
            </Botao>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <Cartao semPadding className="overflow-hidden">
            <FotoDoProduto produto={p} className="aspect-square w-full" />
            <div className="flex gap-2 p-3">
              <input
                ref={input}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const a = e.target.files?.[0];
                  if (a) enviarFoto.mutate(a);
                  e.target.value = '';
                }}
              />
              <Botao
                tamanho="p"
                className="flex-1"
                icone={<Camera className="h-4 w-4" />}
                carregando={enviarFoto.isPending}
                onClick={() => input.current?.click()}
              >
                {p.fotoArquivo ? 'Trocar foto' : 'Adicionar foto'}
              </Botao>
              {p.fotoArquivo && (
                <Botao
                  tamanho="p"
                  variante="fantasma"
                  aria-label="Remover foto"
                  carregando={removerFoto.isPending}
                  onClick={() => removerFoto.mutate(undefined)}
                >
                  <Trash2 className="h-4 w-4" />
                </Botao>
              )}
            </div>
          </Cartao>
        </div>
        <div className="space-y-6">
          {!p.temFicha && (
            <Alerta
              tom="ambar"
              titulo="Falta a ficha técnica"
              acao={
                <Link to={`/produtos/${p.id}/ficha`}>
                  <Botao tamanho="p">Montar ficha</Botao>
                </Link>
              }
            >
              Sem ela não dá para saber o custo, sugerir preço nem registrar produções.
            </Alerta>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              rotulo="Em estoque"
              valor={`${p.estoqueAtual} un.`}
              tom={p.estoqueAtual > 0 ? 'folha' : 'neutro'}
            />
            <Indicador
              rotulo="Preço de venda"
              valor={p.precoVenda ? formatarMoeda(p.precoVenda) : '—'}
            />
            <Indicador
              rotulo="Custo médio"
              valor={p.custoProducao ? formatarMicro(p.custoProducao) : '—'}
              detalhe="Do estoque de acabados"
            />
            <Indicador
              rotulo="Margem bruta"
              valor={margem === null ? '—' : formatarPercentual(margem)}
              tom={margem !== null && margem < 0 ? 'pitanga' : 'neutro'}
              detalhe="Preço menos custo de estoque"
            />
          </div>
          <div>
            <div className="mb-1 flex justify-end">
              <Botao
                tamanho="p"
                icone={<SlidersHorizontal className="h-4 w-4" />}
                onClick={() => setAjustar(true)}
              >
                Ajustar estoque
              </Botao>
            </div>
            <Abas
              ativa={aba}
              aoMudar={setAba}
              abas={[
                { id: 'movimentos', rotulo: 'Movimentos' },
                { id: 'fichas', rotulo: 'Fichas técnicas' },
                { id: 'precos', rotulo: 'Histórico de preços' },
                { id: 'dados', rotulo: 'Dados' },
              ]}
            />
            {aba === 'movimentos' && (
              <Cartao semPadding>
                <div className="p-2">
                  <Tabela<MovimentoProduto>
                    legenda="Movimentos do produto"
                    linhas={movimentos.data?.itens}
                    carregando={movimentos.isLoading}
                    chave={(m) => m.id}
                    vazio={
                      <EstadoVazio
                        titulo="Sem movimentos"
                        descricao="Produções, vendas e ajustes aparecem aqui."
                      />
                    }
                    colunas={[
                      { titulo: 'Data', celula: (m) => formatarData(m.data) },
                      {
                        titulo: 'Tipo',
                        celula: (m) => (
                          <Chip tom={m.quantidade > 0 ? 'folha' : 'neutro'}>
                            {rotuloTipo[m.tipo]}
                          </Chip>
                        ),
                      },
                      {
                        titulo: 'Quantidade',
                        alinhar: 'direita',
                        celula: (m) => (
                          <span
                            className={`numero ${m.quantidade < 0 ? 'text-pitanga-700' : 'text-folha-700'}`}
                          >
                            {m.quantidade > 0 ? '+' : ''}
                            {m.quantidade}
                          </span>
                        ),
                      },
                      {
                        titulo: 'Valor',
                        alinhar: 'direita',
                        ocultarEmPequeno: true,
                        celula: (m) => (
                          <span className="numero">{formatarMoeda(m.custoTotal)}</span>
                        ),
                      },
                      {
                        titulo: 'Saldo',
                        alinhar: 'direita',
                        celula: (m) => <span className="numero">{m.saldoApos}</span>,
                      },
                      {
                        titulo: 'Origem',
                        ocultarEmPequeno: true,
                        celula: (m) =>
                          m.referenciaTipo === 'venda' && m.referenciaId ? (
                            <Link
                              className="text-pitanga-700 hover:underline"
                              to={`/vendas/${m.referenciaId}`}
                            >
                              Venda #{m.referenciaId}
                            </Link>
                          ) : m.referenciaTipo === 'producao' && m.referenciaId ? (
                            <Link
                              className="text-pitanga-700 hover:underline"
                              to={`/producao/${m.referenciaId}`}
                            >
                              Produção #{m.referenciaId}
                            </Link>
                          ) : (
                            <span className="text-tinta-500">{m.justificativa ?? '—'}</span>
                          ),
                      },
                    ]}
                  />
                  <PaginacaoControles paginacao={movimentos.data?.paginacao} aoMudar={setPagina} />
                </div>
              </Cartao>
            )}
            {aba === 'fichas' && (
              <Cartao semPadding>
                <div className="p-2">
                  <Tabela<Ficha>
                    legenda="Versões da ficha técnica"
                    linhas={fichas.data}
                    carregando={fichas.isLoading}
                    chave={(x) => x.id}
                    vazio={
                      <EstadoVazio
                        titulo="Nenhuma ficha técnica"
                        descricao="A ficha lista os materiais, a mão de obra e os custos extras de cada peça."
                        acao={
                          <Link to={`/produtos/${p.id}/ficha`}>
                            <Botao variante="primario">Montar ficha</Botao>
                          </Link>
                        }
                      />
                    }
                    colunas={[
                      {
                        titulo: 'Versão',
                        celula: (x) => <span className="font-medium">v{x.versao}</span>,
                      },
                      { titulo: 'Criada em', celula: (x) => formatarData(x.criadoEm) },
                      {
                        titulo: 'Rendimento',
                        alinhar: 'direita',
                        celula: (x) => `${x.rendimento} un.`,
                      },
                      { titulo: 'Materiais', alinhar: 'direita', celula: (x) => x.itens.length },
                      {
                        titulo: '',
                        alinhar: 'direita',
                        celula: (x) =>
                          x.ativa ? <Chip tom="folha">Ativa</Chip> : <Chip>Anterior</Chip>,
                      },
                    ]}
                  />
                </div>
              </Cartao>
            )}
            {aba === 'precos' && (
              <Cartao semPadding>
                <div className="p-2">
                  <Tabela<Precificacao>
                    legenda="Histórico de precificações"
                    linhas={precificacoes.data}
                    carregando={precificacoes.isLoading}
                    chave={(x) => x.id}
                    vazio={
                      <EstadoVazio
                        titulo="Nenhuma precificação salva"
                        descricao="Use a tela de precificação para simular e guardar suas decisões de preço."
                      />
                    }
                    colunas={[
                      { titulo: 'Data', celula: (x) => formatarData(x.data) },
                      { titulo: 'Método', celula: (x) => ROTULO_MODO_PRECO[x.modo] },
                      {
                        titulo: 'Custo',
                        alinhar: 'direita',
                        celula: (x) => <span className="numero">{formatarMoeda(x.custoBase)}</span>,
                      },
                      {
                        titulo: 'Preço final',
                        alinhar: 'direita',
                        celula: (x) => (
                          <span className="numero font-medium">{formatarMoeda(x.precoFinal)}</span>
                        ),
                      },
                      {
                        titulo: 'Lucro',
                        alinhar: 'direita',
                        celula: (x) => (
                          <span
                            className={`numero ${x.lucroPrevisto < 0 ? 'text-pitanga-700' : ''}`}
                          >
                            {formatarMoeda(x.lucroPrevisto)}
                          </span>
                        ),
                      },
                      {
                        titulo: 'Margem',
                        alinhar: 'direita',
                        celula: (x) => (
                          <span className="numero">{formatarPercentual(x.margemEfetiva)}</span>
                        ),
                      },
                      {
                        titulo: '',
                        alinhar: 'direita',
                        celula: (x) =>
                          x.aplicadoAoProduto ? <Chip tom="folha">Aplicado</Chip> : null,
                      },
                    ]}
                  />
                </div>
              </Cartao>
            )}
            {aba === 'dados' && (
              <Cartao>
                <dl className="grid gap-5 sm:grid-cols-2">
                  <Dado rotulo="Descrição" className="sm:col-span-2">
                    {p.descricao ?? '—'}
                  </Dado>
                  <Dado rotulo="Categoria">{p.categoriaNome ?? '—'}</Dado>
                  <Dado rotulo="Situação">
                    <Chip tom={p.ativo ? 'folha' : 'neutro'}>{p.ativo ? 'Ativo' : 'Inativo'}</Chip>
                  </Dado>
                </dl>
              </Cartao>
            )}
          </div>
        </div>
      </div>
      <ModalProduto aberto={editar} aoFechar={() => setEditar(false)} produto={p} />
      <ModalAjusteProduto aberto={ajustar} aoFechar={() => setAjustar(false)} produto={p} />
    </>
  );
}
