import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ROTULO_STATUS_VENDA,
  formatarData,
  formatarMoeda,
  formatarTelefone,
  type Cliente,
  type ClienteResumo,
  type Venda,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import {
  Abas,
  Botao,
  Cartao,
  Chip,
  Dado,
  ErroDeCarregamento,
  EstadoVazio,
  Esqueleto,
  Indicador,
  PaginacaoControles,
  Tabela,
} from '../../components/ui';
import { useDados, useItem, useLista } from '../../lib/query';
import { ModalCliente } from './PaginaClientes';

export default function PaginaClienteDetalhe() {
  const id = Number(useParams().id);
  const [aba, setAba] = useState<'dados' | 'compras' | 'resumo'>('resumo');
  const [editar, setEditar] = useState(false);
  const [pagina, setPagina] = useState(1);
  const cliente = useItem<Cliente>('cliente', `/clientes/${id}`, id);
  const resumo = useDados<ClienteResumo>(['cliente-resumo', id], `/clientes/${id}/resumo`);
  const compras = useLista<Venda>(
    'cliente-compras',
    `/clientes/${id}/compras`,
    { pagina, porPagina: 15 },
    aba === 'compras',
  );

  if (cliente.isLoading) return <Esqueleto linhas={4} />;
  if (cliente.isError)
    return <ErroDeCarregamento erro={cliente.error} aoTentar={() => void cliente.refetch()} />;
  const c = cliente.data!;
  const r = resumo.data;

  return (
    <>
      <PaginaCabecalho
        voltar={{ para: '/clientes', rotulo: 'Clientes' }}
        titulo={c.nome}
        subtitulo={`${formatarTelefone(c.telefone)} · cliente desde ${formatarData(c.criadoEm)}`}
        acoes={
          <>
            <Link to={`/vendas/nova?cliente=${c.id}`}>
              <Botao variante="primario">Nova venda</Botao>
            </Link>
            <Botao icone={<Pencil className="h-4 w-4" />} onClick={() => setEditar(true)}>
              Editar
            </Botao>
          </>
        }
      />
      <Abas
        ativa={aba}
        aoMudar={setAba}
        abas={[
          { id: 'resumo', rotulo: 'Resumo' },
          { id: 'compras', rotulo: 'Compras' },
          { id: 'dados', rotulo: 'Dados' },
        ]}
      />
      {aba === 'resumo' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador
            rotulo="Total comprado"
            valor={formatarMoeda(r?.totalComprado ?? 0)}
            tom="folha"
          />
          <Indicador rotulo="Compras" valor={r?.quantidadeCompras ?? 0} />
          <Indicador
            rotulo="Ticket médio"
            valor={formatarMoeda(r?.ticketMedio ?? 0)}
            detalhe={
              r?.ultimaCompra
                ? `Última compra em ${formatarData(r.ultimaCompra)}`
                : 'Ainda não comprou'
            }
          />
          <Indicador
            rotulo="A receber"
            valor={formatarMoeda(r?.totalPendente ?? 0)}
            tom={r && r.totalPendente > 0 ? 'pitanga' : 'neutro'}
            detalhe="Vendas ainda não quitadas"
          />
        </div>
      )}
      {aba === 'compras' && (
        <Cartao semPadding>
          <div className="p-2">
            <Tabela<Venda>
              legenda="Compras do cliente"
              linhas={compras.data?.itens}
              carregando={compras.isLoading}
              chave={(v) => v.id}
              vazio={
                <EstadoVazio
                  titulo="Nenhuma compra ainda"
                  descricao="As vendas feitas para este cliente aparecem aqui."
                />
              }
              colunas={[
                { titulo: 'Data', celula: (v) => formatarData(v.data) },
                {
                  titulo: 'Venda',
                  celula: (v) => (
                    <Link
                      className="font-medium text-pitanga-700 hover:underline"
                      to={`/vendas/${v.id}`}
                    >
                      #{v.id}
                    </Link>
                  ),
                },
                {
                  titulo: 'Situação',
                  celula: (v) => (
                    <Chip
                      tom={
                        v.status === 'concluida'
                          ? 'folha'
                          : v.status === 'pendente'
                            ? 'ambar'
                            : 'neutro'
                      }
                    >
                      {ROTULO_STATUS_VENDA[v.status]}
                    </Chip>
                  ),
                },
                {
                  titulo: 'Total',
                  celula: (v) => <span className="numero">{formatarMoeda(v.total)}</span>,
                  alinhar: 'direita',
                },
              ]}
            />
            <PaginacaoControles paginacao={compras.data?.paginacao} aoMudar={setPagina} />
          </div>
        </Cartao>
      )}
      {aba === 'dados' && (
        <Cartao>
          <dl className="grid gap-5 sm:grid-cols-2">
            <Dado rotulo="Nome">{c.nome}</Dado>
            <Dado rotulo="Telefone">{formatarTelefone(c.telefone)}</Dado>
            <Dado rotulo="Situação">
              <Chip tom={c.ativo ? 'folha' : 'neutro'}>{c.ativo ? 'Ativo' : 'Inativo'}</Chip>
            </Dado>
            <Dado rotulo="Observações" className="sm:col-span-2">
              {c.observacao ?? '—'}
            </Dado>
          </dl>
        </Cartao>
      )}
      <ModalCliente aberto={editar} aoFechar={() => setEditar(false)} cliente={c} />
    </>
  );
}
