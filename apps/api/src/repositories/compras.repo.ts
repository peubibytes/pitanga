import type { Compra, CompraDespesa, CompraItem, StatusCompra } from '@pitanga/shared';
import type { Db } from '../db/connection';
import { Filtros, agora, escalar, executar, todos, um } from '../db/util';

const SQL_COMPRA = `
  SELECT c.id, c.fornecedor_id AS fornecedorId, f.nome_loja AS fornecedorNome, c.data,
         c.total_itens AS totalItens, c.total_despesas AS totalDespesas, c.total,
         c.forma_pagamento AS formaPagamento, c.status, c.observacao, c.criado_em AS criadoEm
    FROM compras c LEFT JOIN fornecedores f ON f.id = c.fornecedor_id`;

export function inserirCompra(
  db: Db,
  c: {
    fornecedorId: number | null;
    data: string;
    totalItens: number;
    totalDespesas: number;
    total: number;
    formaPagamento: string;
    observacao: string | null;
    usuarioId: number | null;
  },
): number {
  return executar(
    db,
    `INSERT INTO compras (fornecedor_id, data, total_itens, total_despesas, total, forma_pagamento, observacao, usuario_id)
     VALUES (?,?,?,?,?,?,?,?)`,
    c.fornecedorId,
    c.data,
    c.totalItens,
    c.totalDespesas,
    c.total,
    c.formaPagamento,
    c.observacao,
    c.usuarioId,
  ).id;
}

export function inserirItemCompra(
  db: Db,
  i: {
    compraId: number;
    materialId: number;
    quantidadeInformada: number;
    unidadeInformada: string;
    fatorConversao: number;
    quantidadeBase: number;
    valorUnitario: number;
    valorTotal: number;
    despesaRateada: number;
    custoUnitarioFinal: number;
  },
): number {
  return executar(
    db,
    `INSERT INTO compras_itens (compra_id, material_id, quantidade_informada, unidade_informada, fator_conversao,
                                quantidade_base, valor_unitario, valor_total, despesa_rateada, custo_unitario_final)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    i.compraId,
    i.materialId,
    i.quantidadeInformada,
    i.unidadeInformada,
    i.fatorConversao,
    i.quantidadeBase,
    i.valorUnitario,
    i.valorTotal,
    i.despesaRateada,
    i.custoUnitarioFinal,
  ).id;
}

export function inserirDespesaCompra(
  db: Db,
  d: { compraId: number; tipo: string; descricao: string | null; valor: number; rateio: string },
): number {
  return executar(
    db,
    `INSERT INTO compras_despesas (compra_id, tipo, descricao, valor, rateio) VALUES (?,?,?,?,?)`,
    d.compraId,
    d.tipo,
    d.descricao,
    d.valor,
    d.rateio,
  ).id;
}

export const buscarCompra = (db: Db, id: number): Compra | undefined =>
  um<Compra>(db, `${SQL_COMPRA} WHERE c.id = ?`, id);

export const itensDaCompra = (db: Db, compraId: number): CompraItem[] =>
  todos<CompraItem>(
    db,
    `SELECT ci.id, ci.material_id AS materialId, m.nome AS materialNome, m.unidade AS unidadeBase,
            ci.quantidade_informada AS quantidadeInformada, ci.unidade_informada AS unidadeInformada,
            ci.fator_conversao AS fatorConversao, ci.quantidade_base AS quantidadeBase,
            ci.valor_unitario AS valorUnitario, ci.valor_total AS valorTotal,
            ci.despesa_rateada AS despesaRateada, ci.custo_unitario_final AS custoUnitarioFinal
       FROM compras_itens ci JOIN materiais m ON m.id = ci.material_id
      WHERE ci.compra_id = ? ORDER BY ci.id`,
    compraId,
  );

export const despesasDaCompra = (db: Db, compraId: number): CompraDespesa[] =>
  todos<CompraDespesa>(
    db,
    `SELECT id, tipo, descricao, valor, rateio FROM compras_despesas WHERE compra_id = ? ORDER BY id`,
    compraId,
  );

export function listarCompras(
  db: Db,
  f: {
    de?: string;
    ate?: string;
    fornecedorId?: number;
    materialId?: number;
    status?: StatusCompra;
    pagina: number;
    porPagina: number;
  },
): { itens: Compra[]; total: number } {
  const filtros = new Filtros();
  if (f.de) filtros.adicionar('c.data >= ?', f.de);
  if (f.ate) filtros.adicionar('c.data <= ?', f.ate);
  if (f.fornecedorId) filtros.adicionar('c.fornecedor_id = ?', f.fornecedorId);
  if (f.status) filtros.adicionar('c.status = ?', f.status);
  if (f.materialId) {
    filtros.adicionar(
      'EXISTS (SELECT 1 FROM compras_itens ci WHERE ci.compra_id = c.id AND ci.material_id = ?)',
      f.materialId,
    );
  }
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM compras c ${filtros.where}`,
    ...filtros.params,
  );
  const itens = todos<Compra>(
    db,
    `${SQL_COMPRA} ${filtros.where} ORDER BY c.data DESC, c.id DESC LIMIT ? OFFSET ?`,
    ...filtros.params,
    f.porPagina,
    (f.pagina - 1) * f.porPagina,
  );
  return { itens, total };
}

export function definirStatusCompra(db: Db, id: number, status: StatusCompra): void {
  executar(
    db,
    `UPDATE compras SET status = ?, atualizado_em = ? WHERE id = ?`,
    status,
    agora(),
    id,
  );
}
