import { zodResolver } from '@hookform/resolvers/zod';
import { ImageOff, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  formatarMicro,
  formatarMoeda,
  produtoSchema,
  type Produto,
  type ProdutoEntrada,
} from '@pitanga/shared';
import type { z } from 'zod';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorCategoria } from '../../components/selecionadores';
import {
  AreaDeTexto,
  Botao,
  Campo,
  CampoMoeda,
  Chip,
  Entrada,
  EstadoVazio,
  Esqueleto,
  Modal,
  PaginacaoControles,
} from '../../components/ui';
import { api, urlDaFoto } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useLista, useMutacao } from '../../lib/query';
import { useDebounce } from '../../lib/util';

type Formulario = z.input<typeof produtoSchema>;

export function ModalProduto({
  aberto,
  aoFechar,
  produto,
}: {
  aberto: boolean;
  aoFechar: () => void;
  produto?: Produto;
}) {
  const f = useForm<Formulario>({
    resolver: zodResolver(produtoSchema),
    values: {
      nome: produto?.nome ?? '',
      descricao: produto?.descricao ?? '',
      categoriaId: produto?.categoriaId ?? null,
      precoVenda: produto?.precoVenda ?? null,
      ativo: produto?.ativo ?? true,
    },
  });
  useAvisoDeSaida(aberto && f.formState.isDirty);
  const navegar = useNavigate();
  const salvar = useMutacao(
    (d: ProdutoEntrada) =>
      produto ? api.put<Produto>(`/produtos/${produto.id}`, d) : api.post<Produto>('/produtos', d),
    {
      sucesso: produto ? 'Produto atualizado.' : 'Produto cadastrado. Agora monte a ficha técnica.',
      naJanela: aberto,
      aoConcluir: (p) => {
        fechar();
        if (!produto) navegar(`/produtos/${p.id}`);
      },
    },
  );
  /** Fechar descarta o que foi digitado: reabrir começa do que está salvo. */
  const fechar = () => {
    f.reset();
    aoFechar();
  };
  const e = f.formState.errors;
  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo={produto ? 'Editar produto' : 'Novo produto'}
      erro={salvar.error}
      rodape={
        <>
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvar.isPending}
            onClick={f.handleSubmit((d) => salvar.mutate(d))}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <form className="space-y-4" onSubmit={f.handleSubmit((d) => salvar.mutate(d))}>
        <Campo rotulo="Nome" erro={e.nome?.message} obrigatorio>
          {({ id }) => <Entrada id={id} autoFocus {...f.register('nome')} />}
        </Campo>
        <Campo rotulo="Descrição">
          {({ id }) => <AreaDeTexto id={id} {...f.register('descricao')} />}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Categoria">
            {({ id }) => (
              <Controller
                control={f.control}
                name="categoriaId"
                render={({ field }) => (
                  <SeletorCategoria
                    id={id}
                    tipo="produto"
                    permitirNova
                    valor={field.value ?? null}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
          </Campo>
          <Campo rotulo="Preço de venda" dica="Você pode definir depois, na precificação.">
            {({ id }) => (
              <Controller
                control={f.control}
                name="precoVenda"
                render={({ field }) => (
                  <CampoMoeda id={id} valor={field.value ?? null} onChange={field.onChange} />
                )}
              />
            )}
          </Campo>
        </div>
        {produto && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-pitanga-600"
              {...f.register('ativo')}
            />{' '}
            Produto ativo (aparece nas vendas)
          </label>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function FotoDoProduto({
  produto,
  className,
}: {
  produto: Pick<Produto, 'fotoArquivo' | 'nome'>;
  className?: string;
}) {
  const url = urlDaFoto(produto.fotoArquivo);
  return url ? (
    <img
      src={url}
      alt={produto.nome}
      loading="lazy"
      className={`object-cover ${className ?? ''}`}
    />
  ) : (
    <div
      className={`grid place-items-center bg-pitanga-50 text-pitanga-200 ${className ?? ''}`}
      role="img"
      aria-label="Sem foto"
    >
      <ImageOff className="h-8 w-8" />
    </div>
  );
}

export default function PaginaProdutos() {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);
  const termo = useDebounce(busca);
  const navegar = useNavigate();
  const { data, isLoading } = useLista<Produto>('produtos', '/produtos', {
    busca: termo,
    categoria,
    pagina,
    porPagina: 24,
  });

  return (
    <>
      <PaginaCabecalho
        titulo="Produtos"
        subtitulo="Seu catálogo: o que você produz e vende, com foto, preço, custo e estoque."
        acoes={
          <Botao
            variante="primario"
            icone={<Plus className="h-4 w-4" />}
            onClick={() => setNovo(true)}
          >
            Novo produto
          </Botao>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-400" />
          <Entrada
            className="pl-9"
            placeholder="Buscar produto"
            aria-label="Buscar produtos"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
          />
        </div>
        <div className="w-56">
          <SeletorCategoria
            tipo="produto"
            valor={categoria}
            onChange={(v) => {
              setCategoria(v);
              setPagina(1);
            }}
            placeholder="Todas as categorias"
            aria-label="Filtrar por categoria"
          />
        </div>
      </div>
      {isLoading && !data ? (
        <Esqueleto linhas={4} />
      ) : data && data.itens.length === 0 ? (
        <EstadoVazio
          titulo={termo || categoria ? 'Nenhum produto encontrado' : 'Seu catálogo está vazio'}
          descricao="Cadastre seus produtos, monte a ficha técnica e descubra o custo e o preço ideal de cada um."
          acao={
            <Botao variante="primario" onClick={() => setNovo(true)}>
              Cadastrar produto
            </Botao>
          }
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.itens.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => navegar(`/produtos/${p.id}`)}
                className="cartao group w-full overflow-hidden rounded-cartao border border-creme-200 bg-white text-left shadow-cartao transition hover:-translate-y-0.5 hover:shadow-elevado"
              >
                <FotoDoProduto produto={p} className="aspect-[4/3] w-full" />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-base leading-snug group-hover:text-pitanga-700">
                      {p.nome}
                    </h3>
                    {!p.ativo && <Chip>Inativo</Chip>}
                  </div>
                  <p className="numero font-titulo text-xl text-pitanga-700">
                    {p.precoVenda ? (
                      formatarMoeda(p.precoVenda)
                    ) : (
                      <span className="text-sm text-tinta-400">sem preço</span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-tinta-500">
                    <Chip tom={p.estoqueAtual > 0 ? 'folha' : 'neutro'}>
                      {p.estoqueAtual} em estoque
                    </Chip>
                    {p.custoProducao > 0 && (
                      <span className="numero">custo {formatarMicro(p.custoProducao)}</span>
                    )}
                    {!p.temFicha && <Chip tom="ambar">Sem ficha técnica</Chip>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PaginacaoControles paginacao={data?.paginacao} aoMudar={setPagina} />
      <ModalProduto aberto={novo} aoFechar={() => setNovo(false)} />
    </>
  );
}
