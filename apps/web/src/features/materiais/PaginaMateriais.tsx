import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  UNIDADES,
  UNIDADES_BASE,
  formatarMicro,
  formatarMoeda,
  formatarQuantidade,
  materialSchema,
  valorEmCentavos,
  type Material,
  type MaterialEntrada,
} from '@pitanga/shared';
import type { z } from 'zod';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { SeletorCategoria } from '../../components/selecionadores';
import {
  Alerta,
  Botao,
  Campo,
  Cartao,
  CampoNumero,
  Chip,
  Entrada,
  EstadoVazio,
  Modal,
  PaginacaoControles,
  Selecao,
  Tabela,
} from '../../components/ui';
import { api, mensagemDoErro } from '../../lib/api';
import { useLista, useMutacao } from '../../lib/query';
import { useDebounce } from '../../lib/util';

type Formulario = z.input<typeof materialSchema>;

export function ModalMaterial({
  aberto,
  aoFechar,
  material,
}: {
  aberto: boolean;
  aoFechar: () => void;
  material?: Material;
}) {
  const f = useForm<Formulario>({
    resolver: zodResolver(materialSchema),
    values: {
      nome: material?.nome ?? '',
      categoriaId: material?.categoriaId ?? null,
      unidade: (material?.unidade as Formulario['unidade']) ?? 'un',
      estoqueMinimo: material?.estoqueMinimo ?? null,
      ativo: material?.ativo ?? true,
    },
  });
  const unidade = f.watch('unidade');
  const travada = material?.unidadeTravada ?? false;
  const navegar = useNavigate();
  const salvar = useMutacao(
    (d: MaterialEntrada) =>
      material
        ? api.put<Material>(`/materiais/${material.id}`, d)
        : api.post<Material>('/materiais', d),
    {
      sucesso: material ? 'Material atualizado.' : 'Material cadastrado.',
      // O erro aparece dentro da janela: o aviso flutuante fica atrás dela.
      silencioso: true,
      aoConcluir: (m) => {
        fechar();
        if (!material) navegar(`/materiais/${m.id}`);
      },
    },
  );
  /** Fechar descarta o que foi digitado: reabrir começa do que está salvo. */
  const fechar = () => {
    f.reset();
    salvar.reset();
    aoFechar();
  };
  const e = f.formState.errors;
  const nomesUnidade = Object.fromEntries(UNIDADES.map((u) => [u.codigo, u.nome]));
  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo={material ? 'Editar material' : 'Novo material'}
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
        {salvar.isError && <Alerta tom="pitanga">{mensagemDoErro(salvar.error)}</Alerta>}
        <Campo rotulo="Nome" erro={e.nome?.message} obrigatorio>
          {({ id }) => <Entrada id={id} autoFocus {...f.register('nome')} />}
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
                    tipo="material"
                    permitirNova
                    valor={field.value ?? null}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
          </Campo>
          <Campo
            rotulo="Unidade de controle"
            dica={
              travada
                ? 'Não muda por aqui porque este material já tem compras, ajustes ou receitas.'
                : 'Em que unidade o estoque é contado. Compras em litro, quilo ou caixa são convertidas.'
            }
            erro={e.unidade?.message}
          >
            {({ id, descricao }) =>
              travada ? (
                // Só leitura e fora do formulário: o valor salvo continua em `values` e vai no envio.
                <Entrada
                  id={id}
                  aria-describedby={descricao}
                  disabled
                  value={`${nomesUnidade[unidade] ?? unidade} (${unidade})`}
                />
              ) : (
                <Selecao id={id} aria-describedby={descricao} {...f.register('unidade')}>
                  {UNIDADES_BASE.map((u) => (
                    <option key={u} value={u}>
                      {nomesUnidade[u]} ({u})
                    </option>
                  ))}
                </Selecao>
              )
            }
          </Campo>
        </div>
        <Campo
          rotulo="Estoque mínimo"
          dica="Avisamos no painel quando o estoque chegar a este valor. Deixe vazio para não avisar."
        >
          {({ id }) => (
            <Controller
              control={f.control}
              name="estoqueMinimo"
              render={({ field }) => (
                <CampoNumero
                  id={id}
                  escala={1000}
                  sufixo={unidade}
                  valor={field.value ?? null}
                  onChange={field.onChange}
                />
              )}
            />
          )}
        </Campo>
        {material && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-pitanga-600"
              {...f.register('ativo')}
            />{' '}
            Material ativo
          </label>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export default function PaginaMateriais() {
  const [busca, setBusca] = useState('');
  const [somenteBaixo, setSomenteBaixo] = useState(false);
  const [categoria, setCategoria] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Material | null>(null);
  const termo = useDebounce(busca);
  const navegar = useNavigate();
  const { data, isLoading } = useLista<Material>('materiais', '/materiais', {
    busca: termo,
    estoqueBaixo: somenteBaixo || undefined,
    categoria,
    pagina,
    porPagina: 25,
  });

  return (
    <>
      <PaginaCabecalho
        titulo="Materiais"
        subtitulo="Matérias-primas, embalagens e insumos, com estoque e custo médio."
        acoes={
          <>
            <Botao onClick={() => navegar('/compras/nova')}>Registrar compra</Botao>
            <Botao
              variante="primario"
              icone={<Plus className="h-4 w-4" />}
              onClick={() => setNovo(true)}
            >
              Novo material
            </Botao>
          </>
        }
      />
      <Cartao semPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-creme-200 p-4">
          <div className="relative min-w-[16rem] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-400" />
            <Entrada
              className="pl-9"
              placeholder="Buscar material"
              aria-label="Buscar materiais"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
            />
          </div>
          <div className="w-56">
            <SeletorCategoria
              tipo="material"
              valor={categoria}
              onChange={(v) => {
                setCategoria(v);
                setPagina(1);
              }}
              placeholder="Todas as categorias"
              aria-label="Filtrar por categoria"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-pitanga-600"
              checked={somenteBaixo}
              onChange={(e) => {
                setSomenteBaixo(e.target.checked);
                setPagina(1);
              }}
            />
            Só estoque baixo
          </label>
        </div>
        <div className="p-2">
          <Tabela<Material>
            legenda="Materiais"
            linhas={data?.itens}
            carregando={isLoading}
            chave={(m) => m.id}
            aoClicar={(m) => navegar(`/materiais/${m.id}`)}
            vazio={
              <EstadoVazio
                titulo={
                  termo || somenteBaixo || categoria
                    ? 'Nenhum material encontrado'
                    : 'Nenhum material ainda'
                }
                descricao="Cadastre os materiais para registrar compras e montar fichas técnicas."
                acao={
                  <Botao variante="primario" onClick={() => setNovo(true)}>
                    Cadastrar material
                  </Botao>
                }
              />
            }
            colunas={[
              { titulo: 'Material', celula: (m) => <span className="font-medium">{m.nome}</span> },
              {
                titulo: 'Categoria',
                celula: (m) => m.categoriaNome ?? '—',
                ocultarEmPequeno: true,
              },
              {
                titulo: 'Estoque',
                alinhar: 'direita',
                celula: (m) => (
                  <span
                    className={`numero inline-flex items-center gap-1.5 ${m.estoqueBaixo ? 'font-semibold text-pitanga-700' : ''}`}
                  >
                    {m.estoqueBaixo && (
                      <AlertTriangle className="h-4 w-4" aria-label="Estoque baixo" />
                    )}
                    {formatarQuantidade(m.estoqueAtual, m.unidade)}
                  </span>
                ),
              },
              {
                titulo: 'Mínimo',
                alinhar: 'direita',
                ocultarEmPequeno: true,
                celula: (m) => (
                  <span className="numero text-tinta-500">
                    {m.estoqueMinimo === null
                      ? '—'
                      : formatarQuantidade(m.estoqueMinimo, m.unidade)}
                  </span>
                ),
              },
              {
                titulo: 'Custo médio',
                alinhar: 'direita',
                celula: (m) => (
                  <span className="numero">
                    {m.custoMedio ? `${formatarMicro(m.custoMedio)}/${m.unidade}` : '—'}
                  </span>
                ),
              },
              {
                titulo: 'Valor em estoque',
                alinhar: 'direita',
                ocultarEmPequeno: true,
                celula: (m) => (
                  <span className="numero">
                    {formatarMoeda(valorEmCentavos(Math.max(0, m.estoqueAtual), m.custoMedio))}
                  </span>
                ),
              },
              {
                titulo: '',
                alinhar: 'direita',
                celula: (m) => (
                  <span className="flex items-center justify-end gap-2">
                    {!m.ativo && <Chip>Inativo</Chip>}
                    <Botao
                      tamanho="p"
                      icone={<Pencil className="h-4 w-4" />}
                      aria-label={`Editar ${m.nome}`}
                      onClick={(e) => {
                        // A linha inteira leva ao detalhe; este botão só abre a edição.
                        e.stopPropagation();
                        setEditando(m);
                      }}
                    >
                      Editar
                    </Botao>
                  </span>
                ),
              },
            ]}
          />
          <PaginacaoControles paginacao={data?.paginacao} aoMudar={setPagina} />
        </div>
      </Cartao>
      <ModalMaterial aberto={novo} aoFechar={() => setNovo(false)} />
      <ModalMaterial
        key={editando?.id ?? 'nenhum'}
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        material={editando ?? undefined}
      />
    </>
  );
}
