import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Categoria } from '@pitanga/shared';
import { ToastProvider } from '../../components/ui';
import { criarQueryClient } from '../../lib/query';
import { ModalMaterial } from '../materiais/PaginaMateriais';
import PaginaProdutos, { ModalProduto } from '../produtos/PaginaProdutos';
import { Categorias } from './Categorias';

let categorias: Categoria[];
let chamadas: { metodo: string; url: string; corpo: any }[];

const categoria = (
  id: number,
  nome: string,
  tipo: 'produto' | 'material',
  emUso = 0,
): Categoria => ({ id, nome, tipo, ativo: true, emUso });

beforeEach(() => {
  categorias = [
    categoria(1, 'Difusores', 'produto', 3),
    categoria(2, 'Velas', 'produto'),
    categoria(3, 'Ceras', 'material', 1),
  ];
  chamadas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (endereco: string, o: RequestInit) => {
      const metodo = o.method ?? 'GET';
      const corpo = o.body ? JSON.parse(String(o.body)) : undefined;
      chamadas.push({ metodo, url: endereco, corpo });
      const url = new URL(endereco, 'http://x');
      let status = 200;
      let dados: unknown = [];
      let erro: unknown;
      if (url.pathname === '/api/categorias' && metodo === 'GET')
        dados = categorias.filter((c) => c.tipo === url.searchParams.get('tipo'));
      else if (url.pathname === '/api/categorias' && metodo === 'POST') {
        if (categorias.some((c) => c.nome === corpo.nome)) {
          status = 400;
          erro = { codigo: 'VALIDACAO', mensagem: `Já existe a categoria "${corpo.nome}".` };
        } else {
          const nova = categoria(50, corpo.nome, corpo.tipo);
          categorias = [...categorias, nova];
          dados = nova;
        }
      } else if (metodo === 'DELETE') {
        const id = Number(url.pathname.split('/').at(-1));
        categorias = categorias.filter((c) => c.id !== id);
        dados = { id };
      }
      return new Response(
        JSON.stringify(
          erro ? { erro } : { dados, paginacao: { pagina: 1, porPagina: 25, total: 0 } },
        ),
        { status, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const escritas = () => chamadas.filter((c) => c.metodo !== 'GET');

function renderizar(conteudo: React.ReactNode) {
  return render(
    <QueryClientProvider client={criarQueryClient()}>
      <ToastProvider>
        <MemoryRouter>{conteudo}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('+ Nova categoria no cadastro', () => {
  it.each([
    ['produto', <ModalProduto key="p" aberto aoFechar={() => {}} />, 'Difusores'],
    ['material', <ModalMaterial key="m" aberto aoFechar={() => {}} />, 'Ceras'],
  ])(
    'de %s: cria com Enter, seleciona e mantém o que já foi digitado',
    async (tipo, tela, existente) => {
      const user = userEvent.setup();
      renderizar(tela);
      await screen.findByRole('option', { name: existente });
      await user.type(screen.getByLabelText(/^Nome/), 'Rascunho');
      const seletor = screen.getByLabelText('Categoria');
      await user.selectOptions(seletor, '+ Nova categoria');
      await user.type(screen.getByLabelText(/Nome da categoria/), 'Caixas para pintar{Enter}');
      await waitFor(() => expect(seletor).toHaveValue('50'));
      expect(screen.getByLabelText(/^Nome/)).toHaveValue('Rascunho');
      // Só a categoria foi gravada: o Enter na janela de cima não salva o cadastro de baixo.
      expect(escritas()).toEqual([
        { metodo: 'POST', url: '/api/categorias', corpo: { nome: 'Caixas para pintar', tipo } },
      ]);
    },
  );

  it('desistir mantém a categoria que estava escolhida', async () => {
    const user = userEvent.setup();
    renderizar(<ModalProduto aberto aoFechar={() => {}} />);
    await screen.findByRole('option', { name: 'Velas' });
    const seletor = screen.getByLabelText('Categoria');
    await user.selectOptions(seletor, 'Velas');
    await user.selectOptions(seletor, '+ Nova categoria');
    const janela = screen.getByRole('dialog', { name: 'Nova categoria' });
    await user.click(within(janela).getByRole('button', { name: 'Cancelar' }));
    expect(seletor).toHaveValue('2');
    expect(escritas()).toHaveLength(0);
  });

  it('Esc na janela de cima não fecha o cadastro de baixo', async () => {
    const aoFechar = vi.fn();
    const user = userEvent.setup();
    renderizar(<ModalProduto aberto aoFechar={aoFechar} />);
    await screen.findByRole('option', { name: 'Velas' });
    await user.selectOptions(screen.getByLabelText('Categoria'), '+ Nova categoria');
    const janela = screen.getByRole('dialog', { name: 'Nova categoria' });
    expect(screen.getByLabelText(/Nome da categoria/)).toHaveFocus();
    fireEvent(janela, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog', { name: 'Nova categoria' })).toBeNull();
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('mostra na janela o erro de nome repetido', async () => {
    const user = userEvent.setup();
    renderizar(<ModalProduto aberto aoFechar={() => {}} />);
    await screen.findByRole('option', { name: 'Velas' });
    await user.selectOptions(screen.getByLabelText('Categoria'), '+ Nova categoria');
    await user.type(screen.getByLabelText(/Nome da categoria/), 'Velas{Enter}');
    const janela = screen.getByRole('dialog', { name: 'Nova categoria' });
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Já existe a categoria');
  });

  it('não aparece no filtro da lista', async () => {
    renderizar(<PaginaProdutos />);
    const filtro = await screen.findByLabelText('Filtrar por categoria');
    await within(filtro).findByRole('option', { name: 'Velas' });
    expect(within(filtro).queryByRole('option', { name: '+ Nova categoria' })).toBeNull();
  });
});

describe('Configurações → Categorias', () => {
  it('lista por tipo, com a quantidade de itens', async () => {
    const user = userEvent.setup();
    renderizar(<Categorias />);
    expect(await screen.findByText('3 produtos')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'De materiais' }));
    expect(await screen.findByText('1 material')).toBeInTheDocument();
    expect(screen.queryByText('Velas')).not.toBeInTheDocument();
  });

  it('renomeia', async () => {
    const user = userEvent.setup();
    renderizar(<Categorias />);
    await user.click(await screen.findByRole('button', { name: 'Renomear Velas' }));
    const nome = screen.getByLabelText(/Nome da categoria/);
    expect(nome).toHaveValue('Velas');
    await user.clear(nome);
    await user.type(nome, 'Velas aromáticas{Enter}');
    await waitFor(() =>
      expect(escritas()).toEqual([
        { metodo: 'PUT', url: '/api/categorias/2', corpo: { nome: 'Velas aromáticas' } },
      ]),
    );
  });

  it('remove direto uma categoria vazia, após confirmar', async () => {
    const user = userEvent.setup();
    renderizar(<Categorias />);
    await user.click(await screen.findByRole('button', { name: 'Remover Velas' }));
    await user.click(screen.getByRole('button', { name: 'Remover categoria' }));
    await waitFor(() => expect(screen.queryByText('Velas')).not.toBeInTheDocument());
    expect(escritas()[0]).toMatchObject({ metodo: 'DELETE', url: '/api/categorias/2' });
  });

  it('com itens, só remove depois de escolher para onde movê-los', async () => {
    const user = userEvent.setup();
    renderizar(<Categorias />);
    await user.click(await screen.findByRole('button', { name: 'Remover Difusores' }));
    const confirmar = screen.getByRole('button', { name: 'Mover e remover' });
    expect(confirmar).toBeDisabled();
    const destino = screen.getByLabelText(/Mover para/);
    expect(within(destino).queryByRole('option', { name: 'Difusores' })).toBeNull();
    await user.selectOptions(destino, 'Velas');
    await user.click(confirmar);
    await waitFor(() =>
      expect(escritas()[0]).toMatchObject({
        metodo: 'DELETE',
        url: '/api/categorias/1?moverPara=2',
      }),
    );
  });

  it('avisa quando não há outra categoria para receber os itens', async () => {
    categorias = [categoria(1, 'Difusores', 'produto', 3)];
    const user = userEvent.setup();
    renderizar(<Categorias />);
    await user.click(await screen.findByRole('button', { name: 'Remover Difusores' }));
    expect(screen.getByText(/Crie uma categoria nova antes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mover e remover' })).toBeDisabled();
  });
});
