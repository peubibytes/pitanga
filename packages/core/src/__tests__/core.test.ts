import { describe, expect, it } from 'vitest';
import {
  analisarPreco,
  apurar,
  calcularCustoFicha,
  calcularCustoLote,
  calcularPreco,
  consolidarTaxas,
  custoMedioAposEntrada,
  custoMedioAposEstornoDeEntrada,
  custoUnitarioFinalDoItem,
  diferencaDaEquacao,
  ErroDeCalculo,
  estornarLancamento,
  lancCmv,
  lancCompraMaterial,
  lancRecebimento,
  lancVenda,
  ratearDespesasDaCompra,
  verificarDisponibilidade,
  type LancamentoRascunho,
} from '../index';

describe('custo médio móvel (seção 6.1)', () => {
  it('reproduz o exemplo: 500 ml a R$ 0,18 + 1000 ml por R$ 150 com R$ 10 de transporte', () => {
    const { rateadaPorItem } = ratearDespesasDaCompra(
      [{ valorTotal: 15_000, quantidadeBase: 1_000_000 }],
      [{ valor: 1_000, rateio: 'por_valor' }],
    );
    expect(rateadaPorItem).toEqual([1_000]);
    const custoFinal = custoUnitarioFinalDoItem(15_000, 1_000, 1_000_000);
    expect(custoFinal).toBe(160_000); // R$ 0,160000/ml
    const novo = custoMedioAposEntrada(
      { estoque: 500_000, custoMedio: 180_000 },
      1_000_000,
      16_000,
    );
    expect(novo).toBe(166_667); // R$ 0,166667/ml
  });

  it('com estoque zerado, o custo médio é o custo da entrada', () => {
    expect(custoMedioAposEntrada({ estoque: 0, custoMedio: 999 }, 1_000_000, 16_000)).toBe(160_000);
    expect(custoMedioAposEntrada({ estoque: -5000, custoMedio: 999 }, 1_000_000, 16_000)).toBe(
      160_000,
    );
  });

  it('estorno de entrada devolve o custo médio anterior', () => {
    const antes = { estoque: 500_000, custoMedio: 180_000 };
    const depois = {
      estoque: 1_500_000,
      custoMedio: custoMedioAposEntrada(antes, 1_000_000, 16_000),
    };
    const volta = custoMedioAposEstornoDeEntrada(depois, 1_000_000, 16_000);
    expect(Math.abs(volta - 180_000)).toBeLessThanOrEqual(1);
  });
});

describe('rateio das despesas da compra', () => {
  const itens = [
    { valorTotal: 10_000, quantidadeBase: 100_000 },
    { valorTotal: 5_000, quantidadeBase: 300_000 },
    { valorTotal: 5_000, quantidadeBase: 100_000 },
  ];
  it('por valor, fecha exatamente com a despesa', () => {
    const r = ratearDespesasDaCompra(itens, [{ valor: 1_001, rateio: 'por_valor' }]);
    expect(r.rateadaPorItem.reduce((a, b) => a + b, 0)).toBe(1_001);
    expect(r.rateadaPorItem[0]).toBeGreaterThan(r.rateadaPorItem[1] ?? 0);
  });
  it('por quantidade, segue as quantidades', () => {
    const r = ratearDespesasDaCompra(itens, [{ valor: 500, rateio: 'por_quantidade' }]);
    expect(r.rateadaPorItem).toEqual([100, 300, 100]);
  });
  it('não rateada não compõe o custo', () => {
    const r = ratearDespesasDaCompra(itens, [
      { valor: 700, rateio: 'nao_rateia' },
      { valor: 100, rateio: 'por_valor' },
    ]);
    expect(r.naoRateada).toBe(700);
    expect(r.rateadaPorItem.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('formação do preço (seção 6.4) — difusor de 200 ml', () => {
  // materiais R$ 15,85 + mão de obra 12 min a R$ 25/h = R$ 5,00 → C = R$ 20,85; cartão 3,5%
  const C = 2_085;
  const p = 350;

  it('custo da ficha: materiais + mão de obra', () => {
    const custo = calcularCustoFicha({
      rendimento: 1,
      maoObraModo: 'hora',
      maoObraValorHora: 2_500,
      maoObraMinutos: 12,
      itens: [{ materialId: 1, quantidade: 1_000, custoMedio: 15_850_000 }],
      extras: [],
    });
    expect(custo.unitarioMaoObraMicro).toBe(50_000_00);
    expect(custo.custoUnitarioCentavos).toBe(C);
  });

  it('lucro em valor: R$ 37,15, lucro R$ 15,00, margem 40,4%', () => {
    const preco = calcularPreco({
      custoBase: C,
      taxasPercentuais: p,
      modo: 'lucro_valor',
      parametro: 1_500,
    });
    expect(preco).toBe(3_715);
    const a = analisarPreco({ custoBase: C, taxasPercentuais: p, precoFinal: preco });
    expect(a.lucroPrevisto).toBe(1_500);
    expect(a.margemEfetiva).toBe(4_038); // 40,38% → "40,4%"
  });

  it('acréscimo de 70% sobre o custo: R$ 36,73, lucro R$ 14,59, margem 39,7%', () => {
    const preco = calcularPreco({
      custoBase: C,
      taxasPercentuais: p,
      modo: 'acrescimo_percentual',
      parametro: 7_000,
    });
    expect(preco).toBe(3_673);
    const a = analisarPreco({ custoBase: C, taxasPercentuais: p, precoFinal: preco });
    expect(a.lucroPrevisto).toBe(1_459);
    expect(a.margemEfetiva).toBe(3_972);
  });

  it('margem de 40% sobre o preço: R$ 36,90, lucro R$ 14,76, margem 40,0%', () => {
    const preco = calcularPreco({
      custoBase: C,
      taxasPercentuais: p,
      modo: 'margem_percentual',
      parametro: 4_000,
    });
    expect(preco).toBe(3_690);
    const a = analisarPreco({ custoBase: C, taxasPercentuais: p, precoFinal: preco });
    expect(a.lucroPrevisto).toBe(1_476);
    expect(a.margemEfetiva).toBe(4_000);
  });

  it('recusa margem + taxas >= 100% do preço', () => {
    expect(() =>
      calcularPreco({
        custoBase: C,
        taxasPercentuais: p,
        modo: 'margem_percentual',
        parametro: 9_650,
      }),
    ).toThrow(ErroDeCalculo);
    expect(() =>
      calcularPreco({ custoBase: C, taxasPercentuais: 10_000, modo: 'lucro_valor', parametro: 1 }),
    ).toThrow(/100%/);
  });

  it('sinaliza prejuízo quando o preço fica abaixo do custo', () => {
    const a = analisarPreco({ custoBase: C, taxasPercentuais: p, precoFinal: 2_000 });
    expect(a.prejuizo).toBe(true);
    expect(a.lucroPrevisto).toBeLessThan(0);
    expect(a.precoDeEquilibrio).toBe(2_161);
  });

  it('consolida taxas fixas, sobre o preço e sobre o custo', () => {
    const r = consolidarTaxas(
      [
        { tipo: 'percentual', valor: 350, aplicaEm: 'preco' },
        { tipo: 'fixo', valor: 100, aplicaEm: 'preco' },
        { tipo: 'percentual', valor: 1_000, aplicaEm: 'custo' },
      ],
      2_000,
    );
    expect(r).toEqual({ taxasPercentuais: 350, taxasFixas: 300 });
  });
});

describe('ficha: extras e rateios', () => {
  it('extras por lote são divididos pelo rendimento; por unidade não', () => {
    const custo = calcularCustoFicha(
      {
        rendimento: 4,
        maoObraModo: 'fixo',
        maoObraValorFixo: 2_000,
        itens: [{ materialId: 1, quantidade: 2_000, custoMedio: 1_000_000 }], // 2 un × R$ 1,00
        extras: [
          { valor: 100, porUnidade: true },
          { valor: 400, porUnidade: false },
        ],
      },
      { rateiosCentavos: 800 },
    );
    expect(custo.unitarioMateriaisMicro).toBe(500_000);
    expect(custo.unitarioMaoObraMicro).toBe(5_000_000);
    expect(custo.unitarioExtrasMicro).toBe(100 * 10_000 + 100 * 10_000);
    expect(custo.unitarioRateiosMicro).toBe(200 * 10_000);
  });
});

describe('custo do lote (seção 6.3)', () => {
  const ficha = {
    rendimento: 1,
    maoObraModo: 'hora' as const,
    maoObraValorHora: 2_500,
    maoObraMinutos: 12,
    itens: [{ quantidade: 1 }],
    extras: [{ valor: 100, porUnidade: true }],
  };
  it('mão de obra não paga fica fora do custo de estoque', () => {
    const lote = calcularCustoLote({
      ficha,
      quantidade: 20,
      custosConsumidos: [31_700],
      rateiosCentavos: 0,
      remunerouMaoObra: false,
    });
    expect(lote.custoMaoObra).toBe(10_000); // 20 × R$ 5,00
    expect(lote.custoExtras).toBe(2_000);
    expect(lote.custoTotal).toBe(31_700 + 10_000 + 2_000);
    expect(lote.custoEstoqueTotal).toBe(31_700);
    expect(lote.maoObraNaoRemunerada).toBe(10_000);
    expect(lote.custoEstoqueUnitario).toBe(15_850_000); // R$ 15,85 por peça
  });
  it('mão de obra remunerada integra o estoque', () => {
    const lote = calcularCustoLote({
      ficha,
      quantidade: 20,
      custosConsumidos: [31_700],
      rateiosCentavos: 0,
      remunerouMaoObra: true,
    });
    expect(lote.custoEstoqueTotal).toBe(41_700);
    expect(lote.maoObraNaoRemunerada).toBe(0);
  });
});

describe('disponibilidade de material', () => {
  it('lista exatamente o que falta', () => {
    const faltas = verificarDisponibilidade([
      { materialId: 1, nome: 'Essência', unidade: 'ml', necessario: 300_000, disponivel: 180_000 },
      { materialId: 2, nome: 'Frasco', unidade: 'un', necessario: 5_000, disponivel: 9_000 },
    ]);
    expect(faltas).toHaveLength(1);
    expect(faltas[0]?.falta).toBe(120_000);
  });
});

describe('financeiro (seção 7) — um mês completo', () => {
  const d = '2026-11-10';
  const fase = (l: LancamentoRascunho) => ({ ...l });
  const lancs: LancamentoRascunho[] = [
    // compra de materiais R$ 500,00 à vista
    lancCompraMaterial({
      descricao: 'Compra',
      valor: 50_000,
      data: d,
      referenciaTipo: 'compra',
      referenciaId: 1,
    }),
    // venda de 10 difusores a R$ 36,90, recebida na hora
    lancVenda({
      descricao: 'Venda',
      valor: 36_900,
      data: d,
      referenciaTipo: 'venda',
      referenciaId: 1,
    }),
    lancRecebimento({
      descricao: 'Recebimento',
      valor: 36_900,
      data: d,
      referenciaTipo: 'recebimento',
      referenciaId: 1,
    }),
    // CMV 10 × R$ 15,85
    lancCmv({ descricao: 'CMV', valor: 15_850, data: d, referenciaTipo: 'venda', referenciaId: 1 }),
  ].map(fase);

  it('caixa negativo com lucro positivo, e a equação fecha', () => {
    const r = apurar(lancs, { de: '2026-11-01', ate: '2026-11-30' });
    expect(r.faturamento).toBe(36_900);
    expect(r.recebido).toBe(36_900);
    expect(r.custoProdutosVendidos).toBe(15_850);
    expect(r.lucroPrejuizo).toBe(21_050);
    expect(r.variacaoCaixa).toBe(-13_100);
    expect(r.saldoCaixa).toBe(-13_100);
    expect(r.despesasPagas).toBe(0); // compra de material não é despesa

    // variação de estoque: +500,00 compra − 317,00 consumo + 317,00 acabados − 158,50 CMV = 341,50
    const variacaoEstoque = 50_000 - 31_700 + 31_700 - 15_850;
    expect(variacaoEstoque).toBe(34_150);
    expect(
      diferencaDaEquacao({
        variacaoCaixaOperacional: r.variacaoCaixa,
        variacaoEstoque,
        contasAReceber: 0,
        resultado: r.lucroPrejuizo,
      }),
    ).toBe(0);
  });

  it('venda pendente: receita no resultado, nada no caixa, entra em contas a receber', () => {
    const r = apurar(
      [
        lancVenda({
          descricao: 'Venda',
          valor: 10_000,
          data: d,
          referenciaTipo: 'venda',
          referenciaId: 2,
        }),
      ],
      { de: null, ate: null },
    );
    expect(r.faturamento).toBe(10_000);
    expect(r.variacaoCaixa).toBe(0);
    expect(
      diferencaDaEquacao({
        variacaoCaixaOperacional: 0,
        variacaoEstoque: 0,
        contasAReceber: 10_000,
        resultado: r.lucroPrejuizo,
      }),
    ).toBe(0);
  });

  it('estornos anulam os lançamentos originais', () => {
    const originais = lancs.map((l, i) => ({ ...l, id: i + 1 }));
    const estornos = originais.map((l) => ({
      ...estornarLancamento(l, '2026-11-12', 'teste'),
      id: 0,
    }));
    const r = apurar([...originais, ...estornos], { de: null, ate: null });
    expect(r.faturamento).toBe(0);
    expect(r.lucroPrejuizo).toBe(0);
    expect(r.saldoCaixa).toBe(0);
    expect(r.recebido).toBe(0);
  });

  it('lançamento previsto não conta', () => {
    const r = apurar([{ ...lancs[0]!, status: 'previsto' as const }], { de: null, ate: null });
    expect(r.saldoCaixa).toBe(0);
  });

  it('respeita o período', () => {
    const r = apurar(lancs, { de: '2026-12-01', ate: '2026-12-31' });
    expect(r.faturamento).toBe(0);
    expect(r.lucroPrejuizo).toBe(0);
    expect(r.variacaoCaixa).toBe(0);
    expect(r.saldoCaixa).toBe(-13_100); // saldo acumulado até o fim do período
  });
});
