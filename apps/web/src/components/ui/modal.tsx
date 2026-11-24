import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Botao } from './botao';
import { Entrada } from './campo';

interface ModalProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  rodape?: ReactNode;
  tamanho?: 'p' | 'm' | 'g';
}

/** Janela modal sobre o elemento <dialog>: foco preso, ESC fecha, leitores de tela anunciam o título. */
export function Modal({ aberto, aoFechar, titulo, children, rodape, tamanho = 'm' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Id próprio: uma janela pode abrir sobre outra (ex.: nova categoria dentro de um cadastro).
  const tituloId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      d.showModal();
      // O navegador focaria o "X"; quem abre uma janela com campos quer digitar no primeiro.
      d.querySelector<HTMLElement>(
        '[data-conteudo] :is(input, select, textarea):not(:disabled, [type=hidden])',
      )?.focus();
    }
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={tituloId}
      onCancel={(e) => {
        // No React o "cancel" sobe pela árvore: Esc na janela de cima não pode fechar a de baixo.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
      className={clsx(
        'm-auto w-[calc(100vw-2rem)] rounded-cartao border-0 bg-white p-0 text-tinta-900 shadow-elevado',
        tamanho === 'p' ? 'max-w-md' : tamanho === 'm' ? 'max-w-xl' : 'max-w-3xl',
      )}
    >
      {aberto && (
        <div className="flex max-h-[88vh] flex-col">
          <header className="flex items-center justify-between border-b border-creme-200 px-5 py-4">
            <h2 id={tituloId} className="text-xl">
              {titulo}
            </h2>
            <button
              onClick={aoFechar}
              className="rounded-full p-1.5 text-tinta-500 hover:bg-creme-200"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div data-conteudo className="overflow-y-auto p-5">
            {children}
          </div>
          {rodape && (
            <footer className="flex justify-end gap-2 border-t border-creme-200 bg-creme-50 px-5 py-3">
              {rodape}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmarProps {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar: () => void;
  titulo: string;
  mensagem: ReactNode;
  rotuloConfirmar?: string;
  perigo?: boolean;
  carregando?: boolean;
  /** Exige digitar esta palavra para habilitar a confirmação (operações destrutivas). */
  palavraDeConfirmacao?: string;
}

export function Confirmar({
  aberto,
  aoFechar,
  aoConfirmar,
  titulo,
  mensagem,
  rotuloConfirmar = 'Confirmar',
  perigo,
  carregando,
  palavraDeConfirmacao,
}: ConfirmarProps) {
  const [digitado, setDigitado] = useState('');
  useEffect(() => {
    if (!aberto) setDigitado('');
  }, [aberto]);
  const liberado = !palavraDeConfirmacao || digitado === palavraDeConfirmacao;
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      tamanho="p"
      rodape={
        <>
          <Botao onClick={aoFechar}>Voltar</Botao>
          <Botao
            variante={perigo ? 'primario' : 'primario'}
            onClick={aoConfirmar}
            disabled={!liberado}
            carregando={carregando}
          >
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      <div className="space-y-3 text-sm text-tinta-600">
        <div>{mensagem}</div>
        {palavraDeConfirmacao && (
          <label className="block">
            <span className="mb-1 block font-medium text-tinta-700">
              Para continuar, digite <strong>{palavraDeConfirmacao}</strong>
            </span>
            <Entrada
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </label>
        )}
      </div>
    </Modal>
  );
}
