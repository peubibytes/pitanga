import { lancAjusteEstoque } from '@pitanga/core';
import type {
  AjusteEstoqueEntrada,
  HistoricoCustoMaterial,
  Material,
  MaterialEntrada,
  MovimentoMaterial,
} from '@pitanga/shared';
import { ajusteEstoqueSchema, hojeISO, materialSchema } from '@pitanga/shared';
import type { Contexto } from '../db/util';
import { ErroDeValidacao, OperacaoNaoPermitida, RegistroNaoEncontrado } from '../erros';
import * as repo from '../repositories/materiais.repo';
import { buscarCategoria } from '../repositories/cadastros.repo';
import { inserirAuditoria } from '../repositories/sistema.repo';
import { permiteEstoqueNegativo } from './cadastros.service';
import { movimentarMaterial } from './estoque.service';
import { registrarLancamento } from './financeiro.service';

export function listarMateriais(ctx: Contexto, f: Parameters<typeof repo.listarMateriais>[1]) {
  return repo.listarMateriais(ctx.db, f);
}

export function obterMaterial(ctx: Contexto, id: number): Material {
  const m = repo.buscarMaterial(ctx.db, id);
  if (!m) throw new RegistroNaoEncontrado('Material');
  return m;
}

function validarCategoria(ctx: Contexto, categoriaId: number | null): void {
  if (categoriaId && buscarCategoria(ctx.db, categoriaId)?.tipo !== 'material') {
    throw new ErroDeValidacao('Categoria de material inválida.');
  }
}

export function criarMaterial(ctx: Contexto, entrada: MaterialEntrada): Material {
  const dados = materialSchema.parse(entrada);
  validarCategoria(ctx, dados.categoriaId);
  const id = repo.inserirMaterial(ctx.db, dados);
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'criar',
    entidade: 'material',
    entidadeId: id,
  });
  return obterMaterial(ctx, id);
}

export function atualizarMaterial(ctx: Contexto, id: number, entrada: MaterialEntrada): Material {
  const atual = obterMaterial(ctx, id);
  const dados = materialSchema.parse(entrada);
  validarCategoria(ctx, dados.categoriaId);
  // Receitas também guardam quantidade na unidade do material: trocar só a sigla mudaria a receita.
  if (dados.unidade !== atual.unidade && atual.unidadeTravada) {
    throw new OperacaoNaoPermitida(
      'Não é possível trocar a unidade de um material que já tem movimentos de estoque ou é usado em receitas.',
      'UNIDADE_TRAVADA',
    );
  }
  repo.atualizarMaterial(ctx.db, id, dados);
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'editar',
    entidade: 'material',
    entidadeId: id,
  });
  return obterMaterial(ctx, id);
}

export function listarMovimentos(
  ctx: Contexto,
  id: number,
  pagina: number,
  porPagina: number,
): { itens: MovimentoMaterial[]; total: number } {
  obterMaterial(ctx, id);
  return repo.listarMovimentosMaterial(ctx.db, id, pagina, porPagina);
}

export function historicoDeCustos(ctx: Contexto, id: number): HistoricoCustoMaterial[] {
  obterMaterial(ctx, id);
  return repo.historicoDeCustos(ctx.db, id);
}

/** Ajuste manual de estoque (seção 6): exige justificativa e vira despesa/receita de ajuste. */
export function ajustarEstoque(ctx: Contexto, id: number, entrada: AjusteEstoqueEntrada): Material {
  const dados = ajusteEstoqueSchema.parse(entrada);
  const material = obterMaterial(ctx, id);
  const data = dados.data ?? hojeISO();
  const entra = dados.tipo === 'entrada';
  if (entra && material.custoMedio === 0 && !dados.custoUnitario) {
    throw new ErroDeValidacao(
      'Este material ainda não tem custo médio. Informe o custo unitário para dar entrada.',
    );
  }
  const permitirNegativo = dados.autorizarEstoqueNegativo && permiteEstoqueNegativo(ctx);
  if (!entra && dados.autorizarEstoqueNegativo && !permitirNegativo) {
    throw new OperacaoNaoPermitida(
      'O sistema está configurado para não permitir estoque negativo (Configurações).',
    );
  }
  ctx.db.transaction(() => {
    const r = movimentarMaterial(ctx, {
      materialId: id,
      tipo: 'ajuste',
      quantidade: entra ? dados.quantidade : -dados.quantidade,
      custoUnitarioPadrao: dados.custoUnitario,
      data,
      justificativa: dados.justificativa,
      permitirNegativo,
    });
    registrarLancamento(
      ctx,
      lancAjusteEstoque({
        descricao: `Ajuste de estoque — ${material.nome} (${dados.justificativa})`,
        valor: Math.abs(r.custoTotal),
        data,
        perda: !entra,
        referenciaTipo: 'ajuste_material',
        referenciaId: r.movimentoId,
      }),
    );
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'ajustar_estoque',
      entidade: 'material',
      entidadeId: id,
      dados,
    });
  })();
  return obterMaterial(ctx, id);
}
