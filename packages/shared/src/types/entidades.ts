/**
 * Formas das respostas da API (camelCase). Valores monetários trafegam em centavos inteiros,
 * valores unitários em micro-reais, quantidades de material em mili-unidades.
 */
import type {
  CriterioRateio,
  CriterioRateioCompra,
  FormaPagamento,
  ModoMaoObra,
  ModoPreco,
  Natureza,
  OrigemBackup,
  Perfil,
  StatusCompra,
  StatusLancamento,
  StatusProducao,
  StatusVenda,
  TipoCategoria,
  TipoDespesaCompartilhada,
  TipoDespesaCompra,
  TipoExtraFicha,
  TipoLancamento,
  TipoMovimentoMaterial,
  TipoMovimentoProduto,
} from '../enums';

export interface Paginacao {
  pagina: number;
  porPagina: number;
  total: number;
}
export interface Resposta<T> {
  dados: T;
  paginacao?: Paginacao;
}
export interface ErroApi {
  codigo: string;
  mensagem: string;
  detalhes?: unknown;
}

export interface Usuario {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
  ativo: boolean;
}
export interface Sessao {
  usuario: Usuario | null;
  precisaCriarAdministradora: boolean;
}

export interface Cliente {
  id: number;
  nome: string;
  telefone: string | null;
  observacao: string | null;
  ativo: boolean;
  criadoEm: string;
}
export interface ClienteResumo {
  totalComprado: number;
  quantidadeCompras: number;
  ticketMedio: number;
  ultimaCompra: string | null;
  totalPendente: number;
}
export interface Fornecedor {
  id: number;
  nomeLoja: string;
  contato: string | null;
  observacao: string | null;
  ativo: boolean;
  criadoEm: string;
}
export interface Categoria {
  id: number;
  nome: string;
  tipo: TipoCategoria;
  ativo: boolean;
}
export interface Unidade {
  codigo: string;
  nome: string;
  base: string;
  fator: number | null;
}
export interface Taxa {
  id: number;
  nome: string;
  tipo: 'percentual' | 'fixo';
  valor: number;
  aplicaEm: 'preco' | 'custo';
  padrao: boolean;
  ativo: boolean;
}
export type Configuracoes = Record<string, string>;

/* -------------------------------- materiais -------------------------------- */

export interface Material {
  id: number;
  nome: string;
  categoriaId: number | null;
  categoriaNome: string | null;
  unidade: string;
  estoqueAtual: number;
  estoqueMinimo: number | null;
  /** Micro-reais por unidade base. */
  custoMedio: number;
  ativo: boolean;
  estoqueBaixo: boolean;
}
export interface MovimentoMaterial {
  id: number;
  materialId: number;
  tipo: TipoMovimentoMaterial;
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;
  saldoApos: number;
  custoMedioApos: number;
  referenciaTipo: string | null;
  referenciaId: number | null;
  data: string;
  justificativa: string | null;
  usuarioNome: string | null;
  criadoEm: string;
}

/* -------------------------------- compras -------------------------------- */

export interface CompraItem {
  id: number;
  materialId: number;
  materialNome: string;
  unidadeBase: string;
  quantidadeInformada: number;
  unidadeInformada: string;
  fatorConversao: number;
  quantidadeBase: number;
  valorUnitario: number;
  valorTotal: number;
  despesaRateada: number;
  custoUnitarioFinal: number;
}
export interface CompraDespesa {
  id: number;
  tipo: TipoDespesaCompra;
  descricao: string | null;
  valor: number;
  rateio: CriterioRateioCompra;
}
export interface Compra {
  id: number;
  fornecedorId: number | null;
  fornecedorNome: string | null;
  data: string;
  totalItens: number;
  totalDespesas: number;
  total: number;
  formaPagamento: FormaPagamento;
  status: StatusCompra;
  observacao: string | null;
  criadoEm: string;
  itens?: CompraItem[];
  despesas?: CompraDespesa[];
}
export interface HistoricoCustoMaterial {
  data: string;
  compraId: number;
  fornecedorNome: string | null;
  quantidadeBase: number;
  custoUnitarioFinal: number;
  valorTotal: number;
}

/* -------------------------------- produtos -------------------------------- */

export interface Produto {
  id: number;
  nome: string;
  descricao: string | null;
  categoriaId: number | null;
  categoriaNome: string | null;
  fotoArquivo: string | null;
  precoVenda: number | null;
  /** Custo médio do estoque de acabados (micro-reais por unidade). */
  custoProducao: number;
  estoqueAtual: number;
  ativo: boolean;
  temFicha?: boolean;
}
export interface MovimentoProduto {
  id: number;
  produtoId: number;
  tipo: TipoMovimentoProduto;
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;
  saldoApos: number;
  custoMedioApos: number;
  referenciaTipo: string | null;
  referenciaId: number | null;
  data: string;
  justificativa: string | null;
  usuarioNome: string | null;
}

export interface FichaItem {
  id: number;
  materialId: number;
  materialNome: string;
  unidade: string;
  quantidade: number;
  observacao: string | null;
  /** Custo médio vigente do material (micro-reais por unidade base). */
  custoMedio: number;
  estoqueAtual: number;
}
export interface FichaExtra {
  id: number;
  descricao: string;
  valor: number;
  tipo: TipoExtraFicha;
  porUnidade: boolean;
}
export interface Ficha {
  id: number;
  produtoId: number;
  versao: number;
  rendimento: number;
  maoObraModo: ModoMaoObra;
  maoObraValorHora: number | null;
  maoObraMinutos: number | null;
  maoObraValorFixo: number | null;
  ativa: boolean;
  observacao: string | null;
  criadoEm: string;
  itens: FichaItem[];
  extras: FichaExtra[];
}
export interface Precificacao {
  id: number;
  produtoId: number;
  fichaId: number | null;
  modo: ModoPreco;
  parametro: number;
  custoBase: number;
  taxasFixas: number;
  taxasPercentuais: number;
  precoSugerido: number;
  precoFinal: number;
  lucroPrevisto: number;
  margemEfetiva: number;
  aplicadoAoProduto: boolean;
  data: string;
}

/** Custo da ficha técnica por peça (micro-reais), com a composição. */
export interface CustoFichaDto {
  rendimento: number;
  loteMateriaisMicro: number;
  loteMaoObraMicro: number;
  unitarioMateriaisMicro: number;
  unitarioMaoObraMicro: number;
  unitarioExtrasMicro: number;
  unitarioRateiosMicro: number;
  custoUnitarioMicro: number;
  custoUnitarioCentavos: number;
}
export interface CustoFichaResposta {
  fichaId: number;
  produtoId: number;
  quantidade: number;
  custo: CustoFichaDto;
  /** Despesas compartilhadas rateadas ao produto e ainda não apropriadas a uma produção (centavos). */
  rateiosPendentes: number;
}
export interface CalculoPreco {
  precoSugerido: number;
  taxasSobrePreco: number;
  lucroPrevisto: number;
  /** Centésimos de ponto percentual. */
  margemEfetiva: number;
  prejuizo: boolean;
  precoDeEquilibrio: number;
}

/* ---------------------------- despesas compartilhadas ---------------------------- */

export interface DespesaRateio {
  id: number;
  destinoTipo: 'produto' | 'producao';
  destinoId: number;
  destinoNome: string | null;
  valor: number;
  producaoId: number | null;
}
export interface DespesaCompartilhada {
  id: number;
  descricao: string;
  data: string;
  valorTotal: number;
  tipo: TipoDespesaCompartilhada;
  criterio: CriterioRateio;
  lancamentoId: number | null;
  status: 'aberta' | 'rateada' | 'cancelada';
  rateios?: DespesaRateio[];
}

/* -------------------------------- produção -------------------------------- */

export interface ProducaoConsumo {
  id: number;
  materialId: number;
  materialNome: string;
  unidade: string;
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;
}
export interface Producao {
  id: number;
  produtoId: number;
  produtoNome: string;
  fichaId: number;
  fichaVersao: number;
  quantidade: number;
  data: string;
  custoMateriais: number;
  custoMaoObra: number;
  custoExtras: number;
  custoRateios: number;
  custoTotal: number;
  custoUnitario: number;
  custoEstoqueTotal: number;
  custoEstoqueUnitario: number;
  remunerouMaoObra: boolean;
  status: StatusProducao;
  autorizouEstoqueNegativo: boolean;
  observacao: string | null;
  criadoEm: string;
  consumos?: ProducaoConsumo[];
}

export interface SimulacaoProducaoItem {
  materialId: number;
  nome: string;
  unidade: string;
  necessario: number;
  disponivel: number;
  falta: number;
  custoMedio: number;
  custoEstimado: number;
}
export interface SimulacaoProducao {
  produtoId: number;
  produtoNome: string;
  fichaId: number;
  fichaVersao: number;
  rendimento: number;
  quantidade: number;
  itens: SimulacaoProducaoItem[];
  possivel: boolean;
  custoMateriais: number;
  custoMaoObra: number;
  custoExtras: number;
  custoRateios: number;
  custoTotal: number;
  custoUnitario: number;
  custoEstoqueTotal: number;
  remuneraMaoObra: boolean;
  permiteEstoqueNegativo: boolean;
}

/* --------------------------------- vendas --------------------------------- */

export interface VendaItem {
  id: number;
  produtoId: number;
  produtoNome: string;
  quantidade: number;
  precoUnitario: number;
  descontoItem: number;
  total: number;
  custoUnitario: number;
  custoTotal: number;
}
export interface Recebimento {
  id: number;
  vendaId: number;
  data: string;
  valor: number;
  formaPagamento: FormaPagamento;
}
export interface Venda {
  id: number;
  clienteId: number | null;
  clienteNome: string | null;
  data: string;
  subtotal: number;
  desconto: number;
  total: number;
  formaPagamento: FormaPagamento;
  status: StatusVenda;
  cmv: number;
  lucroEstimado: number;
  observacao: string | null;
  recebido: number;
  criadoEm: string;
  itens?: VendaItem[];
  recebimentos?: Recebimento[];
}

/* ------------------------------- financeiro ------------------------------- */

export interface Lancamento {
  id: number;
  tipo: TipoLancamento;
  natureza: Natureza;
  descricao: string;
  valor: number;
  dataCompetencia: string;
  dataCaixa: string | null;
  afetaResultado: boolean;
  afetaCaixa: boolean;
  status: StatusLancamento;
  referenciaTipo: string | null;
  referenciaId: number | null;
  estornaLancamentoId: number | null;
  criadoEm: string;
}
export interface ResumoFinanceiro {
  de: string | null;
  ate: string | null;
  faturamento: number;
  recebido: number;
  despesasPagas: number;
  custoProdutosVendidos: number;
  lucroPrejuizo: number;
  /** Saldo acumulado do caixa até o fim do período. */
  saldoCaixa: number;
  /** Variação do caixa dentro do período (operacional + aportes/retiradas). */
  variacaoCaixa: number;
  contasAReceber: number;
  /** Informativo: mão de obra própria das peças vendidas, não paga em dinheiro. */
  maoObraNaoRemunerada: number;
  lucroAposMaoObra: number;
}
export interface PontoCaixa {
  data: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

export interface Painel {
  periodo: { de: string; ate: string };
  vendasNoPeriodo: number;
  resumo: ResumoFinanceiro;
  faturamentoPorDia: { data: string; valor: number }[];
  produtosMaisVendidos: { produtoId: number; nome: string; quantidade: number; total: number }[];
  materiaisEstoqueBaixo: {
    id: number;
    nome: string;
    unidade: string;
    estoqueAtual: number;
    estoqueMinimo: number;
  }[];
  ultimoBackupEm: string | null;
  diasDesdeBackup: number | null;
  vendasPendentes: number;
}

/* --------------------------------- backup --------------------------------- */

export interface BackupRegistro {
  id: number;
  arquivo: string;
  data: string;
  tamanhoBytes: number;
  hashSha256: string;
  integridadeOk: boolean;
  origem: OrigemBackup;
  existe: boolean;
}
export interface Saude {
  status: 'ok' | 'atencao';
  versao: string;
  schema: { aplicadas: number; ultima: string | null };
  integridade: string;
  ultimoBackupEm: string | null;
  dadosDir: string;
  node: string;
}
