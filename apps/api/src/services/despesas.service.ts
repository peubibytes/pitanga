import { lancDespesaOperacional } from '@pitanga/core';
import type {
  DespesaCompartilhada,
  DespesaCompartilhadaEntrada,
  RateioEntrada,
} from '@pitanga/shared';
import { despesaCompartilhadaSchema, formatarMoeda, rateioSchema, ratear } from '@pitanga/shared';
import type { Contexto } from '../db/util';
import { ErroDeValidacao, OperacaoNaoPermitida, RegistroNaoEncontrado } from '../erros';
import { buscarProduto } from '../repositories/produtos.repo';
import * as repo from '../repositories/producao.repo';
import { inserirAuditoria } from '../repositories/sistema.repo';
import { estornarReferencia, registrarLancamento } from './financeiro.service';

export function obterDespesa(ctx: Contexto, id: number): DespesaCompartilhada {
  const d = repo.buscarDespesa(ctx.db, id);
  if (!d) throw new RegistroNaoEncontrado('Despesa compartilhada');
  return { ...d, rateios: repo.rateiosDaDespesa(ctx.db, id) };
}

export const listarDespesas = (ctx: Contexto): DespesaCompartilhada[] =>
  repo.listarDespesas(ctx.db).map((d) => ({ ...d, rateios: repo.rateiosDaDespesa(ctx.db, d.id) }));

/**
 * Registra a despesa e o seu ÚNICO lançamento de caixa (também no resultado, pois foi paga).
 * O rateio entre produtos serve só para custeio — não toca o caixa de novo.
 */
export function criarDespesa(
  ctx: Contexto,
  entrada: DespesaCompartilhadaEntrada,
): DespesaCompartilhada {
  const dados = despesaCompartilhadaSchema.parse(entrada);
  const id = ctx.db.transaction(() => {
    const despesaId = repo.inserirDespesa(ctx.db, { ...dados, usuarioId: ctx.usuarioId });
    const lancamentoId = registrarLancamento(
      ctx,
      lancDespesaOperacional({
        descricao: `Despesa compartilhada — ${dados.descricao}`,
        valor: dados.valorTotal,
        data: dados.data,
        referenciaTipo: 'despesa_compartilhada',
        referenciaId: despesaId,
      }),
    );
    repo.ligarLancamentoADespesa(ctx.db, despesaId, lancamentoId);
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'criar',
      entidade: 'despesa_compartilhada',
      entidadeId: despesaId,
    });
    return despesaId;
  })();
  return obterDespesa(ctx, id);
}

/**
 * Distribui a despesa entre produtos e/ou produções. A soma dos rateios fecha exatamente com o valor
 * da despesa (a sobra de arredondamento vai para a maior parcela).
 *  - destino "produto": entra no custo da PRÓXIMA produção do produto (e na ficha, como pendente);
 *  - destino "produção": soma ao custo gerencial de um lote já produzido.
 */
export function ratearDespesa(
  ctx: Contexto,
  id: number,
  entrada: RateioEntrada,
): DespesaCompartilhada {
  const dados = rateioSchema.parse(entrada);
  const despesa = obterDespesa(ctx, id);
  if (despesa.status !== 'aberta') {
    throw new OperacaoNaoPermitida(
      despesa.status === 'rateada'
        ? 'Esta despesa já foi rateada.'
        : 'Despesa cancelada não pode ser rateada.',
    );
  }

  let valores: number[];
  if (despesa.criterio === 'manual') {
    valores = dados.destinos.map((d) => d.valor ?? 0);
    const soma = valores.reduce((s, v) => s + v, 0);
    if (soma !== despesa.valorTotal) {
      throw new ErroDeValidacao(
        `A soma dos rateios (${formatarMoeda(soma)}) precisa ser igual ao valor da despesa (${formatarMoeda(despesa.valorTotal)}).`,
      );
    }
  } else {
    const pesos = dados.destinos.map((d) => d.peso ?? 0);
    if (pesos.every((p) => p === 0)) {
      throw new ErroDeValidacao(
        'Informe o peso (quantidade ou valor) de cada destino para ratear.',
      );
    }
    valores = ratear(despesa.valorTotal, pesos);
  }

  ctx.db.transaction(() => {
    dados.destinos.forEach((d, i) => {
      const valor = valores[i] ?? 0;
      if (d.destinoTipo === 'produto') {
        if (!buscarProduto(ctx.db, d.destinoId))
          throw new RegistroNaoEncontrado('Produto do rateio');
        repo.inserirRateio(ctx.db, {
          despesaId: id,
          destinoTipo: 'produto',
          destinoId: d.destinoId,
          valor,
          producaoId: null,
        });
      } else {
        const prod = repo.buscarProducao(ctx.db, d.destinoId);
        if (!prod) throw new RegistroNaoEncontrado('Produção do rateio');
        if (prod.status !== 'concluida')
          throw new ErroDeValidacao('Não é possível ratear para uma produção cancelada.');
        repo.inserirRateio(ctx.db, {
          despesaId: id,
          destinoTipo: 'producao',
          destinoId: d.destinoId,
          valor,
          producaoId: d.destinoId,
        });
        repo.acrescentarRateioNaProducao(ctx.db, d.destinoId, valor);
      }
    });
    repo.definirStatusDespesa(ctx.db, id, 'rateada');
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'ratear',
      entidade: 'despesa_compartilhada',
      entidadeId: id,
    });
  })();
  return obterDespesa(ctx, id);
}

export function cancelarDespesa(ctx: Contexto, id: number, hoje: string): DespesaCompartilhada {
  const despesa = obterDespesa(ctx, id);
  if (despesa.status === 'cancelada')
    throw new OperacaoNaoPermitida('Esta despesa já foi cancelada.');
  if (repo.rateioJaApropriado(ctx.db, id)) {
    throw new OperacaoNaoPermitida(
      'Esta despesa já compõe o custo de uma produção; não pode ser cancelada.',
    );
  }
  ctx.db.transaction(() => {
    estornarReferencia(ctx, 'despesa_compartilhada', id, hoje, 'despesa cancelada');
    repo.definirStatusDespesa(ctx.db, id, 'cancelada');
    ctx.db.prepare(`DELETE FROM despesas_rateios WHERE despesa_id = ?`).run(id);
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'cancelar',
      entidade: 'despesa_compartilhada',
      entidadeId: id,
    });
  })();
  return obterDespesa(ctx, id);
}
