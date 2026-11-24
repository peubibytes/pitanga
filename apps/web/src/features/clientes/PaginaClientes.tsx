import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  clienteSchema,
  formatarData,
  formatarTelefone,
  type Cliente,
  type ClienteEntrada,
} from '@pitanga/shared';
import type { z } from 'zod';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import {
  AreaDeTexto,
  Botao,
  Campo,
  Cartao,
  Chip,
  Entrada,
  EstadoVazio,
  Modal,
  PaginacaoControles,
  Tabela,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useLista, useMutacao } from '../../lib/query';
import { useDebounce } from '../../lib/util';

type Formulario = z.input<typeof clienteSchema>;

/** Formulário de cliente (criação e edição), também usado na ficha do cliente. */
export function ModalCliente({
  aberto,
  aoFechar,
  cliente,
}: {
  aberto: boolean;
  aoFechar: () => void;
  cliente?: Cliente;
}) {
  const f = useForm<Formulario>({
    resolver: zodResolver(clienteSchema),
    values: {
      nome: cliente?.nome ?? '',
      telefone: cliente?.telefone ?? '',
      observacao: cliente?.observacao ?? '',
      ativo: cliente?.ativo ?? true,
    },
  });
  useAvisoDeSaida(aberto && f.formState.isDirty);
  const navegar = useNavigate();
  const salvar = useMutacao(
    (d: ClienteEntrada) =>
      cliente ? api.put<Cliente>(`/clientes/${cliente.id}`, d) : api.post<Cliente>('/clientes', d),
    {
      sucesso: cliente ? 'Cliente atualizado.' : 'Cliente cadastrado.',
      aoConcluir: (c) => {
        aoFechar();
        f.reset();
        if (!cliente) navegar(`/clientes/${c.id}`);
      },
    },
  );
  const e = f.formState.errors;
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={cliente ? 'Editar cliente' : 'Novo cliente'}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
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
        <Campo rotulo="Telefone / WhatsApp" erro={e.telefone?.message}>
          {({ id }) => (
            <Entrada
              id={id}
              inputMode="tel"
              placeholder="(11) 90000-0000"
              {...f.register('telefone')}
            />
          )}
        </Campo>
        <Campo rotulo="Observações" dica="Gostos, aromas favoritos, datas especiais…">
          {({ id }) => <AreaDeTexto id={id} {...f.register('observacao')} />}
        </Campo>
        {cliente && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-pitanga-600"
              {...f.register('ativo')}
            />{' '}
            Cliente ativo
          </label>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export default function PaginaClientes() {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);
  const termo = useDebounce(busca);
  const { data, isLoading } = useLista<Cliente>('clientes', '/clientes', {
    busca: termo,
    pagina,
    porPagina: 25,
  });
  const navegar = useNavigate();

  return (
    <>
      <PaginaCabecalho
        titulo="Clientes"
        subtitulo="Quem compra de você, com histórico e total comprado."
        acoes={
          <Botao
            variante="primario"
            icone={<Plus className="h-4 w-4" />}
            onClick={() => setNovo(true)}
          >
            Novo cliente
          </Botao>
        }
      />
      <Cartao semPadding>
        <div className="border-b border-creme-200 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-400" />
            <Entrada
              className="pl-9"
              placeholder="Buscar por nome ou telefone"
              aria-label="Buscar clientes"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
            />
          </div>
        </div>
        <div className="p-2">
          <Tabela<Cliente>
            legenda="Clientes"
            linhas={data?.itens}
            carregando={isLoading}
            chave={(c) => c.id}
            aoClicar={(c) => navegar(`/clientes/${c.id}`)}
            vazio={
              <EstadoVazio
                titulo={termo ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
                descricao={
                  termo
                    ? 'Tente outro nome ou telefone.'
                    : 'Cadastre quem compra de você para acompanhar o histórico.'
                }
                acao={
                  !termo && (
                    <Botao variante="primario" onClick={() => setNovo(true)}>
                      Cadastrar o primeiro cliente
                    </Botao>
                  )
                }
              />
            }
            colunas={[
              { titulo: 'Nome', celula: (c) => <span className="font-medium">{c.nome}</span> },
              {
                titulo: 'Telefone',
                celula: (c) => formatarTelefone(c.telefone),
                ocultarEmPequeno: true,
              },
              {
                titulo: 'Observações',
                celula: (c) => (
                  <span className="line-clamp-1 text-tinta-500">{c.observacao ?? '—'}</span>
                ),
                ocultarEmPequeno: true,
              },
              { titulo: 'Desde', celula: (c) => formatarData(c.criadoEm), ocultarEmPequeno: true },
              {
                titulo: 'Situação',
                celula: (c) => (
                  <Chip tom={c.ativo ? 'folha' : 'neutro'}>{c.ativo ? 'Ativo' : 'Inativo'}</Chip>
                ),
                alinhar: 'direita',
              },
            ]}
          />
          <PaginacaoControles paginacao={data?.paginacao} aoMudar={setPagina} />
        </div>
      </Cartao>
      <ModalCliente aberto={novo} aoFechar={() => setNovo(false)} />
    </>
  );
}
