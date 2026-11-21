import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Aviso {
  id: number;
  tipo: 'sucesso' | 'erro' | 'info';
  texto: string;
}
interface Api {
  sucesso(texto: string): void;
  erro(texto: string): void;
  info(texto: string): void;
}

const Contexto = createContext<Api | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const remover = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const adicionar = useCallback(
    (tipo: Aviso['tipo'], texto: string) => {
      const id = Date.now() + Math.random();
      setAvisos((a) => [...a.slice(-3), { id, tipo, texto }]);
      setTimeout(() => remover(id), tipo === 'erro' ? 9000 : 4500);
    },
    [remover],
  );
  const api = useMemo<Api>(
    () => ({
      sucesso: (t) => adicionar('sucesso', t),
      erro: (t) => adicionar('erro', t),
      info: (t) => adicionar('info', t),
    }),
    [adicionar],
  );
  return (
    <Contexto.Provider value={api}>
      {children}
      <div
        className="toast-area pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2"
        aria-live="polite"
      >
        {avisos.map((a) => (
          <div
            key={a.id}
            role={a.tipo === 'erro' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 rounded-cartao border px-4 py-3 shadow-elevado ${
              a.tipo === 'erro'
                ? 'border-pitanga-200 bg-pitanga-50 text-pitanga-800'
                : a.tipo === 'sucesso'
                  ? 'border-folha-100 bg-folha-50 text-folha-700'
                  : 'border-creme-300 bg-white text-tinta-700'
            }`}
          >
            {a.tipo === 'erro' ? (
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <p className="flex-1 text-sm leading-snug">{a.texto}</p>
            <button
              onClick={() => remover(a.id)}
              className="rounded p-0.5 opacity-60 hover:opacity-100"
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useToast(): Api {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}
