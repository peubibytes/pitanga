import { useEffect } from 'react';

/**
 * Pede confirmação ao fechar a janela enquanto houver alterações não salvas. Na janela do aplicativo
 * quem pergunta é a casca (`will-prevent-unload`); no navegador, o próprio navegador.
 * Passe `false` quando o formulário não está à vista (ex.: janela fechada).
 */
export function useAvisoDeSaida(temAlteracoes: boolean): void {
  useEffect(() => {
    if (!temAlteracoes) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [temAlteracoes]);
}
