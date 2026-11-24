import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Material } from '@pitanga/shared';
import { ToastProvider } from '../../components/ui';
import { criarQueryClient } from '../../lib/query';
import PaginaMateriais, { ModalMaterial } from './PaginaMateriais';

const alcool: Material = {
  id: 7,
  nome: 'Álcool de Cereais 1lt',
  categoriaId: null,
  categoriaNome: null,
  unidade: 'ml',
  estoqueAtual: 1_000_000,
  estoqueMinimo: 200_000,
  custoMedio: 28_000,
  ativo: true,
  estoqueBaixo: false,
  unidadeTravada: true,
};

interface Chamada {
  metodo: string;
  url: string;
  corpo: any;
}

/** API de mentira: responde a lista de materiais e guarda o que foi enviado. */
function simularApi(put: { status: number; corpo: unknown } = { status: 200, corpo: {} }) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, o: RequestInit) => {
      const metodo = o.method ?? 'GET';
      chamadas.push({ metodo, url, corpo: o.body ? JSON.parse(String(o.body)) : undefined });
      const [status, corpo] =
        metodo === 'PUT'
          ? [put.status, put.corpo]
          : url.startsWith('/api/materiais')
            ? [200, { dados: [alcool], paginacao: { pagina: 1, porPagina: 25, total: 1 } }]
            : [200, { dados: [] }];
      return new Response(JSON.stringify(corpo), {
        status: status as number,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return { envios: () => chamadas.filter((c) => c.metodo === 'PUT') };
}

function ComModal({ material }: { material: Material }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button onClick={() => setAberto(true)}>abrir</button>
      <ModalMaterial aberto={aberto} aoFechar={() => setAberto(false)} material={material} />
    </>
  );
}

function renderizar(conteudo: React.ReactNode) {
  return render(
    <QueryClientProvider client={criarQueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={conteudo} />
            <Route path="/materiais/:id" element={<p>tela de detalhe</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ModalMaterial (edição)', () => {
  // Hipótese do plano de ação: com a unidade travada, o react-hook-form omitiria o valor e o zod
  // recusaria. Não se confirmou; estes testes garantem que continue assim.
  it.each([true, false])('envia a unidade ao trocar só o nome (travada: %s)', async (travada) => {
    const { envios } = simularApi();
    const user = userEvent.setup();
    renderizar(<ComModal material={{ ...alcool, unidadeTravada: travada }} />);
    await user.click(screen.getByText('abrir'));
    const nome = screen.getByLabelText(/^Nome/);
    await user.clear(nome);
    await user.type(nome, 'Álcool de cereais');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(envios()).toHaveLength(1));
    expect(envios()[0]!.corpo).toEqual({
      nome: 'Álcool de cereais',
      categoriaId: null,
      unidade: 'ml',
      estoqueMinimo: 200_000,
      ativo: true,
    });
  });

  it('mostra a unidade só para leitura quando ela está travada', async () => {
    simularApi();
    const user = userEvent.setup();
    renderizar(<ComModal material={alcool} />);
    await user.click(screen.getByText('abrir'));
    const unidade = screen.getByLabelText('Unidade de controle');
    expect(unidade).toHaveValue('Mililitro (ml)');
    expect(unidade).toBeDisabled();
    expect(unidade).toHaveAccessibleDescription(/Não muda por aqui/);
  });

  it('deixa escolher a unidade quando o material ainda não foi usado', async () => {
    const { envios } = simularApi();
    const user = userEvent.setup();
    renderizar(<ComModal material={{ ...alcool, unidadeTravada: false }} />);
    await user.click(screen.getByText('abrir'));
    await user.selectOptions(screen.getByLabelText('Unidade de controle'), 'g');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(envios()[0]?.corpo.unidade).toBe('g'));
  });

  it('mostra dentro da janela a mensagem de erro que vier da API', async () => {
    simularApi({
      status: 409,
      corpo: { erro: { codigo: 'X', mensagem: 'Não foi possível salvar o material.' } },
    });
    const user = userEvent.setup();
    renderizar(<ComModal material={alcool} />);
    await user.click(screen.getByText('abrir'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    const alerta = await within(screen.getByRole('dialog')).findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível salvar o material.');
    expect(screen.getAllByText('Não foi possível salvar o material.')).toHaveLength(1);
  });

  it('cancelar descarta o que foi digitado e o erro anterior', async () => {
    simularApi({ status: 409, corpo: { erro: { codigo: 'X', mensagem: 'Falhou.' } } });
    const user = userEvent.setup();
    renderizar(<ComModal material={alcool} />);
    await user.click(screen.getByText('abrir'));
    await user.type(screen.getByLabelText(/^Nome/), ' rascunho');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Falhou.');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByText('abrir'));
    expect(screen.getByLabelText(/^Nome/)).toHaveValue(alcool.nome);
    expect(screen.queryByText('Falhou.')).not.toBeInTheDocument();
  });
});

describe('PaginaMateriais', () => {
  it('o botão Editar abre a edição sem sair da lista, com clique ou teclado', async () => {
    simularApi();
    const user = userEvent.setup();
    renderizar(<PaginaMateriais />);
    const editar = await screen.findByRole('button', { name: `Editar ${alcool.nome}` });
    await user.click(editar);
    expect(screen.getByRole('heading', { name: 'Editar material' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome/)).toHaveValue(alcool.nome);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    screen.getByRole('button', { name: `Editar ${alcool.nome}` }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'Editar material' })).toBeInTheDocument();
    expect(screen.queryByText('tela de detalhe')).not.toBeInTheDocument();
  });

  it('clicar no resto da linha continua levando ao detalhe', async () => {
    simularApi();
    const user = userEvent.setup();
    renderizar(<PaginaMateriais />);
    await user.click(await screen.findByText(alcool.nome));
    expect(await screen.findByText('tela de detalhe')).toBeInTheDocument();
  });
});
