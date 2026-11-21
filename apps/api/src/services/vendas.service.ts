import { lancCmv, lancRecebimento, lancVenda } from '@pitanga/core';
import type { RecebimentoEntrada, StatusVenda, Venda, VendaEntrada } from '@pitanga/shared';
import {
  cancelamentoSchema,
  formatarMoeda,
  hojeISO,
  mulDiv,
  recebimentoSchema,
  vendaSchema,
} from '@pitanga/shared';
import type { Contexto } from '../db/util';
import {
  EstoqueInsuficiente,
  ErroDeValidacao,
  OperacaoNaoPermitida,
  RegistroNaoEncontrado,
} from '../erros';
import { buscarCliente } from '../repositories/cadastros.repo';
import { buscarProduto, estadoDoProduto } from '../repositories/produtos.repo';
import { inserirAuditoria, lerConfiguracoes } from '../repositories/sistema.repo';
import * as repo from '../repositories/vendas.repo';
import { movimentarProduto } from './estoque.service';
import { estornarReferencia, registrarLancamento } from './financeiro.service';

export const listarVendas = (ctx: Contexto, f: Parameters<typeof repo.listarVendas>[1]) =>
  repo.listarVendas(ctx.db, f);

export function obterVenda(ctx: Contexto, id: number): Venda {
  const v = repo.buscarVenda(ctx.db, id);
  if (!v) throw new RegistroNaoEncontrado('Venda');
  return {
    ...v,
    itens: repo.itensDaVenda(ctx.db, id),
    recebimentos: repo.recebimentosDaVenda(ctx.db, id),
  };
}

const statusPorRecebimento = (total: number, recebido: number): StatusVenda =>
  recebido >= total ? 'concluida' : 'pendente';

/**
 * Registra uma venda (seção 6.5 e 7):
 *  - baixa os acabados ao custo médio e congela o custo unitário em cada item (CMV);
 *  - reconhece a receita UMA vez, na data da venda, e o CMV no mesmo dia;
 *  - o valor recebido movimenta só o caixa; o saldo em aberto é a conta a receber.
 */
export function registrarVenda(ctx: Contexto, entrada: VendaEntrada): Venda {
  const dados = vendaSchema.parse(entrada);
  if (dados.clienteId && !buscarCliente(ctx.db, dados.clienteId))
    throw new RegistroNaoEncontrado('Cliente');

  const itens = dados.itens.map((i, idx) => {
    const produto = buscarProduto(ctx.db, i.produtoId);
    if (!produto) throw new RegistroNaoEncontrado(`Produto do item ${idx + 1}`);
    const bruto = i.quantidade * i.precoUnitario;
    if (i.descontoItem > bruto) {
      throw new ErroDeValidacao(
        `O desconto do item "${produto.nome}" é maior que o valor do item.`,
      );
    }
    return { ...i, produto, total: bruto - i.descontoItem };
  });
  const subtotal = itens.reduce((s, i) => s + i.total, 0);
  if (dados.desconto > subtotal)
    throw new ErroDeValidacao('O desconto é maior que o total da venda.');
  const total = subtotal - dados.desconto;
  const valorRecebido = dados.valorRecebido ?? total;
  if (valorRecebido > total) {
    throw new ErroDeValidacao(
      `O valor recebido (${formatarMoeda(valorRecebido)}) é maior que o total da venda.`,
    );
  }

  // Disponibilidade por produto (o mesmo produto pode aparecer em mais de uma linha).
  const porProduto = new Map<number, number>();
  for (const i of itens)
    porProduto.set(i.produtoId, (porProduto.get(i.produtoId) ?? 0) + i.quantidade);
  const faltas = [...porProduto].flatMap(([produtoId, necessario]) => {
    const p = buscarProduto(ctx.db, produtoId)!;
    return necessario > p.estoqueAtual
      ? [
          {
            id: p.id,
            nome: p.nome,
            unidade: 'un',
            necessario,
            disponivel: p.estoqueAtual,
            falta: necessario - p.estoqueAtual,
          },
        ]
      : [];
  });
  let permitirNegativo = false;
  if (faltas.length > 0) {
    const detalhe = faltas.map((f) => `${f.falta} un. de ${f.nome}`).join('; ');
    if (!dados.autorizarEstoqueNegativo)
      throw new EstoqueInsuficiente(`Estoque insuficiente: faltam ${detalhe}.`, faltas);
    if (lerConfiguracoes(ctx.db).permite_estoque_negativo !== '1') {
      throw new OperacaoNaoPermitida(
        `Estoque insuficiente: faltam ${detalhe}. O sistema está configurado para não permitir estoque negativo.`,
        'ESTOQUE_NEGATIVO_BLOQUEADO',
      );
    }
    permitirNegativo = true;
  }

  const id = ctx.db.transaction(() => {
    const vendaId = repo.inserirVenda(ctx.db, {
      clienteId: dados.clienteId,
      data: dados.data,
      subtotal,
      desconto: dados.desconto,
      total,
      formaPagamento: dados.formaPagamento,
      status: statusPorRecebimento(total, valorRecebido),
      cmv: 0,
      lucroEstimado: 0,
      observacao: dados.observacao,
      usuarioId: ctx.usuarioId,
    });

    let cmv = 0;
    for (const i of itens) {
      const maoObraUnitaria = estadoDoProduto(ctx.db, i.produtoId)?.maoObraMedia ?? 0;
      const r = movimentarProduto(ctx, {
        produtoId: i.produtoId,
        tipo: 'venda',
        quantidade: -i.quantidade,
        data: dados.data,
        referenciaTipo: 'venda',
        referenciaId: vendaId,
        permitirNegativo,
      });
      const custoTotal = Math.abs(r.custoTotal);
      cmv += custoTotal;
      repo.inserirItemVenda(ctx.db, {
        vendaId,
        produtoId: i.produtoId,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        descontoItem: i.descontoItem,
        total: i.total,
        custoUnitario: r.custoUnitario,
        custoTotal,
        maoObraUnitaria,
      });
    }
    repo.atualizarTotaisVenda(ctx.db, vendaId, cmv, total - cmv);

    registrarLancamento(
      ctx,
      lancVenda({
        descricao: `Venda #${vendaId}`,
        valor: total,
        data: dados.data,
        referenciaTipo: 'venda',
        referenciaId: vendaId,
      }),
    );
    registrarLancamento(
      ctx,
      lancCmv({
        descricao: `Custo dos produtos vendidos — venda #${vendaId}`,
        valor: cmv,
        data: dados.data,
        referenciaTipo: 'venda',
        referenciaId: vendaId,
      }),
    );
    if (valorRecebido > 0) {
      lancarRecebimento(ctx, vendaId, {
        data: dados.data,
        valor: valorRecebido,
        formaPagamento: dados.formaPagamento,
      });
    }
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'criar',
      entidade: 'venda',
      entidadeId: vendaId,
      dados: { total, itens: itens.length },
    });
    return vendaId;
  })();
  return obterVenda(ctx, id);
}

function lancarRecebimento(
  ctx: Contexto,
  vendaId: number,
  r: { data: string; valor: number; formaPagamento: string },
): number {
  const recebimentoId = repo.inserirRecebimento(ctx.db, {
    vendaId,
    ...r,
    usuarioId: ctx.usuarioId,
  });
  const lancamentoId = registrarLancamento(
    ctx,
    lancRecebimento({
      descricao: `Recebimento da venda #${vendaId}`,
      valor: r.valor,
      data: r.data,
      referenciaTipo: 'recebimento',
      referenciaId: recebimentoId,
    }),
  );
  if (lancamentoId) repo.ligarLancamentoAoRecebimento(ctx.db, recebimentoId, lancamentoId);
  return recebimentoId;
}

/** Recebimento (parcial ou total) de uma venda pendente: movimenta só o caixa, nunca a receita. */
export function registrarRecebimento(
  ctx: Contexto,
  vendaId: number,
  entrada: RecebimentoEntrada,
): Venda {
  const dados = recebimentoSchema.parse(entrada);
  const venda = obterVenda(ctx, vendaId);
  if (venda.status === 'cancelada')
    throw new OperacaoNaoPermitida('Venda cancelada não recebe pagamentos.');
  const emAberto = venda.total - venda.recebido;
  if (emAberto <= 0) throw new OperacaoNaoPermitida('Esta venda já está quitada.');
  if (dados.valor > emAberto) {
    throw new ErroDeValidacao(
      `O valor (${formatarMoeda(dados.valor)}) é maior que o saldo em aberto (${formatarMoeda(emAberto)}).`,
    );
  }
  ctx.db.transaction(() => {
    lancarRecebimento(ctx, vendaId, dados);
    repo.definirStatusVenda(
      ctx.db,
      vendaId,
      statusPorRecebimento(venda.total, venda.recebido + dados.valor),
    );
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'receber',
      entidade: 'venda',
      entidadeId: vendaId,
      dados,
    });
  })();
  return obterVenda(ctx, vendaId);
}

/** Cancelamento: devolve o estoque ao custo original e estorna receita, CMV e recebimentos. */
export function cancelarVenda(ctx: Contexto, id: number, entrada: unknown): Venda {
  const { motivo } = cancelamentoSchema.parse(entrada ?? {});
  const venda = obterVenda(ctx, id);
  if (venda.status === 'cancelada') throw new OperacaoNaoPermitida('Esta venda já foi cancelada.');
  const hoje = hojeISO();
  ctx.db.transaction(() => {
    for (const i of repo.itensParaEstorno(ctx.db, id)) {
      movimentarProduto(ctx, {
        produtoId: i.produtoId,
        tipo: 'estorno',
        quantidade: i.quantidade,
        valorCentavos: i.custoTotal,
        maoObraCentavos: mulDiv(i.quantidade, i.maoObraUnitaria, 10_000),
        data: hoje,
        referenciaTipo: 'venda',
        referenciaId: id,
        justificativa: motivo,
      });
    }
    estornarReferencia(ctx, 'venda', id, hoje, motivo);
    for (const r of venda.recebimentos ?? [])
      estornarReferencia(ctx, 'recebimento', r.id, hoje, motivo);
    repo.definirStatusVenda(ctx.db, id, 'cancelada');
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'cancelar',
      entidade: 'venda',
      entidadeId: id,
      dados: { motivo },
    });
  })();
  return obterVenda(ctx, id);
}
