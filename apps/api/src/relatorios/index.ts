/** Consultas de relatório e geração de CSV para o Excel em português (UTF-8 com BOM, `;`, vírgula). */
import { formatarData, formatarDataHora } from '@pitanga/shared';
import type { Db } from '../db/connection';
import { todos } from '../db/util';
import { ErroDeValidacao } from '../erros';

export type TipoColuna =
  'texto' | 'moeda' | 'micro' | 'quantidade' | 'data' | 'datahora' | 'inteiro' | 'percentual';
export interface Coluna {
  chave: string;
  rotulo: string;
  tipo: TipoColuna;
}
export type Valor = string | number | null;
export interface Relatorio {
  nome: string;
  titulo: string;
  periodo: { de: string | null; ate: string | null };
  colunas: Coluna[];
  linhas: Record<string, Valor>[];
  /** Totais por chave de coluna numérica, quando fazem sentido. */
  totais: Record<string, number>;
}

interface Definicao {
  titulo: string;
  colunas: Coluna[];
  totalizar?: string[];
  consultar: (db: Db, de: string | null, ate: string | null) => Record<string, Valor>[];
}

const entre = (campo: string, de: string | null, ate: string | null, params: unknown[]): string => {
  const partes: string[] = [];
  if (de) {
    partes.push(`${campo} >= ?`);
    params.push(de);
  }
  if (ate) {
    partes.push(`${campo} <= ?`);
    params.push(ate);
  }
  return partes.length ? `WHERE ${partes.join(' AND ')}` : '';
};

const DEFINICOES: Record<string, Definicao> = {
  vendas: {
    titulo: 'Vendas',
    colunas: [
      { chave: 'id', rotulo: 'Venda', tipo: 'inteiro' },
      { chave: 'data', rotulo: 'Data', tipo: 'data' },
      { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'status', rotulo: 'Situação', tipo: 'texto' },
      { chave: 'formaPagamento', rotulo: 'Pagamento', tipo: 'texto' },
      { chave: 'subtotal', rotulo: 'Subtotal', tipo: 'moeda' },
      { chave: 'desconto', rotulo: 'Desconto', tipo: 'moeda' },
      { chave: 'total', rotulo: 'Total', tipo: 'moeda' },
      { chave: 'recebido', rotulo: 'Recebido', tipo: 'moeda' },
      { chave: 'cmv', rotulo: 'Custo (CMV)', tipo: 'moeda' },
      { chave: 'lucro', rotulo: 'Lucro estimado', tipo: 'moeda' },
    ],
    totalizar: ['subtotal', 'desconto', 'total', 'recebido', 'cmv', 'lucro'],
    consultar(db, de, ate) {
      const p: unknown[] = [];
      const where = entre('v.data', de, ate, p);
      return todos(
        db,
        `SELECT v.id, v.data, COALESCE(c.nome, 'Consumidor não identificado') AS cliente, v.status,
                v.forma_pagamento AS formaPagamento, v.subtotal, v.desconto, v.total,
                COALESCE((SELECT SUM(valor) FROM vendas_recebimentos r WHERE r.venda_id = v.id), 0) AS recebido,
                v.cmv, v.lucro_estimado AS lucro
           FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id ${where} ORDER BY v.data, v.id`,
        ...p,
      );
    },
  },
  'vendas-itens': {
    titulo: 'Itens vendidos',
    colunas: [
      { chave: 'data', rotulo: 'Data', tipo: 'data' },
      { chave: 'venda', rotulo: 'Venda', tipo: 'inteiro' },
      { chave: 'produto', rotulo: 'Produto', tipo: 'texto' },
      { chave: 'quantidade', rotulo: 'Quantidade', tipo: 'inteiro' },
      { chave: 'precoUnitario', rotulo: 'Preço unitário', tipo: 'moeda' },
      { chave: 'total', rotulo: 'Total', tipo: 'moeda' },
      { chave: 'custoTotal', rotulo: 'Custo', tipo: 'moeda' },
    ],
    totalizar: ['quantidade', 'total', 'custoTotal'],
    consultar(db, de, ate) {
      const p: unknown[] = [];
      const where = entre('v.data', de, ate, p);
      return todos(
        db,
        `SELECT v.data, v.id AS venda, pr.nome AS produto, vi.quantidade, vi.preco_unitario AS precoUnitario,
                vi.total, vi.custo_total AS custoTotal
           FROM vendas_itens vi JOIN vendas v ON v.id = vi.venda_id JOIN produtos pr ON pr.id = vi.produto_id
          ${where ? `${where} AND` : 'WHERE'} v.status <> 'cancelada' ORDER BY v.data, v.id`,
        ...p,
      );
    },
  },
  compras: {
    titulo: 'Compras de materiais',
    colunas: [
      { chave: 'id', rotulo: 'Compra', tipo: 'inteiro' },
      { chave: 'data', rotulo: 'Data', tipo: 'data' },
      { chave: 'fornecedor', rotulo: 'Fornecedor', tipo: 'texto' },
      { chave: 'status', rotulo: 'Situação', tipo: 'texto' },
      { chave: 'totalItens', rotulo: 'Itens', tipo: 'moeda' },
      { chave: 'totalDespesas', rotulo: 'Despesas', tipo: 'moeda' },
      { chave: 'total', rotulo: 'Total', tipo: 'moeda' },
    ],
    totalizar: ['totalItens', 'totalDespesas', 'total'],
    consultar(db, de, ate) {
      const p: unknown[] = [];
      const where = entre('c.data', de, ate, p);
      return todos(
        db,
        `SELECT c.id, c.data, COALESCE(f.nome_loja, '—') AS fornecedor, c.status, c.total_itens AS totalItens,
                c.total_despesas AS totalDespesas, c.total
           FROM compras c LEFT JOIN fornecedores f ON f.id = c.fornecedor_id ${where} ORDER BY c.data, c.id`,
        ...p,
      );
    },
  },
  'movimentos-materiais': {
    titulo: 'Movimentos de materiais',
    colunas: [
      { chave: 'data', rotulo: 'Data', tipo: 'data' },
      { chave: 'material', rotulo: 'Material', tipo: 'texto' },
      { chave: 'unidade', rotulo: 'Unidade', tipo: 'texto' },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
      { chave: 'quantidade', rotulo: 'Quantidade', tipo: 'quantidade' },
      { chave: 'custoUnitario', rotulo: 'Custo unitário', tipo: 'micro' },
      { chave: 'custoTotal', rotulo: 'Valor', tipo: 'moeda' },
      { chave: 'saldoApos', rotulo: 'Saldo após', tipo: 'quantidade' },
      { chave: 'justificativa', rotulo: 'Justificativa', tipo: 'texto' },
    ],
    consultar(db, de, ate) {
      const p: unknown[] = [];
      const where = entre('mm.data', de, ate, p);
      return todos(
        db,
        `SELECT mm.data, m.nome AS material, m.unidade, mm.tipo, mm.quantidade, mm.custo_unitario AS custoUnitario,
                mm.custo_total AS custoTotal, mm.saldo_apos AS saldoApos, mm.justificativa
           FROM materiais_movimentos mm JOIN materiais m ON m.id = mm.material_id ${where}
          ORDER BY mm.data, mm.id`,
        ...p,
      );
    },
  },
  'movimentos-produtos': {
    titulo: 'Movimentos de produtos acabados',
    colunas: [
      { chave: 'data', rotulo: 'Data', tipo: 'data' },
      { chave: 'produto', rotulo: 'Produto', tipo: 'texto' },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
      { chave: 'quantidade', rotulo: 'Quantidade', tipo: 'inteiro' },
      { chave: 'custoUnitario', rotulo: 'Custo unitário', tipo: 'micro' },
      { chave: 'custoTotal', rotulo: 'Valor', tipo: 'moeda' },
      { chave: 'saldoApos', rotulo: 'Saldo após', tipo: 'inteiro' },
      { chave: 'justificativa', rotulo: 'Justificativa', tipo: 'texto' },
    ],
    consultar(db, de, ate) {
      const p: unknown[] = [];
      const where = entre('pm.data', de, ate, p);
      return todos(
        db,
        `SELECT pm.data, pr.nome AS produto, pm.tipo, pm.quantidade, pm.custo_unitario AS custoUnitario,
                pm.custo_total AS custoTotal, pm.saldo_apos AS saldoApos, pm.justificativa
           FROM produtos_movimentos pm JOIN produtos pr ON pr.id = pm.produto_id ${where}
          ORDER BY pm.data, pm.id`,
        ...p,
      );
    },
  },
  lancamentos: {
    titulo: 'Lançamentos financeiros',
    colunas: [
      { chave: 'dataCompetencia', rotulo: 'Competência', tipo: 'data' },
      { chave: 'dataCaixa', rotulo: 'Caixa', tipo: 'data' },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
      { chave: 'natureza', rotulo: 'Natureza', tipo: 'texto' },
      { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto' },
      { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
      { chave: 'afetaResultado', rotulo: 'Afeta resultado', tipo: 'texto' },
      { chave: 'afetaCaixa', rotulo: 'Afeta caixa', tipo: 'texto' },
      { chave: 'status', rotulo: 'Situação', tipo: 'texto' },
    ],
    consultar(db, de, ate) {
      const p: unknown[] = [];
      const where = entre('COALESCE(data_caixa, data_competencia)', de, ate, p);
      return todos<Record<string, Valor>>(
        db,
        `SELECT data_competencia AS dataCompetencia, data_caixa AS dataCaixa, tipo, natureza, descricao, valor,
                afeta_resultado AS afetaResultado, afeta_caixa AS afetaCaixa, status
           FROM financeiro_lancamentos ${where} ORDER BY COALESCE(data_caixa, data_competencia), id`,
        ...p,
      ).map((l) => ({
        ...l,
        afetaResultado: l.afetaResultado ? 'Sim' : 'Não',
        afetaCaixa: l.afetaCaixa ? 'Sim' : 'Não',
      }));
    },
  },
  producoes: {
    titulo: 'Produções',
    colunas: [
      { chave: 'id', rotulo: 'Produção', tipo: 'inteiro' },
      { chave: 'data', rotulo: 'Data', tipo: 'data' },
      { chave: 'produto', rotulo: 'Produto', tipo: 'texto' },
      { chave: 'quantidade', rotulo: 'Quantidade', tipo: 'inteiro' },
      { chave: 'status', rotulo: 'Situação', tipo: 'texto' },
      { chave: 'custoTotal', rotulo: 'Custo total', tipo: 'moeda' },
      { chave: 'custoUnitario', rotulo: 'Custo unitário', tipo: 'micro' },
      { chave: 'custoEstoqueTotal', rotulo: 'Custo de estoque', tipo: 'moeda' },
    ],
    totalizar: ['quantidade', 'custoTotal', 'custoEstoqueTotal'],
    consultar(db, de, ate) {
      const p: unknown[] = [];
      const where = entre('pr.data', de, ate, p);
      return todos(
        db,
        `SELECT pr.id, pr.data, p.nome AS produto, pr.quantidade, pr.status, pr.custo_total AS custoTotal,
                pr.custo_unitario AS custoUnitario, pr.custo_estoque_total AS custoEstoqueTotal
           FROM producoes pr JOIN produtos p ON p.id = pr.produto_id ${where} ORDER BY pr.data, pr.id`,
        ...p,
      );
    },
  },
  'estoque-materiais': {
    titulo: 'Posição de estoque de materiais',
    colunas: [
      { chave: 'nome', rotulo: 'Material', tipo: 'texto' },
      { chave: 'categoria', rotulo: 'Categoria', tipo: 'texto' },
      { chave: 'unidade', rotulo: 'Unidade', tipo: 'texto' },
      { chave: 'estoque', rotulo: 'Estoque', tipo: 'quantidade' },
      { chave: 'minimo', rotulo: 'Mínimo', tipo: 'quantidade' },
      { chave: 'custoMedio', rotulo: 'Custo médio', tipo: 'micro' },
      { chave: 'valor', rotulo: 'Valor em estoque', tipo: 'moeda' },
    ],
    totalizar: ['valor'],
    consultar: (db) =>
      todos(
        db,
        `SELECT m.nome, COALESCE(c.nome, '—') AS categoria, m.unidade, m.estoque_atual AS estoque,
                m.estoque_minimo AS minimo, m.custo_medio AS custoMedio,
                CAST(ROUND(m.estoque_atual * m.custo_medio / 10000000.0) AS INTEGER) AS valor
           FROM materiais m LEFT JOIN categorias c ON c.id = m.categoria_id WHERE m.ativo = 1 ORDER BY m.nome`,
      ),
  },
  catalogo: {
    titulo: 'Catálogo de produtos',
    colunas: [
      { chave: 'nome', rotulo: 'Produto', tipo: 'texto' },
      { chave: 'categoria', rotulo: 'Categoria', tipo: 'texto' },
      { chave: 'preco', rotulo: 'Preço de venda', tipo: 'moeda' },
      { chave: 'custo', rotulo: 'Custo de estoque', tipo: 'micro' },
      { chave: 'estoque', rotulo: 'Estoque', tipo: 'inteiro' },
    ],
    consultar: (db) =>
      todos(
        db,
        `SELECT p.nome, COALESCE(c.nome, '—') AS categoria, p.preco_venda AS preco, p.custo_producao AS custo,
                p.estoque_atual AS estoque
           FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE p.ativo = 1 ORDER BY p.nome`,
      ),
  },
  clientes: {
    titulo: 'Clientes',
    colunas: [
      { chave: 'nome', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'telefone', rotulo: 'Telefone', tipo: 'texto' },
      { chave: 'compras', rotulo: 'Compras', tipo: 'inteiro' },
      { chave: 'total', rotulo: 'Total comprado', tipo: 'moeda' },
      { chave: 'ultima', rotulo: 'Última compra', tipo: 'data' },
    ],
    totalizar: ['compras', 'total'],
    consultar: (db) =>
      todos(
        db,
        `SELECT c.nome, c.telefone, COUNT(v.id) AS compras, COALESCE(SUM(v.total), 0) AS total, MAX(v.data) AS ultima
           FROM clientes c LEFT JOIN vendas v ON v.cliente_id = c.id AND v.status <> 'cancelada'
          WHERE c.ativo = 1 GROUP BY c.id ORDER BY c.nome COLLATE NOCASE`,
      ),
  },
};

export const NOMES_DE_RELATORIOS = Object.entries(DEFINICOES).map(([nome, d]) => ({
  nome,
  titulo: d.titulo,
}));

export function gerarRelatorio(
  db: Db,
  nome: string,
  periodo: { de?: string; ate?: string },
): Relatorio {
  const def = DEFINICOES[nome];
  if (!def) throw new ErroDeValidacao(`Relatório "${nome}" não existe.`);
  const de = periodo.de ?? null;
  const ate = periodo.ate ?? null;
  const linhas = def.consultar(db, de, ate);
  const totais: Record<string, number> = {};
  for (const chave of def.totalizar ?? []) {
    totais[chave] = linhas.reduce(
      (s, l) => s + (typeof l[chave] === 'number' ? (l[chave] as number) : 0),
      0,
    );
  }
  return { nome, titulo: def.titulo, periodo: { de, ate }, colunas: def.colunas, linhas, totais };
}

/* ---------------------------------- CSV ---------------------------------- */

const decimal = (n: number, casas: number): string => n.toFixed(casas).replace('.', ',');

function valorCsv(v: Valor | undefined, tipo: TipoColuna): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    switch (tipo) {
      case 'moeda':
        return decimal(v / 100, 2);
      case 'micro':
        return decimal(v / 1_000_000, 6);
      case 'quantidade':
        return decimal(v / 1000, 3).replace(/,?0+$/, '');
      case 'percentual':
        return decimal(v / 100, 2);
      default:
        return String(v);
    }
  }
  if (tipo === 'data') return formatarData(v);
  if (tipo === 'datahora') return formatarDataHora(v);
  return v;
}

/** Marca de ordem de bytes UTF-8: faz o Excel em português abrir os acentos corretamente. */
const BOM = String.fromCharCode(0xfeff);

const escapar = (s: string): string => (/[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV com cabeçalhos em português, separador `;`, decimal com vírgula e BOM UTF-8 para o Excel. */
export function paraCsv(rel: Relatorio): string {
  const linhas = [rel.colunas.map((c) => escapar(c.rotulo)).join(';')];
  for (const l of rel.linhas) {
    linhas.push(rel.colunas.map((c) => escapar(valorCsv(l[c.chave], c.tipo))).join(';'));
  }
  if (Object.keys(rel.totais).length) {
    linhas.push(
      rel.colunas
        .map((c, i) =>
          i === 0
            ? 'Total'
            : c.chave in rel.totais
              ? escapar(valorCsv(rel.totais[c.chave]!, c.tipo))
              : '',
        )
        .join(';'),
    );
  }
  return `${BOM}${linhas.join('\r\n')}\r\n`;
}
