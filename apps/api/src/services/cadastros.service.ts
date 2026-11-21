import type {
  Categoria,
  CategoriaEntrada,
  Cliente,
  ClienteEntrada,
  ClienteResumo,
  Configuracoes,
  Fornecedor,
  FornecedorEntrada,
  Taxa,
  TaxaEntrada,
  TipoCategoria,
  Unidade,
} from '@pitanga/shared';
import {
  categoriaSchema,
  clienteSchema,
  configuracoesSchema,
  fornecedorSchema,
  taxaSchema,
} from '@pitanga/shared';
import type { Contexto } from '../db/util';
import { ErroDeValidacao, RegistroNaoEncontrado } from '../erros';
import * as repo from '../repositories/cadastros.repo';
import {
  gravarConfiguracao,
  inserirAuditoria,
  lerConfiguracoes,
} from '../repositories/sistema.repo';

export interface Lista<T> {
  itens: T[];
  total: number;
}
export interface FiltroLista {
  busca?: string;
  ativo?: boolean;
  pagina: number;
  porPagina: number;
}

/* -------------------------------- clientes -------------------------------- */

export const listarClientes = (ctx: Contexto, f: FiltroLista): Lista<Cliente> =>
  repo.listarClientes(ctx.db, f);

export function obterCliente(ctx: Contexto, id: number): Cliente {
  const c = repo.buscarCliente(ctx.db, id);
  if (!c) throw new RegistroNaoEncontrado('Cliente');
  return c;
}

export function criarCliente(ctx: Contexto, entrada: ClienteEntrada): Cliente {
  const dados = clienteSchema.parse(entrada);
  const id = repo.inserirCliente(ctx.db, dados);
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'criar',
    entidade: 'cliente',
    entidadeId: id,
  });
  return obterCliente(ctx, id);
}

export function atualizarCliente(ctx: Contexto, id: number, entrada: ClienteEntrada): Cliente {
  obterCliente(ctx, id);
  repo.atualizarCliente(ctx.db, id, clienteSchema.parse(entrada));
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'editar',
    entidade: 'cliente',
    entidadeId: id,
  });
  return obterCliente(ctx, id);
}

export function resumoDoCliente(ctx: Contexto, id: number): ClienteResumo {
  obterCliente(ctx, id);
  return repo.resumoDoCliente(ctx.db, id);
}

/* ------------------------------- fornecedores ------------------------------- */

export const listarFornecedores = (ctx: Contexto, f: FiltroLista): Lista<Fornecedor> =>
  repo.listarFornecedores(ctx.db, f);

export function obterFornecedor(ctx: Contexto, id: number): Fornecedor {
  const f = repo.buscarFornecedor(ctx.db, id);
  if (!f) throw new RegistroNaoEncontrado('Fornecedor');
  return f;
}

export function criarFornecedor(ctx: Contexto, entrada: FornecedorEntrada): Fornecedor {
  const id = repo.inserirFornecedor(ctx.db, fornecedorSchema.parse(entrada));
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'criar',
    entidade: 'fornecedor',
    entidadeId: id,
  });
  return obterFornecedor(ctx, id);
}

export function atualizarFornecedor(
  ctx: Contexto,
  id: number,
  entrada: FornecedorEntrada,
): Fornecedor {
  obterFornecedor(ctx, id);
  repo.atualizarFornecedor(ctx.db, id, fornecedorSchema.parse(entrada));
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'editar',
    entidade: 'fornecedor',
    entidadeId: id,
  });
  return obterFornecedor(ctx, id);
}

/* ------------------------------ categorias e unidades ------------------------------ */

export const listarCategorias = (ctx: Contexto, tipo?: TipoCategoria): Categoria[] =>
  repo.listarCategorias(ctx.db, tipo);

export function criarCategoria(ctx: Contexto, entrada: CategoriaEntrada): Categoria {
  const dados = categoriaSchema.parse(entrada);
  if (repo.categoriaExiste(ctx.db, dados.nome, dados.tipo)) {
    throw new ErroDeValidacao(`Já existe a categoria "${dados.nome}".`);
  }
  const id = repo.inserirCategoria(ctx.db, dados);
  return repo.buscarCategoria(ctx.db, id)!;
}

export const listarUnidades = (ctx: Contexto): Unidade[] => repo.listarUnidades(ctx.db);

/* ---------------------------------- taxas ---------------------------------- */

export const listarTaxas = (ctx: Contexto): Taxa[] => repo.listarTaxas(ctx.db);

export function criarTaxa(ctx: Contexto, entrada: TaxaEntrada): Taxa {
  const dados = taxaSchema.parse(entrada);
  if (dados.tipo === 'percentual' && dados.valor >= 10_000) {
    throw new ErroDeValidacao('A taxa percentual precisa ser menor que 100%.');
  }
  const id = repo.inserirTaxa(ctx.db, dados);
  return repo.buscarTaxa(ctx.db, id)!;
}

export function atualizarTaxa(ctx: Contexto, id: number, entrada: TaxaEntrada): Taxa {
  if (!repo.buscarTaxa(ctx.db, id)) throw new RegistroNaoEncontrado('Taxa');
  const dados = taxaSchema.parse(entrada);
  if (dados.tipo === 'percentual' && dados.valor >= 10_000) {
    throw new ErroDeValidacao('A taxa percentual precisa ser menor que 100%.');
  }
  repo.atualizarTaxa(ctx.db, id, dados);
  return repo.buscarTaxa(ctx.db, id)!;
}

/* ------------------------------- configurações ------------------------------- */

export const obterConfiguracoes = (ctx: Contexto): Configuracoes => lerConfiguracoes(ctx.db);

export function atualizarConfiguracoes(ctx: Contexto, entrada: unknown): Configuracoes {
  const dados = configuracoesSchema.parse(entrada);
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor !== undefined) gravarConfiguracao(ctx.db, chave, valor);
  }
  inserirAuditoria(ctx.db, {
    usuarioId: ctx.usuarioId,
    acao: 'editar',
    entidade: 'configuracoes',
    entidadeId: null,
    dados,
  });
  return lerConfiguracoes(ctx.db);
}

/** Estoque negativo só pode ser autorizado quando a configuração permite. */
export function permiteEstoqueNegativo(ctx: Contexto): boolean {
  return lerConfiguracoes(ctx.db).permite_estoque_negativo === '1';
}
