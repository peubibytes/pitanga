import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { fornecedorSchema, type Fornecedor, type FornecedorEntrada } from '@pitanga/shared';
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
import { useLista, useMutacao } from '../../lib/query';
import { useDebounce } from '../../lib/util';

type Formulario = z.input<typeof fornecedorSchema>;

function ModalFornecedor({
  aberto,
  aoFechar,
  fornecedor,
}: {
  aberto: boolean;
  aoFechar: () => void;
  fornecedor?: Fornecedor;
}) {
  const f = useForm<Formulario>({
    resolver: zodResolver(fornecedorSchema),
    values: {
      nomeLoja: fornecedor?.nomeLoja ?? '',
      contato: fornecedor?.contato ?? '',
      observacao: fornecedor?.observacao ?? '',
      ativo: fornecedor?.ativo ?? true,
    },
  });
  const salvar = useMutacao(
    (d: FornecedorEntrada) =>
      fornecedor
        ? api.put<Fornecedor>(`/fornecedores/${fornecedor.id}`, d)
        : api.post<Fornecedor>('/fornecedores', d),
    {
      sucesso: fornecedor ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.',
      aoConcluir: () => {
        aoFechar();
        f.reset();
      },
    },
  );
  const e = f.formState.errors;
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}
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
        <Campo rotulo="Nome da loja" erro={e.nomeLoja?.message} obrigatorio>
          {({ id }) => <Entrada id={id} autoFocus {...f.register('nomeLoja')} />}
        </Campo>
        <Campo rotulo="Contato" dica="Telefone, e-mail, site ou nome da pessoa.">
          {({ id }) => <Entrada id={id} {...f.register('contato')} />}
        </Campo>
        <Campo rotulo="Observações" dica="O que você compra aqui, prazo de entrega, condições…">
          {({ id }) => <AreaDeTexto id={id} {...f.register('observacao')} />}
        </Campo>
        {fornecedor && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-pitanga-600"
              {...f.register('ativo')}
            />{' '}
            Fornecedor ativo
          </label>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export default function PaginaFornecedores() {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<Fornecedor | 'novo' | null>(null);
  const termo = useDebounce(busca);
  const { data, isLoading } = useLista<Fornecedor>('fornecedores', '/fornecedores', {
    busca: termo,
    pagina,
    porPagina: 25,
  });

  return (
    <>
      <PaginaCabecalho
        titulo="Fornecedores"
        subtitulo="Onde você compra os materiais."
        acoes={
          <Botao
            variante="primario"
            icone={<Plus className="h-4 w-4" />}
            onClick={() => setAberto('novo')}
          >
            Novo fornecedor
          </Botao>
        }
      />
      <Cartao semPadding>
        <div className="border-b border-creme-200 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-400" />
            <Entrada
              className="pl-9"
              placeholder="Buscar fornecedor"
              aria-label="Buscar fornecedores"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
            />
          </div>
        </div>
        <div className="p-2">
          <Tabela<Fornecedor>
            legenda="Fornecedores"
            linhas={data?.itens}
            carregando={isLoading}
            chave={(f) => f.id}
            aoClicar={(f) => setAberto(f)}
            vazio={
              <EstadoVazio
                titulo={termo ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor ainda'}
                descricao="Cadastre as lojas onde você compra para registrar as compras de material."
              />
            }
            colunas={[
              { titulo: 'Loja', celula: (f) => <span className="font-medium">{f.nomeLoja}</span> },
              { titulo: 'Contato', celula: (f) => f.contato ?? '—', ocultarEmPequeno: true },
              {
                titulo: 'Observações',
                celula: (f) => (
                  <span className="line-clamp-1 text-tinta-500">{f.observacao ?? '—'}</span>
                ),
                ocultarEmPequeno: true,
              },
              {
                titulo: 'Situação',
                celula: (f) => (
                  <Chip tom={f.ativo ? 'folha' : 'neutro'}>{f.ativo ? 'Ativo' : 'Inativo'}</Chip>
                ),
                alinhar: 'direita',
              },
            ]}
          />
          <PaginacaoControles paginacao={data?.paginacao} aoMudar={setPagina} />
        </div>
      </Cartao>
      <ModalFornecedor
        aberto={aberto !== null}
        aoFechar={() => setAberto(null)}
        fornecedor={aberto && aberto !== 'novo' ? aberto : undefined}
      />
    </>
  );
}
