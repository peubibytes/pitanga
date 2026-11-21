/** Enumerações do domínio, compartilhadas entre API e interface. */

export const FORMAS_PAGAMENTO = [
  'dinheiro',
  'pix',
  'cartao_debito',
  'cartao_credito',
  'transferencia',
  'boleto',
  'outra',
] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];
export const ROTULO_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_debito: 'Cartão de débito',
  cartao_credito: 'Cartão de crédito',
  transferencia: 'Transferência',
  boleto: 'Boleto',
  outra: 'Outra',
};

export const STATUS_VENDA = ['concluida', 'pendente', 'cancelada'] as const;
export type StatusVenda = (typeof STATUS_VENDA)[number];
export const ROTULO_STATUS_VENDA: Record<StatusVenda, string> = {
  concluida: 'Concluída',
  pendente: 'Pendente',
  cancelada: 'Cancelada',
};

export const STATUS_COMPRA = ['registrada', 'cancelada'] as const;
export type StatusCompra = (typeof STATUS_COMPRA)[number];

export const STATUS_PRODUCAO = ['concluida', 'cancelada'] as const;
export type StatusProducao = (typeof STATUS_PRODUCAO)[number];

export const TIPOS_LANCAMENTO = ['receita', 'despesa'] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

export const NATUREZAS = [
  'venda',
  'compra_material',
  'despesa_operacional',
  'mao_obra',
  'cmv',
  'ajuste',
  'aporte',
  'retirada',
] as const;
export type Natureza = (typeof NATUREZAS)[number];
export const ROTULO_NATUREZA: Record<Natureza, string> = {
  venda: 'Venda',
  compra_material: 'Compra de material',
  despesa_operacional: 'Despesa operacional',
  mao_obra: 'Mão de obra',
  cmv: 'Custo dos produtos vendidos',
  ajuste: 'Ajuste / outras receitas',
  aporte: 'Aporte da sócia',
  retirada: 'Retirada da sócia',
};
/** Naturezas que a usuária pode lançar manualmente. */
export const NATUREZAS_MANUAIS = ['despesa_operacional', 'ajuste', 'aporte', 'retirada'] as const;
export type NaturezaManual = (typeof NATUREZAS_MANUAIS)[number];

export const STATUS_LANCAMENTO = ['previsto', 'realizado', 'cancelado'] as const;
export type StatusLancamento = (typeof STATUS_LANCAMENTO)[number];

export const TIPOS_DESPESA_COMPRA = ['transporte', 'estacionamento', 'frete', 'outro'] as const;
export type TipoDespesaCompra = (typeof TIPOS_DESPESA_COMPRA)[number];

export const CRITERIOS_RATEIO_COMPRA = ['por_valor', 'por_quantidade', 'nao_rateia'] as const;
export type CriterioRateioCompra = (typeof CRITERIOS_RATEIO_COMPRA)[number];
export const ROTULO_RATEIO_COMPRA: Record<CriterioRateioCompra, string> = {
  por_valor: 'Ratear por valor',
  por_quantidade: 'Ratear por quantidade',
  nao_rateia: 'Não compõe o custo (despesa à parte)',
};

export const MODOS_PRECO = ['lucro_valor', 'acrescimo_percentual', 'margem_percentual'] as const;
export type ModoPreco = (typeof MODOS_PRECO)[number];
export const ROTULO_MODO_PRECO: Record<ModoPreco, string> = {
  lucro_valor: 'Lucro em valor (R$)',
  acrescimo_percentual: 'Acréscimo sobre o custo (%)',
  margem_percentual: 'Margem sobre o preço (%)',
};

export const MODOS_MAO_OBRA = ['hora', 'fixo', 'nenhuma'] as const;
export type ModoMaoObra = (typeof MODOS_MAO_OBRA)[number];

export const TIPOS_EXTRA_FICHA = ['embalagem', 'transporte', 'estacionamento', 'outro'] as const;
export type TipoExtraFicha = (typeof TIPOS_EXTRA_FICHA)[number];

export const TIPOS_DESPESA_COMPARTILHADA = [
  'transporte',
  'estacionamento',
  'embalagem',
  'energia',
  'aluguel',
  'outro',
] as const;
export type TipoDespesaCompartilhada = (typeof TIPOS_DESPESA_COMPARTILHADA)[number];

export const CRITERIOS_RATEIO = ['manual', 'por_producao', 'por_valor'] as const;
export type CriterioRateio = (typeof CRITERIOS_RATEIO)[number];

export const TIPOS_MOVIMENTO_MATERIAL = ['compra', 'consumo', 'ajuste', 'estorno'] as const;
export type TipoMovimentoMaterial = (typeof TIPOS_MOVIMENTO_MATERIAL)[number];
export const TIPOS_MOVIMENTO_PRODUTO = ['producao', 'venda', 'ajuste', 'estorno'] as const;
export type TipoMovimentoProduto = (typeof TIPOS_MOVIMENTO_PRODUTO)[number];

export const PERFIS = ['administradora', 'operadora'] as const;
export type Perfil = (typeof PERFIS)[number];

export const TIPOS_CATEGORIA = ['material', 'produto'] as const;
export type TipoCategoria = (typeof TIPOS_CATEGORIA)[number];

export const TIPOS_TAXA = ['percentual', 'fixo'] as const;
export const APLICA_EM_TAXA = ['preco', 'custo'] as const;

export const ORIGENS_BACKUP = ['manual', 'automatico', 'pre_migracao', 'pre_restauracao'] as const;
export type OrigemBackup = (typeof ORIGENS_BACKUP)[number];
