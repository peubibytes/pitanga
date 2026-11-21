import { lancAjusteEstoque } from '@pitanga/core';
import type {
  AjusteEstoqueEntrada,
  MovimentoProduto,
  Produto,
  ProdutoEntrada,
} from '@pitanga/shared';
import { ajusteEstoqueSchema, hojeISO, produtoSchema } from '@pitanga/shared';
import type { Contexto } from '../db/util';
import { ErroDeValidacao, OperacaoNaoPermitida, RegistroNaoEncontrado } from '../erros';
import { buscarCategoria } from '../repositories/cadastros.repo';
import * as repo from '../repositories/produtos.repo';
import { inserirAuditoria } from '../repositories/sistema.repo';
import { permiteEstoqueNegativo } from './cadastros.service';
import { movimentarProduto } from './estoque.service';
import { registrarLancamento } from './financeiro.service';

export const listarProdutos = (ctx: Contexto, f: Parameters<typeof repo.listarProdutos>[1]) =>
  repo.listarProdutos(ctx.db, f);

export function obterProduto(ctx: Contexto, id: number): Produto {
  const p = repo.buscarProduto(ctx.db, id);
  if (!p) throw new RegistroNaoEncontrado('Produto');
  return p;
}

function validarCategoria(ctx: Contexto, categoriaId: number | null): void {
  if (categoriaId && buscarCategoria(ctx.db, categoriaId)?.tipo !== 'produto') {
    throw new ErroDeValidacao('Categoria de produto inválida.');
  }
}

export function criarProduto(ctx: Contexto, entrada: ProdutoEntrada): Produto {
  const dados = produtoSchema.parse(entrada);
  validarCategoria(ctx, dados.categoriaId);
  const id = repo.inserirProduto(ctx.db, dados);
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'criar',
    entidade: 'produto',
    entidadeId: id,
  });
  return obterProduto(ctx, id);
}

export function atualizarProduto(ctx: Contexto, id: number, entrada: ProdutoEntrada): Produto {
  obterProduto(ctx, id);
  const dados = produtoSchema.parse(entrada);
  validarCategoria(ctx, dados.categoriaId);
  repo.atualizarProduto(ctx.db, id, dados);
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'editar',
    entidade: 'produto',
    entidadeId: id,
  });
  return obterProduto(ctx, id);
}

export function definirFoto(
  ctx: Contexto,
  id: number,
  arquivo: string | null,
): { anterior: string | null } {
  const atual = obterProduto(ctx, id);
  repo.definirFoto(ctx.db, id, arquivo);
  return { anterior: atual.fotoArquivo };
}

export function listarMovimentos(
  ctx: Contexto,
  id: number,
  pagina: number,
  porPagina: number,
): { itens: MovimentoProduto[]; total: number } {
  obterProduto(ctx, id);
  return repo.listarMovimentosProduto(ctx.db, id, pagina, porPagina);
}

/** Ajuste manual do estoque de acabados, sempre com justificativa. */
export function ajustarEstoqueProduto(
  ctx: Contexto,
  id: number,
  entrada: AjusteEstoqueEntrada,
): Produto {
  const dados = ajusteEstoqueSchema.parse(entrada);
  const produto = obterProduto(ctx, id);
  const data = dados.data ?? hojeISO();
  const entra = dados.tipo === 'entrada';
  const permitirNegativo = dados.autorizarEstoqueNegativo && permiteEstoqueNegativo(ctx);
  if (!entra && dados.autorizarEstoqueNegativo && !permitirNegativo) {
    throw new OperacaoNaoPermitida(
      'O sistema está configurado para não permitir estoque negativo (Configurações).',
    );
  }
  ctx.db.transaction(() => {
    const r = movimentarProduto(ctx, {
      produtoId: id,
      tipo: 'ajuste',
      quantidade: entra ? dados.quantidade : -dados.quantidade,
      data,
      justificativa: dados.justificativa,
      permitirNegativo,
    });
    registrarLancamento(
      ctx,
      lancAjusteEstoque({
        descricao: `Ajuste de estoque — ${produto.nome} (${dados.justificativa})`,
        valor: Math.abs(r.custoTotal),
        data,
        perda: !entra,
        referenciaTipo: 'ajuste_produto',
        referenciaId: r.movimentoId,
      }),
    );
    inserirAuditoria(ctx.db, {
      usuarioId: ctx.usuarioId,
      acao: 'ajustar_estoque',
      entidade: 'produto',
      entidadeId: id,
      dados,
    });
  })();
  return obterProduto(ctx, id);
}
