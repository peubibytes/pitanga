/** Clientes, fornecedores, categorias, unidades e taxas. */
import type {
  Categoria,
  Cliente,
  ClienteResumo,
  Fornecedor,
  Taxa,
  TipoCategoria,
  Unidade,
} from '@pitanga/shared';
import type { Db } from '../db/connection';
import { Filtros, agora, comoBooleano, escalar, executar, todos, um } from '../db/util';

/* -------------------------------- clientes -------------------------------- */

const SQL_CLIENTE = `SELECT id, nome, telefone, observacao, ativo, criado_em AS criadoEm FROM clientes`;
const paraCliente = (l: Omit<Cliente, 'ativo'> & { ativo: number }): Cliente => ({
  ...l,
  ativo: comoBooleano(l.ativo),
});

export function listarClientes(
  db: Db,
  f: { busca?: string; ativo?: boolean; pagina: number; porPagina: number },
): { itens: Cliente[]; total: number } {
  const filtros = new Filtros().busca(f.busca, ['nome', 'telefone', 'observacao']);
  if (f.ativo !== undefined) filtros.adicionar('ativo = ?', f.ativo ? 1 : 0);
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM clientes ${filtros.where}`,
    ...filtros.params,
  );
  const itens = todos<Cliente & { ativo: number }>(
    db,
    `${SQL_CLIENTE} ${filtros.where} ORDER BY nome COLLATE NOCASE LIMIT ? OFFSET ?`,
    ...filtros.params,
    f.porPagina,
    (f.pagina - 1) * f.porPagina,
  ).map(paraCliente);
  return { itens, total };
}

export function buscarCliente(db: Db, id: number): Cliente | undefined {
  const l = um<Cliente & { ativo: number }>(db, `${SQL_CLIENTE} WHERE id = ?`, id);
  return l ? paraCliente(l) : undefined;
}

export function inserirCliente(
  db: Db,
  c: { nome: string; telefone: string | null; observacao: string | null; ativo: boolean },
): number {
  return executar(
    db,
    `INSERT INTO clientes (nome, telefone, observacao, ativo) VALUES (?,?,?,?)`,
    c.nome,
    c.telefone,
    c.observacao,
    c.ativo ? 1 : 0,
  ).id;
}

export function atualizarCliente(
  db: Db,
  id: number,
  c: { nome: string; telefone: string | null; observacao: string | null; ativo: boolean },
): number {
  return executar(
    db,
    `UPDATE clientes SET nome = ?, telefone = ?, observacao = ?, ativo = ?, atualizado_em = ? WHERE id = ?`,
    c.nome,
    c.telefone,
    c.observacao,
    c.ativo ? 1 : 0,
    agora(),
    id,
  ).alteradas;
}

export function resumoDoCliente(db: Db, id: number): ClienteResumo {
  const r = um<{ total: number; qtd: number; ultima: string | null }>(
    db,
    `SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS qtd, MAX(data) AS ultima
       FROM vendas WHERE cliente_id = ? AND status <> 'cancelada'`,
    id,
  )!;
  const pendente = escalar<number>(
    db,
    `SELECT COALESCE(SUM(v.total - COALESCE((SELECT SUM(valor) FROM vendas_recebimentos WHERE venda_id = v.id),0)),0)
       FROM vendas v WHERE v.cliente_id = ? AND v.status = 'pendente'`,
    id,
  );
  return {
    totalComprado: r.total,
    quantidadeCompras: r.qtd,
    ticketMedio: r.qtd ? Math.round(r.total / r.qtd) : 0,
    ultimaCompra: r.ultima,
    totalPendente: pendente,
  };
}

/* ------------------------------- fornecedores ------------------------------- */

const SQL_FORNECEDOR = `SELECT id, nome_loja AS nomeLoja, contato, observacao, ativo, criado_em AS criadoEm FROM fornecedores`;
const paraFornecedor = (l: Omit<Fornecedor, 'ativo'> & { ativo: number }): Fornecedor => ({
  ...l,
  ativo: comoBooleano(l.ativo),
});

export function listarFornecedores(
  db: Db,
  f: { busca?: string; ativo?: boolean; pagina: number; porPagina: number },
): { itens: Fornecedor[]; total: number } {
  const filtros = new Filtros().busca(f.busca, ['nome_loja', 'contato', 'observacao']);
  if (f.ativo !== undefined) filtros.adicionar('ativo = ?', f.ativo ? 1 : 0);
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM fornecedores ${filtros.where}`,
    ...filtros.params,
  );
  const itens = todos<Fornecedor & { ativo: number }>(
    db,
    `${SQL_FORNECEDOR} ${filtros.where} ORDER BY nome_loja COLLATE NOCASE LIMIT ? OFFSET ?`,
    ...filtros.params,
    f.porPagina,
    (f.pagina - 1) * f.porPagina,
  ).map(paraFornecedor);
  return { itens, total };
}

export function buscarFornecedor(db: Db, id: number): Fornecedor | undefined {
  const l = um<Fornecedor & { ativo: number }>(db, `${SQL_FORNECEDOR} WHERE id = ?`, id);
  return l ? paraFornecedor(l) : undefined;
}

export function inserirFornecedor(
  db: Db,
  f: { nomeLoja: string; contato: string | null; observacao: string | null; ativo: boolean },
): number {
  return executar(
    db,
    `INSERT INTO fornecedores (nome_loja, contato, observacao, ativo) VALUES (?,?,?,?)`,
    f.nomeLoja,
    f.contato,
    f.observacao,
    f.ativo ? 1 : 0,
  ).id;
}

export function atualizarFornecedor(
  db: Db,
  id: number,
  f: { nomeLoja: string; contato: string | null; observacao: string | null; ativo: boolean },
): number {
  return executar(
    db,
    `UPDATE fornecedores SET nome_loja = ?, contato = ?, observacao = ?, ativo = ?, atualizado_em = ? WHERE id = ?`,
    f.nomeLoja,
    f.contato,
    f.observacao,
    f.ativo ? 1 : 0,
    agora(),
    id,
  ).alteradas;
}

/* ------------------------------ categorias e unidades ------------------------------ */

export function listarCategorias(db: Db, tipo?: TipoCategoria): Categoria[] {
  const filtros = new Filtros();
  if (tipo) filtros.adicionar('tipo = ?', tipo);
  return todos<Omit<Categoria, 'ativo'> & { ativo: number }>(
    db,
    `SELECT id, nome, tipo, ativo FROM categorias ${filtros.where} ORDER BY nome COLLATE NOCASE`,
    ...filtros.params,
  ).map((c) => ({ ...c, ativo: comoBooleano(c.ativo) }));
}

export function inserirCategoria(db: Db, c: { nome: string; tipo: TipoCategoria }): number {
  return executar(db, `INSERT INTO categorias (nome, tipo) VALUES (?,?)`, c.nome, c.tipo).id;
}

export function categoriaExiste(db: Db, nome: string, tipo: TipoCategoria): boolean {
  return !!um(db, `SELECT 1 FROM categorias WHERE nome = ? AND tipo = ?`, nome, tipo);
}

export const buscarCategoria = (db: Db, id: number): Categoria | undefined => {
  const c = um<Omit<Categoria, 'ativo'> & { ativo: number }>(
    db,
    `SELECT id, nome, tipo, ativo FROM categorias WHERE id = ?`,
    id,
  );
  return c ? { ...c, ativo: comoBooleano(c.ativo) } : undefined;
};

export const listarUnidades = (db: Db): Unidade[] =>
  todos<Unidade>(db, `SELECT codigo, nome, base, fator FROM unidades ORDER BY codigo`);

/* ---------------------------------- taxas ---------------------------------- */

const SQL_TAXA = `SELECT id, nome, tipo, valor, aplica_em AS aplicaEm, padrao, ativo FROM taxas`;
const paraTaxa = (l: Omit<Taxa, 'padrao' | 'ativo'> & { padrao: number; ativo: number }): Taxa => ({
  ...l,
  padrao: comoBooleano(l.padrao),
  ativo: comoBooleano(l.ativo),
});

export const listarTaxas = (db: Db, somenteAtivas = false): Taxa[] =>
  todos<Taxa & { padrao: number; ativo: number }>(
    db,
    `${SQL_TAXA} ${somenteAtivas ? 'WHERE ativo = 1' : ''} ORDER BY nome COLLATE NOCASE`,
  ).map(paraTaxa);

export const buscarTaxa = (db: Db, id: number): Taxa | undefined => {
  const l = um<Taxa & { padrao: number; ativo: number }>(db, `${SQL_TAXA} WHERE id = ?`, id);
  return l ? paraTaxa(l) : undefined;
};

export const buscarTaxas = (db: Db, ids: number[]): Taxa[] =>
  ids.length
    ? todos<Taxa & { padrao: number; ativo: number }>(
        db,
        `${SQL_TAXA} WHERE id IN (${ids.map(() => '?').join(',')})`,
        ...ids,
      ).map(paraTaxa)
    : [];

export function inserirTaxa(db: Db, t: Omit<Taxa, 'id'>): number {
  return executar(
    db,
    `INSERT INTO taxas (nome, tipo, valor, aplica_em, padrao, ativo) VALUES (?,?,?,?,?,?)`,
    t.nome,
    t.tipo,
    t.valor,
    t.aplicaEm,
    t.padrao ? 1 : 0,
    t.ativo ? 1 : 0,
  ).id;
}

export function atualizarTaxa(db: Db, id: number, t: Omit<Taxa, 'id'>): number {
  return executar(
    db,
    `UPDATE taxas SET nome = ?, tipo = ?, valor = ?, aplica_em = ?, padrao = ?, ativo = ?, atualizado_em = ? WHERE id = ?`,
    t.nome,
    t.tipo,
    t.valor,
    t.aplicaEm,
    t.padrao ? 1 : 0,
    t.ativo ? 1 : 0,
    agora(),
    id,
  ).alteradas;
}
