import type { Lancamento, Natureza, StatusLancamento } from '@pitanga/shared';
import type { LancamentoParaApuracao, LancamentoRascunho } from '@pitanga/core';
import type { Db } from '../db/connection';
import { Filtros, agora, comoBooleano, escalar, executar, todos, um } from '../db/util';

const SQL_LANC = `
  SELECT id, tipo, natureza, descricao, valor, data_competencia AS dataCompetencia, data_caixa AS dataCaixa,
         afeta_resultado AS afetaResultado, afeta_caixa AS afetaCaixa, status,
         referencia_tipo AS referenciaTipo, referencia_id AS referenciaId,
         estorna_lancamento_id AS estornaLancamentoId, criado_em AS criadoEm
    FROM financeiro_lancamentos`;

type LinhaLanc = Omit<Lancamento, 'afetaResultado' | 'afetaCaixa'> & {
  afetaResultado: number;
  afetaCaixa: number;
};
const paraLancamento = (l: LinhaLanc): Lancamento => ({
  ...l,
  afetaResultado: comoBooleano(l.afetaResultado),
  afetaCaixa: comoBooleano(l.afetaCaixa),
});

export function inserirLancamento(db: Db, l: LancamentoRascunho, usuarioId: number | null): number {
  return executar(
    db,
    `INSERT INTO financeiro_lancamentos
       (tipo, natureza, descricao, valor, data_competencia, data_caixa, afeta_resultado, afeta_caixa,
        status, referencia_tipo, referencia_id, estorna_lancamento_id, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    l.tipo,
    l.natureza,
    l.descricao,
    l.valor,
    l.dataCompetencia,
    l.dataCaixa,
    l.afetaResultado ? 1 : 0,
    l.afetaCaixa ? 1 : 0,
    l.status,
    l.referenciaTipo,
    l.referenciaId,
    l.estornaLancamentoId ?? null,
    usuarioId,
  ).id;
}

export function buscarLancamento(db: Db, id: number): Lancamento | undefined {
  const l = um<LinhaLanc>(db, `${SQL_LANC} WHERE id = ?`, id);
  return l ? paraLancamento(l) : undefined;
}

export function listarLancamentos(
  db: Db,
  f: {
    de?: string;
    ate?: string;
    natureza?: Natureza;
    status?: StatusLancamento;
    busca?: string;
    pagina: number;
    porPagina: number;
  },
): { itens: Lancamento[]; total: number } {
  const filtros = new Filtros().busca(f.busca, ['descricao']);
  if (f.de) filtros.adicionar('COALESCE(data_caixa, data_competencia) >= ?', f.de);
  if (f.ate) filtros.adicionar('COALESCE(data_caixa, data_competencia) <= ?', f.ate);
  if (f.natureza) filtros.adicionar('natureza = ?', f.natureza);
  if (f.status) filtros.adicionar('status = ?', f.status);
  const total = escalar<number>(
    db,
    `SELECT COUNT(*) FROM financeiro_lancamentos ${filtros.where}`,
    ...filtros.params,
  );
  const itens = todos<LinhaLanc>(
    db,
    `${SQL_LANC} ${filtros.where} ORDER BY COALESCE(data_caixa, data_competencia) DESC, id DESC LIMIT ? OFFSET ?`,
    ...filtros.params,
    f.porPagina,
    (f.pagina - 1) * f.porPagina,
  ).map(paraLancamento);
  return { itens, total };
}

/** Lançamentos de uma origem (venda, compra, recebimento...) que ainda não foram estornados. */
export function lancamentosVigentesDaReferencia(
  db: Db,
  referenciaTipo: string,
  referenciaId: number,
): Lancamento[] {
  return todos<LinhaLanc>(
    db,
    `${SQL_LANC} l
      WHERE l.referencia_tipo = ? AND l.referencia_id = ? AND l.status = 'realizado'
        AND l.estorna_lancamento_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos e WHERE e.estorna_lancamento_id = l.id)`,
    referenciaTipo,
    referenciaId,
  ).map(paraLancamento);
}

export const foiEstornado = (db: Db, id: number): boolean =>
  !!um(db, `SELECT 1 FROM financeiro_lancamentos WHERE estorna_lancamento_id = ? LIMIT 1`, id);

export function definirStatusLancamento(
  db: Db,
  id: number,
  status: StatusLancamento,
  dataCaixa?: string | null,
): void {
  if (dataCaixa !== undefined) {
    executar(
      db,
      `UPDATE financeiro_lancamentos SET status = ?, data_caixa = ?, atualizado_em = ? WHERE id = ?`,
      status,
      dataCaixa,
      agora(),
      id,
    );
  } else {
    executar(
      db,
      `UPDATE financeiro_lancamentos SET status = ?, atualizado_em = ? WHERE id = ?`,
      status,
      agora(),
      id,
    );
  }
}

/** Todos os lançamentos realizados que podem influenciar o período (competência ou caixa até `ate`). */
export function lancamentosParaApuracao(db: Db, ate: string | null): LancamentoParaApuracao[] {
  const filtros = new Filtros().adicionar(`status = 'realizado'`);
  if (ate)
    filtros.adicionar(
      '(data_competencia <= ? OR (data_caixa IS NOT NULL AND data_caixa <= ?))',
      ate,
      ate,
    );
  return todos<
    Omit<LancamentoParaApuracao, 'afetaResultado' | 'afetaCaixa'> & {
      afetaResultado: number;
      afetaCaixa: number;
    }
  >(
    db,
    `SELECT tipo, natureza, valor, data_competencia AS dataCompetencia, data_caixa AS dataCaixa,
            afeta_resultado AS afetaResultado, afeta_caixa AS afetaCaixa, status
       FROM financeiro_lancamentos ${filtros.where}`,
    ...filtros.params,
  ).map((l) => ({
    ...l,
    afetaResultado: comoBooleano(l.afetaResultado),
    afetaCaixa: comoBooleano(l.afetaCaixa),
  }));
}

/** Movimentação diária do caixa no período, para o gráfico e a tela de caixa. */
export function caixaPorDia(
  db: Db,
  de: string,
  ate: string,
): { data: string; entradas: number; saidas: number }[] {
  return todos(
    db,
    `SELECT data_caixa AS data,
            COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor END), 0) AS saidas
       FROM financeiro_lancamentos
      WHERE status = 'realizado' AND afeta_caixa = 1 AND data_caixa BETWEEN ? AND ?
      GROUP BY data_caixa ORDER BY data_caixa`,
    de,
    ate,
  );
}

export function saldoCaixaAte(db: Db, data: string): number {
  return escalar<number>(
    db,
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END), 0)
       FROM financeiro_lancamentos
      WHERE status = 'realizado' AND afeta_caixa = 1 AND data_caixa <= ?`,
    data,
  );
}

export function faturamentoPorDia(
  db: Db,
  de: string,
  ate: string,
): { data: string; valor: number }[] {
  return todos(
    db,
    `SELECT data_competencia AS data,
            SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END) AS valor
       FROM financeiro_lancamentos
      WHERE status = 'realizado' AND natureza = 'venda' AND afeta_resultado = 1
        AND data_competencia BETWEEN ? AND ?
      GROUP BY data_competencia ORDER BY data_competencia`,
    de,
    ate,
  );
}
