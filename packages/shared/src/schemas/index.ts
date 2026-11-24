import { z } from 'zod';
import {
  APLICA_EM_TAXA,
  CRITERIOS_RATEIO,
  CRITERIOS_RATEIO_COMPRA,
  FORMAS_PAGAMENTO,
  MODOS_MAO_OBRA,
  MODOS_PRECO,
  NATUREZAS_MANUAIS,
  PERFIS,
  TIPOS_CATEGORIA,
  TIPOS_DESPESA_COMPARTILHADA,
  TIPOS_DESPESA_COMPRA,
  TIPOS_EXTRA_FICHA,
  TIPOS_LANCAMENTO,
  TIPOS_TAXA,
} from '../enums';
import { UNIDADES, UNIDADES_BASE } from '../quantity';
import {
  dataSchema,
  idSchema,
  inteiroNaoNegativo,
  inteiroPositivo,
  nomeSchema,
  textoOpcional,
} from './comum';

export * from './comum';

/* ------------------------------- sessão ------------------------------- */

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Informe o usuário'),
  senha: z.string().min(1, 'Informe a senha'),
});

export const usuarioSchema = z.object({
  nome: nomeSchema,
  login: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use ao menos 3 caracteres')
    .regex(/^[a-z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou sublinhado'),
  senha: z.string().min(6, 'A senha precisa de ao menos 6 caracteres'),
  perfil: z.enum(PERFIS).default('operadora'),
});

export const trocaSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual'),
  novaSenha: z.string().min(6, 'A senha precisa de ao menos 6 caracteres'),
});

/* ------------------------------ cadastros ------------------------------ */

export const clienteSchema = z.object({
  nome: nomeSchema,
  telefone: textoOpcional,
  observacao: textoOpcional,
  ativo: z.boolean().default(true),
});

export const fornecedorSchema = z.object({
  nomeLoja: nomeSchema,
  contato: textoOpcional,
  observacao: textoOpcional,
  ativo: z.boolean().default(true),
});

export const categoriaSchema = z.object({
  nome: nomeSchema,
  tipo: z.enum(TIPOS_CATEGORIA),
});

/** O tipo não muda depois de criada: os itens da categoria são de um tipo só. */
export const categoriaRenomearSchema = categoriaSchema.pick({ nome: true });

export const taxaSchema = z.object({
  nome: nomeSchema,
  tipo: z.enum(TIPOS_TAXA),
  /** Centésimos de ponto percentual (tipo percentual) ou centavos (tipo fixo). */
  valor: inteiroNaoNegativo,
  aplicaEm: z.enum(APLICA_EM_TAXA).default('preco'),
  padrao: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

export const configuracoesSchema = z
  .object({
    nome_empresa: z.string().trim().max(120),
    valor_hora_padrao: z.string().regex(/^\d+$/),
    remunera_mao_obra_propria: z.enum(['0', '1']),
    permite_estoque_negativo: z.enum(['0', '1']),
  })
  .partial();

/* ------------------------------- materiais ------------------------------- */

export const materialSchema = z.object({
  nome: nomeSchema,
  categoriaId: idSchema.nullish().transform((v) => v ?? null),
  unidade: z.enum(UNIDADES_BASE, { error: 'Escolha a unidade de controle do estoque' }),
  estoqueMinimo: inteiroNaoNegativo.nullish().transform((v) => v ?? null),
  ativo: z.boolean().default(true),
});

/** Fator como dois inteiros (mili): `quantidadeNova` da unidade nova = `quantidadeAtual` da atual. */
export const trocaUnidadePreviaSchema = z.object({
  novaUnidade: z.enum(UNIDADES_BASE, { error: 'Escolha a nova unidade' }),
  quantidadeNova: inteiroPositivo.max(1_000_000_000, 'Valor grande demais'),
  quantidadeAtual: inteiroPositivo.max(1_000_000_000, 'Valor grande demais'),
});

export const trocaUnidadeSchema = trocaUnidadePreviaSchema.extend({
  /** Quantidade (mili, na unidade nova) escolhida para cada receita que pediu decisão. */
  receitas: z.array(z.object({ fichaId: idSchema, quantidade: inteiroPositivo })).default([]),
  motivo: textoOpcional,
  /** A que veio na prévia: garante que se aplica o que a usuária viu. */
  assinatura: z.string().min(1),
});

/** Unidade em que a tela mostrava a quantidade; recusa a gravação se ela mudou nesse meio-tempo. */
const unidadeVista = z.string().optional();

export const ajusteEstoqueSchema = z.object({
  tipo: z.enum(['entrada', 'saida']),
  unidade: unidadeVista,
  /** Mili-unidades (material) ou unidades inteiras (produto), sempre positivo. */
  quantidade: inteiroPositivo,
  /** Só para entradas de material sem custo médio vigente (micro-reais por unidade base). */
  custoUnitario: inteiroNaoNegativo.optional(),
  justificativa: z.string().trim().min(3, 'Explique o motivo do ajuste'),
  data: dataSchema.optional(),
  autorizarEstoqueNegativo: z.boolean().default(false),
});

/* -------------------------------- compras -------------------------------- */

export const compraItemSchema = z.object({
  materialId: idSchema,
  /** Mili-unidades da unidade informada. */
  quantidadeInformada: inteiroPositivo,
  unidadeInformada: z
    .string()
    .refine((u) => UNIDADES.some((x) => x.codigo === u), 'Unidade inválida'),
  /** Quanto da unidade base cabe na unidade informada (obrigatório para caixa). */
  fatorConversao: inteiroPositivo.optional(),
  /** Total pago pelo item, em centavos. */
  valorTotal: inteiroNaoNegativo,
});

export const compraDespesaSchema = z.object({
  tipo: z.enum(TIPOS_DESPESA_COMPRA),
  descricao: textoOpcional,
  valor: inteiroPositivo,
  rateio: z.enum(CRITERIOS_RATEIO_COMPRA).default('por_valor'),
});

export const compraSchema = z.object({
  fornecedorId: idSchema.nullish().transform((v) => v ?? null),
  data: dataSchema,
  formaPagamento: z.enum(FORMAS_PAGAMENTO).default('pix'),
  observacao: textoOpcional,
  itens: z.array(compraItemSchema).min(1, 'Inclua ao menos um item'),
  despesas: z.array(compraDespesaSchema).default([]),
});

export const cancelamentoSchema = z.object({
  motivo: textoOpcional,
});

/* --------------------------------- produtos --------------------------------- */

export const produtoSchema = z.object({
  nome: nomeSchema,
  descricao: textoOpcional,
  categoriaId: idSchema.nullish().transform((v) => v ?? null),
  precoVenda: inteiroNaoNegativo.nullish().transform((v) => v ?? null),
  ativo: z.boolean().default(true),
});

/* ----------------------------- ficha técnica ----------------------------- */

export const fichaItemSchema = z.object({
  materialId: idSchema,
  /** Mili-unidades da unidade base do material, por rendimento da ficha. */
  quantidade: inteiroPositivo,
  unidade: unidadeVista,
  observacao: textoOpcional,
});

export const fichaExtraSchema = z.object({
  descricao: nomeSchema,
  valor: inteiroNaoNegativo,
  tipo: z.enum(TIPOS_EXTRA_FICHA).default('outro'),
  porUnidade: z.boolean().default(true),
});

export const fichaSchema = z
  .object({
    rendimento: inteiroPositivo.default(1),
    maoObraModo: z.enum(MODOS_MAO_OBRA).default('nenhuma'),
    /** Centavos por hora. */
    maoObraValorHora: inteiroNaoNegativo.nullish().transform((v) => v ?? null),
    maoObraMinutos: inteiroNaoNegativo.nullish().transform((v) => v ?? null),
    /** Centavos por rendimento. */
    maoObraValorFixo: inteiroNaoNegativo.nullish().transform((v) => v ?? null),
    observacao: textoOpcional,
    itens: z.array(fichaItemSchema).default([]),
    extras: z.array(fichaExtraSchema).default([]),
  })
  .superRefine((f, ctx) => {
    if (f.maoObraModo === 'hora' && (!f.maoObraValorHora || !f.maoObraMinutos)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o valor da hora e os minutos',
        path: ['maoObraMinutos'],
      });
    }
    if (f.maoObraModo === 'fixo' && !f.maoObraValorFixo) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o valor fixo da mão de obra',
        path: ['maoObraValorFixo'],
      });
    }
    const ids = f.itens.map((i) => i.materialId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Material repetido na ficha', path: ['itens'] });
    }
  });

/* ----------------------------- precificação ----------------------------- */

export const precificacaoCalculoSchema = z.object({
  /** Custo base gerencial (centavos). */
  custoBase: inteiroNaoNegativo,
  /** Soma das taxas fixas (centavos). */
  taxasFixas: inteiroNaoNegativo.default(0),
  /** Soma das taxas percentuais sobre o preço (centésimos de ponto percentual). */
  taxasPercentuais: inteiroNaoNegativo.default(0),
  modo: z.enum(MODOS_PRECO),
  /** Centavos (lucro em valor) ou centésimos de ponto percentual. */
  parametro: inteiroNaoNegativo,
  /** Preço final escolhido pela usuária; quando presente, calcula lucro e margem efetivos. */
  precoFinal: inteiroNaoNegativo.optional(),
});

export const precificacaoSchema = z.object({
  produtoId: idSchema,
  modo: z.enum(MODOS_PRECO),
  parametro: inteiroNaoNegativo,
  taxaIds: z.array(idSchema).default([]),
  precoFinal: inteiroPositivo,
  aplicarAoProduto: z.boolean().default(false),
});

/* ------------------------------- produção ------------------------------- */

export const producaoSimulacaoSchema = z.object({
  produtoId: idSchema,
  quantidade: inteiroPositivo,
});

export const producaoSchema = producaoSimulacaoSchema.extend({
  data: dataSchema,
  observacao: textoOpcional,
  autorizarEstoqueNegativo: z.boolean().default(false),
  justificativaEstoqueNegativo: textoOpcional,
});

/* -------------------------------- vendas -------------------------------- */

export const vendaItemSchema = z.object({
  produtoId: idSchema,
  quantidade: inteiroPositivo,
  /** Centavos por unidade. */
  precoUnitario: inteiroNaoNegativo,
  descontoItem: inteiroNaoNegativo.default(0),
});

export const vendaSchema = z.object({
  clienteId: idSchema.nullish().transform((v) => v ?? null),
  data: dataSchema,
  itens: z.array(vendaItemSchema).min(1, 'Inclua ao menos um produto'),
  desconto: inteiroNaoNegativo.default(0),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).default('pix'),
  /** Valor recebido na hora. Omitido = recebido por inteiro. 0 = venda pendente. */
  valorRecebido: inteiroNaoNegativo.optional(),
  observacao: textoOpcional,
  autorizarEstoqueNegativo: z.boolean().default(false),
});

export const recebimentoSchema = z.object({
  data: dataSchema,
  valor: inteiroPositivo,
  formaPagamento: z.enum(FORMAS_PAGAMENTO).default('pix'),
});

/* ------------------------- despesas compartilhadas ------------------------- */

export const despesaCompartilhadaSchema = z.object({
  descricao: nomeSchema,
  data: dataSchema,
  valorTotal: inteiroPositivo,
  tipo: z.enum(TIPOS_DESPESA_COMPARTILHADA).default('outro'),
  criterio: z.enum(CRITERIOS_RATEIO).default('manual'),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).default('pix'),
});

export const rateioSchema = z.object({
  destinos: z
    .array(
      z.object({
        destinoTipo: z.enum(['produto', 'producao']),
        destinoId: idSchema,
        /** Obrigatório no critério manual. */
        valor: inteiroNaoNegativo.optional(),
        /** Usado nos critérios por_producao e por_valor. */
        peso: inteiroNaoNegativo.optional(),
      }),
    )
    .min(1, 'Escolha ao menos um destino'),
});

/* ------------------------------- financeiro ------------------------------- */

export const lancamentoManualSchema = z.object({
  tipo: z.enum(TIPOS_LANCAMENTO),
  natureza: z.enum(NATUREZAS_MANUAIS),
  descricao: nomeSchema,
  valor: inteiroPositivo,
  dataCompetencia: dataSchema,
  /** Quando o dinheiro entrou/saiu. Vazio = lançamento previsto. */
  dataCaixa: dataSchema.nullish().transform((v) => v ?? null),
});

export const realizarLancamentoSchema = z.object({ dataCaixa: dataSchema });

/* -------------------------------- backup -------------------------------- */

export const restauracaoSchema = z.object({
  arquivo: z.string().min(1),
  confirmacao: z.literal('RESTAURAR', { error: 'Digite RESTAURAR para confirmar' }),
});

/* ------------------------------ tipos derivados ------------------------------ */

export type LoginEntrada = z.input<typeof loginSchema>;
export type UsuarioEntrada = z.input<typeof usuarioSchema>;
export type ClienteEntrada = z.input<typeof clienteSchema>;
export type FornecedorEntrada = z.input<typeof fornecedorSchema>;
export type CategoriaEntrada = z.input<typeof categoriaSchema>;
export type CategoriaRenomearEntrada = z.input<typeof categoriaRenomearSchema>;
export type TaxaEntrada = z.input<typeof taxaSchema>;
export type MaterialEntrada = z.input<typeof materialSchema>;
export type TrocaUnidadePreviaEntrada = z.input<typeof trocaUnidadePreviaSchema>;
export type TrocaUnidadeEntrada = z.input<typeof trocaUnidadeSchema>;
export type AjusteEstoqueEntrada = z.input<typeof ajusteEstoqueSchema>;
export type CompraEntrada = z.input<typeof compraSchema>;
export type CompraItemEntrada = z.input<typeof compraItemSchema>;
export type CompraDespesaEntrada = z.input<typeof compraDespesaSchema>;
export type ProdutoEntrada = z.input<typeof produtoSchema>;
export type FichaEntrada = z.input<typeof fichaSchema>;
export type PrecificacaoCalculoEntrada = z.input<typeof precificacaoCalculoSchema>;
export type PrecificacaoEntrada = z.input<typeof precificacaoSchema>;
export type ProducaoEntrada = z.input<typeof producaoSchema>;
export type VendaEntrada = z.input<typeof vendaSchema>;
export type RecebimentoEntrada = z.input<typeof recebimentoSchema>;
export type DespesaCompartilhadaEntrada = z.input<typeof despesaCompartilhadaSchema>;
export type RateioEntrada = z.input<typeof rateioSchema>;
export type LancamentoManualEntrada = z.input<typeof lancamentoManualSchema>;
