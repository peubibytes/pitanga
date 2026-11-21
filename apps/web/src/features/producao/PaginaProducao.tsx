import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatarData, formatarMicro, formatarMoeda, type Producao } from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorProduto } from '../../components/selecionadores';
import {
  Botao,
  Campo,
  CampoData,
  Cartao,
  Chip,
  EstadoVazio,
  PaginacaoControles,
  Tabela,
} from '../../components/ui';
import { useLista } from '../../lib/query';
import { periodoDoMes } from '../../lib/util';

export default function PaginaProducao() {
  const [periodo, setPeriodo] = useState(periodoDoMes());
  const [produto, setProduto] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const navegar = useNavigate();
  const { data, isLoading } = useLista<Producao>('producoes', '/producoes', {
    ...periodo,
    produto,
    pagina,
    porPagina: 25,
  });

  return (
    <>
      <PaginaCabecalho
        titulo="Produção"
        subtitulo="Cada lote consome materiais, dá entrada nos produtos acabados e guarda o custo real daquele dia."
        acoes={
          <Botao
            variante="primario"
            icone={<Plus className="h-4 w-4" />}
            onClick={() => navegar('/producao/nova')}
          >
            Registrar produção
          </Botao>
        }
      />
      <Cartao semPadding>
        <div className="flex flex-wrap items-end gap-3 border-b border-creme-200 p-4">
          <Campo rotulo="De">
            {({ id }) => (
              <CampoData
                id={id}
                valor={periodo.de}
                onChange={(de) => {
                  setPeriodo({ ...periodo, de });
                  setPagina(1);
                }}
              />
            )}
          </Campo>
          <Campo rotulo="Até">
            {({ id }) => (
              <CampoData
                id={id}
                valor={periodo.ate}
                onChange={(ate) => {
                  setPeriodo({ ...periodo, ate });
                  setPagina(1);
                }}
              />
            )}
          </Campo>
          <Campo rotulo="Produto" className="min-w-[16rem]">
            {({ id }) => (
              <SeletorProduto
                id={id}
                valor={produto}
                onChange={(v) => {
                  setProduto(v);
                  setPagina(1);
                }}
                placeholder="Todos"
              />
            )}
          </Campo>
        </div>
        <div className="p-2">
          <Tabela<Producao>
            legenda="Produções"
            linhas={data?.itens}
            carregando={isLoading}
            chave={(p) => p.id}
            aoClicar={(p) => navegar(`/producao/${p.id}`)}
            vazio={
              <EstadoVazio
                titulo="Nenhuma produção no período"
                descricao="Registre um lote para dar entrada nos produtos acabados."
                acao={
                  <Botao variante="primario" onClick={() => navegar('/producao/nova')}>
                    Registrar produção
                  </Botao>
                }
              />
            }
            colunas={[
              { titulo: 'Data', celula: (p) => formatarData(p.data) },
              { titulo: 'Lote', celula: (p) => <span className="font-medium">#{p.id}</span> },
              { titulo: 'Produto', celula: (p) => p.produtoNome },
              {
                titulo: 'Qtd.',
                alinhar: 'direita',
                celula: (p) => <span className="numero">{p.quantidade}</span>,
              },
              { titulo: 'Ficha', ocultarEmPequeno: true, celula: (p) => `v${p.fichaVersao}` },
              {
                titulo: 'Custo do lote',
                alinhar: 'direita',
                celula: (p) => <span className="numero">{formatarMoeda(p.custoTotal)}</span>,
              },
              {
                titulo: 'Custo por peça',
                alinhar: 'direita',
                ocultarEmPequeno: true,
                celula: (p) => <span className="numero">{formatarMicro(p.custoUnitario)}</span>,
              },
              {
                titulo: '',
                alinhar: 'direita',
                celula: (p) =>
                  p.status === 'cancelada' ? (
                    <Chip>Cancelada</Chip>
                  ) : p.autorizouEstoqueNegativo ? (
                    <Chip tom="ambar">Estoque negativo</Chip>
                  ) : null,
              },
            ]}
          />
          <PaginacaoControles paginacao={data?.paginacao} aoMudar={setPagina} />
        </div>
      </Cartao>
    </>
  );
}
