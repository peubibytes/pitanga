import { useQueries } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { calcularCustoFicha } from '@pitanga/core';
import { formatarMoeda, formatarPercentual, type Ficha } from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { useProdutos } from '../../components/selecionadores';
import { Botao, Cartao, Chip, EstadoVazio, Tabela } from '../../components/ui';
import { ApiError, api } from '../../lib/api';

interface Linha {
  id: number;
  nome: string;
  preco: number | null;
  ficha: Ficha | null;
  custo: number | null;
}

/** Visão geral: custo atual de cada ficha técnica (com o custo médio vigente dos materiais) × preço de venda. */
export default function PaginaFichas() {
  const navegar = useNavigate();
  const produtos = useProdutos();
  const lista = produtos.data?.itens ?? [];
  const fichas = useQueries({
    queries: lista.map((p) => ({
      queryKey: ['produto-ficha-ativa', p.id],
      queryFn: async () => {
        try {
          return await api.get<Ficha>(`/produtos/${p.id}/ficha-ativa`);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }
      },
    })),
  });

  const linhas: Linha[] = lista.map((p, i) => {
    const ficha = fichas[i]?.data ?? null;
    const custo = ficha
      ? calcularCustoFicha({
          rendimento: ficha.rendimento,
          maoObraModo: ficha.maoObraModo,
          maoObraValorHora: ficha.maoObraValorHora,
          maoObraMinutos: ficha.maoObraMinutos,
          maoObraValorFixo: ficha.maoObraValorFixo,
          itens: ficha.itens,
          extras: ficha.extras,
        }).custoUnitarioCentavos
      : null;
    return { id: p.id, nome: p.nome, preco: p.precoVenda, ficha, custo };
  });

  return (
    <>
      <PaginaCabecalho
        titulo="Fichas e preços"
        subtitulo="O custo de cada peça hoje, o preço que você pratica e a margem que sobra."
      />
      <Cartao semPadding>
        <div className="p-2">
          <Tabela<Linha>
            legenda="Fichas técnicas e preços"
            linhas={produtos.isLoading ? undefined : linhas}
            carregando={produtos.isLoading}
            chave={(l) => l.id}
            aoClicar={(l) => navegar(`/produtos/${l.id}/ficha`)}
            vazio={
              <EstadoVazio
                titulo="Nenhum produto cadastrado"
                descricao="Cadastre um produto para montar a ficha técnica."
                acao={
                  <Botao variante="primario" onClick={() => navegar('/produtos')}>
                    Ir para produtos
                  </Botao>
                }
              />
            }
            colunas={[
              { titulo: 'Produto', celula: (l) => <span className="font-medium">{l.nome}</span> },
              {
                titulo: 'Ficha',
                celula: (l) =>
                  l.ficha ? (
                    <Chip tom="folha">
                      v{l.ficha.versao} · {l.ficha.itens.length} materiais
                    </Chip>
                  ) : (
                    <Chip tom="ambar">Sem ficha</Chip>
                  ),
              },
              {
                titulo: 'Custo da peça',
                alinhar: 'direita',
                celula: (l) => (
                  <span className="numero">{l.custo === null ? '—' : formatarMoeda(l.custo)}</span>
                ),
              },
              {
                titulo: 'Preço de venda',
                alinhar: 'direita',
                celula: (l) => (
                  <span className="numero">{l.preco ? formatarMoeda(l.preco) : '—'}</span>
                ),
              },
              {
                titulo: 'Margem bruta',
                alinhar: 'direita',
                celula: (l) => {
                  if (!l.preco || l.custo === null)
                    return <span className="text-tinta-400">—</span>;
                  const m = Math.round(((l.preco - l.custo) / l.preco) * 10_000);
                  return (
                    <span
                      className={`numero font-medium ${m < 0 ? 'text-pitanga-700' : m < 2000 ? 'text-ambar-700' : 'text-folha-700'}`}
                    >
                      {formatarPercentual(m)}
                    </span>
                  );
                },
              },
              {
                titulo: '',
                alinhar: 'direita',
                celula: (l) => (
                  <Botao
                    tamanho="p"
                    onClick={(e) => {
                      e.stopPropagation();
                      navegar(`/produtos/${l.id}/precificacao`);
                    }}
                  >
                    Precificar
                  </Botao>
                ),
              },
            ]}
          />
        </div>
      </Cartao>
    </>
  );
}
