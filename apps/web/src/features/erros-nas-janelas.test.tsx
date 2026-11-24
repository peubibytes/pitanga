import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { AuthProvider } from '../lib/auth';
import { criarQueryClient } from '../lib/query';
import PaginaBackup from './backup/PaginaBackup';
import PaginaConfiguracoes from './backup/PaginaConfiguracoes';
import PaginaClientes from './clientes/PaginaClientes';
import PaginaCompraDetalhe from './compras/PaginaCompraDetalhe';
import PaginaFinanceiro from './financeiro/PaginaFinanceiro';
import PaginaFornecedores from './fornecedores/PaginaFornecedores';
import PaginaMaterialDetalhe from './materiais/PaginaMaterialDetalhe';
import PaginaProducaoDetalhe from './producao/PaginaProducaoDetalhe';
import PaginaProducaoNova from './producao/PaginaProducaoNova';
import PaginaProdutoDetalhe from './produtos/PaginaProdutoDetalhe';
import PaginaProdutos from './produtos/PaginaProdutos';
import PaginaVendaDetalhe from './vendas/PaginaVendaDetalhe';

// O aviso flutuante fica atrás de qualquer janela aberta: a mensagem da API precisa estar dentro dela.
const MENSAGEM = 'A API recusou: confira os dados.';

const fornecedor = {
  id: 3,
  nomeLoja: 'Casa do Gesso',
  contato: null,
  observacao: null,
  ativo: true,
};
const produto = {
  id: 5,
  nome: 'Vela de lavanda',
  descricao: null,
  categoriaId: null,
  categoriaNome: null,
  fotoArquivo: null,
  precoVenda: 3_500,
  custoProducao: 120_000,
  estoqueAtual: 4,
  ativo: true,
};
const material = {
  id: 7,
  nome: 'Cera de soja',
  categoriaId: null,
  categoriaNome: null,
  unidade: 'g',
  estoqueAtual: 1_000_000,
  estoqueMinimo: null,
  custoMedio: 28_000,
  ativo: true,
  estoqueBaixo: false,
  unidadeTravada: true,
};
const lancamento = {
  id: 11,
  tipo: 'despesa',
  natureza: 'despesa_operacional',
  descricao: 'Internet do mês',
  valor: 9_900,
  dataCompetencia: '2026-11-10',
  dataCaixa: null,
  afetaResultado: true,
  afetaCaixa: true,
  status: 'previsto',
  referenciaTipo: 'manual',
  referenciaId: null,
  estornaLancamentoId: null,
};
const taxa = {
  id: 2,
  nome: 'Cartão',
  tipo: 'percentual',
  valor: 400,
  aplicaEm: 'preco',
  padrao: false,
  ativo: true,
};
const despesa = {
  id: 9,
  descricao: 'Frete da feira',
  data: '2026-11-10',
  valorTotal: 5_000,
  tipo: 'transporte',
  criterio: 'por_producao',
  status: 'aberta',
  rateios: [],
};

/** Respostas de leitura; o que não estiver aqui volta como lista vazia. */
const leituras: Record<string, unknown> = {
  '/api/sessao': { usuario: { id: 1, nome: 'Ateliê', perfil: 'administradora' } },
  '/api/configuracoes': {},
  '/api/fornecedores': [fornecedor],
  '/api/produtos': [produto],
  '/api/produtos/5': produto,
  '/api/materiais/7': material,
  '/api/taxas': [taxa],
  '/api/financeiro/lancamentos': [lancamento],
  '/api/financeiro/resumo': undefined,
  '/api/despesas-compartilhadas': [despesa],
  '/api/vendas/1': {
    id: 1,
    clienteId: null,
    data: '2026-11-10',
    subtotal: 3_500,
    desconto: 0,
    total: 3_500,
    formaPagamento: 'pix',
    status: 'pendente',
    cmv: 0,
    lucroEstimado: 3_500,
    recebido: 0,
    itens: [],
    recebimentos: [],
  },
  '/api/compras/1': {
    id: 1,
    data: '2026-11-10',
    totalItens: 0,
    totalDespesas: 0,
    total: 0,
    formaPagamento: 'pix',
    status: 'concluida',
    itens: [],
    despesas: [],
  },
  '/api/producoes/1': {
    id: 1,
    produtoId: 5,
    produtoNome: produto.nome,
    fichaVersao: 1,
    quantidade: 2,
    data: '2026-11-10',
    status: 'concluida',
    consumos: [],
  },
  '/api/producoes/simular': {
    produtoId: 5,
    produtoNome: produto.nome,
    rendimento: 1,
    quantidade: 1,
    itens: [],
    possivel: false,
    permiteEstoqueNegativo: true,
    custoExtras: 0,
    custoRateios: 0,
  },
  '/api/backup': [
    {
      id: 1,
      arquivo: 'copia.zip',
      data: '2026-11-10 10:00:00',
      tamanhoBytes: 10,
      origem: 'manual',
      existe: true,
    },
  ],
};

/** API de mentira: lê normalmente e recusa toda gravação (ou espera `gravacao`). */
function simularApi(gravacao?: () => Promise<void>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, o: RequestInit) => {
      const caminho = url.split('?')[0]!;
      const leitura = o.method === 'GET' || caminho.endsWith('/simular');
      if (!leitura) await gravacao?.();
      const dados = caminho in leituras ? leituras[caminho] : [];
      return new Response(
        JSON.stringify(
          leitura
            ? { dados, paginacao: { pagina: 1, porPagina: 25, total: 1 } }
            : { erro: { codigo: 'RECUSADO', mensagem: MENSAGEM } },
        ),
        { status: leitura ? 200 : 409, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
}

function renderizar(pagina: ReactNode, rota = '/', url = rota) {
  return render(
    <QueryClientProvider client={criarQueryClient()}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route path={rota} element={pagina} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const clicar = async (user: UserEvent, nome: string | RegExp) =>
  user.click(await screen.findByRole('button', { name: nome }));
const naAba = async (user: UserEvent, nome: string) =>
  user.click(await screen.findByRole('tab', { name: nome }));
const janela = () => within(screen.getByRole('dialog'));

interface Caso {
  nome: string;
  pagina: ReactNode;
  rota?: [string, string];
  abrir: (user: UserEvent) => Promise<void>;
  preencher?: (user: UserEvent) => Promise<void>;
  enviar: string;
  fechar?: string;
  /** Campo que, ao cancelar, volta ao valor de antes. */
  descarta?: { campo: RegExp; valor: string };
}

const digitar = async (user: UserEvent, campo: RegExp | string, texto: string) => {
  const alvo = janela().getByLabelText(campo);
  await user.clear(alvo);
  await user.type(alvo, texto);
};

const casos: Caso[] = [
  {
    nome: 'cliente',
    pagina: <PaginaClientes />,
    abrir: (u) => clicar(u, 'Novo cliente'),
    preencher: (u) => digitar(u, /^Nome/, 'Marina'),
    enviar: 'Salvar',
    descarta: { campo: /^Nome/, valor: '' },
  },
  {
    nome: 'fornecedor novo',
    pagina: <PaginaFornecedores />,
    abrir: (u) => clicar(u, 'Novo fornecedor'),
    preencher: (u) => digitar(u, /^Nome da loja/, 'Loja'),
    enviar: 'Salvar',
    descarta: { campo: /^Nome da loja/, valor: '' },
  },
  {
    nome: 'fornecedor em edição',
    pagina: <PaginaFornecedores />,
    abrir: async (u) => u.click(await screen.findByText(fornecedor.nomeLoja)),
    preencher: (u) => digitar(u, /^Nome da loja/, 'Outro nome'),
    enviar: 'Salvar',
    descarta: { campo: /^Nome da loja/, valor: fornecedor.nomeLoja },
  },
  {
    nome: 'produto novo',
    pagina: <PaginaProdutos />,
    abrir: (u) => clicar(u, 'Novo produto'),
    preencher: (u) => digitar(u, /^Nome/, 'Sabonete'),
    enviar: 'Salvar',
    descarta: { campo: /^Nome/, valor: '' },
  },
  {
    nome: 'produto em edição',
    pagina: <PaginaProdutoDetalhe />,
    rota: ['/produtos/:id', '/produtos/5'],
    abrir: (u) => clicar(u, 'Editar'),
    preencher: (u) => digitar(u, /^Nome/, 'Outro nome'),
    enviar: 'Salvar',
    descarta: { campo: /^Nome/, valor: produto.nome },
  },
  {
    nome: 'ajuste de produto',
    pagina: <PaginaProdutoDetalhe />,
    rota: ['/produtos/:id', '/produtos/5'],
    abrir: (u) => clicar(u, /Ajustar estoque/),
    preencher: async (u) => {
      await digitar(u, /^Quantidade/, '1');
      await digitar(u, /^Justificativa/, 'quebrou');
    },
    enviar: 'Registrar ajuste',
    descarta: { campo: /^Justificativa/, valor: '' },
  },
  {
    nome: 'ajuste de material',
    pagina: <PaginaMaterialDetalhe />,
    rota: ['/materiais/:id', '/materiais/7'],
    abrir: (u) => clicar(u, /Ajustar estoque/),
    preencher: async (u) => {
      await digitar(u, /^Quantidade/, '1');
      await digitar(u, /^Justificativa/, 'derramou');
    },
    enviar: 'Registrar ajuste',
    descarta: { campo: /^Justificativa/, valor: '' },
  },
  {
    nome: 'taxa em edição',
    pagina: <PaginaConfiguracoes />,
    abrir: async (u) => {
      await naAba(u, 'Taxas');
      await u.click(await screen.findByText(taxa.nome));
    },
    preencher: (u) => digitar(u, /^Nome/, 'Outra'),
    enviar: 'Salvar',
    descarta: { campo: /^Nome/, valor: taxa.nome },
  },
  {
    nome: 'lançamento',
    pagina: <PaginaFinanceiro />,
    abrir: async (u) => {
      await naAba(u, 'Extrato');
      await clicar(u, /Novo lançamento/);
    },
    preencher: async (u) => {
      await digitar(u, /^Descrição/, 'Aluguel');
      await digitar(u, /^Valor/, '1000');
    },
    enviar: 'Registrar',
    descarta: { campo: /^Descrição/, valor: '' },
  },
  {
    nome: 'realizar lançamento',
    pagina: <PaginaFinanceiro />,
    abrir: async (u) => {
      await naAba(u, 'Extrato');
      await clicar(u, 'Realizar');
    },
    enviar: 'Confirmar',
    fechar: 'Voltar',
  },
  {
    nome: 'cancelar lançamento',
    pagina: <PaginaFinanceiro />,
    abrir: async (u) => {
      await naAba(u, 'Extrato');
      await clicar(u, 'Cancelar');
    },
    enviar: 'Cancelar lançamento',
    fechar: 'Voltar',
  },
  {
    nome: 'despesa compartilhada',
    pagina: <PaginaFinanceiro />,
    abrir: async (u) => {
      await naAba(u, 'Despesas compartilhadas');
      await clicar(u, /Nova despesa/);
    },
    preencher: async (u) => {
      await digitar(u, /^Descrição/, 'Embalagens');
      await digitar(u, /^Valor total/, '1000');
    },
    enviar: 'Registrar',
    descarta: { campo: /^Descrição/, valor: '' },
  },
  {
    nome: 'rateio',
    pagina: <PaginaFinanceiro />,
    abrir: async (u) => {
      await naAba(u, 'Despesas compartilhadas');
      await clicar(u, 'Ratear');
      await screen.findByLabelText(/próxima produção/);
    },
    preencher: async (u) => u.click(janela().getByLabelText(/próxima produção/)),
    enviar: 'Ratear',
  },
  {
    nome: 'cancelar despesa',
    pagina: <PaginaFinanceiro />,
    abrir: async (u) => {
      await naAba(u, 'Despesas compartilhadas');
      await clicar(u, 'Cancelar');
    },
    enviar: 'Cancelar despesa',
    fechar: 'Voltar',
  },
  {
    nome: 'recebimento',
    pagina: <PaginaVendaDetalhe />,
    rota: ['/vendas/:id', '/vendas/1'],
    abrir: (u) => clicar(u, 'Registrar recebimento'),
    preencher: (u) => digitar(u, /^Valor recebido/, '1000'),
    enviar: 'Registrar',
    descarta: { campo: /^Valor recebido/, valor: '35,00' },
  },
  {
    nome: 'cancelar venda',
    pagina: <PaginaVendaDetalhe />,
    rota: ['/vendas/:id', '/vendas/1'],
    abrir: (u) => clicar(u, 'Cancelar venda'),
    enviar: 'Cancelar venda',
    fechar: 'Voltar',
  },
  {
    nome: 'cancelar compra',
    pagina: <PaginaCompraDetalhe />,
    rota: ['/compras/:id', '/compras/1'],
    abrir: (u) => clicar(u, 'Cancelar compra'),
    enviar: 'Cancelar compra',
    fechar: 'Voltar',
  },
  {
    nome: 'cancelar produção',
    pagina: <PaginaProducaoDetalhe />,
    rota: ['/producao/:id', '/producao/1'],
    abrir: (u) => clicar(u, 'Cancelar produção'),
    enviar: 'Cancelar produção',
    fechar: 'Voltar',
  },
  {
    nome: 'produzir com estoque negativo',
    pagina: <PaginaProducaoNova />,
    rota: ['/producao/nova', '/producao/nova?produto=5'],
    abrir: (u) => clicar(u, 'Produzir mesmo assim…'),
    enviar: 'Produzir mesmo assim',
    fechar: 'Voltar',
  },
  {
    nome: 'remover backup',
    pagina: <PaginaBackup />,
    abrir: (u) => clicar(u, 'Remover'),
    enviar: 'Remover backup',
    fechar: 'Voltar',
  },
  {
    nome: 'restaurar backup',
    pagina: <PaginaBackup />,
    abrir: (u) => clicar(u, 'Restaurar'),
    preencher: (u) => digitar(u, /Para continuar/, 'RESTAURAR'),
    enviar: 'Restaurar backup',
    fechar: 'Voltar',
  },
];

afterEach(() => vi.unstubAllGlobals());

describe('erro da API nas janelas', () => {
  it.each(casos)('$nome: a mensagem aparece na janela e some ao fechar', async (c) => {
    simularApi();
    const user = userEvent.setup();
    renderizar(c.pagina, ...(c.rota ?? []));
    await c.abrir(user);
    await c.preencher?.(user);
    await user.click(janela().getByRole('button', { name: c.enviar }));

    const alerta = await janela().findByRole('alert');
    expect(alerta).toHaveTextContent(MENSAGEM);
    // Fora da área de rolagem, para não sumir em formulários longos; e sem repetir no aviso flutuante.
    expect(alerta.closest('[data-conteudo]')).toBeNull();
    expect(screen.getAllByText(MENSAGEM)).toHaveLength(1);

    await user.click(janela().getByRole('button', { name: c.fechar ?? 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await c.abrir(user);
    expect(janela().queryByRole('alert')).not.toBeInTheDocument();
    if (c.descarta) expect(janela().getByLabelText(c.descarta.campo)).toHaveValue(c.descarta.valor);
  });

  it('a validação da própria tela aparece no mesmo lugar e também some ao cancelar', async () => {
    simularApi();
    const user = userEvent.setup();
    renderizar(<PaginaConfiguracoes />);
    await naAba(user, 'Taxas');
    await clicar(user, 'Nova taxa');
    await user.click(janela().getByRole('button', { name: 'Salvar' }));
    expect(await janela().findByRole('alert')).toHaveTextContent('Dê um nome à taxa.');
    await user.click(janela().getByRole('button', { name: 'Cancelar' }));
    await clicar(user, 'Nova taxa');
    expect(janela().queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cancelar o rateio descarta os destinos marcados', async () => {
    simularApi();
    const user = userEvent.setup();
    renderizar(<PaginaFinanceiro />);
    await naAba(user, 'Despesas compartilhadas');
    await clicar(user, 'Ratear');
    await user.click(await screen.findByLabelText(/próxima produção/));
    await user.click(janela().getByRole('button', { name: 'Cancelar' }));
    await clicar(user, 'Ratear');
    expect(await screen.findByLabelText(/próxima produção/)).not.toBeChecked();
  });

  it('com a janela já fechada, o erro que chega depois vai para o aviso flutuante', async () => {
    let responder = () => {};
    simularApi(() => new Promise<void>((r) => (responder = r)));
    const user = userEvent.setup();
    renderizar(<PaginaBackup />);
    await clicar(user, 'Remover');
    await user.click(janela().getByRole('button', { name: 'Remover backup' }));
    await user.click(janela().getByRole('button', { name: 'Voltar' }));
    responder();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(MENSAGEM));
    await clicar(user, 'Remover');
    expect(janela().queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reabrir durante o envio mantém o botão ocupado e mostra o erro na janela', async () => {
    let responder = () => {};
    simularApi(() => new Promise<void>((r) => (responder = r)));
    const user = userEvent.setup();
    renderizar(<PaginaBackup />);
    await clicar(user, 'Remover');
    await user.click(janela().getByRole('button', { name: 'Remover backup' }));
    await user.click(janela().getByRole('button', { name: 'Voltar' }));
    await clicar(user, 'Remover');
    expect(janela().getByRole('button', { name: 'Remover backup' })).toBeDisabled();
    responder();
    expect(await janela().findByRole('alert')).toHaveTextContent(MENSAGEM);
    expect(screen.getAllByText(MENSAGEM)).toHaveLength(1);
  });
});
