/** Tudo o que guarda quantidade na unidade de um material (ADR 0008). */
import type { Db } from '../db/connection';
import { agora, comoBooleano, executar, todos } from '../db/util';

export interface LinhaMovimento {
  id: number;
  tipo: string;
  quantidade: number;
  custoUnitario: number;
  saldoApos: number;
  custoMedioApos: number;
  referenciaTipo: string | null;
  referenciaId: number | null;
}
export interface LinhaCompra {
  id: number;
  compraId: number;
  quantidadeBase: number;
  custoUnitarioFinal: number;
}
export interface LinhaConsumo {
  id: number;
  producaoId: number;
  quantidade: number;
  custoUnitario: number;
}
export interface LinhaReceita {
  id: number;
  fichaId: number;
  produtoId: number;
  produtoNome: string;
  ativa: boolean;
  quantidade: number;
}
export interface UsosDoMaterial {
  movimentos: LinhaMovimento[];
  compras: LinhaCompra[];
  consumos: LinhaConsumo[];
  receitas: LinhaReceita[];
}

/** Sempre na ordem de gravação: é ela que define os saldos e liga cada linha ao seu movimento. */
export function usosDoMaterial(db: Db, materialId: number): UsosDoMaterial {
  return {
    movimentos: todos<LinhaMovimento>(
      db,
      `SELECT id, tipo, quantidade, custo_unitario AS custoUnitario, saldo_apos AS saldoApos,
              custo_medio_apos AS custoMedioApos, referencia_tipo AS referenciaTipo,
              referencia_id AS referenciaId
         FROM materiais_movimentos WHERE material_id = ? ORDER BY id`,
      materialId,
    ),
    compras: todos<LinhaCompra>(
      db,
      `SELECT id, compra_id AS compraId, quantidade_base AS quantidadeBase,
              custo_unitario_final AS custoUnitarioFinal
         FROM compras_itens WHERE material_id = ? ORDER BY id`,
      materialId,
    ),
    consumos: todos<LinhaConsumo>(
      db,
      `SELECT id, producao_id AS producaoId, quantidade, custo_unitario AS custoUnitario
         FROM producoes_consumos WHERE material_id = ? ORDER BY id`,
      materialId,
    ),
    receitas: todos<Omit<LinhaReceita, 'ativa'> & { ativa: number }>(
      db,
      `SELECT fi.id, fi.ficha_id AS fichaId, f.produto_id AS produtoId, p.nome AS produtoNome,
              f.ativa, fi.quantidade
         FROM fichas_itens fi
         JOIN fichas_tecnicas f ON f.id = fi.ficha_id
         JOIN produtos p ON p.id = f.produto_id
        WHERE fi.material_id = ? ORDER BY p.nome COLLATE NOCASE, fi.id`,
      materialId,
    ).map((r) => ({ ...r, ativa: comoBooleano(r.ativa) })),
  };
}

export const gravarMovimento = (
  db: Db,
  m: Pick<LinhaMovimento, 'id' | 'quantidade' | 'custoUnitario' | 'saldoApos' | 'custoMedioApos'>,
): void => {
  executar(
    db,
    `UPDATE materiais_movimentos
        SET quantidade = ?, custo_unitario = ?, saldo_apos = ?, custo_medio_apos = ? WHERE id = ?`,
    m.quantidade,
    m.custoUnitario,
    m.saldoApos,
    m.custoMedioApos,
    m.id,
  );
};

/** O que foi digitado na compra (quantidade, unidade, fator e valores) é documento e não muda. */
export const gravarItemDeCompra = (
  db: Db,
  i: Pick<LinhaCompra, 'id' | 'quantidadeBase' | 'custoUnitarioFinal'>,
): void => {
  executar(
    db,
    `UPDATE compras_itens SET quantidade_base = ?, custo_unitario_final = ? WHERE id = ?`,
    i.quantidadeBase,
    i.custoUnitarioFinal,
    i.id,
  );
};

export const gravarConsumo = (
  db: Db,
  c: Pick<LinhaConsumo, 'id' | 'quantidade' | 'custoUnitario'>,
): void => {
  executar(
    db,
    `UPDATE producoes_consumos SET quantidade = ?, custo_unitario = ? WHERE id = ?`,
    c.quantidade,
    c.custoUnitario,
    c.id,
  );
};

export const gravarItemDeReceita = (db: Db, id: number, quantidade: number): void => {
  executar(db, `UPDATE fichas_itens SET quantidade = ? WHERE id = ?`, quantidade, id);
};

export const gravarUnidade = (
  db: Db,
  materialId: number,
  m: { unidade: string; estoque: number; estoqueMinimo: number | null; custoMedio: number },
): void => {
  executar(
    db,
    `UPDATE materiais SET unidade = ?, estoque_atual = ?, estoque_minimo = ?, custo_medio = ?,
            atualizado_em = ? WHERE id = ?`,
    m.unidade,
    m.estoque,
    m.estoqueMinimo,
    m.custoMedio,
    agora(),
    materialId,
  );
};
