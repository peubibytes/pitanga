/**
 * Razão de estoque: toda mudança de saldo de material ou de produto acabado passa por aqui,
 * gravando o movimento e atualizando o cache (`estoque_atual`, `custo_medio`) na mesma transação.
 */
import { custoMedioAposEntrada, custoMedioAposEstornoDeEntrada, valorDaBaixa } from '@pitanga/core';
import type { TipoMovimentoMaterial, TipoMovimentoProduto } from '@pitanga/shared';
import { MILI, custoUnitarioMicro, formatarQuantidade, valorEmCentavos } from '@pitanga/shared';
import type { Contexto } from '../db/util';
import { EstoqueInsuficiente, RegistroNaoEncontrado } from '../erros';
import * as materiais from '../repositories/materiais.repo';
import * as produtos from '../repositories/produtos.repo';

export interface ResultadoMovimento {
  movimentoId: number;
  /** Centavos, com o mesmo sinal da quantidade. */
  custoTotal: number;
  custoUnitario: number;
  saldoApos: number;
  custoMedioApos: number;
}

export interface MovimentoMaterialEntrada {
  materialId: number;
  tipo: TipoMovimentoMaterial;
  /** Mili-unidades da unidade base; positivo entra, negativo sai. */
  quantidade: number;
  /** Valor exato do movimento (centavos, positivo). Omitido = avaliado ao custo médio. */
  valorCentavos?: number;
  /** Custo unitário (micro-reais) para entradas sem custo médio vigente. */
  custoUnitarioPadrao?: number;
  data: string;
  referenciaTipo?: string | null;
  referenciaId?: number | null;
  justificativa?: string | null;
  permitirNegativo?: boolean;
}

export function movimentarMaterial(ctx: Contexto, p: MovimentoMaterialEntrada): ResultadoMovimento {
  const m = materiais.buscarMaterial(ctx.db, p.materialId);
  if (!m) throw new RegistroNaoEncontrado('Material');
  const estado = { estoque: m.estoqueAtual, custoMedio: m.custoMedio };
  const q = Math.abs(p.quantidade);
  const saldoApos = m.estoqueAtual + p.quantidade;

  if (p.quantidade < 0 && saldoApos < 0 && !p.permitirNegativo) {
    throw new EstoqueInsuficiente(
      `Estoque insuficiente de ${m.nome}: há ${formatarQuantidade(m.estoqueAtual, m.unidade)} e a operação exige ${formatarQuantidade(q, m.unidade)}.`,
      [
        {
          id: m.id,
          nome: m.nome,
          unidade: m.unidade,
          necessario: q,
          disponivel: m.estoqueAtual,
          falta: q - m.estoqueAtual,
        },
      ],
    );
  }

  let valor: number;
  let custoMedioApos = m.custoMedio;
  if (p.quantidade > 0) {
    const padrao = m.custoMedio > 0 ? m.custoMedio : (p.custoUnitarioPadrao ?? 0);
    valor = p.valorCentavos ?? valorEmCentavos(q, padrao);
    custoMedioApos = custoMedioAposEntrada(estado, q, valor);
  } else {
    if (p.valorCentavos !== undefined) {
      valor = p.valorCentavos;
      custoMedioApos = custoMedioAposEstornoDeEntrada(estado, q, valor);
    } else {
      valor = valorDaBaixa(estado, q);
    }
  }
  const custoTotal = p.quantidade > 0 ? valor : -valor;
  const custoUnitario = q > 0 ? custoUnitarioMicro(valor, q) : m.custoMedio;

  const movimentoId = materiais.inserirMovimentoMaterial(ctx.db, {
    materialId: m.id,
    tipo: p.tipo,
    quantidade: p.quantidade,
    custoUnitario,
    custoTotal,
    saldoApos,
    custoMedioApos,
    referenciaTipo: p.referenciaTipo ?? null,
    referenciaId: p.referenciaId ?? null,
    data: p.data,
    justificativa: p.justificativa ?? null,
    usuarioId: ctx.usuarioId,
  });
  materiais.atualizarSaldoMaterial(ctx.db, m.id, saldoApos, custoMedioApos);
  return { movimentoId, custoTotal, custoUnitario, saldoApos, custoMedioApos };
}

export interface MovimentoProdutoEntrada {
  produtoId: number;
  tipo: TipoMovimentoProduto;
  /** Unidades inteiras; positivo entra, negativo sai. */
  quantidade: number;
  /** Valor exato do movimento (centavos, positivo). Omitido = avaliado ao custo médio. */
  valorCentavos?: number;
  /** Mão de obra própria não paga embutida no movimento (centavos, positivo). */
  maoObraCentavos?: number;
  data: string;
  referenciaTipo?: string | null;
  referenciaId?: number | null;
  justificativa?: string | null;
  permitirNegativo?: boolean;
}

export function movimentarProduto(ctx: Contexto, p: MovimentoProdutoEntrada): ResultadoMovimento {
  const prod = produtos.buscarProduto(ctx.db, p.produtoId);
  const est = produtos.estadoDoProduto(ctx.db, p.produtoId);
  if (!prod || !est) throw new RegistroNaoEncontrado('Produto');
  const q = Math.abs(p.quantidade);
  const saldoApos = est.estoqueAtual + p.quantidade;

  if (p.quantidade < 0 && saldoApos < 0 && !p.permitirNegativo) {
    throw new EstoqueInsuficiente(
      `Estoque insuficiente de ${prod.nome}: há ${est.estoqueAtual} un. e a operação exige ${q}.`,
      [
        {
          id: prod.id,
          nome: prod.nome,
          unidade: 'un',
          necessario: q,
          disponivel: est.estoqueAtual,
          falta: q - est.estoqueAtual,
        },
      ],
    );
  }

  // As funções de custo trabalham em mili-unidades; produtos têm unidades inteiras.
  const estado = { estoque: est.estoqueAtual * MILI, custoMedio: est.custoProducao };
  const estadoMao = { estoque: est.estoqueAtual * MILI, custoMedio: est.maoObraMedia };
  let valor: number;
  let custoMedioApos = est.custoProducao;
  let maoMediaApos = est.maoObraMedia;

  if (p.quantidade > 0) {
    valor = p.valorCentavos ?? valorEmCentavos(q * MILI, est.custoProducao);
    custoMedioApos = custoMedioAposEntrada(estado, q * MILI, valor);
    if (p.maoObraCentavos !== undefined) {
      maoMediaApos = custoMedioAposEntrada(estadoMao, q * MILI, p.maoObraCentavos);
    }
  } else if (p.valorCentavos !== undefined) {
    valor = p.valorCentavos;
    custoMedioApos = custoMedioAposEstornoDeEntrada(estado, q * MILI, valor);
    if (p.maoObraCentavos !== undefined) {
      maoMediaApos = custoMedioAposEstornoDeEntrada(estadoMao, q * MILI, p.maoObraCentavos);
    }
  } else {
    valor = valorDaBaixa(estado, q * MILI);
  }
  const custoTotal = p.quantidade > 0 ? valor : -valor;
  const custoUnitario = q > 0 ? custoUnitarioMicro(valor, q * MILI) : est.custoProducao;

  const movimentoId = produtos.inserirMovimentoProduto(ctx.db, {
    produtoId: prod.id,
    tipo: p.tipo,
    quantidade: p.quantidade,
    custoUnitario,
    custoTotal,
    saldoApos,
    custoMedioApos,
    referenciaTipo: p.referenciaTipo ?? null,
    referenciaId: p.referenciaId ?? null,
    data: p.data,
    justificativa: p.justificativa ?? null,
    usuarioId: ctx.usuarioId,
  });
  produtos.atualizarSaldoProduto(ctx.db, prod.id, saldoApos, custoMedioApos, maoMediaApos);
  return { movimentoId, custoTotal, custoUnitario, saldoApos, custoMedioApos };
}
