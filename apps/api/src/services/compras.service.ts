import {
  custoUnitarioFinalDoItem,
  lancCompraMaterial,
  lancDespesaOperacional,
  ratearDespesasDaCompra,
} from '@pitanga/core';
import type { Compra, CompraEntrada } from '@pitanga/shared';
import {
  cancelamentoSchema,
  compraSchema,
  custoUnitarioMicro,
  fatorDeConversao,
  formatarMoeda,
  hojeISO,
  ROTULO_RATEIO_COMPRA,
} from '@pitanga/shared';
import type { Contexto } from '../db/util';
import { ErroDeValidacao, OperacaoNaoPermitida, RegistroNaoEncontrado } from '../erros';
import { buscarFornecedor } from '../repositories/cadastros.repo';
import * as repo from '../repositories/compras.repo';
import { buscarMaterial } from '../repositories/materiais.repo';
import { inserirAuditoria } from '../repositories/sistema.repo';
import { movimentarMaterial } from './estoque.service';
import { estornarReferencia, registrarLancamento } from './financeiro.service';

export const listarCompras = (ctx: Contexto, f: Parameters<typeof repo.listarCompras>[1]) =>
  repo.listarCompras(ctx.db, f);

export function obterCompra(ctx: Contexto, id: number): Compra {
  const c = repo.buscarCompra(ctx.db, id);
  if (!c) throw new RegistroNaoEncontrado('Compra');
  return {
    ...c,
    itens: repo.itensDaCompra(ctx.db, id),
    despesas: repo.despesasDaCompra(ctx.db, id),
  };
}

/**
 * Registra uma compra de matéria-prima (seção 6.1 e 7):
 *  - converte para a unidade base e rateia as despesas entre os itens;
 *  - dá entrada no estoque e recalcula o custo médio móvel;
 *  - lança UM desembolso de caixa que NÃO afeta o resultado (troca de dinheiro por estoque).
 */
export function registrarCompra(ctx: Contexto, entrada: CompraEntrada): Compra {
  const dados = compraSchema.parse(entrada);
  if (dados.fornecedorId && !buscarFornecedor(ctx.db, dados.fornecedorId)) {
    throw new RegistroNaoEncontrado('Fornecedor');
  }

  const itens = dados.itens.map((i, idx) => {
    const material = buscarMaterial(ctx.db, i.materialId);
    if (!material) throw new RegistroNaoEncontrado(`Material do item ${idx + 1}`);
    const fator = fatorDeConversao(i.unidadeInformada, material.unidade, i.fatorConversao);
    if (!fator) {
      throw new ErroDeValidacao(
        i.unidadeInformada === 'cx'
          ? `Informe quantas unidades de ${material.nome} cabem em cada caixa.`
          : `A unidade "${i.unidadeInformada}" não é compatível com ${material.nome}, controlado em "${material.unidade}".`,
      );
    }
    return { ...i, material, fator, quantidadeBase: i.quantidadeInformada * fator };
  });

  const rateio = ratearDespesasDaCompra(
    itens.map((i) => ({ valorTotal: i.valorTotal, quantidadeBase: i.quantidadeBase })),
    dados.despesas.map((d) => ({ valor: d.valor, rateio: d.rateio })),
  );

  const totalItens = itens.reduce((s, i) => s + i.valorTotal, 0);
  const totalDespesas = dados.despesas.reduce((s, d) => s + d.valor, 0);
  const rateadas = rateio.rateadaPorItem.reduce((s, v) => s + v, 0);

  const id = ctx.db.transaction(() => {
    const compraId = repo.inserirCompra(ctx.db, {
      fornecedorId: dados.fornecedorId,
      data: dados.data,
      totalItens,
      totalDespesas,
      total: totalItens + totalDespesas,
      formaPagamento: dados.formaPagamento,
      observacao: dados.observacao,
      usuarioId: ctx.usuarioId,
    });

    itens.forEach((i, idx) => {
      const despesaRateada = rateio.rateadaPorItem[idx] ?? 0;
      repo.inserirItemCompra(ctx.db, {
        compraId,
        materialId: i.materialId,
        quantidadeInformada: i.quantidadeInformada,
        unidadeInformada: i.unidadeInformada,
        fatorConversao: i.fator,
        quantidadeBase: i.quantidadeBase,
        valorUnitario: custoUnitarioMicro(i.valorTotal, i.quantidadeInformada),
        valorTotal: i.valorTotal,
        despesaRateada,
        custoUnitarioFinal: custoUnitarioFinalDoItem(
          i.valorTotal,
          despesaRateada,
          i.quantidadeBase,
        ),
      });
      movimentarMaterial(ctx, {
        materialId: i.materialId,
        tipo: 'compra',
        quantidade: i.quantidadeBase,
        valorCentavos: i.valorTotal + despesaRateada,
        data: dados.data,
        referenciaTipo: 'compra',
        referenciaId: compraId,
      });
    });

    for (const d of dados.despesas) {
      repo.inserirDespesaCompra(ctx.db, { compraId, ...d });
    }

    const fornecedor = dados.fornecedorId
      ? buscarFornecedor(ctx.db, dados.fornecedorId)?.nomeLoja
      : null;
    // Um só lançamento para itens + despesas que compõem o custo: caixa sim, resultado não.
    registrarLancamento(
      ctx,
      lancCompraMaterial({
        descricao: `Compra de materiais #${compraId}${fornecedor ? ` — ${fornecedor}` : ''}`,
        valor: totalItens + rateadas,
        data: dados.data,
        referenciaTipo: 'compra',
        referenciaId: compraId,
      }),
    );
    // Despesa que não compõe o custo do material é desembolso à parte (resultado do período).
    for (const d of dados.despesas.filter((x) => x.rateio === 'nao_rateia')) {
      registrarLancamento(
        ctx,
        lancDespesaOperacional({
          descricao: `${d.tipo[0]!.toUpperCase()}${d.tipo.slice(1)} da compra #${compraId}${d.descricao ? ` — ${d.descricao}` : ''}`,
          valor: d.valor,
          data: dados.data,
          referenciaTipo: 'compra',
          referenciaId: compraId,
        }),
      );
    }
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'criar',
      entidade: 'compra',
      entidadeId: compraId,
      dados: { total: totalItens + totalDespesas, itens: itens.length },
    });
    return compraId;
  })();
  return obterCompra(ctx, id);
}

/** Cancelamento: devolve o material ao fornecedor e estorna o caixa; nada é apagado. */
export function cancelarCompra(ctx: Contexto, id: number, entrada: unknown): Compra {
  const { motivo } = cancelamentoSchema.parse(entrada ?? {});
  const compra = obterCompra(ctx, id);
  if (compra.status === 'cancelada')
    throw new OperacaoNaoPermitida('Esta compra já foi cancelada.');
  const hoje = hojeISO();
  ctx.db.transaction(() => {
    for (const i of compra.itens ?? []) {
      const material = buscarMaterial(ctx.db, i.materialId);
      if (!material || material.estoqueAtual < i.quantidadeBase) {
        throw new OperacaoNaoPermitida(
          `Não dá para cancelar: ${i.materialNome} já foi usado em produção e o estoque atual não cobre a devolução. ` +
            `Use um ajuste de estoque com justificativa.`,
          'COMPRA_JA_CONSUMIDA',
        );
      }
      movimentarMaterial(ctx, {
        materialId: i.materialId,
        tipo: 'estorno',
        quantidade: -i.quantidadeBase,
        valorCentavos: i.valorTotal + i.despesaRateada,
        data: hoje,
        referenciaTipo: 'compra',
        referenciaId: id,
        justificativa: motivo,
      });
    }
    estornarReferencia(ctx, 'compra', id, hoje, motivo);
    repo.definirStatusCompra(ctx.db, id, 'cancelada');
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'cancelar',
      entidade: 'compra',
      entidadeId: id,
      dados: { motivo, total: formatarMoeda(compra.total) },
    });
  })();
  return obterCompra(ctx, id);
}

export const rotuloRateio = (r: keyof typeof ROTULO_RATEIO_COMPRA): string =>
  ROTULO_RATEIO_COMPRA[r];
