import { analisarPreco, calcularCustoFicha, calcularPreco, consolidarTaxas } from '@pitanga/core';
import type {
  CalculoPreco,
  CustoFichaResposta,
  Ficha,
  FichaEntrada,
  Precificacao,
  PrecificacaoCalculoEntrada,
  PrecificacaoEntrada,
} from '@pitanga/shared';
import {
  fichaSchema,
  hojeISO,
  precificacaoCalculoSchema,
  precificacaoSchema,
} from '@pitanga/shared';
import type { Contexto } from '../db/util';
import { ErroDeValidacao, OperacaoNaoPermitida, RegistroNaoEncontrado } from '../erros';
import { buscarTaxas } from '../repositories/cadastros.repo';
import * as repo from '../repositories/fichas.repo';
import { buscarMaterial } from '../repositories/materiais.repo';
import { recusarUnidadeDesatualizada } from './materiais.service';
import { definirPrecoVenda } from '../repositories/produtos.repo';
import { inserirAuditoria } from '../repositories/sistema.repo';
import { obterProduto } from './produtos.service';

export function obterFicha(ctx: Contexto, id: number): Ficha {
  const f = repo.buscarFicha(ctx.db, id);
  if (!f) throw new RegistroNaoEncontrado('Ficha técnica');
  return f;
}

export function fichaAtiva(ctx: Contexto, produtoId: number): Ficha | undefined {
  return repo.fichaAtivaDoProduto(ctx.db, produtoId);
}

export function listarFichasDoProduto(ctx: Contexto, produtoId: number): Ficha[] {
  obterProduto(ctx, produtoId);
  return repo.listarFichasDoProduto(ctx.db, produtoId);
}

function gravarItens(
  ctx: Contexto,
  fichaId: number,
  dados: ReturnType<typeof fichaSchema.parse>,
): void {
  for (const i of dados.itens) {
    const material = buscarMaterial(ctx.db, i.materialId);
    if (!material) throw new RegistroNaoEncontrado('Material da ficha');
    recusarUnidadeDesatualizada(material, i.unidade);
    repo.inserirItemFicha(ctx.db, { fichaId, ...i });
  }
  for (const e of dados.extras) repo.inserirExtraFicha(ctx.db, { fichaId, ...e });
}

/** Cria uma ficha (primeira versão ou nova versão, que passa a ser a ativa). */
export function criarFicha(ctx: Contexto, produtoId: number, entrada: FichaEntrada): Ficha {
  obterProduto(ctx, produtoId);
  const dados = fichaSchema.parse(entrada);
  const id = ctx.db.transaction(() => {
    const versao = repo.proximaVersao(ctx.db, produtoId);
    repo.desativarFichas(ctx.db, produtoId);
    const fichaId = repo.inserirFicha(ctx.db, { produtoId, versao, ...dados });
    gravarItens(ctx, fichaId, dados);
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'criar',
      entidade: 'ficha',
      entidadeId: fichaId,
      dados: { produtoId, versao },
    });
    return fichaId;
  })();
  return obterFicha(ctx, id);
}

/**
 * Edição de ficha. Uma ficha já usada em produção nunca é alterada: a edição gera a versão
 * seguinte, preservando o histórico de custo. Ficha ainda não usada é corrigida no lugar.
 */
export function editarFicha(ctx: Contexto, id: number, entrada: FichaEntrada): Ficha {
  const atual = obterFicha(ctx, id);
  if (!atual.ativa) {
    throw new OperacaoNaoPermitida('Só a versão ativa da ficha pode ser editada.');
  }
  if (repo.fichaFoiUsada(ctx.db, id)) return criarFicha(ctx, atual.produtoId, entrada);
  const dados = fichaSchema.parse(entrada);
  ctx.db.transaction(() => {
    repo.atualizarFicha(ctx.db, id, dados);
    repo.limparItensEExtras(ctx.db, id);
    gravarItens(ctx, id, dados);
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'editar',
      entidade: 'ficha',
      entidadeId: id,
    });
  })();
  return obterFicha(ctx, id);
}

/** Custo por peça com o custo médio vigente dos materiais (o front recalcula igual, em tempo real). */
export function custoDaFicha(ctx: Contexto, id: number, quantidade?: number): CustoFichaResposta {
  const ficha = obterFicha(ctx, id);
  const rateiosPendentes = repo.rateiosPendentesDoProduto(ctx.db, ficha.produtoId);
  const qtd = quantidade && quantidade > 0 ? quantidade : ficha.rendimento;
  return {
    fichaId: ficha.id,
    produtoId: ficha.produtoId,
    quantidade: qtd,
    rateiosPendentes,
    custo: calcularCustoFicha(
      {
        rendimento: ficha.rendimento,
        maoObraModo: ficha.maoObraModo,
        maoObraValorHora: ficha.maoObraValorHora,
        maoObraMinutos: ficha.maoObraMinutos,
        maoObraValorFixo: ficha.maoObraValorFixo,
        itens: ficha.itens,
        extras: ficha.extras,
      },
      { rateiosCentavos: rateiosPendentes, quantidade: qtd },
    ),
  };
}

/* ------------------------------- precificação ------------------------------- */

function tratarErroDeCalculo<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof Error && e.name === 'ErroDeCalculo') throw new ErroDeValidacao(e.message);
    throw e;
  }
}

/** Calcula sem gravar — usado em tempo real pela tela de precificação. */
export function calcularPrecificacao(entrada: PrecificacaoCalculoEntrada): CalculoPreco {
  const d = precificacaoCalculoSchema.parse(entrada);
  return tratarErroDeCalculo(() => {
    const precoSugerido = calcularPreco(d);
    const analise = analisarPreco({ ...d, precoFinal: d.precoFinal ?? precoSugerido });
    return { precoSugerido, ...analise };
  });
}

/** Grava a decisão de preço. O servidor recalcula o custo base a partir da ficha ativa. */
export function registrarPrecificacao(ctx: Contexto, entrada: PrecificacaoEntrada): Precificacao {
  const d = precificacaoSchema.parse(entrada);
  const produto = obterProduto(ctx, d.produtoId);
  const ficha = repo.fichaAtivaDoProduto(ctx.db, produto.id);
  if (!ficha)
    throw new OperacaoNaoPermitida('Cadastre a ficha técnica do produto antes de precificar.');
  const custoBase = custoDaFicha(ctx, ficha.id).custo.custoUnitarioCentavos;
  const taxas = buscarTaxas(ctx.db, d.taxaIds);
  const { taxasFixas, taxasPercentuais } = consolidarTaxas(taxas, custoBase);
  const calculo = tratarErroDeCalculo(() => {
    const precoSugerido = calcularPreco({
      custoBase,
      taxasFixas,
      taxasPercentuais,
      modo: d.modo,
      parametro: d.parametro,
    });
    return {
      precoSugerido,
      ...analisarPreco({ custoBase, taxasFixas, taxasPercentuais, precoFinal: d.precoFinal }),
    };
  });
  const id = ctx.db.transaction(() => {
    const novoId = repo.inserirPrecificacao(ctx.db, {
      produtoId: produto.id,
      fichaId: ficha.id,
      modo: d.modo,
      parametro: d.parametro,
      custoBase,
      taxasFixas,
      taxasPercentuais,
      precoSugerido: calculo.precoSugerido,
      precoFinal: d.precoFinal,
      lucroPrevisto: calculo.lucroPrevisto,
      margemEfetiva: calculo.margemEfetiva,
      aplicadoAoProduto: d.aplicarAoProduto,
      data: hojeISO(),
      usuarioId: ctx.usuarioId,
    });
    if (d.aplicarAoProduto) definirPrecoVenda(ctx.db, produto.id, d.precoFinal);
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'precificar',
      entidade: 'produto',
      entidadeId: produto.id,
      dados: { precoFinal: d.precoFinal, aplicado: d.aplicarAoProduto },
    });
    return novoId;
  })();
  return repo.listarPrecificacoes(ctx.db, produto.id).find((p) => p.id === id)!;
}

export function listarPrecificacoes(ctx: Contexto, produtoId: number): Precificacao[] {
  obterProduto(ctx, produtoId);
  return repo.listarPrecificacoes(ctx.db, produtoId);
}
