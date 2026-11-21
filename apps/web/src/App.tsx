import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Casca } from './components/layout/Casca';
import { Alerta, Esqueleto } from './components/ui';
import { useAuth } from './lib/auth';

// Cada módulo é carregado sob demanda: a primeira tela abre rápido, mesmo em máquina modesta.
const Painel = lazy(() => import('./features/painel/PaginaPainel'));
const Clientes = lazy(() => import('./features/clientes/PaginaClientes'));
const ClienteDetalhe = lazy(() => import('./features/clientes/PaginaClienteDetalhe'));
const Fornecedores = lazy(() => import('./features/fornecedores/PaginaFornecedores'));
const Materiais = lazy(() => import('./features/materiais/PaginaMateriais'));
const MaterialDetalhe = lazy(() => import('./features/materiais/PaginaMaterialDetalhe'));
const Compras = lazy(() => import('./features/compras/PaginaCompras'));
const CompraNova = lazy(() => import('./features/compras/PaginaCompraNova'));
const CompraDetalhe = lazy(() => import('./features/compras/PaginaCompraDetalhe'));
const Produtos = lazy(() => import('./features/produtos/PaginaProdutos'));
const ProdutoDetalhe = lazy(() => import('./features/produtos/PaginaProdutoDetalhe'));
const Fichas = lazy(() => import('./features/fichas/PaginaFichas'));
const FichaEditor = lazy(() => import('./features/fichas/PaginaFichaEditor'));
const Precificacao = lazy(() => import('./features/fichas/PaginaPrecificacao'));
const Producao = lazy(() => import('./features/producao/PaginaProducao'));
const ProducaoNova = lazy(() => import('./features/producao/PaginaProducaoNova'));
const ProducaoDetalhe = lazy(() => import('./features/producao/PaginaProducaoDetalhe'));
const Vendas = lazy(() => import('./features/vendas/PaginaVendas'));
const VendaNova = lazy(() => import('./features/vendas/PaginaVendaNova'));
const VendaDetalhe = lazy(() => import('./features/vendas/PaginaVendaDetalhe'));
const Financeiro = lazy(() => import('./features/financeiro/PaginaFinanceiro'));
const Relatorios = lazy(() => import('./features/relatorios/PaginaRelatorios'));
const Backup = lazy(() => import('./features/backup/PaginaBackup'));
const Configuracoes = lazy(() => import('./features/backup/PaginaConfiguracoes'));
const GuiaDeEstilo = lazy(() => import('./pages/guia-de-estilo'));

export function App() {
  const { usuario, carregando } = useAuth();
  if (carregando) {
    return (
      <div className="grid h-full place-items-center">
        <Esqueleto linhas={3} className="w-72" />
      </div>
    );
  }
  // Modo local, sem tela de entrada: a API já identifica a usuária. Sem ela, a API não respondeu.
  if (!usuario) {
    return (
      <div className="grid h-full place-items-center p-8">
        <Alerta tom="pitanga" titulo="Não consegui falar com o Flor de Pitanga">
          Verifique se o aplicativo está aberto em http://127.0.0.1:1971 e recarregue a página.
        </Alerta>
      </div>
    );
  }
  return (
    <Suspense fallback={<Esqueleto linhas={5} className="p-8" />}>
      <Routes>
        <Route element={<Casca />}>
          <Route index element={<Navigate to="/painel" replace />} />
          <Route path="painel" element={<Painel />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/:id" element={<ClienteDetalhe />} />
          <Route path="fornecedores" element={<Fornecedores />} />
          <Route path="materiais" element={<Materiais />} />
          <Route path="materiais/:id" element={<MaterialDetalhe />} />
          <Route path="compras" element={<Compras />} />
          <Route path="compras/nova" element={<CompraNova />} />
          <Route path="compras/:id" element={<CompraDetalhe />} />
          <Route path="produtos" element={<Produtos />} />
          <Route path="produtos/:id" element={<ProdutoDetalhe />} />
          <Route path="produtos/:id/ficha" element={<FichaEditor />} />
          <Route path="produtos/:id/precificacao" element={<Precificacao />} />
          <Route path="fichas" element={<Fichas />} />
          <Route path="producao" element={<Producao />} />
          <Route path="producao/nova" element={<ProducaoNova />} />
          <Route path="producao/:id" element={<ProducaoDetalhe />} />
          <Route path="vendas" element={<Vendas />} />
          <Route path="vendas/nova" element={<VendaNova />} />
          <Route path="vendas/:id" element={<VendaDetalhe />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="backup" element={<Backup />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="guia-de-estilo" element={<GuiaDeEstilo />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
