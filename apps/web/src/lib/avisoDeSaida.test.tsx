import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import PaginaCompraNova from '../features/compras/PaginaCompraNova';
import { ModalMaterial } from '../features/materiais/PaginaMateriais';
import { criarQueryClient } from './query';

/** Simula o fechamento da janela: `true` = alguém pediu confirmação. */
const pediuConfirmacao = () => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ dados: [], paginacao: { pagina: 1, porPagina: 500, total: 0 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

const renderizar = (tela: React.ReactNode) =>
  render(
    <QueryClientProvider client={criarQueryClient()}>
      <ToastProvider>
        <MemoryRouter>{tela}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

function ComModal() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button onClick={() => setAberto(true)}>abrir</button>
      <ModalMaterial aberto={aberto} aoFechar={() => setAberto(false)} />
    </>
  );
}

describe('aviso ao fechar com alterações não salvas', () => {
  it('só avisa com o formulário aberto e modificado', async () => {
    const user = userEvent.setup();
    renderizar(<ComModal />);
    expect(pediuConfirmacao()).toBe(false);
    await user.click(screen.getByText('abrir'));
    expect(pediuConfirmacao()).toBe(false);
    await user.type(screen.getByLabelText(/^Nome/), 'Argila');
    expect(pediuConfirmacao()).toBe(true);
    await user.clear(screen.getByLabelText(/^Nome/));
    expect(pediuConfirmacao()).toBe(false);
    await user.type(screen.getByLabelText(/^Nome/), 'Argila');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(pediuConfirmacao()).toBe(false);
  });

  it('vale para telas inteiras e some ao sair delas', async () => {
    const user = userEvent.setup();
    const { unmount } = renderizar(<PaginaCompraNova />);
    await waitFor(() => expect(screen.getByLabelText(/Observa/)).toBeInTheDocument());
    expect(pediuConfirmacao()).toBe(false);
    await user.type(screen.getByLabelText(/Observa/), 'feira');
    expect(pediuConfirmacao()).toBe(true);
    unmount();
    expect(pediuConfirmacao()).toBe(false);
  });
});
