import type { Recebimento, StatusVenda, Venda, VendaItem } from '@pitanga/shared';
import type { Db } from '../db/connection';
import { Filtros, agora, escalar, executar, todos, um } from '../db/util';

const SQL_VENDA = `
  SELECT v.id, v.cliente_id AS clienteId, c.nome AS clienteNome, v.data, v.subtotal, v.desconto, v.total,
         v.forma_pagamento AS formaPagamento, v.status, v.cmv, v.lucro_estimado AS lucroEstimado,
         v.observacao, v.criado_em AS criadoEm,
         COALESCE((SELECT SUM(valor) FROM vendas_recebimentos r WHERE r.venda_id = v.id), 0) AS recebido
    FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id`;

export function inserirVenda(
  db: Db,
  v: {
    clienteId: number | null;
    data: string;
    subtotal: number;
    desconto: number;
    total: number;
    formaPagamento: string;
    status: StatusVenda;
    cmv: number;
    lucroEstimado: number;
    observacao: string | null;
    usuarioId: number | null;
  },
): number {
  return executar(
    db,
    `INSERT INTO vendas (cliente_id, data, subtotal, desconto, total, forma_pagamento, status, cmv,
                         lucro_estimado, observacao, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    v.clienteId,
    v.data,
    v.subtotal,
    v.desconto,
    v.total,
    v.formaPagamento,
    v.status,
    v.cmv,
    v.lucroEstimado,
    v.observacao,
    v.usuarioId,
  ).id;
}

export function inserirItemVenda(
  db: Db,
  i: {
    vendaId: number;
    produtoId: number;
    quantidade: number;
    precoUnitario: number;
    descontoItem: number;
    total: number;
    custoUnitario: number;
    custoTotal: number;
    maoObraUnitaria: number;
  },
): number {
  return executar(
    db,
    `INSERT INTO vendas_itens (venda_id, produto_id, quantidade, preco_unitario, desconto_item, total,
                               custo_unitario, custo_total, mao_obra_unitaria)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    i.vendaId,
    i.produtoId,
    i.quantidade,
    i.precoUnitario,
    i.descontoItem,
    i.total,
    i.custoUnitario,
    i.custoTotal,
    i.maoObraUnitaria,
  ).id;
}

export function atualizarTotaisVenda(db: Db, id: number, cmv: number, lucroEstimado: number): void {
  executar(
    db,
    `UPDATE vendas SET cmv = ?, lucro_estimado = ?, atualizado_em = ? WHERE id = ?`,
    cmv,
    lucroEstimado,
    agora(),
    id,
  );
}

export function definirStatusVenda(db: Db, id: number, status: StatusVenda): void {
  executar(db, `UPDATE vendas SET status = ?, atualizado_em = ? WHERE id = ?`, status, agora(), id);
}

export function buscarVenda(db: Db, id: number): Venda | undefined {
  return um<Venda>(db, `${SQL_VENDA} WHERE v.id = ?`, id);
}

export function itensDaVenda(db: Db, vendaId: number): VendaItem[] {
  return todos<VendaItem>(
    db,
    `SELECT vi.id, vi.produto_id AS produtoId, p.nome AS produtoNome, vi.quantidade,
            vi.preco_unitario AS precoUnitario, vi.desconto_item AS descontoItem, vi.total,
            vi.custo_unitario AS custoUnitario, vi.custo_total AS custoTotal
       FROM vendas_itens vi JOIN produtos p ON p.id = vi.produto_id
      WHERE vi.venda_id = ? ORDER BY vi.id`,
    vendaId,
  );
}

/** Itens com a mão de obra congelada, usados no cancelamento para devolver o estoque. */
export function itensParaEstorno(
  db: Db,
  vendaId: number,
): { produtoId: number; quantidade: number; custoTotal: number; maoObraUnitaria: number }[] {
  return todos(
    db,
    `SELECT produto_id AS produtoId, quantidade, custo_total AS custoTotal, mao_obra_unitaria AS maoObraUnitaria
       FROM vendas_itens WHERE venda_id = ? ORDER BY id`,
    vendaId,
  );
}

export function listarVendas(
  db: Db,
  f: {
    de?: string;
    ate?: string;
    clienteId?: number;
    status?: StatusVenda;
    busca?: string;
    pagina: number;
    porPagina: number;
  },
): { itens: Venda[]; total: number } {
  const filtros = new Filtros().busca(f.busca, ['c.nome', 'v.observacao']);
  if (f.de) filtros.adicionar('v.data >= ?', f.de);
  if (f.ate) filtros.adicionar('v.data <= ?', f.ate);
  if (f.clienteId) filtros.adicionar('v.cliente_id = ?', f.clienteId);
  if (f.status) filtros.adicionar('v.status = ?', f.status);
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id ${filtros.where}`,
    ...filtros.params,
  );
  const itens = todos<Venda>(
    db,
    `${SQL_VENDA} ${filtros.where} ORDER BY v.data DESC, v.id DESC LIMIT ? OFFSET ?`,
    ...filtros.params,
    f.porPagina,
    (f.pagina - 1) * f.porPagina,
  );
  return { itens, total };
}

export function inserirRecebimento(
  db: Db,
  r: {
    vendaId: number;
    data: string;
    valor: number;
    formaPagamento: string;
    usuarioId: number | null;
  },
): number {
  return executar(
    db,
    `INSERT INTO vendas_recebimentos (venda_id, data, valor, forma_pagamento, usuario_id) VALUES (?,?,?,?,?)`,
    r.vendaId,
    r.data,
    r.valor,
    r.formaPagamento,
    r.usuarioId,
  ).id;
}

export function ligarLancamentoAoRecebimento(
  db: Db,
  recebimentoId: number,
  lancamentoId: number,
): void {
  executar(
    db,
    `UPDATE vendas_recebimentos SET lancamento_id = ? WHERE id = ?`,
    lancamentoId,
    recebimentoId,
  );
}

export const recebimentosDaVenda = (db: Db, vendaId: number): Recebimento[] =>
  todos<Recebimento>(
    db,
    `SELECT id, venda_id AS vendaId, data, valor, forma_pagamento AS formaPagamento
       FROM vendas_recebimentos WHERE venda_id = ? ORDER BY data, id`,
    vendaId,
  );

export const totalRecebido = (db: Db, vendaId: number): number =>
  escalar<number>(
    db,
    `SELECT COALESCE(SUM(valor), 0) FROM vendas_recebimentos WHERE venda_id = ?`,
    vendaId,
  );

/** Contas a receber: vendas não canceladas até `ate`, descontando recebimentos até `ate`. */
export function contasAReceber(db: Db, ate: string | null): number {
  const limite = ate ?? '9999-12-31';
  return escalar<number>(
    db,
    `SELECT COALESCE(SUM(pend), 0) FROM (
       SELECT v.total - COALESCE((SELECT SUM(r.valor) FROM vendas_recebimentos r
                                   WHERE r.venda_id = v.id AND r.data <= ?), 0) AS pend
         FROM vendas v WHERE v.status <> 'cancelada' AND v.data <= ?
     ) WHERE pend > 0`,
    limite,
    limite,
  );
}

/** Mão de obra própria (não paga em dinheiro) das peças vendidas no período, em centavos. */
export function maoObraNaoRemuneradaVendida(db: Db, de: string | null, ate: string | null): number {
  const filtros = new Filtros().adicionar(`v.status <> 'cancelada'`);
  if (de) filtros.adicionar('v.data >= ?', de);
  if (ate) filtros.adicionar('v.data <= ?', ate);
  return escalar<number>(
    db,
    `SELECT COALESCE(CAST(ROUND(SUM(vi.quantidade * vi.mao_obra_unitaria) / 10000.0) AS INTEGER), 0)
       FROM vendas_itens vi JOIN vendas v ON v.id = vi.venda_id ${filtros.where}`,
    ...filtros.params,
  );
}

export function produtosMaisVendidos(
  db: Db,
  de: string,
  ate: string,
  limite = 5,
): { produtoId: number; nome: string; quantidade: number; total: number }[] {
  return todos(
    db,
    `SELECT p.id AS produtoId, p.nome, SUM(vi.quantidade) AS quantidade, SUM(vi.total) AS total
       FROM vendas_itens vi
       JOIN vendas v ON v.id = vi.venda_id
       JOIN produtos p ON p.id = vi.produto_id
      WHERE v.status <> 'cancelada' AND v.data BETWEEN ? AND ?
      GROUP BY p.id ORDER BY quantidade DESC, total DESC LIMIT ?`,
    de,
    ate,
    limite,
  );
}

export const contarVendas = (db: Db, de: string, ate: string): number =>
  escalar<number>(
    db,
    `SELECT COUNT(*) FROM vendas WHERE status <> 'cancelada' AND data BETWEEN ? AND ?`,
    de,
    ate,
  );

export const contarVendasPendentes = (db: Db): number =>
  escalar<number>(db, `SELECT COUNT(*) FROM vendas WHERE status = 'pendente'`);
