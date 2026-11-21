import {
  calcularCustoLote,
  calcularNecessidadesDoLote,
  lancMaoObra,
  verificarDisponibilidade,
} from '@pitanga/core';
import type { Producao, ProducaoEntrada, SimulacaoProducao } from '@pitanga/shared';
import {
  cancelamentoSchema,
  formatarQuantidade,
  hojeISO,
  producaoSchema,
  producaoSimulacaoSchema,
  valorEmCentavos,
} from '@pitanga/shared';
import type { Contexto } from '../db/util';
import {
  EstoqueInsuficiente,
  OperacaoNaoPermitida,
  RegistroNaoEncontrado,
  ErroDeValidacao,
} from '../erros';
import * as fichas from '../repositories/fichas.repo';
import { buscarMaterial } from '../repositories/materiais.repo';
import * as repo from '../repositories/producao.repo';
import { buscarProduto } from '../repositories/produtos.repo';
import { inserirAuditoria, lerConfiguracoes } from '../repositories/sistema.repo';
import { movimentarMaterial, movimentarProduto } from './estoque.service';
import { estornarReferencia, registrarLancamento } from './financeiro.service';

export const listarProducoes = (ctx: Contexto, f: Parameters<typeof repo.listarProducoes>[1]) =>
  repo.listarProducoes(ctx.db, f);

export function obterProducao(ctx: Contexto, id: number): Producao {
  const p = repo.buscarProducao(ctx.db, id);
  if (!p) throw new RegistroNaoEncontrado('Produção');
  return { ...p, consumos: repo.consumosDaProducao(ctx.db, id) };
}

function carregarBase(ctx: Contexto, produtoId: number, quantidade: number) {
  const produto = buscarProduto(ctx.db, produtoId);
  if (!produto) throw new RegistroNaoEncontrado('Produto');
  const ficha = fichas.fichaAtivaDoProduto(ctx.db, produtoId);
  if (!ficha) {
    throw new OperacaoNaoPermitida(
      `Cadastre a ficha técnica de ${produto.nome} antes de registrar uma produção.`,
      'SEM_FICHA',
    );
  }
  if (ficha.itens.length === 0) {
    throw new OperacaoNaoPermitida('A ficha técnica não tem nenhum material.', 'FICHA_VAZIA');
  }
  const necessidades = calcularNecessidadesDoLote(ficha.itens, quantidade, ficha.rendimento);
  return { produto, ficha, necessidades };
}

/** Simulação: lista as necessidades e a disponibilidade sem gravar nada (seção 14, etapa 5). */
export function simularProducao(ctx: Contexto, entrada: unknown): SimulacaoProducao {
  const { produtoId, quantidade } = producaoSimulacaoSchema.parse(entrada);
  const { produto, ficha, necessidades } = carregarBase(ctx, produtoId, quantidade);
  const config = lerConfiguracoes(ctx.db);

  const itens = ficha.itens.map((i, idx) => {
    const necessario = necessidades[idx] ?? 0;
    return {
      materialId: i.materialId,
      nome: i.materialNome,
      unidade: i.unidade,
      necessario,
      disponivel: i.estoqueAtual,
      falta: Math.max(0, necessario - i.estoqueAtual),
      custoMedio: i.custoMedio,
      custoEstimado: valorEmCentavos(necessario, i.custoMedio),
    };
  });
  const rateios = fichas.rateiosPendentesDoProduto(ctx.db, produtoId);
  const remunera = config.remunera_mao_obra_propria === '1';
  const lote = calcularCustoLote({
    ficha,
    quantidade,
    custosConsumidos: itens.map((i) => i.custoEstimado),
    rateiosCentavos: rateios,
    remunerouMaoObra: remunera && ficha.maoObraModo !== 'nenhuma',
  });
  return {
    produtoId,
    produtoNome: produto.nome,
    fichaId: ficha.id,
    fichaVersao: ficha.versao,
    rendimento: ficha.rendimento,
    quantidade,
    itens,
    possivel: itens.every((i) => i.falta === 0),
    custoMateriais: lote.custoMateriais,
    custoMaoObra: lote.custoMaoObra,
    custoExtras: lote.custoExtras,
    custoRateios: lote.custoRateios,
    custoTotal: lote.custoTotal,
    custoUnitario: lote.custoUnitario,
    custoEstoqueTotal: lote.custoEstoqueTotal,
    remuneraMaoObra: remunera,
    permiteEstoqueNegativo: config.permite_estoque_negativo === '1',
  };
}

/**
 * Registra um lote (seção 6.3), numa única transação:
 *  1. confere a disponibilidade (ou exige autorização explícita para estoque negativo);
 *  2. baixa os materiais ao custo médio do momento e fotografa o custo do lote;
 *  3. dá entrada nos acabados ao custo de estoque e recalcula o custo médio do produto;
 *  4. só gera lançamento financeiro se houve pagamento de mão de obra.
 */
export function registrarProducao(ctx: Contexto, entrada: ProducaoEntrada): Producao {
  const dados = producaoSchema.parse(entrada);
  const { produto, ficha, necessidades } = carregarBase(ctx, dados.produtoId, dados.quantidade);
  const config = lerConfiguracoes(ctx.db);

  const faltas = verificarDisponibilidade(
    ficha.itens.map((i, idx) => ({
      materialId: i.materialId,
      nome: i.materialNome,
      unidade: i.unidade,
      necessario: necessidades[idx] ?? 0,
      disponivel: i.estoqueAtual,
    })),
  );
  let permitirNegativo = false;
  if (faltas.length > 0) {
    const detalhe = faltas
      .map((f) => `${formatarQuantidade(f.falta, f.unidade)} de ${f.nome}`)
      .join('; ');
    if (!dados.autorizarEstoqueNegativo) {
      throw new EstoqueInsuficiente(
        `Faltam ${detalhe}.`,
        faltas.map((f) => ({ ...f, id: f.materialId })),
      );
    }
    if (config.permite_estoque_negativo !== '1') {
      throw new OperacaoNaoPermitida(
        `Faltam ${detalhe}. O sistema está configurado para não permitir estoque negativo (Configurações).`,
        'ESTOQUE_NEGATIVO_BLOQUEADO',
      );
    }
    if (!dados.justificativaEstoqueNegativo || dados.justificativaEstoqueNegativo.length < 3) {
      throw new ErroDeValidacao('Explique o motivo de produzir com estoque negativo.');
    }
    permitirNegativo = true;
  }

  const remunera = config.remunera_mao_obra_propria === '1' && ficha.maoObraModo !== 'nenhuma';

  const id = ctx.db.transaction(() => {
    const producaoId = repo.inserirProducao(ctx.db, {
      produtoId: produto.id,
      fichaId: ficha.id,
      quantidade: dados.quantidade,
      data: dados.data,
      autorizouEstoqueNegativo: permitirNegativo,
      observacao: dados.observacao,
      usuarioId: ctx.usuarioId,
    });

    const custosConsumidos: number[] = [];
    ficha.itens.forEach((item, idx) => {
      const necessario = necessidades[idx] ?? 0;
      if (necessario <= 0) return;
      const r = movimentarMaterial(ctx, {
        materialId: item.materialId,
        tipo: 'consumo',
        quantidade: -necessario,
        data: dados.data,
        referenciaTipo: 'producao',
        referenciaId: producaoId,
        justificativa: permitirNegativo ? dados.justificativaEstoqueNegativo : null,
        permitirNegativo,
      });
      const custoTotal = Math.abs(r.custoTotal);
      custosConsumidos.push(custoTotal);
      repo.inserirConsumo(ctx.db, {
        producaoId,
        materialId: item.materialId,
        quantidade: necessario,
        custoUnitario: r.custoUnitario,
        custoTotal,
      });
    });

    const rateios = fichas.rateiosPendentesDoProduto(ctx.db, produto.id);
    fichas.apropriarRateiosPendentes(ctx.db, produto.id, producaoId);

    const lote = calcularCustoLote({
      ficha,
      quantidade: dados.quantidade,
      custosConsumidos,
      rateiosCentavos: rateios,
      remunerouMaoObra: remunera,
    });
    repo.gravarCustosDaProducao(ctx.db, producaoId, { ...lote, remunerouMaoObra: remunera });

    movimentarProduto(ctx, {
      produtoId: produto.id,
      tipo: 'producao',
      quantidade: dados.quantidade,
      valorCentavos: lote.custoEstoqueTotal,
      maoObraCentavos: lote.maoObraNaoRemunerada,
      data: dados.data,
      referenciaTipo: 'producao',
      referenciaId: producaoId,
    });

    if (remunera) {
      registrarLancamento(
        ctx,
        lancMaoObra({
          descricao: `Mão de obra — produção #${producaoId} de ${produto.nome}`,
          valor: lote.custoMaoObra,
          data: dados.data,
          referenciaTipo: 'producao',
          referenciaId: producaoId,
        }),
      );
    }
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'criar',
      entidade: 'producao',
      entidadeId: producaoId,
      dados: { produtoId: produto.id, quantidade: dados.quantidade, permitirNegativo },
    });
    return producaoId;
  })();
  return obterProducao(ctx, id);
}

/** Cancelamento: devolve os materiais, retira os acabados e estorna a mão de obra paga. */
export function cancelarProducao(ctx: Contexto, id: number, entrada: unknown): Producao {
  const { motivo } = cancelamentoSchema.parse(entrada ?? {});
  const producao = obterProducao(ctx, id);
  if (producao.status === 'cancelada')
    throw new OperacaoNaoPermitida('Esta produção já foi cancelada.');
  const produto = buscarProduto(ctx.db, producao.produtoId);
  if (!produto || produto.estoqueAtual < producao.quantidade) {
    throw new OperacaoNaoPermitida(
      'Parte das peças deste lote já foi vendida; não dá para cancelar a produção inteira. ' +
        'Cancele as vendas ou use um ajuste de estoque com justificativa.',
      'PRODUCAO_JA_VENDIDA',
    );
  }
  const hoje = hojeISO();
  ctx.db.transaction(() => {
    movimentarProduto(ctx, {
      produtoId: producao.produtoId,
      tipo: 'estorno',
      quantidade: -producao.quantidade,
      valorCentavos: producao.custoEstoqueTotal,
      maoObraCentavos: producao.remunerouMaoObra ? 0 : producao.custoMaoObra,
      data: hoje,
      referenciaTipo: 'producao',
      referenciaId: id,
      justificativa: motivo,
    });
    for (const c of producao.consumos ?? []) {
      if (!buscarMaterial(ctx.db, c.materialId)) continue;
      movimentarMaterial(ctx, {
        materialId: c.materialId,
        tipo: 'estorno',
        quantidade: c.quantidade,
        valorCentavos: c.custoTotal,
        data: hoje,
        referenciaTipo: 'producao',
        referenciaId: id,
        justificativa: motivo,
      });
    }
    estornarReferencia(ctx, 'producao', id, hoje, motivo);
    fichas.liberarRateiosDaProducao(ctx.db, id);
    repo.definirStatusProducao(ctx.db, id, 'cancelada');
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'cancelar',
      entidade: 'producao',
      entidadeId: id,
      dados: { motivo },
    });
  })();
  return obterProducao(ctx, id);
}
