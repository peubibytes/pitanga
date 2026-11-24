/** Seletores de cadastros usados em vários formulários. Todos carregam a lista de uma vez (base pequena). */
import type {
  Categoria,
  Cliente,
  Fornecedor,
  Material,
  Produto,
  Taxa,
  TipoCategoria,
} from '@pitanga/shared';
import { formatarQuantidade } from '@pitanga/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ModalCategoria } from '../features/categorias/ModalCategoria';
import { api } from '../lib/api';
import { useLista } from '../lib/query';
import { Selecao } from './ui';

interface Base {
  id?: string;
  valor: number | null;
  onChange: (id: number | null) => void;
  erro?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-describedby'?: string;
}

const paraId = (v: string): number | null => (v === '' ? null : Number(v));

export function useMateriais(somenteAtivos = true) {
  return useLista<Material>('materiais', '/materiais', {
    porPagina: 500,
    ativo: somenteAtivos ? true : undefined,
  });
}
export function useProdutos(somenteAtivos = true) {
  return useLista<Produto>('produtos', '/produtos', {
    porPagina: 500,
    ativo: somenteAtivos ? true : undefined,
  });
}
export function useCategorias(tipo: TipoCategoria) {
  return useQuery({
    queryKey: ['categorias', tipo],
    queryFn: () => api.get<Categoria[]>('/categorias', { tipo }),
    staleTime: 60_000,
  });
}
export function useTaxas() {
  return useQuery({ queryKey: ['taxas'], queryFn: () => api.get<Taxa[]>('/taxas') });
}

export function SeletorMaterial({
  valor,
  onChange,
  placeholder = 'Escolha o material',
  excluir = [],
  ...r
}: Base & { excluir?: number[] }) {
  const { data } = useMateriais();
  return (
    <Selecao value={valor ?? ''} onChange={(e) => onChange(paraId(e.target.value))} {...r}>
      <option value="">{placeholder}</option>
      {data?.itens
        .filter((m) => !excluir.includes(m.id) || m.id === valor)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome} ({m.unidade})
          </option>
        ))}
    </Selecao>
  );
}

export function SeletorProduto({
  valor,
  onChange,
  placeholder = 'Escolha o produto',
  comEstoque,
  ...r
}: Base & { comEstoque?: boolean }) {
  const { data } = useProdutos();
  return (
    <Selecao value={valor ?? ''} onChange={(e) => onChange(paraId(e.target.value))} {...r}>
      <option value="">{placeholder}</option>
      {data?.itens.map((p) => (
        <option key={p.id} value={p.id} disabled={comEstoque && p.estoqueAtual <= 0}>
          {p.nome}
          {comEstoque ? ` — ${p.estoqueAtual} em estoque` : ''}
        </option>
      ))}
    </Selecao>
  );
}

export function SeletorCliente({
  valor,
  onChange,
  placeholder = 'Consumidor não identificado',
  ...r
}: Base) {
  const { data } = useLista<Cliente>('clientes', '/clientes', { porPagina: 500, ativo: true });
  return (
    <Selecao value={valor ?? ''} onChange={(e) => onChange(paraId(e.target.value))} {...r}>
      <option value="">{placeholder}</option>
      {data?.itens.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </Selecao>
  );
}

export function SeletorFornecedor({
  valor,
  onChange,
  placeholder = 'Sem fornecedor informado',
  ...r
}: Base) {
  const { data } = useLista<Fornecedor>('fornecedores', '/fornecedores', {
    porPagina: 500,
    ativo: true,
  });
  return (
    <Selecao value={valor ?? ''} onChange={(e) => onChange(paraId(e.target.value))} {...r}>
      <option value="">{placeholder}</option>
      {data?.itens.map((f) => (
        <option key={f.id} value={f.id}>
          {f.nomeLoja}
        </option>
      ))}
    </Selecao>
  );
}

const NOVA_CATEGORIA = 'nova';

/** `permitirNova`: acrescenta "+ Nova categoria" (cadastros; nos filtros não faz sentido). */
export function SeletorCategoria({
  tipo,
  valor,
  onChange,
  placeholder = 'Sem categoria',
  excluir = [],
  permitirNova,
  ...r
}: Base & { tipo: TipoCategoria; excluir?: number[]; permitirNova?: boolean }) {
  const { data } = useCategorias(tipo);
  const [criando, setCriando] = useState(false);
  return (
    <>
      <Selecao
        value={valor ?? ''}
        onChange={(e) =>
          e.target.value === NOVA_CATEGORIA ? setCriando(true) : onChange(paraId(e.target.value))
        }
        {...r}
      >
        <option value="">{placeholder}</option>
        {data
          ?.filter((c) => !excluir.includes(c.id))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        {permitirNova && <option value={NOVA_CATEGORIA}>+ Nova categoria</option>}
      </Selecao>
      {permitirNova && (
        <ModalCategoria
          aberto={criando}
          aoFechar={() => setCriando(false)}
          tipo={tipo}
          aoSalvar={(c) => onChange(c.id)}
        />
      )}
    </>
  );
}

export const rotuloEstoque = (m: Pick<Material, 'estoqueAtual' | 'unidade'>): string =>
  formatarQuantidade(m.estoqueAtual, m.unidade);
