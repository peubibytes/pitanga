import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import type { Paginacao } from '@pitanga/shared';
import { useRef } from 'react';
import { api, mensagemDoErro, ApiError } from './api';
import { useToast } from '../components/ui/toast';

export const criarQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (tentativas, erro) =>
          !(erro instanceof ApiError && erro.status < 500 && erro.status !== 0) && tentativas < 1,
      },
    },
  });

type Parametros = Record<string, string | number | boolean | null | undefined>;

/** Item único: chave ['recurso', id]. */
export function useItem<T>(recurso: string, caminho: string | null, id?: number | string | null) {
  return useQuery({
    queryKey: [recurso, id ?? caminho],
    queryFn: () => api.get<T>(caminho!),
    enabled: caminho !== null,
  });
}

/** Lista paginada: chave ['recurso', parametros]. */
export function useLista<T>(
  recurso: string,
  caminho: string,
  params: Parametros = {},
  ativo = true,
) {
  return useQuery({
    queryKey: [recurso, caminho, params],
    queryFn: () => api.lista<T>(caminho, params),
    placeholderData: keepPreviousData,
    enabled: ativo,
  });
}

/** Resposta simples (não paginada) com chave arbitrária. */
export function useDados<T>(chave: unknown[], caminho: string | null, params?: Parametros) {
  return useQuery({
    queryKey: chave,
    queryFn: () => api.get<T>(caminho!, params),
    enabled: caminho !== null,
  });
}

export type ListaResultado<T> = { itens: T[]; paginacao: Paginacao };

/**
 * Mutação com aviso de sucesso/erro. Depois de gravar, invalida tudo: registrar uma venda altera
 * produtos, financeiro e painel — numa base pequena e local, rebuscar o que está na tela é barato.
 */
export function useMutacao<E, S>(
  fn: (entrada: E) => Promise<S>,
  opcoes: {
    sucesso?: string | ((s: S) => string);
    aoConcluir?: (s: S) => void;
    silencioso?: boolean;
  } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (s) => {
      await qc.invalidateQueries();
      const msg = typeof opcoes.sucesso === 'function' ? opcoes.sucesso(s) : opcoes.sucesso;
      if (msg) toast.sucesso(msg);
      opcoes.aoConcluir?.(s);
    },
    onError: (e) => {
      if (!opcoes.silencioso) toast.erro(mensagemDoErro(e));
    },
  });
}

/**
 * Chave de idempotência por formulário: um duplo clique reenvia a mesma chave e o servidor
 * devolve a primeira resposta. Renova depois de um envio bem-sucedido.
 */
export function useChaveIdempotencia(): { atual: () => string; renovar: () => void } {
  const ref = useRef(crypto.randomUUID());
  return { atual: () => ref.current, renovar: () => (ref.current = crypto.randomUUID()) };
}
