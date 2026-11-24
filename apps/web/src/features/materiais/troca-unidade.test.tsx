import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Material, PreviaTrocaUnidade, ReceitaNaTroca } from '@pitanga/shared';
import { ToastProvider } from '../../components/ui';
import { criarQueryClient } from '../../lib/query';
import { ModalMaterial } from './PaginaMateriais';

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
const receita = (dados: Partial<ReceitaNaTroca>): ReceitaNaTroca => ({
  fichaId: 1,
  produtoId: 1,
  produtoNome: 'Difusor',
  quantidadeAtual: 120_000,
  quantidadeNova: 120,
  desvio: 0,
  custoAtual: 3_360_000,
  custoNovo: 3_360_000,
  exigeDecisao: false,
  ...dados,
});
const spray = receita({
  fichaId: 2,
  produtoNome: 'Home spray',
  quantidadeAtual: 2_500,
  quantidadeNova: 3,
  desvio: 2_000,
  custoAtual: 70_000,
  custoNovo: 84_000,
  exigeDecisao: true,
});
const gotas = receita({
  fichaId: 3,
  produtoNome: 'Gotas',
  quantidadeAtual: 400,
  quantidadeNova: 0,
  desvio: -10_000,
  exigeDecisao: true,
});

let receitas: ReceitaNaTroca[];
let envios: { url: string; corpo: any }[];
let respostaDaTroca: { status: number; corpo: unknown };

const previa = (): PreviaTrocaUnidade => ({
  materialId: 7,
  nome: alcool.nome,
  antes: {
    unidade: 'ml',
    estoque: 1_000_000,
    estoqueMinimo: 200_000,
    custoMedio: 28_000,
    valorEmEstoque: 2_800,
  },
  depois: {
    unidade: 'un',
    estoque: 1_000,
    estoqueMinimo: 200,
    custoMedio: 28_000_000,
    valorEmEstoque: 2_800,
  },
  receitas,
  contagem: { movimentos: 4, compras: 1, producoes: 3, receitasAntigas: 0 },
  assinatura: 'abc',
});

beforeEach(() => {
  receitas = [];
  envios = [];
  respostaDaTroca = { status: 200, corpo: { dados: { ...alcool, unidade: 'un' } } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, o: RequestInit) => {
      let status = 200;
      let corpo: unknown = { dados: [] };
      if (o.method === 'POST') {
        envios.push({ url, corpo: JSON.parse(String(o.body)) });
        if (url.endsWith('/previa')) corpo = { dados: previa() };
        else ({ status, corpo } = respostaDaTroca);
      }
      return new Response(JSON.stringify(corpo), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const aoFechar = vi.fn();
function renderizar(material: Material = alcool) {
  aoFechar.mockClear();
  render(
    <QueryClientProvider client={criarQueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <ModalMaterial aberto aoFechar={aoFechar} material={material} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function atePrevia(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Trocar unidade' }));
  await user.selectOptions(screen.getByLabelText(/Nova unidade/), 'un');
  await user.type(screen.getByLabelText(/Quantos mililitros \(ml\) há em 1 unidade/), '1000');
  await user.click(screen.getByRole('button', { name: 'Ver como fica' }));
  await screen.findByText('Hoje');
}
const trocas = () => envios.filter((e) => e.url.endsWith('/trocar-unidade'));

describe('assistente de troca de unidade', () => {
  it('mostra antes e depois, e só grava ao confirmar', async () => {
    receitas = [receita({})];
    const user = renderizar();
    await atePrevia(user);
    expect(envios).toEqual([
      {
        url: '/api/materiais/7/trocar-unidade/previa',
        corpo: { novaUnidade: 'un', quantidadeNova: 1000, quantidadeAtual: 1_000_000 },
      },
    ]);
    const tabela = screen.getByRole('table', { name: 'Como fica' });
    expect(within(tabela).getByText('1.000 ml')).toBeInTheDocument();
    expect(within(tabela).getByText('1 un')).toBeInTheDocument();
    expect(within(tabela).getAllByText(/28,00$/)).toHaveLength(2);
    expect(screen.getByText(/0,001 un \(1 ml\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar troca' }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(trocas()).toEqual([
      {
        url: '/api/materiais/7/trocar-unidade',
        corpo: {
          novaUnidade: 'un',
          quantidadeNova: 1000,
          quantidadeAtual: 1_000_000,
          assinatura: 'abc',
          motivo: null,
          receitas: [],
        },
      },
    ]);
  });

  it('pede decisão receita por receita: aceitar a mais próxima ou digitar outra', async () => {
    receitas = [receita({}), spray, gotas];
    const user = renderizar();
    await atePrevia(user);
    const confirmar = screen.getByRole('button', { name: 'Confirmar troca' });
    expect(confirmar).toBeDisabled();
    const secao = screen.getByRole('region', { name: 'Receitas para conferir' });
    expect(within(secao).queryByText('Difusor')).not.toBeInTheDocument();
    expect(within(secao).getByText(/3 ml, \+20%/)).toBeInTheDocument();

    await user.click(within(secao).getByRole('checkbox', { name: 'Usar 0,003 un' }));
    expect(within(secao).getByText(/de R\$\s0,07 para\s+R\$\s0,08/)).toBeInTheDocument();
    expect(confirmar).toBeDisabled();
    // A que viraria zero não tem opção de aceitar: só digitando.
    expect(within(secao).getAllByRole('checkbox')).toHaveLength(1);
    const campo = within(secao).getByLabelText('Quantidade em Gotas');
    await user.type(campo, '0');
    expect(confirmar).toBeDisabled();
    await user.clear(campo);
    await user.type(campo, '0,002');
    await user.click(confirmar);
    await waitFor(() => expect(trocas()).toHaveLength(1));
    expect(trocas()[0]!.corpo.receitas).toEqual([
      { fichaId: 2, quantidade: 3 },
      { fichaId: 3, quantidade: 2 },
    ]);
  });

  it('digitar outra quantidade desmarca a sugerida', async () => {
    receitas = [spray];
    const user = renderizar();
    await atePrevia(user);
    const marcar = screen.getByRole('checkbox', { name: 'Usar 0,003 un' });
    await user.click(marcar);
    const campo = screen.getByLabelText('Quantidade em Home spray');
    await user.clear(campo);
    await user.type(campo, '0,005');
    expect(marcar).not.toBeChecked();
    expect(screen.getByText(/Equivale a 5 ml/)).toBeInTheDocument();
  });

  it('pergunta o fator no sentido natural também de un para ml e entre ml e g', async () => {
    const user = renderizar({ ...alcool, unidade: 'un' });
    await user.click(screen.getByRole('button', { name: 'Trocar unidade' }));
    await user.selectOptions(screen.getByLabelText(/Nova unidade/), 'ml');
    await user.type(screen.getByLabelText(/Quantos mililitros \(ml\) há em 1 unidade/), '200');
    await user.click(screen.getByRole('button', { name: 'Ver como fica' }));
    await waitFor(() =>
      expect(envios[0]!.corpo).toEqual({
        novaUnidade: 'ml',
        quantidadeNova: 200_000,
        quantidadeAtual: 1000,
      }),
    );
  });

  it('se algo mudou depois da prévia, mostra o aviso e deixa conferir de novo', async () => {
    const user = renderizar();
    await atePrevia(user);
    respostaDaTroca = {
      status: 409,
      corpo: { erro: { codigo: 'PREVIA_DESATUALIZADA', mensagem: 'Alguma coisa mudou.' } },
    };
    await user.click(screen.getByRole('button', { name: 'Confirmar troca' }));
    expect(await screen.findByText('Alguma coisa mudou.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Conferir de novo' }));
    expect(await screen.findByRole('button', { name: 'Confirmar troca' })).toBeEnabled();
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('não abre com alterações pendentes no cadastro', async () => {
    const user = renderizar();
    await user.type(screen.getByLabelText(/^Nome/), ' x');
    expect(screen.getByRole('button', { name: 'Trocar unidade' })).toBeDisabled();
    expect(screen.getByLabelText('Unidade de controle')).toHaveAccessibleDescription(
      /salve ou cancele/,
    );
  });

  it('material que ainda não foi usado não precisa do assistente', () => {
    renderizar({ ...alcool, unidadeTravada: false });
    expect(screen.queryByRole('button', { name: 'Trocar unidade' })).toBeNull();
  });
});
