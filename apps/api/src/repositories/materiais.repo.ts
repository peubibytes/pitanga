import type {
  HistoricoCustoMaterial,
  Material,
  MovimentoMaterial,
  TipoMovimentoMaterial,
} from '@pitanga/shared';
import type { Db } from '../db/connection';
import { Filtros, agora, comoBooleano, escalar, executar, todos, um } from '../db/util';

const SQL_MATERIAL = `
  SELECT m.id, m.nome, m.categoria_id AS categoriaId, c.nome AS categoriaNome, m.unidade,
         m.estoque_atual AS estoqueAtual, m.estoque_minimo AS estoqueMinimo,
         m.custo_medio AS custoMedio, m.ativo,
         (m.estoque_minimo IS NOT NULL AND m.estoque_atual <= m.estoque_minimo) AS estoqueBaixo,
         (EXISTS (SELECT 1 FROM materiais_movimentos mm WHERE mm.material_id = m.id)
          OR EXISTS (SELECT 1 FROM fichas_itens fi WHERE fi.material_id = m.id)) AS unidadeTravada
    FROM materiais m LEFT JOIN categorias c ON c.id = m.categoria_id`;

type LinhaMaterial = Omit<Material, 'ativo' | 'estoqueBaixo' | 'unidadeTravada'> & {
  ativo: number;
  estoqueBaixo: number;
  unidadeTravada: number;
};
const paraMaterial = (l: LinhaMaterial): Material => ({
  ...l,
  ativo: comoBooleano(l.ativo),
  estoqueBaixo: comoBooleano(l.estoqueBaixo),
  unidadeTravada: comoBooleano(l.unidadeTravada),
});

export function listarMateriais(
  db: Db,
  f: {
    busca?: string;
    categoriaId?: number;
    estoqueBaixo?: boolean;
    ativo?: boolean;
    pagina: number;
    porPagina: number;
  },
): { itens: Material[]; total: number } {
  const filtros = new Filtros().busca(f.busca, ['m.nome', 'c.nome']);
  if (f.categoriaId) filtros.adicionar('m.categoria_id = ?', f.categoriaId);
  if (f.estoqueBaixo)
    filtros.adicionar('(m.estoque_minimo IS NOT NULL AND m.estoque_atual <= m.estoque_minimo)');
  if (f.ativo !== undefined) filtros.adicionar('m.ativo = ?', f.ativo ? 1 : 0);
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM materiais m LEFT JOIN categorias c ON c.id = m.categoria_id ${filtros.where}`,
    ...filtros.params,
  );
  const itens = todos<LinhaMaterial>(
    db,
    `${SQL_MATERIAL} ${filtros.where} ORDER BY m.nome COLLATE NOCASE LIMIT ? OFFSET ?`,
    ...filtros.params,
    f.porPagina,
    (f.pagina - 1) * f.porPagina,
  ).map(paraMaterial);
  return { itens, total };
}

export function buscarMaterial(db: Db, id: number): Material | undefined {
  const l = um<LinhaMaterial>(db, `${SQL_MATERIAL} WHERE m.id = ?`, id);
  return l ? paraMaterial(l) : undefined;
}

export function inserirMaterial(
  db: Db,
  m: {
    nome: string;
    categoriaId: number | null;
    unidade: string;
    estoqueMinimo: number | null;
    ativo: boolean;
  },
): number {
  return executar(
    db,
    `INSERT INTO materiais (nome, categoria_id, unidade, estoque_minimo, ativo) VALUES (?,?,?,?,?)`,
    m.nome,
    m.categoriaId,
    m.unidade,
    m.estoqueMinimo,
    m.ativo ? 1 : 0,
  ).id;
}

export function atualizarMaterial(
  db: Db,
  id: number,
  m: {
    nome: string;
    categoriaId: number | null;
    unidade: string;
    estoqueMinimo: number | null;
    ativo: boolean;
  },
): void {
  executar(
    db,
    `UPDATE materiais SET nome = ?, categoria_id = ?, unidade = ?, estoque_minimo = ?, ativo = ?, atualizado_em = ? WHERE id = ?`,
    m.nome,
    m.categoriaId,
    m.unidade,
    m.estoqueMinimo,
    m.ativo ? 1 : 0,
    agora(),
    id,
  );
}

export function atualizarSaldoMaterial(
  db: Db,
  id: number,
  estoque: number,
  custoMedio: number,
): void {
  executar(
    db,
    `UPDATE materiais SET estoque_atual = ?, custo_medio = ?, atualizado_em = ? WHERE id = ?`,
    estoque,
    custoMedio,
    agora(),
    id,
  );
}

export function inserirMovimentoMaterial(
  db: Db,
  m: {
    materialId: number;
    tipo: TipoMovimentoMaterial;
    quantidade: number;
    custoUnitario: number;
    custoTotal: number;
    saldoApos: number;
    custoMedioApos: number;
    referenciaTipo: string | null;
    referenciaId: number | null;
    data: string;
    justificativa: string | null;
    usuarioId: number | null;
  },
): number {
  return executar(
    db,
    `INSERT INTO materiais_movimentos
       (material_id, tipo, quantidade, custo_unitario, custo_total, saldo_apos, custo_medio_apos,
        referencia_tipo, referencia_id, data, justificativa, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    m.materialId,
    m.tipo,
    m.quantidade,
    m.custoUnitario,
    m.custoTotal,
    m.saldoApos,
    m.custoMedioApos,
    m.referenciaTipo,
    m.referenciaId,
    m.data,
    m.justificativa,
    m.usuarioId,
  ).id;
}

export function listarMovimentosMaterial(
  db: Db,
  materialId: number,
  pagina: number,
  porPagina: number,
): { itens: MovimentoMaterial[]; total: number } {
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM materiais_movimentos WHERE material_id = ?`,
    materialId,
  );
  const itens = todos<MovimentoMaterial>(
    db,
    `SELECT mm.id, mm.material_id AS materialId, mm.tipo, mm.quantidade, mm.custo_unitario AS custoUnitario,
            mm.custo_total AS custoTotal, mm.saldo_apos AS saldoApos, mm.custo_medio_apos AS custoMedioApos,
            mm.referencia_tipo AS referenciaTipo, mm.referencia_id AS referenciaId, mm.data,
            mm.justificativa, u.nome AS usuarioNome, mm.criado_em AS criadoEm
       FROM materiais_movimentos mm LEFT JOIN usuarios u ON u.id = mm.usuario_id
      WHERE mm.material_id = ? ORDER BY mm.data DESC, mm.id DESC LIMIT ? OFFSET ?`,
    materialId,
    porPagina,
    (pagina - 1) * porPagina,
  );
  return { itens, total };
}

/** Compras (não canceladas) do material, da mais antiga à mais nova — base do gráfico de custo. */
export function historicoDeCustos(db: Db, materialId: number): HistoricoCustoMaterial[] {
  return todos<HistoricoCustoMaterial>(
    db,
    `SELECT c.data, c.id AS compraId, f.nome_loja AS fornecedorNome, ci.quantidade_base AS quantidadeBase,
            ci.custo_unitario_final AS custoUnitarioFinal, (ci.valor_total + ci.despesa_rateada) AS valorTotal
       FROM compras_itens ci
       JOIN compras c ON c.id = ci.compra_id
       LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
      WHERE ci.material_id = ? AND c.status = 'registrada'
      ORDER BY c.data, c.id`,
    materialId,
  );
}

export const materiaisComEstoqueBaixo = (
  db: Db,
  limite = 20,
): { id: number; nome: string; unidade: string; estoqueAtual: number; estoqueMinimo: number }[] =>
  todos(
    db,
    `SELECT id, nome, unidade, estoque_atual AS estoqueAtual, estoque_minimo AS estoqueMinimo
       FROM materiais
      WHERE ativo = 1 AND estoque_minimo IS NOT NULL AND estoque_atual <= estoque_minimo
      ORDER BY (estoque_atual * 1.0 / MAX(estoque_minimo, 1)), nome LIMIT ?`,
    limite,
  );
