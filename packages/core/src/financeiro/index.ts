import type { Natureza, StatusLancamento, TipoLancamento } from '@pitanga/shared';

/**
 * Regras financeiras (seção 7) — a matriz "operação → lançamento" e a apuração dos blocos.
 *
 * Cada fato é classificado em duas dimensões independentes:
 *   afetaCaixa     → entra no saldo de caixa (na `dataCaixa`)
 *   afetaResultado → entra no lucro/prejuízo (na `dataCompetencia`)
 * Comprar matéria-prima é troca de dinheiro por estoque: afeta o caixa, não o resultado.
 * O valor vira resultado quando o produto é vendido, como CMV.
 */

export interface LancamentoRascunho {
  tipo: TipoLancamento;
  natureza: Natureza;
  descricao: string;
  /** Sempre positivo; o sinal vem de `tipo`. */
  valor: number;
  dataCompetencia: string;
  dataCaixa: string | null;
  afetaResultado: boolean;
  afetaCaixa: boolean;
  status: StatusLancamento;
  referenciaTipo: string | null;
  referenciaId: number | null;
  estornaLancamentoId?: number | null;
}

type Base = Pick<LancamentoRascunho, 'descricao' | 'valor' | 'referenciaTipo' | 'referenciaId'>;

/** Compra de matéria-prima (itens + despesas rateadas): caixa sim, resultado não. */
export function lancCompraMaterial(b: Base & { data: string }): LancamentoRascunho {
  return {
    tipo: 'despesa',
    natureza: 'compra_material',
    descricao: b.descricao,
    valor: b.valor,
    dataCompetencia: b.data,
    dataCaixa: b.data,
    afetaResultado: false,
    afetaCaixa: true,
    status: 'realizado',
    referenciaTipo: b.referenciaTipo,
    referenciaId: b.referenciaId,
  };
}

/** Despesa operacional paga: caixa e resultado. */
export function lancDespesaOperacional(b: Base & { data: string }): LancamentoRascunho {
  return {
    tipo: 'despesa',
    natureza: 'despesa_operacional',
    descricao: b.descricao,
    valor: b.valor,
    dataCompetencia: b.data,
    dataCaixa: b.data,
    afetaResultado: true,
    afetaCaixa: true,
    status: 'realizado',
    referenciaTipo: b.referenciaTipo,
    referenciaId: b.referenciaId,
  };
}

/** Mão de obra paga: caixa sim; resultado não (integra o custo do estoque). */
export function lancMaoObra(b: Base & { data: string }): LancamentoRascunho {
  return {
    tipo: 'despesa',
    natureza: 'mao_obra',
    descricao: b.descricao,
    valor: b.valor,
    dataCompetencia: b.data,
    dataCaixa: b.data,
    afetaResultado: false,
    afetaCaixa: true,
    status: 'realizado',
    referenciaTipo: b.referenciaTipo,
    referenciaId: b.referenciaId,
  };
}

/** Receita da venda, reconhecida uma só vez na data da venda: resultado sim; caixa só no recebimento. */
export function lancVenda(b: Base & { data: string }): LancamentoRascunho {
  return {
    tipo: 'receita',
    natureza: 'venda',
    descricao: b.descricao,
    valor: b.valor,
    dataCompetencia: b.data,
    dataCaixa: null,
    afetaResultado: true,
    afetaCaixa: false,
    status: 'realizado',
    referenciaTipo: b.referenciaTipo,
    referenciaId: b.referenciaId,
  };
}

/** Recebimento de venda: movimenta só o caixa; a receita já foi reconhecida na venda. */
export function lancRecebimento(b: Base & { data: string }): LancamentoRascunho {
  return {
    tipo: 'receita',
    natureza: 'venda',
    descricao: b.descricao,
    valor: b.valor,
    dataCompetencia: b.data,
    dataCaixa: b.data,
    afetaResultado: false,
    afetaCaixa: true,
    status: 'realizado',
    referenciaTipo: b.referenciaTipo,
    referenciaId: b.referenciaId,
  };
}

/** Baixa de CMV na venda: resultado sim, caixa não. */
export function lancCmv(b: Base & { data: string }): LancamentoRascunho {
  return {
    tipo: 'despesa',
    natureza: 'cmv',
    descricao: b.descricao,
    valor: b.valor,
    dataCompetencia: b.data,
    dataCaixa: null,
    afetaResultado: true,
    afetaCaixa: false,
    status: 'realizado',
    referenciaTipo: b.referenciaTipo,
    referenciaId: b.referenciaId,
  };
}

/** Ajuste de estoque com justificativa: perda é despesa, sobra é receita; só resultado. */
export function lancAjusteEstoque(b: Base & { data: string; perda: boolean }): LancamentoRascunho {
  return {
    tipo: b.perda ? 'despesa' : 'receita',
    natureza: 'ajuste',
    descricao: b.descricao,
    valor: b.valor,
    dataCompetencia: b.data,
    dataCaixa: null,
    afetaResultado: true,
    afetaCaixa: false,
    status: 'realizado',
    referenciaTipo: b.referenciaTipo,
    referenciaId: b.referenciaId,
  };
}

export interface EntradaManual {
  tipo: TipoLancamento;
  natureza: 'despesa_operacional' | 'ajuste' | 'aporte' | 'retirada';
  descricao: string;
  valor: number;
  dataCompetencia: string;
  dataCaixa: string | null;
}

/** Combinações válidas de tipo × natureza nos lançamentos manuais. */
export const TIPO_DA_NATUREZA_MANUAL: Record<EntradaManual['natureza'], TipoLancamento> = {
  despesa_operacional: 'despesa',
  ajuste: 'receita',
  aporte: 'receita',
  retirada: 'despesa',
};

/** Lançamento manual. Sem `dataCaixa` fica "previsto" e não conta até ser realizado. */
export function lancManual(m: EntradaManual): LancamentoRascunho {
  const naoOperacional = m.natureza === 'aporte' || m.natureza === 'retirada';
  return {
    tipo: m.tipo,
    natureza: m.natureza,
    descricao: m.descricao,
    valor: m.valor,
    dataCompetencia: m.dataCompetencia,
    dataCaixa: m.dataCaixa,
    afetaResultado: !naoOperacional,
    afetaCaixa: true,
    status: m.dataCaixa ? 'realizado' : 'previsto',
    referenciaTipo: 'manual',
    referenciaId: null,
  };
}

/** Lançamento de estorno: espelha o original com o tipo oposto, na data do cancelamento. */
export function estornarLancamento(
  original: LancamentoRascunho & { id: number },
  data: string,
  motivo?: string | null,
): LancamentoRascunho {
  return {
    ...original,
    tipo: original.tipo === 'receita' ? 'despesa' : 'receita',
    descricao: `Estorno: ${original.descricao}${motivo ? ` (${motivo})` : ''}`,
    dataCompetencia: data,
    dataCaixa: original.afetaCaixa && original.dataCaixa ? data : null,
    status: 'realizado',
    estornaLancamentoId: original.id,
  };
}

/* ------------------------------- apuração ------------------------------- */

export interface LancamentoParaApuracao {
  tipo: TipoLancamento;
  natureza: Natureza;
  valor: number;
  dataCompetencia: string;
  dataCaixa: string | null;
  afetaResultado: boolean;
  afetaCaixa: boolean;
  status: StatusLancamento;
}

export interface Apuracao {
  faturamento: number;
  recebido: number;
  despesasPagas: number;
  custoProdutosVendidos: number;
  lucroPrejuizo: number;
  saldoCaixa: number;
  variacaoCaixa: number;
}

const assinado = (l: { tipo: TipoLancamento; valor: number }): number =>
  l.tipo === 'receita' ? l.valor : -l.valor;

const dentro = (data: string | null, de: string | null, ate: string | null): boolean =>
  data !== null && (!de || data >= de) && (!ate || data <= ate);

/**
 * Apura os blocos do resultado e do caixa (seção 7.1). Estornos entram com sinal oposto, então
 * cancelamentos se anulam naturalmente. Só lançamentos "realizado" contam.
 *
 *   faturamento     = Σ venda (afeta resultado) por competência
 *   recebido        = Σ venda/outras receitas (afeta caixa) por data de caixa
 *   despesasPagas   = Σ despesa operacional + mão de obra (afeta caixa), sem compra de material
 *   cmv             = Σ natureza 'cmv'
 *   lucroPrejuizo   = Σ (afeta resultado) receitas − despesas
 *   variacaoCaixa   = Σ (afeta caixa) no período; saldoCaixa = acumulado até `ate`
 */
export function apurar(
  lancamentos: LancamentoParaApuracao[],
  periodo: { de: string | null; ate: string | null },
): Apuracao {
  const { de, ate } = periodo;
  let faturamento = 0;
  let recebido = 0;
  let despesasPagas = 0;
  let cmv = 0;
  let lucro = 0;
  let variacaoCaixa = 0;
  let saldoCaixa = 0;

  for (const l of lancamentos) {
    if (l.status !== 'realizado') continue;
    const v = assinado(l);
    if (l.afetaResultado && dentro(l.dataCompetencia, de, ate)) {
      lucro += v;
      if (l.natureza === 'venda') faturamento += v;
      if (l.natureza === 'cmv') cmv -= v;
    }
    if (l.afetaCaixa && l.dataCaixa) {
      if (!ate || l.dataCaixa <= ate) saldoCaixa += v;
      if (dentro(l.dataCaixa, de, ate)) {
        variacaoCaixa += v;
        if (l.natureza === 'venda' || l.natureza === 'ajuste') recebido += v;
        if (l.natureza === 'despesa_operacional' || l.natureza === 'mao_obra') despesasPagas -= v;
      }
    }
  }
  return {
    faturamento,
    recebido,
    despesasPagas,
    custoProdutosVendidos: cmv,
    lucroPrejuizo: lucro,
    saldoCaixa,
    variacaoCaixa,
  };
}

/**
 * Conferência da seção 7.2:
 *   variação de caixa (operacional) + variação de estoque + contas a receber = resultado
 * Devolve a diferença (0 = fecha). Aportes e retiradas ficam de fora do caixa operacional.
 */
export function diferencaDaEquacao(e: {
  variacaoCaixaOperacional: number;
  variacaoEstoque: number;
  contasAReceber: number;
  resultado: number;
}): number {
  return e.variacaoCaixaOperacional + e.variacaoEstoque + e.contasAReceber - e.resultado;
}
