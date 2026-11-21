import {
  MICRO_POR_CENTAVO,
  custoUnitarioMicro,
  mulDiv,
  ratear,
  somar,
  type CriterioRateioCompra,
  type ModoMaoObra,
} from '@pitanga/shared';
import { necessidadeDoLote } from '../estoque';

/* ----------------------- custo de aquisição (compras) ----------------------- */

export interface ItemParaRateio {
  /** Total pago pelo item (centavos). */
  valorTotal: number;
  /** Quantidade na unidade base (mili-unidades). */
  quantidadeBase: number;
}
export interface DespesaParaRateio {
  valor: number;
  rateio: CriterioRateioCompra;
}
export interface ResultadoRateioCompra {
  /** Parcela das despesas que cabe a cada item (mesma ordem de entrada). */
  rateadaPorItem: number[];
  /** Despesas que não compõem o custo do material (desembolso à parte). */
  naoRateada: number;
}

/**
 * Rateia as despesas de uma compra entre os itens (seção 6.1). A sobra de arredondamento vai para
 * o item de maior peso, de modo que a soma dos rateios feche exatamente com cada despesa.
 */
export function ratearDespesasDaCompra(
  itens: ItemParaRateio[],
  despesas: DespesaParaRateio[],
): ResultadoRateioCompra {
  const rateadaPorItem = itens.map(() => 0);
  let naoRateada = 0;
  for (const d of despesas) {
    if (d.rateio === 'nao_rateia') {
      naoRateada += d.valor;
      continue;
    }
    const pesos = itens.map((i) => (d.rateio === 'por_valor' ? i.valorTotal : i.quantidadeBase));
    ratear(d.valor, pesos).forEach((parte, idx) => {
      rateadaPorItem[idx] = (rateadaPorItem[idx] ?? 0) + parte;
    });
  }
  return { rateadaPorItem, naoRateada };
}

/** Custo unitário final do item (micro-reais por unidade base): (valor + despesa rateada) ÷ quantidade. */
export function custoUnitarioFinalDoItem(
  valorTotal: number,
  despesaRateada: number,
  quantidadeBase: number,
): number {
  return custoUnitarioMicro(valorTotal + despesaRateada, quantidadeBase);
}

/* ------------------------------ ficha técnica ------------------------------ */

export interface FichaParaCusto {
  rendimento: number;
  maoObraModo: ModoMaoObra;
  /** Centavos por hora. */
  maoObraValorHora?: number | null;
  maoObraMinutos?: number | null;
  /** Centavos por rendimento. */
  maoObraValorFixo?: number | null;
  itens: { materialId: number; quantidade: number; custoMedio: number }[];
  extras: { valor: number; porUnidade: boolean }[];
}

export interface CustoFicha {
  rendimento: number;
  /** Custo do lote-padrão da ficha (um rendimento), em micro-reais. */
  loteMateriaisMicro: number;
  loteMaoObraMicro: number;
  /** Composição do custo unitário, em micro-reais por peça. */
  unitarioMateriaisMicro: number;
  unitarioMaoObraMicro: number;
  unitarioExtrasMicro: number;
  unitarioRateiosMicro: number;
  custoUnitarioMicro: number;
  /** Custo unitário em centavos — o "custo base" da formação de preço. */
  custoUnitarioCentavos: number;
}

/** Mão de obra do lote-padrão (um rendimento) em micro-reais. */
export function maoObraDoRendimentoMicro(f: {
  maoObraModo: ModoMaoObra;
  maoObraValorHora?: number | null;
  maoObraMinutos?: number | null;
  maoObraValorFixo?: number | null;
}): number {
  if (f.maoObraModo === 'hora') {
    return mulDiv((f.maoObraValorHora ?? 0) * MICRO_POR_CENTAVO, f.maoObraMinutos ?? 0, 60);
  }
  if (f.maoObraModo === 'fixo') return (f.maoObraValorFixo ?? 0) * MICRO_POR_CENTAVO;
  return 0;
}

/**
 * Custo da ficha técnica (seção 6.2), por peça:
 *   (materiais + mão de obra) ÷ rendimento + extras + rateios
 * `rateiosCentavos` = despesas compartilhadas ainda não apropriadas a uma produção; são diluídas
 * em `quantidade` peças (por padrão, o rendimento da ficha).
 */
export function calcularCustoFicha(
  ficha: FichaParaCusto,
  opcoes: { rateiosCentavos?: number; quantidade?: number } = {},
): CustoFicha {
  const { rendimento } = ficha;
  const quantidade = opcoes.quantidade ?? rendimento;
  const loteMateriaisMicro = somar(
    ficha.itens.map((i) => mulDiv(i.quantidade, i.custoMedio, 1000)),
  );
  const loteMaoObraMicro = maoObraDoRendimentoMicro(ficha);
  const unitarioMateriaisMicro = mulDiv(loteMateriaisMicro, 1, rendimento);
  const unitarioMaoObraMicro = mulDiv(loteMaoObraMicro, 1, rendimento);
  const unitarioExtrasMicro = somar(
    ficha.extras.map((e) =>
      e.porUnidade
        ? e.valor * MICRO_POR_CENTAVO
        : mulDiv(e.valor * MICRO_POR_CENTAVO, 1, rendimento),
    ),
  );
  const unitarioRateiosMicro = opcoes.rateiosCentavos
    ? mulDiv(opcoes.rateiosCentavos * MICRO_POR_CENTAVO, 1, quantidade)
    : 0;
  const custoUnitario =
    unitarioMateriaisMicro + unitarioMaoObraMicro + unitarioExtrasMicro + unitarioRateiosMicro;
  return {
    rendimento,
    loteMateriaisMicro,
    loteMaoObraMicro,
    unitarioMateriaisMicro,
    unitarioMaoObraMicro,
    unitarioExtrasMicro,
    unitarioRateiosMicro,
    custoUnitarioMicro: custoUnitario,
    custoUnitarioCentavos: mulDiv(custoUnitario, 1, MICRO_POR_CENTAVO),
  };
}

/* ------------------------------ custo do lote ------------------------------ */

export interface EntradaCustoLote {
  ficha: Omit<FichaParaCusto, 'itens'> & { itens: { quantidade: number }[] };
  /** Peças produzidas. */
  quantidade: number;
  /** Custo (centavos) de cada material efetivamente consumido, já ao custo médio do momento. */
  custosConsumidos: number[];
  /** Despesas compartilhadas apropriadas a este lote (centavos). */
  rateiosCentavos: number;
  /** Houve desembolso pela mão de obra deste lote. */
  remunerouMaoObra: boolean;
}

export interface CustoLote {
  custoMateriais: number;
  custoMaoObra: number;
  custoExtras: number;
  custoRateios: number;
  /** Custo gerencial completo (formação de preço). */
  custoTotal: number;
  custoUnitario: number;
  /** Custo que entra no estoque de acabados (seção 6.3). */
  custoEstoqueTotal: number;
  custoEstoqueUnitario: number;
  /** Mão de obra do lote que NÃO foi paga em dinheiro (fora do estoque). */
  maoObraNaoRemunerada: number;
}

/**
 * Custo real do lote, fotografado na gravação (seção 6.3). `custoTotal` é gerencial; o estoque de
 * acabados só recebe materiais e, se houve pagamento, a mão de obra — extras e rateios já foram
 * lançados como compra/despesa no seu próprio momento e não podem ser contados de novo.
 */
export function calcularCustoLote(e: EntradaCustoLote): CustoLote {
  const { ficha, quantidade } = e;
  const custoMateriais = somar(e.custosConsumidos);
  let custoMaoObra = 0;
  if (ficha.maoObraModo === 'hora') {
    custoMaoObra = mulDiv(
      (ficha.maoObraValorHora ?? 0) * (ficha.maoObraMinutos ?? 0),
      quantidade,
      60 * ficha.rendimento,
    );
  } else if (ficha.maoObraModo === 'fixo') {
    custoMaoObra = mulDiv(ficha.maoObraValorFixo ?? 0, quantidade, ficha.rendimento);
  }
  const custoExtras = somar(
    ficha.extras.map((x) =>
      x.porUnidade ? x.valor * quantidade : mulDiv(x.valor, quantidade, ficha.rendimento),
    ),
  );
  const custoRateios = e.rateiosCentavos;
  const custoTotal = custoMateriais + custoMaoObra + custoExtras + custoRateios;
  const custoEstoqueTotal = custoMateriais + (e.remunerouMaoObra ? custoMaoObra : 0);
  return {
    custoMateriais,
    custoMaoObra,
    custoExtras,
    custoRateios,
    custoTotal,
    custoUnitario: custoUnitarioMicro(custoTotal, quantidade * 1000),
    custoEstoqueTotal,
    custoEstoqueUnitario: custoUnitarioMicro(custoEstoqueTotal, quantidade * 1000),
    maoObraNaoRemunerada: e.remunerouMaoObra ? 0 : custoMaoObra,
  };
}

/** Necessidades de material de um lote, na ordem dos itens da ficha. */
export function calcularNecessidadesDoLote(
  itens: { quantidade: number }[],
  quantidadeLote: number,
  rendimento: number,
): number[] {
  return itens.map((i) => necessidadeDoLote(i.quantidade, quantidadeLote, rendimento));
}
