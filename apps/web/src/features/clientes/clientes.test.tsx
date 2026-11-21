import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui';
import { criarQueryClient } from '../../lib/query';
import PaginaClientes from './PaginaClientes';

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderizar() {
  return render(
    <QueryClientProvider client={criarQueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <PaginaClientes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('PaginaClientes', () => {
  it('mostra os clientes formatados em pt-BR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        resposta(200, {
          dados: [
            {
              id: 1,
              nome: 'Marina Albuquerque',
              telefone: '11988112030',
              observacao: 'Gosta de lavanda',
              ativo: true,
              criadoEm: '2026-08-01 10:00:00',
            },
          ],
          paginacao: { pagina: 1, porPagina: 25, total: 1 },
        }),
      ),
    );
    renderizar();
    expect(await screen.findByText('Marina Albuquerque')).toBeInTheDocument();
    expect(screen.getByText('(11) 98811-2030')).toBeInTheDocument();
    expect(screen.getByText('01/08/2026')).toBeInTheDocument();
  });

  it('mostra o estado vazio com chamada para cadastrar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        resposta(200, { dados: [], paginacao: { pagina: 1, porPagina: 25, total: 0 } }),
      ),
    );
    renderizar();
    expect(await screen.findByText('Nenhum cliente ainda')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cadastrar o primeiro cliente' }),
    ).toBeInTheDocument();
  });

  it('abre o formulário e valida o nome obrigatório', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        resposta(200, { dados: [], paginacao: { pagina: 1, porPagina: 25, total: 0 } }),
      ),
    );
    renderizar();
    const botao = await screen.findByRole('button', { name: 'Novo cliente' });
    botao.click();
    const salvar = await screen.findByRole('button', { name: 'Salvar' });
    salvar.click();
    expect(await screen.findByText(/Informe o nome/)).toBeInTheDocument();
  });
});
