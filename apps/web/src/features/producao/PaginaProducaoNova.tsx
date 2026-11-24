import { useQuery } from '@tanstack/react-query';
import { Check, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  formatarMicro,
  formatarMoeda,
  formatarQuantidade,
  hojeISO,
  type Producao,
  type SimulacaoProducao,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorProduto } from '../../components/selecionadores';
import {
  Alerta,
  AreaDeTexto,
  Botao,
  Campo,
  CampoData,
  CampoNumero,
  Cartao,
  Chip,
  Confirmar,
  Entrada,
  Esqueleto,
  Tabela,
} from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useChaveIdempotencia, useMutacao } from '../../lib/query';
import { useDebounce } from '../../lib/util';

export default function PaginaProducaoNova() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const chave = useChaveIdempotencia();
  const [produtoId, setProdutoId] = useState<number | null>(
    params.get('produto') ? Number(params.get('produto')) : null,
  );
  const [quantidade, setQuantidade] = useState<number | null>(1);
  const [data, setData] = useState(hojeISO());
  const [observacao, setObservacao] = useState('');
  const [forcar, setForcar] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const qtd = useDebounce(quantidade ?? 0, 250);
  const inicial = params.get('produto') ? Number(params.get('produto')) : null;
  useAvisoDeSaida(
    produtoId !== inicial || quantidade !== 1 || observacao !== '' || justificativa !== '',
  );

  const simulacao = useQuery({
    queryKey: ['simulacao-producao', produtoId, qtd],
    queryFn: () =>
      api.post<SimulacaoProducao>('/producoes/simular', { produtoId, quantidade: qtd }),
    enabled: !!produtoId && qtd > 0,
    retry: false,
  });
  const s = simulacao.data;
  const semFicha =
    simulacao.error instanceof ApiError &&
    (simulacao.error.codigo === 'SEM_FICHA' || simulacao.error.codigo === 'FICHA_VAZIA');

  const registrar = useMutacao(
    (negativo: boolean) =>
      api.post<Producao>(
        '/producoes',
        {
          produtoId,
          quantidade,
          data,
          observacao: observacao || null,
          autorizarEstoqueNegativo: negativo,
          justificativaEstoqueNegativo: negativo ? justificativa : undefined,
        },
        chave.atual(),
      ),
    {
      sucesso: (p) =>
        `Lote #${p.id} registrado: materiais baixados e ${p.quantidade} peças em estoque.`,
      naJanela: forcar,
      aoConcluir: (p) => {
        chave.renovar();
        navegar(`/producao/${p.id}`);
      },
    },
  );

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: '/producao', rotulo: 'Produção' }}
        titulo="Registrar produção"
        subtitulo="Escolha o produto e a quantidade: mostramos o que será usado e se há material suficiente."
      />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Cartao titulo="O que você vai produzir?">
          <div className="space-y-4">
            <Campo rotulo="Produto" obrigatorio>
              {({ id }) => <SeletorProduto id={id} valor={produtoId} onChange={setProdutoId} />}
            </Campo>
            <Campo
              rotulo="Quantidade de peças"
              dica={s ? `A ficha rende ${s.rendimento} por lote.` : undefined}
              obrigatorio
            >
              {({ id }) => (
                <CampoNumero
                  id={id}
                  escala={1}
                  sufixo="un."
                  valor={quantidade}
                  onChange={setQuantidade}
                />
              )}
            </Campo>
            <Campo rotulo="Data da produção">
              {({ id }) => <CampoData id={id} valor={data} onChange={setData} />}
            </Campo>
            <Campo rotulo="Observação">
              {({ id }) => (
                <Entrada
                  id={id}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              )}
            </Campo>
          </div>
        </Cartao>

        <div className="space-y-6">
          {!produtoId && <Alerta tom="neutro">Escolha um produto para ver a simulação.</Alerta>}
          {semFicha && (
            <Alerta
              tom="ambar"
              titulo="Falta a ficha técnica"
              acao={
                <Link to={`/produtos/${produtoId}/ficha`}>
                  <Botao tamanho="p" variante="primario">
                    Montar ficha
                  </Botao>
                </Link>
              }
            >
              {simulacao.error instanceof ApiError ? simulacao.error.message : ''}
            </Alerta>
          )}
          {simulacao.isError && !semFicha && (
            <Alerta tom="pitanga">
              {simulacao.error instanceof ApiError
                ? simulacao.error.message
                : 'Não foi possível simular.'}
            </Alerta>
          )}
          {simulacao.isFetching && !s && <Esqueleto linhas={5} />}
          {s && (
            <>
              <Cartao
                titulo={`Necessidades para ${s.quantidade} peça${s.quantidade === 1 ? '' : 's'} de ${s.produtoNome}`}
                semPadding
              >
                <div className="p-2">
                  <Tabela<SimulacaoProducao['itens'][number]>
                    legenda="Materiais necessários"
                    linhas={s.itens}
                    chave={(i) => i.materialId}
                    colunas={[
                      {
                        titulo: 'Material',
                        celula: (i) => <span className="font-medium">{i.nome}</span>,
                      },
                      {
                        titulo: 'Necessário',
                        alinhar: 'direita',
                        celula: (i) => (
                          <span className="numero">
                            {formatarQuantidade(i.necessario, i.unidade)}
                          </span>
                        ),
                      },
                      {
                        titulo: 'Em estoque',
                        alinhar: 'direita',
                        celula: (i) => (
                          <span className="numero">
                            {formatarQuantidade(i.disponivel, i.unidade)}
                          </span>
                        ),
                      },
                      {
                        titulo: 'Custo estimado',
                        alinhar: 'direita',
                        ocultarEmPequeno: true,
                        celula: (i) => (
                          <span className="numero">{formatarMoeda(i.custoEstimado)}</span>
                        ),
                      },
                      {
                        titulo: 'Situação',
                        alinhar: 'direita',
                        celula: (i) =>
                          i.falta > 0 ? (
                            <Chip tom="pitanga">
                              <TriangleAlert className="h-3.5 w-3.5" /> Faltam{' '}
                              {formatarQuantidade(i.falta, i.unidade)}
                            </Chip>
                          ) : (
                            <Chip tom="folha">
                              <Check className="h-3.5 w-3.5" /> Disponível
                            </Chip>
                          ),
                      },
                    ]}
                  />
                </div>
              </Cartao>

              <Cartao titulo="Custo do lote">
                <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-tinta-500">Materiais</dt>
                    <dd className="numero text-lg">{formatarMoeda(s.custoMateriais)}</dd>
                  </div>
                  <div>
                    <dt className="text-tinta-500">Mão de obra</dt>
                    <dd className="numero text-lg">{formatarMoeda(s.custoMaoObra)}</dd>
                  </div>
                  <div>
                    <dt className="text-tinta-500">Outros custos e rateios</dt>
                    <dd className="numero text-lg">
                      {formatarMoeda(s.custoExtras + s.custoRateios)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-tinta-500">Custo total</dt>
                    <dd className="numero font-titulo text-2xl text-pitanga-700">
                      {formatarMoeda(s.custoTotal)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm text-tinta-500">
                  Custo por peça: <span className="numero">{formatarMicro(s.custoUnitario)}</span>.
                  Entram no estoque de acabados {formatarMoeda(s.custoEstoqueTotal)}
                  {!s.remuneraMaoObra && s.custoMaoObra > 0
                    ? ' — sua mão de obra entra no preço, mas não no valor do estoque'
                    : ''}
                  .
                </p>
              </Cartao>

              {!s.possivel && (
                <Alerta tom="pitanga" titulo="Não há material suficiente">
                  <p>
                    {s.itens
                      .filter((i) => i.falta > 0)
                      .map((i) => `${formatarQuantidade(i.falta, i.unidade)} de ${i.nome}`)
                      .join('; ')}
                    .
                  </p>
                  <p className="mt-1">
                    Registre uma{' '}
                    <Link to="/compras/nova" className="font-medium underline">
                      compra
                    </Link>{' '}
                    ou reduza a quantidade.
                    {s.permiteEstoqueNegativo
                      ? ' Se o material já está a caminho, você pode produzir mesmo assim, com justificativa.'
                      : ''}
                  </p>
                </Alerta>
              )}
              <div className="flex justify-end gap-2">
                <Botao onClick={() => navegar('/producao')}>Cancelar</Botao>
                {s.possivel ? (
                  <Botao
                    variante="primario"
                    carregando={registrar.isPending}
                    disabled={!quantidade}
                    onClick={() => registrar.mutate(false)}
                  >
                    Registrar produção
                  </Botao>
                ) : (
                  <Botao
                    variante="perigo"
                    disabled={!s.permiteEstoqueNegativo}
                    onClick={() => setForcar(true)}
                  >
                    Produzir mesmo assim…
                  </Botao>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <Confirmar
        aberto={forcar}
        aoFechar={() => setForcar(false)}
        aoConfirmar={() => registrar.mutate(true)}
        carregando={registrar.isPending}
        erro={registrar.error}
        perigo
        titulo="Produzir com estoque negativo?"
        rotuloConfirmar="Produzir mesmo assim"
        mensagem={
          <div className="space-y-3">
            <p>
              Os materiais em falta ficarão com saldo negativo até a próxima compra. Fica registrado
              quem autorizou e por quê.
            </p>
            <AreaDeTexto
              placeholder="Justificativa (obrigatória)"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              aria-label="Justificativa"
            />
          </div>
        }
      />
    </>
  );
}
