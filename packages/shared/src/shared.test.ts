import { describe, expect, it } from 'vitest';
import {
  fatorDeConversao,
  formatarData,
  formatarMicro,
  formatarMoeda,
  formatarPercentual,
  formatarQuantidade,
  lerData,
  lerMoeda,
  lerPercentual,
  lerQuantidade,
  mulDiv,
  paraCampo,
  ratear,
  valorEmCentavos,
  custoUnitarioMicro,
  vendaSchema,
  compraSchema,
  fichaSchema,
} from './index';

const norm = (s: string) => s.replace(/\s/g, ' ');

describe('mulDiv', () => {
  it('arredonda meio para cima (positivos)', () => {
    expect(mulDiv(5, 1, 2)).toBe(3);
    expect(mulDiv(7, 1, 4)).toBe(2);
    expect(mulDiv(1, 1, 3)).toBe(0);
  });
  it('arredonda meio para longe do zero (negativos)', () => {
    expect(mulDiv(-5, 1, 2)).toBe(-3);
    expect(mulDiv(5, -1, 2)).toBe(-3);
    expect(mulDiv(-7, 1, 4)).toBe(-2);
  });
  it('não perde precisão em produtos grandes', () => {
    expect(mulDiv(9_007_199_254_740_991, 3, 3)).toBe(9_007_199_254_740_991);
  });
  it('recusa divisão por zero', () => {
    expect(() => mulDiv(1, 1, 0)).toThrow();
  });
});

describe('valores unitários', () => {
  it('converte quantidade × custo unitário em centavos', () => {
    // 250 ml a R$ 0,0375/ml = R$ 9,375 → 938 centavos
    expect(valorEmCentavos(250_000, 37_500)).toBe(938);
  });
  it('calcula custo unitário em micro-reais', () => {
    // R$ 160,00 por 1000 ml = R$ 0,16/ml
    expect(custoUnitarioMicro(16_000, 1_000_000)).toBe(160_000);
  });
});

describe('ratear', () => {
  it('fecha exatamente com o total e põe a sobra na maior parcela', () => {
    const partes = ratear(100, [1, 1, 1]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(100);
    expect(partes).toEqual([34, 33, 33]);
  });
  it('é proporcional aos pesos', () => {
    expect(ratear(1000, [100, 300])).toEqual([250, 750]);
  });
  it('divide igualmente quando todos os pesos são zero', () => {
    expect(ratear(10, [0, 0])).toEqual([5, 5]);
  });
  it('mantém a soma em casos com resto', () => {
    for (const total of [1, 7, 999, 12345]) {
      const partes = ratear(total, [3, 5, 11, 2]);
      expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe('formatação pt-BR', () => {
  it('formata moeda, micro, quantidade e percentual', () => {
    expect(norm(formatarMoeda(123456))).toBe('R$ 1.234,56');
    expect(norm(formatarMicro(166_667))).toBe('R$ 0,166667');
    expect(norm(formatarMicro(2_000_000))).toBe('R$ 2,00');
    expect(formatarQuantidade(1500, 'kg')).toBe('1,5 kg');
    expect(formatarQuantidade(250_000)).toBe('250');
    expect(formatarPercentual(1250)).toBe('12,5%');
  });
  it('formata datas', () => {
    expect(formatarData('2026-11-21')).toBe('21/11/2026');
    expect(formatarData(null)).toBe('—');
  });
});

describe('leitura de entrada', () => {
  it('lê moeda, quantidade e percentual', () => {
    expect(lerMoeda('1.234,56')).toBe(123456);
    expect(lerMoeda('15')).toBe(1500);
    expect(lerMoeda('0,5')).toBe(50);
    expect(lerQuantidade('1,5')).toBe(1500);
    expect(lerQuantidade('250')).toBe(250_000);
    expect(lerPercentual('12,5')).toBe(1250);
    expect(lerMoeda('')).toBeNull();
  });
  it('lê datas BR e ISO e recusa inválidas', () => {
    expect(lerData('21/11/2026')).toBe('2026-11-21');
    expect(lerData('2026-11-21')).toBe('2026-11-21');
    expect(lerData('31/02/2026')).toBeNull();
    expect(lerData('abc')).toBeNull();
  });
  it('devolve valor editável', () => {
    expect(paraCampo(123456, 100)).toBe('1234,56');
    expect(paraCampo(1500, 1000)).toBe('1,5');
    expect(paraCampo(null, 100)).toBe('');
  });
});

describe('conversão de unidades', () => {
  it('converte litro e quilo; caixa exige fator', () => {
    expect(fatorDeConversao('l', 'ml')).toBe(1000);
    expect(fatorDeConversao('kg', 'g')).toBe(1000);
    expect(fatorDeConversao('cx', 'un')).toBeNull();
    expect(fatorDeConversao('cx', 'un', 12)).toBe(12);
    expect(fatorDeConversao('kg', 'ml')).toBeNull();
  });
});

describe('schemas', () => {
  it('venda exige ao menos um item', () => {
    const r = vendaSchema.safeParse({ data: '2026-11-21', itens: [] });
    expect(r.success).toBe(false);
  });
  it('venda aplica padrões', () => {
    const r = vendaSchema.parse({
      data: '2026-11-21',
      itens: [{ produtoId: 1, quantidade: 2, precoUnitario: 3690 }],
    });
    expect(r.desconto).toBe(0);
    expect(r.clienteId).toBeNull();
    expect(r.itens[0]?.descontoItem).toBe(0);
  });
  it('compra recusa unidade inexistente', () => {
    const r = compraSchema.safeParse({
      data: '2026-11-21',
      itens: [
        { materialId: 1, quantidadeInformada: 1000, unidadeInformada: 'xx', valorTotal: 100 },
      ],
    });
    expect(r.success).toBe(false);
  });
  it('ficha por hora exige valor da hora e minutos', () => {
    const r = fichaSchema.safeParse({ maoObraModo: 'hora', itens: [] });
    expect(r.success).toBe(false);
  });
  it('ficha recusa material repetido', () => {
    const r = fichaSchema.safeParse({
      itens: [
        { materialId: 1, quantidade: 1000 },
        { materialId: 1, quantidade: 2000 },
      ],
    });
    expect(r.success).toBe(false);
  });
});
