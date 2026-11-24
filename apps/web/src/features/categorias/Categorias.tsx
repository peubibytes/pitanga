import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Categoria, TipoCategoria } from '@pitanga/shared';
import { SeletorCategoria, useCategorias } from '../../components/selecionadores';
import {
  Abas,
  Alerta,
  Botao,
  Campo,
  Cartao,
  ErroDeCarregamento,
  EstadoVazio,
  Modal,
  Tabela,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useMutacao } from '../../lib/query';
import { ModalCategoria } from './ModalCategoria';

const nomeDoItem = (tipo: TipoCategoria, n: number): string =>
  tipo === 'produto'
    ? `${n} ${n === 1 ? 'produto' : 'produtos'}`
    : `${n} ${n === 1 ? 'material' : 'materiais'}`;

/** Remover pede confirmação; com itens dentro, pede também para onde eles vão. */
function ModalRemover({ categoria, aoFechar }: { categoria: Categoria; aoFechar: () => void }) {
  const [destino, setDestino] = useState<number | null>(null);
  const outras = (useCategorias(categoria.tipo).data ?? []).filter((c) => c.id !== categoria.id);
  const comItens = categoria.emUso > 0;
  const semDestinoPossivel = comItens && outras.length === 0;
  const remover = useMutacao(
    () =>
      api.delete(`/categorias/${categoria.id}${destino !== null ? `?moverPara=${destino}` : ''}`),
    { sucesso: 'Categoria removida.', naJanela: true, aoConcluir: aoFechar },
  );
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Remover "${categoria.nome}"?`}
      tamanho="p"
      erro={remover.error}
      rodape={
        <>
          <Botao onClick={aoFechar}>Voltar</Botao>
          <Botao
            variante="primario"
            carregando={remover.isPending}
            disabled={comItens && destino === null}
            onClick={() => remover.mutate(undefined)}
          >
            {comItens ? 'Mover e remover' : 'Remover categoria'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4 text-sm text-tinta-600">
        {!comItens && <p>Nenhum item usa esta categoria. Ela some das listas de escolha.</p>}
        {semDestinoPossivel && (
          <Alerta tom="ambar">
            Há {nomeDoItem(categoria.tipo, categoria.emUso)} nesta categoria e não existe outra para
            recebê-los. Crie uma categoria nova antes de remover esta.
          </Alerta>
        )}
        {comItens && !semDestinoPossivel && (
          <>
            <p>
              Há {nomeDoItem(categoria.tipo, categoria.emUso)} nesta categoria, contando os
              inativos. Escolha para onde levar antes de remover.
            </p>
            <Campo rotulo="Mover para" obrigatorio>
              {({ id }) => (
                <SeletorCategoria
                  id={id}
                  tipo={categoria.tipo}
                  excluir={[categoria.id]}
                  valor={destino}
                  onChange={setDestino}
                  placeholder="Escolha a categoria"
                />
              )}
            </Campo>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Configurações → Categorias: listar, criar, renomear e remover, separadas por tipo. */
export function Categorias() {
  const [tipo, setTipo] = useState<TipoCategoria>('produto');
  const [editando, setEditando] = useState<Categoria | 'nova' | null>(null);
  const [removendo, setRemovendo] = useState<Categoria | null>(null);
  const lista = useCategorias(tipo);
  return (
    <>
      <Cartao
        titulo="Categorias"
        acao={
          <Botao
            tamanho="p"
            variante="primario"
            icone={<Plus className="h-4 w-4" />}
            onClick={() => setEditando('nova')}
          >
            Nova categoria
          </Botao>
        }
      >
        <Abas
          ativa={tipo}
          aoMudar={setTipo}
          abas={[
            { id: 'produto', rotulo: 'De produtos' },
            { id: 'material', rotulo: 'De materiais' },
          ]}
        />
        {lista.isError ? (
          <ErroDeCarregamento erro={lista.error} aoTentar={() => void lista.refetch()} />
        ) : (
          <Tabela<Categoria>
            legenda={tipo === 'produto' ? 'Categorias de produtos' : 'Categorias de materiais'}
            linhas={lista.data}
            carregando={lista.isLoading}
            chave={(c) => c.id}
            vazio={
              <EstadoVazio
                titulo="Nenhuma categoria"
                descricao="Crie categorias para organizar e filtrar as suas listas."
              />
            }
            colunas={[
              {
                titulo: 'Categoria',
                celula: (c) => <span className="font-medium">{c.nome}</span>,
              },
              {
                titulo: 'Em uso',
                alinhar: 'direita',
                celula: (c) => (
                  <span className="numero text-tinta-500">
                    {c.emUso === 0 ? '—' : nomeDoItem(tipo, c.emUso)}
                  </span>
                ),
              },
              {
                titulo: '',
                alinhar: 'direita',
                celula: (c) => (
                  <span className="flex justify-end gap-2">
                    <Botao
                      tamanho="p"
                      icone={<Pencil className="h-4 w-4" />}
                      aria-label={`Renomear ${c.nome}`}
                      onClick={() => setEditando(c)}
                    >
                      Renomear
                    </Botao>
                    <Botao
                      tamanho="p"
                      variante="perigo"
                      icone={<Trash2 className="h-4 w-4" />}
                      aria-label={`Remover ${c.nome}`}
                      onClick={() => setRemovendo(c)}
                    >
                      Remover
                    </Botao>
                  </span>
                ),
              },
            ]}
          />
        )}
      </Cartao>
      <ModalCategoria
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        tipo={tipo}
        categoria={editando && editando !== 'nova' ? editando : undefined}
      />
      {removendo && (
        <ModalRemover
          key={removendo.id}
          categoria={removendo}
          aoFechar={() => setRemovendo(null)}
        />
      )}
    </>
  );
}
