import {
  TIPO_DA_NATUREZA_MANUAL,
  apurar,
  estornarLancamento,
  lancManual,
  type LancamentoRascunho,
} from '@pitanga/core';
import type {
  Lancamento,
  LancamentoManualEntrada,
  PontoCaixa,
  ResumoFinanceiro,
} from '@pitanga/shared';
import { hojeISO, lancamentoManualSchema, realizarLancamentoSchema } from '@pitanga/shared';
import type { Contexto } from '../db/util';
import { ErroDeValidacao, OperacaoNaoPermitida, RegistroNaoEncontrado } from '../erros';
import * as repo from '../repositories/financeiro.repo';
import { inserirAuditoria } from '../repositories/sistema.repo';
import { contasAReceber, maoObraNaoRemuneradaVendida } from '../repositories/vendas.repo';

/** Grava um lançamento derivado de uma operação (compra, venda, produção...). */
export function registrarLancamento(ctx: Contexto, l: LancamentoRascunho): number {
  if (l.valor <= 0) return 0; // lançamento de valor zero não tem efeito financeiro
  return repo.inserirLancamento(ctx.db, l, ctx.usuarioId);
}

/**
 * Cancelamento: nada é apagado. Cada lançamento vigente da origem ganha um estorno que o espelha
 * (tipo oposto, mesmas flags), na data do cancelamento.
 */
export function estornarReferencia(
  ctx: Contexto,
  referenciaTipo: string,
  referenciaId: number,
  data: string,
  motivo?: string | null,
): number[] {
  return repo
    .lancamentosVigentesDaReferencia(ctx.db, referenciaTipo, referenciaId)
    .map((original) => {
      const rascunho = estornarLancamento(original, data, motivo);
      return repo.inserirLancamento(ctx.db, rascunho, ctx.usuarioId);
    });
}

export function listarLancamentos(
  ctx: Contexto,
  f: Parameters<typeof repo.listarLancamentos>[1],
): { itens: Lancamento[]; total: number } {
  return repo.listarLancamentos(ctx.db, f);
}

export function criarLancamentoManual(ctx: Contexto, entrada: LancamentoManualEntrada): Lancamento {
  const dados = lancamentoManualSchema.parse(entrada);
  if (TIPO_DA_NATUREZA_MANUAL[dados.natureza] !== dados.tipo) {
    throw new ErroDeValidacao(
      dados.natureza === 'ajuste'
        ? 'Outras receitas são lançadas como receita.'
        : `Lançamentos de "${dados.natureza}" precisam ser do tipo ${TIPO_DA_NATUREZA_MANUAL[dados.natureza]}.`,
    );
  }
  const id = repo.inserirLancamento(ctx.db, lancManual(dados), ctx.usuarioId);
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'criar',
    entidade: 'lancamento',
    entidadeId: id,
    dados,
  });
  return repo.buscarLancamento(ctx.db, id)!;
}

export function realizarLancamento(ctx: Contexto, id: number, entrada: unknown): Lancamento {
  const { dataCaixa } = realizarLancamentoSchema.parse(entrada);
  const l = repo.buscarLancamento(ctx.db, id);
  if (!l) throw new RegistroNaoEncontrado('Lançamento');
  if (l.status !== 'previsto')
    throw new OperacaoNaoPermitida('Só lançamentos previstos podem ser realizados.');
  repo.definirStatusLancamento(ctx.db, id, 'realizado', dataCaixa);
  return repo.buscarLancamento(ctx.db, id)!;
}

export function cancelarLancamento(ctx: Contexto, id: number): Lancamento {
  const l = repo.buscarLancamento(ctx.db, id);
  if (!l) throw new RegistroNaoEncontrado('Lançamento');
  if (l.referenciaTipo !== 'manual') {
    throw new OperacaoNaoPermitida(
      'Este lançamento nasceu de uma venda, compra ou produção. Cancele a operação de origem.',
    );
  }
  if (l.status === 'cancelado' || repo.foiEstornado(ctx.db, id)) {
    throw new OperacaoNaoPermitida('Este lançamento já foi cancelado.');
  }
  if (l.status === 'previsto') {
    // Previsto nunca entrou nas somas: basta marcar como cancelado.
    repo.definirStatusLancamento(ctx.db, id, 'cancelado');
  } else {
    // Realizado: o original permanece no histórico e um estorno o anula nas apurações.
    repo.inserirLancamento(
      ctx.db,
      estornarLancamento(l, hojeISO(), 'cancelamento manual'),
      ctx.usuarioId,
    );
  }
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'cancelar',
    entidade: 'lancamento',
    entidadeId: id,
  });
  return repo.buscarLancamento(ctx.db, id)!;
}

/**
 * Os sete blocos do resultado e do caixa (seção 7.1): saem de `apurar`, em `packages/core`,
 * a única implementação das fórmulas.
 */
export function resumoFinanceiro(
  ctx: Contexto,
  de: string | null,
  ate: string | null,
): ResumoFinanceiro {
  // Só lançamentos "realizado" contam; estornos entram com sinal oposto e anulam o original.
  const a = apurar(repo.lancamentosParaApuracao(ctx.db, ate), { de, ate });
  const maoObra = maoObraNaoRemuneradaVendida(ctx.db, de, ate);
  return {
    de,
    ate,
    faturamento: a.faturamento,
    recebido: a.recebido,
    despesasPagas: a.despesasPagas,
    custoProdutosVendidos: a.custoProdutosVendidos,
    lucroPrejuizo: a.lucroPrejuizo,
    saldoCaixa: a.saldoCaixa,
    variacaoCaixa: a.variacaoCaixa,
    contasAReceber: contasAReceber(ctx.db, ate),
    maoObraNaoRemunerada: maoObra,
    lucroAposMaoObra: a.lucroPrejuizo - maoObra,
  };
}

/** Movimento diário do caixa com saldo corrido. */
export function caixaDiario(
  ctx: Contexto,
  de: string,
  ate: string,
): { saldoInicial: number; pontos: PontoCaixa[] } {
  const anterior = new Date(`${de}T00:00:00`);
  anterior.setDate(anterior.getDate() - 1);
  const dia = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}-${String(anterior.getDate()).padStart(2, '0')}`;
  const saldoInicial = repo.saldoCaixaAte(ctx.db, dia);
  let saldo = saldoInicial;
  const pontos = repo.caixaPorDia(ctx.db, de, ate).map((p) => {
    saldo += p.entradas - p.saidas;
    return { ...p, saldo };
  });
  return { saldoInicial, pontos };
}
