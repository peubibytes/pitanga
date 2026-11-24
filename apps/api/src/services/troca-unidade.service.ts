/**
 * Troca da unidade de controle de um material que já foi usado (ADR 0008).
 * Prévia sem gravar → confirmação com a assinatura do que foi visto → backup → conversão de tudo
 * numa transação, com os valores originais na auditoria. Nenhum valor em reais já lançado muda.
 */
import crypto from 'node:crypto';
import {
  converterCusto,
  converterMovimentos,
  converterQuantidade,
  desvioDaConversao,
  exigeDecisao,
  type FatorDeTroca,
} from '@pitanga/core';
import type {
  LadoDaTroca,
  Material,
  PreviaTrocaUnidade,
  ReceitaNaTroca,
  TrocaUnidadeEntrada,
  TrocaUnidadePreviaEntrada,
} from '@pitanga/shared';
import {
  mulDiv,
  trocaUnidadePreviaSchema,
  trocaUnidadeSchema,
  valorEmCentavos,
} from '@pitanga/shared';
import { criarBackup } from '../backup';
import type { Config } from '../config';
import type { Contexto } from '../db/util';
import { ErroDeValidacao, OperacaoNaoPermitida } from '../erros';
import { logger } from '../logger';
import * as fichas from '../repositories/fichas.repo';
import { inserirAuditoria } from '../repositories/sistema.repo';
import * as repo from '../repositories/troca-unidade.repo';
import { verificarInvariantes } from './invariantes.service';
import { obterMaterial } from './materiais.service';

interface Calculo {
  material: Material;
  fator: FatorDeTroca;
  usos: repo.UsosDoMaterial;
  previa: PreviaTrocaUnidade;
}

const lado = (
  unidade: string,
  estoque: number,
  estoqueMinimo: number | null,
  custoMedio: number,
): LadoDaTroca => ({
  unidade,
  estoque,
  estoqueMinimo,
  custoMedio,
  valorEmEstoque: valorEmCentavos(Math.max(0, estoque), custoMedio),
});

/** Arredondar para zero faria a informação sumir; o menor valor possível a preserva. */
const semSumir = (original: number, convertido: number): number =>
  original > 0 ? Math.max(1, convertido) : convertido;

function calcular(ctx: Contexto, id: number, entrada: TrocaUnidadePreviaEntrada): Calculo {
  const dados = trocaUnidadePreviaSchema.parse(entrada);
  const material = obterMaterial(ctx, id);
  if (dados.novaUnidade === material.unidade) {
    throw new ErroDeValidacao(`${material.nome} já é controlado em "${material.unidade}".`);
  }
  const fator: FatorDeTroca = { nova: dados.quantidadeNova, atual: dados.quantidadeAtual };
  const usos = repo.usosDoMaterial(ctx.db, id);

  const somaDosMovimentos = usos.movimentos.reduce((s, m) => s + m.quantidade, 0);
  if (somaDosMovimentos !== material.estoqueAtual) {
    throw new OperacaoNaoPermitida(
      'O estoque deste material não bate com o histórico dele, então a troca não pode ser feita. Fale com o suporte.',
      'ESTOQUE_INCONSISTENTE',
    );
  }

  const antes = lado(
    material.unidade,
    material.estoqueAtual,
    material.estoqueMinimo,
    material.custoMedio,
  );
  const depois = lado(
    dados.novaUnidade,
    converterQuantidade(material.estoqueAtual, fator),
    material.estoqueMinimo === null
      ? null
      : semSumir(material.estoqueMinimo, converterQuantidade(material.estoqueMinimo, fator)),
    converterCusto(material.custoMedio, fator),
  );
  if (antes.estoque !== 0 && depois.estoque === 0) {
    throw new ErroDeValidacao(
      'Com essa conversão o estoque viraria zero. Confira a quantidade informada.',
    );
  }
  if (antes.custoMedio > 0 && depois.custoMedio === 0) {
    throw new ErroDeValidacao(
      'Com essa conversão o custo viraria zero. Confira a quantidade informada.',
    );
  }
  if (![depois.estoque, depois.custoMedio].every(Number.isSafeInteger)) {
    throw new ErroDeValidacao('Essa conversão gera números grandes demais. Confira a quantidade.');
  }

  const receitas: ReceitaNaTroca[] = usos.receitas
    .filter((r) => r.ativa)
    .map((r) => {
      const quantidadeNova = converterQuantidade(r.quantidade, fator);
      return {
        fichaId: r.fichaId,
        produtoId: r.produtoId,
        produtoNome: r.produtoNome,
        quantidadeAtual: r.quantidade,
        quantidadeNova,
        desvio: desvioDaConversao(r.quantidade, quantidadeNova, fator),
        custoAtual: mulDiv(r.quantidade, antes.custoMedio, 1000),
        custoNovo: mulDiv(quantidadeNova, depois.custoMedio, 1000),
        exigeDecisao: exigeDecisao(r.quantidade, quantidadeNova, fator),
      };
    });

  // Tudo o que entra na conta: se qualquer linha mudar, a assinatura muda e a prévia não vale mais.
  const assinatura = crypto
    .createHash('sha256')
    .update(JSON.stringify({ dados, antes, usos }))
    .digest('hex');
  return {
    material,
    fator,
    usos,
    previa: {
      materialId: id,
      nome: material.nome,
      antes,
      depois,
      receitas,
      contagem: {
        movimentos: usos.movimentos.length,
        compras: usos.compras.length,
        producoes: usos.consumos.length,
        receitasAntigas: usos.receitas.length - receitas.length,
      },
      assinatura,
    },
  };
}

/** Mostra como tudo ficaria, sem gravar nada. */
export const previaDaTroca = (
  ctx: Contexto,
  id: number,
  entrada: TrocaUnidadePreviaEntrada,
): PreviaTrocaUnidade => calcular(ctx, id, entrada).previa;

export function trocarUnidade(
  ctx: Contexto,
  config: Config,
  id: number,
  entrada: TrocaUnidadeEntrada,
): Material {
  const dados = trocaUnidadeSchema.parse(entrada);
  const { receitas: escolhas, motivo, assinatura, ...conversao } = dados;
  const calculo = calcular(ctx, id, conversao);
  if (calculo.previa.assinatura !== assinatura) {
    throw new OperacaoNaoPermitida(
      'Alguma coisa mudou neste material depois da prévia. Confira os números de novo antes de confirmar.',
      'PREVIA_DESATUALIZADA',
    );
  }
  const decisoes = new Map(escolhas.map((r) => [r.fichaId, r.quantidade]));
  const pendente = calculo.previa.receitas.find((r) => r.exigeDecisao && !decisoes.has(r.fichaId));
  if (pendente) {
    throw new ErroDeValidacao(
      `Escolha a quantidade de ${calculo.material.nome} na receita de ${pendente.produtoNome}.`,
    );
  }
  for (const fichaId of decisoes.keys()) {
    if (!calculo.previa.receitas.some((r) => r.fichaId === fichaId && r.exigeDecisao)) {
      throw new ErroDeValidacao('Há uma quantidade para uma receita que não precisa de ajuste.');
    }
  }

  let backup: string;
  try {
    backup = criarBackup(ctx.db, config, 'automatico', 'pre-troca-unidade').arquivo;
  } catch (erro) {
    logger.error({ erro }, 'Falha no backup antes da troca de unidade.');
    throw new OperacaoNaoPermitida(
      'Não consegui fazer o backup de segurança, então nada foi alterado. Veja se há espaço no disco e tente de novo.',
      'BACKUP_FALHOU',
    );
  }

  const jaFalhavam = new Set(falhas(ctx));
  ctx.db.transaction(() => {
    const receitasDecididas = aplicar(ctx, calculo, decisoes);
    const novas = falhas(ctx).filter((n) => !jaFalhavam.has(n));
    if (novas.length) {
      logger.error({ material: id, invariantes: novas }, 'Troca de unidade desfeita.');
      throw new OperacaoNaoPermitida(
        'A conferência dos números falhou depois da conversão. Nada foi alterado. Fale com o suporte.',
        'CONFERENCIA_FALHOU',
      );
    }
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'trocar_unidade',
      entidade: 'material',
      entidadeId: id,
      dados: {
        de: calculo.previa.antes.unidade,
        para: calculo.previa.depois.unidade,
        fator: { nova: calculo.fator.nova, atual: calculo.fator.atual },
        motivo,
        antes: calculo.previa.antes,
        depois: calculo.previa.depois,
        receitasDecididas,
        backup,
        // Os números de antes, linha a linha: nada é perdido ao reescrever o histórico.
        originais: {
          movimentos: calculo.usos.movimentos.map((m) => [
            m.id,
            m.quantidade,
            m.custoUnitario,
            m.saldoApos,
            m.custoMedioApos,
          ]),
          compras: calculo.usos.compras.map((c) => [c.id, c.quantidadeBase, c.custoUnitarioFinal]),
          consumos: calculo.usos.consumos.map((c) => [c.id, c.quantidade, c.custoUnitario]),
          receitas: calculo.usos.receitas.map((r) => [r.id, r.quantidade]),
        },
      },
    });
  })();
  return obterMaterial(ctx, id);
}

const falhas = (ctx: Contexto): number[] =>
  verificarInvariantes(ctx.db)
    .filter((i) => !i.ok)
    .map((i) => i.numero);

interface ReceitaDecidida {
  fichaId: number;
  quantidadeAtual: number;
  convertida: number;
  escolhida: number;
  /** A receita já usada em produção ganhou esta versão, em vez de ser alterada. */
  novaFichaId: number | null;
}

/** Grava a conversão; quem chama abre a transação. */
function aplicar(
  ctx: Contexto,
  { material, fator, usos, previa }: Calculo,
  decisoes: Map<number, number>,
): ReceitaDecidida[] {
  const { db } = ctx;
  const convertidos = converterMovimentos(
    usos.movimentos.map((m) => m.quantidade),
    fator,
  );
  // Quantidades já convertidas, na fila de cada referência: a compra e o consumo usam exatamente a
  // do próprio movimento, para que cancelar depois devolva o que entrou ou saiu.
  const filas = new Map<string, number[]>();
  usos.movimentos.forEach((m, i) => {
    const { quantidade, saldo } = convertidos[i]!;
    repo.gravarMovimento(db, {
      id: m.id,
      quantidade,
      custoUnitario: converterCusto(m.custoUnitario, fator),
      saldoApos: saldo,
      custoMedioApos: converterCusto(m.custoMedioApos, fator),
    });
    if (m.tipo === 'compra' || m.tipo === 'consumo') {
      const chave = `${m.tipo}:${m.referenciaId}`;
      filas.set(chave, [...(filas.get(chave) ?? []), Math.abs(quantidade)]);
    }
  });
  const doMovimento = (chave: string, original: number): number =>
    filas.get(chave)?.shift() ?? converterQuantidade(original, fator);

  for (const c of usos.compras) {
    repo.gravarItemDeCompra(db, {
      id: c.id,
      quantidadeBase: doMovimento(`compra:${c.compraId}`, c.quantidadeBase),
      custoUnitarioFinal: converterCusto(c.custoUnitarioFinal, fator),
    });
  }
  for (const c of usos.consumos) {
    repo.gravarConsumo(db, {
      id: c.id,
      quantidade: doMovimento(`consumo:${c.producaoId}`, c.quantidade),
      custoUnitario: converterCusto(c.custoUnitario, fator),
    });
  }

  const decididas: ReceitaDecidida[] = [];
  for (const r of usos.receitas) {
    const convertida = semSumir(r.quantidade, converterQuantidade(r.quantidade, fator));
    const escolhida = decisoes.get(r.fichaId);
    if (escolhida === undefined) {
      repo.gravarItemDeReceita(db, r.id, convertida);
      continue;
    }
    // A escolha da usuária muda a receita de verdade: se ela já foi usada em produção, a versão usada
    // só muda de unidade e a quantidade escolhida vai para uma versão nova.
    let novaFichaId: number | null = null;
    if (fichas.fichaFoiUsada(db, r.fichaId)) {
      repo.gravarItemDeReceita(db, r.id, convertida);
      novaFichaId = novaVersao(ctx, r.fichaId, material.id, escolhida);
    } else {
      repo.gravarItemDeReceita(db, r.id, escolhida);
    }
    decididas.push({
      fichaId: r.fichaId,
      quantidadeAtual: r.quantidade,
      convertida,
      escolhida,
      novaFichaId,
    });
  }

  repo.gravarUnidade(db, material.id, {
    unidade: previa.depois.unidade,
    estoque: previa.depois.estoque,
    estoqueMinimo: previa.depois.estoqueMinimo,
    custoMedio: previa.depois.custoMedio,
  });
  return decididas;
}

/** Cópia da ficha como versão ativa, com outra quantidade deste material. */
function novaVersao(
  ctx: Contexto,
  fichaId: number,
  materialId: number,
  quantidade: number,
): number {
  const ficha = fichas.buscarFicha(ctx.db, fichaId)!;
  const versao = fichas.proximaVersao(ctx.db, ficha.produtoId);
  fichas.desativarFichas(ctx.db, ficha.produtoId);
  const novaId = fichas.inserirFicha(ctx.db, { ...ficha, versao });
  for (const i of ficha.itens) {
    fichas.inserirItemFicha(ctx.db, {
      fichaId: novaId,
      materialId: i.materialId,
      quantidade: i.materialId === materialId ? quantidade : i.quantidade,
      observacao: i.observacao,
    });
  }
  for (const e of ficha.extras) fichas.inserirExtraFicha(ctx.db, { ...e, fichaId: novaId });
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'criar',
    entidade: 'ficha',
    entidadeId: novaId,
    dados: { produtoId: ficha.produtoId, versao, motivo: 'troca_unidade' },
  });
  return novaId;
}
