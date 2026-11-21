import type { MovimentoProduto, Produto, TipoMovimentoProduto } from '@pitanga/shared';
import type { Db } from '../db/connection';
import { Filtros, agora, comoBooleano, escalar, executar, todos, um } from '../db/util';

const SQL_PRODUTO = `
  SELECT p.id, p.nome, p.descricao, p.categoria_id AS categoriaId, c.nome AS categoriaNome,
         p.foto_arquivo AS fotoArquivo, p.preco_venda AS precoVenda, p.custo_producao AS custoProducao,
         p.estoque_atual AS estoqueAtual, p.ativo,
         EXISTS (SELECT 1 FROM fichas_tecnicas f WHERE f.produto_id = p.id AND f.ativa = 1) AS temFicha
    FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id`;

type LinhaProduto = Omit<Produto, 'ativo' | 'temFicha'> & { ativo: number; temFicha: number };
const paraProduto = (l: LinhaProduto): Produto => ({
  ...l,
  ativo: comoBooleano(l.ativo),
  temFicha: comoBooleano(l.temFicha),
});

export function listarProdutos(
  db: Db,
  f: {
    busca?: string;
    categoriaId?: number;
    ativo?: boolean;
    comEstoque?: boolean;
    pagina: number;
    porPagina: number;
  },
): { itens: Produto[]; total: number } {
  const filtros = new Filtros().busca(f.busca, ['p.nome', 'p.descricao', 'c.nome']);
  if (f.categoriaId) filtros.adicionar('p.categoria_id = ?', f.categoriaId);
  if (f.ativo !== undefined) filtros.adicionar('p.ativo = ?', f.ativo ? 1 : 0);
  if (f.comEstoque) filtros.adicionar('p.estoque_atual > 0');
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id ${filtros.where}`,
    ...filtros.params,
  );
  const itens = todos<LinhaProduto>(
    db,
    `${SQL_PRODUTO} ${filtros.where} ORDER BY p.nome COLLATE NOCASE LIMIT ? OFFSET ?`,
    ...filtros.params,
    f.porPagina,
    (f.pagina - 1) * f.porPagina,
  ).map(paraProduto);
  return { itens, total };
}

export function buscarProduto(db: Db, id: number): Produto | undefined {
  const l = um<LinhaProduto>(db, `${SQL_PRODUTO} WHERE p.id = ?`, id);
  return l ? paraProduto(l) : undefined;
}

/** Estado de estoque com a média de mão de obra própria não paga, usada pelo serviço de estoque. */
export function estadoDoProduto(
  db: Db,
  id: number,
): { estoqueAtual: number; custoProducao: number; maoObraMedia: number } | undefined {
  return um(
    db,
    `SELECT estoque_atual AS estoqueAtual, custo_producao AS custoProducao,
            mao_obra_pendente_media AS maoObraMedia FROM produtos WHERE id = ?`,
    id,
  );
}

export function inserirProduto(
  db: Db,
  p: {
    nome: string;
    descricao: string | null;
    categoriaId: number | null;
    precoVenda: number | null;
    ativo: boolean;
  },
): number {
  return executar(
    db,
    `INSERT INTO produtos (nome, descricao, categoria_id, preco_venda, ativo) VALUES (?,?,?,?,?)`,
    p.nome,
    p.descricao,
    p.categoriaId,
    p.precoVenda,
    p.ativo ? 1 : 0,
  ).id;
}

export function atualizarProduto(
  db: Db,
  id: number,
  p: {
    nome: string;
    descricao: string | null;
    categoriaId: number | null;
    precoVenda: number | null;
    ativo: boolean;
  },
): void {
  executar(
    db,
    `UPDATE produtos SET nome = ?, descricao = ?, categoria_id = ?, preco_venda = ?, ativo = ?, atualizado_em = ? WHERE id = ?`,
    p.nome,
    p.descricao,
    p.categoriaId,
    p.precoVenda,
    p.ativo ? 1 : 0,
    agora(),
    id,
  );
}

export function definirPrecoVenda(db: Db, id: number, preco: number): void {
  executar(
    db,
    `UPDATE produtos SET preco_venda = ?, atualizado_em = ? WHERE id = ?`,
    preco,
    agora(),
    id,
  );
}

export function definirFoto(db: Db, id: number, arquivo: string | null): void {
  executar(
    db,
    `UPDATE produtos SET foto_arquivo = ?, atualizado_em = ? WHERE id = ?`,
    arquivo,
    agora(),
    id,
  );
}

export function atualizarSaldoProduto(
  db: Db,
  id: number,
  estoque: number,
  custoProducao: number,
  maoObraMedia: number,
): void {
  executar(
    db,
    `UPDATE produtos SET estoque_atual = ?, custo_producao = ?, mao_obra_pendente_media = ?, atualizado_em = ? WHERE id = ?`,
    estoque,
    custoProducao,
    maoObraMedia,
    agora(),
    id,
  );
}

export function inserirMovimentoProduto(
  db: Db,
  m: {
    produtoId: number;
    tipo: TipoMovimentoProduto;
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
    `INSERT INTO produtos_movimentos
       (produto_id, tipo, quantidade, custo_unitario, custo_total, saldo_apos, custo_medio_apos,
        referencia_tipo, referencia_id, data, justificativa, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    m.produtoId,
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

export function listarMovimentosProduto(
  db: Db,
  produtoId: number,
  pagina: number,
  porPagina: number,
): { itens: MovimentoProduto[]; total: number } {
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM produtos_movimentos WHERE produto_id = ?`,
    produtoId,
  );
  const itens = todos<MovimentoProduto>(
    db,
    `SELECT pm.id, pm.produto_id AS produtoId, pm.tipo, pm.quantidade, pm.custo_unitario AS custoUnitario,
            pm.custo_total AS custoTotal, pm.saldo_apos AS saldoApos, pm.custo_medio_apos AS custoMedioApos,
            pm.referencia_tipo AS referenciaTipo, pm.referencia_id AS referenciaId, pm.data,
            pm.justificativa, u.nome AS usuarioNome
       FROM produtos_movimentos pm LEFT JOIN usuarios u ON u.id = pm.usuario_id
      WHERE pm.produto_id = ? ORDER BY pm.data DESC, pm.id DESC LIMIT ? OFFSET ?`,
    produtoId,
    porPagina,
    (pagina - 1) * porPagina,
  );
  return { itens, total };
}

export const produtoTemMovimentos = (db: Db, id: number): boolean =>
  !!um(db, `SELECT 1 FROM produtos_movimentos WHERE produto_id = ? LIMIT 1`, id);
