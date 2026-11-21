import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Sessao, Usuario } from '@pitanga/shared';
import { api } from './api';

/**
 * Modo local, sem tela de entrada: o app roda só em 127.0.0.1 e a API identifica sozinha a
 * administradora do ateliê. Aqui apenas lemos quem é ela.
 */
interface Autenticacao {
  usuario: Usuario | null;
  carregando: boolean;
  ehAdministradora: boolean;
}

const Contexto = createContext<Autenticacao | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sessao'],
    queryFn: () => api.get<Sessao>('/sessao'),
    staleTime: Infinity,
  });

  const valor = useMemo<Autenticacao>(
    () => ({
      usuario: data?.usuario ?? null,
      carregando: isLoading,
      ehAdministradora: data?.usuario?.perfil === 'administradora',
    }),
    [data, isLoading],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): Autenticacao {
  const c = useContext(Contexto);
  if (!c) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return c;
}
