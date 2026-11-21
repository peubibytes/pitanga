import type {
  DespesaCompartilhada,
  DespesaRateio,
  Producao,
  ProducaoConsumo,
} from '@pitanga/shared';
import type { Db } from '../db/connection';
import { Filtros, agora, comoBooleano, escalar, executar, todos, um } from '../db/util';

/* -------------------------------- produções -------------------------------- */

const SQL_PRODUCAO = `
  SELECT pr.id, pr.produto_id AS produtoId, p.nome AS produtoNome, pr.ficha_id AS fichaId, f.versao AS fichaVersao,
         pr.quantidade, pr.data, pr.custo_materiais AS custoMateriais, pr.custo_mao_obra AS custoMaoObra,
         pr.custo_extras AS custoExtras, pr.custo_rateios AS custoRateios, pr.custo_total AS custoTotal,
         pr.custo_unitario AS custoUnitario, pr.custo_estoque_total AS custoEstoqueTotal,
         pr.custo_estoque_unitario AS custoEstoqueUnitario, pr.remunerou_mao_obra AS remunerouMaoObra,
         pr.status, pr.autorizou_estoque_negativo AS autorizouEstoqueNegativo, pr.observacao,
         pr.criado_em AS criadoEm
    FROM producoes pr
    JOIN produtos p ON p.id = pr.produto_id
    JOIN fichas_tecnicas f ON f.id = pr.ficha_id`;

type LinhaProducao = Omit<Producao, 'remunerouMaoObra' | 'autorizouEstoqueNegativo'> & {
  remunerouMaoObra: number;
  autorizouEstoqueNegativo: number;
};
const paraProducao = (l: LinhaProducao): Producao => ({
  ...l,
  remunerouMaoObra: comoBooleano(l.remunerouMaoObra),
  autorizouEstoqueNegativo: comoBooleano(l.autorizouEstoqueNegativo),
});

export function inserirProducao(
  db: Db,
  p: {
    produtoId: number;
    fichaId: number;
    quantidade: number;
    data: string;
    autorizouEstoqueNegativo: boolean;
    observacao: string | null;
    usuarioId: number | null;
  },
): number {
  return executar(
    db,
    `INSERT INTO producoes (produto_id, ficha_id, quantidade, data, autorizou_estoque_negativo, observacao, usuario_id)
     VALUES (?,?,?,?,?,?,?)`,
    p.produtoId,
    p.fichaId,
    p.quantidade,
    p.data,
    p.autorizouEstoqueNegativo ? 1 : 0,
    p.observacao,
    p.usuarioId,
  ).id;
}

export function gravarCustosDaProducao(
  db: Db,
  id: number,
  c: {
    custoMateriais: number;
    custoMaoObra: number;
    custoExtras: number;
    custoRateios: number;
    custoTotal: number;
    custoUnitario: number;
    custoEstoqueTotal: number;
    custoEstoqueUnitario: number;
    remunerouMaoObra: boolean;
  },
): void {
  executar(
    db,
    `UPDATE producoes SET custo_materiais = ?, custo_mao_obra = ?, custo_extras = ?, custo_rateios = ?,
            custo_total = ?, custo_unitario = ?, custo_estoque_total = ?, custo_estoque_unitario = ?,
            remunerou_mao_obra = ?, atualizado_em = ? WHERE id = ?`,
    c.custoMateriais,
    c.custoMaoObra,
    c.custoExtras,
    c.custoRateios,
    c.custoTotal,
    c.custoUnitario,
    c.custoEstoqueTotal,
    c.custoEstoqueUnitario,
    c.remunerouMaoObra ? 1 : 0,
    agora(),
    id,
  );
}

export const definirStatusProducao = (
  db: Db,
  id: number,
  status: 'concluida' | 'cancelada',
): void => {
  executar(
    db,
    `UPDATE producoes SET status = ?, atualizado_em = ? WHERE id = ?`,
    status,
    agora(),
    id,
  );
};

export function inserirConsumo(
  db: Db,
  c: {
    producaoId: number;
    materialId: number;
    quantidade: number;
    custoUnitario: number;
    custoTotal: number;
  },
): void {
  executar(
    db,
    `INSERT INTO producoes_consumos (producao_id, material_id, quantidade, custo_unitario, custo_total) VALUES (?,?,?,?,?)`,
    c.producaoId,
    c.materialId,
    c.quantidade,
    c.custoUnitario,
    c.custoTotal,
  );
}

export const consumosDaProducao = (db: Db, producaoId: number): ProducaoConsumo[] =>
  todos<ProducaoConsumo>(
    db,
    `SELECT pc.id, pc.material_id AS materialId, m.nome AS materialNome, m.unidade, pc.quantidade,
            pc.custo_unitario AS custoUnitario, pc.custo_total AS custoTotal
       FROM producoes_consumos pc JOIN materiais m ON m.id = pc.material_id
      WHERE pc.producao_id = ? ORDER BY pc.id`,
    producaoId,
  );

export function buscarProducao(db: Db, id: number): Producao | undefined {
  const l = um<LinhaProducao>(db, `${SQL_PRODUCAO} WHERE pr.id = ?`, id);
  return l ? paraProducao(l) : undefined;
}

export function listarProducoes(
  db: Db,
  f: { de?: string; ate?: string; produtoId?: number; pagina: number; porPagina: number },
): { itens: Producao[]; total: number } {
  const filtros = new Filtros();
  if (f.de) filtros.adicionar('pr.data >= ?', f.de);
  if (f.ate) filtros.adicionar('pr.data <= ?', f.ate);
  if (f.produtoId) filtros.adicionar('pr.produto_id = ?', f.produtoId);
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM producoes pr ${filtros.where}`,
    ...filtros.params,
  );
  const itens = todos<LinhaProducao>(
    db,
    `${SQL_PRODUCAO} ${filtros.where} ORDER BY pr.data DESC, pr.id DESC LIMIT ? OFFSET ?`,
    ...filtros.params,
    f.porPagina,
    (f.pagina - 1) * f.porPagina,
  ).map(paraProducao);
  return { itens, total };
}

/** Soma o rateio de um lote já produzido (despesa compartilhada destinada à produção). */
export function acrescentarRateioNaProducao(db: Db, producaoId: number, valor: number): void {
  executar(
    db,
    `UPDATE producoes
        SET custo_rateios = custo_rateios + ?, custo_total = custo_total + ?,
            custo_unitario = CAST(ROUND((custo_total + ?) * 10000.0 / quantidade) AS INTEGER),
            atualizado_em = ?
      WHERE id = ?`,
    valor,
    valor,
    valor,
    agora(),
    producaoId,
  );
}

/* ------------------------------ despesas compartilhadas ------------------------------ */

type LinhaDespesa = DespesaCompartilhada;
const SQL_DESPESA = `
  SELECT id, descricao, data, valor_total AS valorTotal, tipo, criterio, lancamento_id AS lancamentoId, status
    FROM despesas_compartilhadas`;

export function inserirDespesa(
  db: Db,
  d: {
    descricao: string;
    data: string;
    valorTotal: number;
    tipo: string;
    criterio: string;
    usuarioId: number | null;
  },
): number {
  return executar(
    db,
    `INSERT INTO despesas_compartilhadas (descricao, data, valor_total, tipo, criterio, usuario_id) VALUES (?,?,?,?,?,?)`,
    d.descricao,
    d.data,
    d.valorTotal,
    d.tipo,
    d.criterio,
    d.usuarioId,
  ).id;
}

export const ligarLancamentoADespesa = (db: Db, id: number, lancamentoId: number): void => {
  executar(
    db,
    `UPDATE despesas_compartilhadas SET lancamento_id = ? WHERE id = ?`,
    lancamentoId,
    id,
  );
};

export const definirStatusDespesa = (
  db: Db,
  id: number,
  status: 'aberta' | 'rateada' | 'cancelada',
): void => {
  executar(
    db,
    `UPDATE despesas_compartilhadas SET status = ?, atualizado_em = ? WHERE id = ?`,
    status,
    agora(),
    id,
  );
};

export const buscarDespesa = (db: Db, id: number): DespesaCompartilhada | undefined =>
  um<LinhaDespesa>(db, `${SQL_DESPESA} WHERE id = ?`, id);

export const listarDespesas = (db: Db): DespesaCompartilhada[] =>
  todos<LinhaDespesa>(db, `${SQL_DESPESA} ORDER BY data DESC, id DESC`);

export function inserirRateio(
  db: Db,
  r: {
    despesaId: number;
    destinoTipo: 'produto' | 'producao';
    destinoId: number;
    valor: number;
    producaoId: number | null;
  },
): void {
  executar(
    db,
    `INSERT INTO despesas_rateios (despesa_id, destino_tipo, destino_id, valor, producao_id) VALUES (?,?,?,?,?)`,
    r.despesaId,
    r.destinoTipo,
    r.destinoId,
    r.valor,
    r.producaoId,
  );
}

export const rateiosDaDespesa = (db: Db, despesaId: number): DespesaRateio[] =>
  todos<DespesaRateio>(
    db,
    `SELECT r.id, r.destino_tipo AS destinoTipo, r.destino_id AS destinoId,
            CASE r.destino_tipo
              WHEN 'produto' THEN (SELECT nome FROM produtos WHERE id = r.destino_id)
              ELSE (SELECT 'Produção #' || pr.id || ' — ' || p.nome FROM producoes pr
                      JOIN produtos p ON p.id = pr.produto_id WHERE pr.id = r.destino_id)
            END AS destinoNome,
            r.valor, r.producao_id AS producaoId
       FROM despesas_rateios r WHERE r.despesa_id = ? ORDER BY r.id`,
    despesaId,
  );

export const somaDosRateios = (db: Db, despesaId: number): number =>
  escalar<number>(
    db,
    `SELECT COALESCE(SUM(valor), 0) FROM despesas_rateios WHERE despesa_id = ?`,
    despesaId,
  );

export const rateioJaApropriado = (db: Db, despesaId: number): boolean =>
  !!um(
    db,
    `SELECT 1 FROM despesas_rateios WHERE despesa_id = ? AND producao_id IS NOT NULL LIMIT 1`,
    despesaId,
  );
