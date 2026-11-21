import type { Ficha, FichaExtra, FichaItem, Precificacao } from '@pitanga/shared';
import type { Db } from '../db/connection';
import { agora, comoBooleano, escalar, executar, todos, um } from '../db/util';

type LinhaFicha = Omit<Ficha, 'ativa' | 'itens' | 'extras'> & { ativa: number };
const SQL_FICHA = `
  SELECT id, produto_id AS produtoId, versao, rendimento, mao_obra_modo AS maoObraModo,
         mao_obra_valor_hora AS maoObraValorHora, mao_obra_minutos AS maoObraMinutos,
         mao_obra_valor_fixo AS maoObraValorFixo, ativa, observacao, criado_em AS criadoEm
    FROM fichas_tecnicas`;

function completar(db: Db, l: LinhaFicha): Ficha {
  return {
    ...l,
    ativa: comoBooleano(l.ativa),
    itens: itensDaFicha(db, l.id),
    extras: extrasDaFicha(db, l.id),
  };
}

export const itensDaFicha = (db: Db, fichaId: number): FichaItem[] =>
  todos<FichaItem>(
    db,
    `SELECT fi.id, fi.material_id AS materialId, m.nome AS materialNome, m.unidade, fi.quantidade,
            fi.observacao, m.custo_medio AS custoMedio, m.estoque_atual AS estoqueAtual
       FROM fichas_itens fi JOIN materiais m ON m.id = fi.material_id
      WHERE fi.ficha_id = ? ORDER BY fi.id`,
    fichaId,
  );

export const extrasDaFicha = (db: Db, fichaId: number): FichaExtra[] =>
  todos<Omit<FichaExtra, 'porUnidade'> & { porUnidade: number }>(
    db,
    `SELECT id, descricao, valor, tipo, por_unidade AS porUnidade FROM fichas_custos_extras
      WHERE ficha_id = ? ORDER BY id`,
    fichaId,
  ).map((e) => ({ ...e, porUnidade: comoBooleano(e.porUnidade) }));

export function buscarFicha(db: Db, id: number): Ficha | undefined {
  const l = um<LinhaFicha>(db, `${SQL_FICHA} WHERE id = ?`, id);
  return l ? completar(db, l) : undefined;
}

export function fichaAtivaDoProduto(db: Db, produtoId: number): Ficha | undefined {
  const l = um<LinhaFicha>(db, `${SQL_FICHA} WHERE produto_id = ? AND ativa = 1`, produtoId);
  return l ? completar(db, l) : undefined;
}

export const listarFichasDoProduto = (db: Db, produtoId: number): Ficha[] =>
  todos<LinhaFicha>(db, `${SQL_FICHA} WHERE produto_id = ? ORDER BY versao DESC`, produtoId).map(
    (l) => completar(db, l),
  );

export const proximaVersao = (db: Db, produtoId: number): number =>
  escalar<number>(
    db,
    `SELECT COALESCE(MAX(versao), 0) + 1 FROM fichas_tecnicas WHERE produto_id = ?`,
    produtoId,
  );

export const desativarFichas = (db: Db, produtoId: number): void => {
  executar(db, `UPDATE fichas_tecnicas SET ativa = 0 WHERE produto_id = ?`, produtoId);
};

export function inserirFicha(
  db: Db,
  f: {
    produtoId: number;
    versao: number;
    rendimento: number;
    maoObraModo: string;
    maoObraValorHora: number | null;
    maoObraMinutos: number | null;
    maoObraValorFixo: number | null;
    observacao: string | null;
  },
): number {
  return executar(
    db,
    `INSERT INTO fichas_tecnicas (produto_id, versao, rendimento, mao_obra_modo, mao_obra_valor_hora,
                                  mao_obra_minutos, mao_obra_valor_fixo, ativa, observacao)
     VALUES (?,?,?,?,?,?,?,1,?)`,
    f.produtoId,
    f.versao,
    f.rendimento,
    f.maoObraModo,
    f.maoObraValorHora,
    f.maoObraMinutos,
    f.maoObraValorFixo,
    f.observacao,
  ).id;
}

export function atualizarFicha(
  db: Db,
  id: number,
  f: {
    rendimento: number;
    maoObraModo: string;
    maoObraValorHora: number | null;
    maoObraMinutos: number | null;
    maoObraValorFixo: number | null;
    observacao: string | null;
  },
): void {
  executar(
    db,
    `UPDATE fichas_tecnicas SET rendimento = ?, mao_obra_modo = ?, mao_obra_valor_hora = ?, mao_obra_minutos = ?,
            mao_obra_valor_fixo = ?, observacao = ? WHERE id = ?`,
    f.rendimento,
    f.maoObraModo,
    f.maoObraValorHora,
    f.maoObraMinutos,
    f.maoObraValorFixo,
    f.observacao,
    id,
  );
}

export function limparItensEExtras(db: Db, fichaId: number): void {
  executar(db, `DELETE FROM fichas_itens WHERE ficha_id = ?`, fichaId);
  executar(db, `DELETE FROM fichas_custos_extras WHERE ficha_id = ?`, fichaId);
}

export function inserirItemFicha(
  db: Db,
  i: { fichaId: number; materialId: number; quantidade: number; observacao: string | null },
): void {
  executar(
    db,
    `INSERT INTO fichas_itens (ficha_id, material_id, quantidade, observacao) VALUES (?,?,?,?)`,
    i.fichaId,
    i.materialId,
    i.quantidade,
    i.observacao,
  );
}

export function inserirExtraFicha(
  db: Db,
  e: { fichaId: number; descricao: string; valor: number; tipo: string; porUnidade: boolean },
): void {
  executar(
    db,
    `INSERT INTO fichas_custos_extras (ficha_id, descricao, valor, tipo, por_unidade) VALUES (?,?,?,?,?)`,
    e.fichaId,
    e.descricao,
    e.valor,
    e.tipo,
    e.porUnidade ? 1 : 0,
  );
}

export const fichaFoiUsada = (db: Db, fichaId: number): boolean =>
  !!um(db, `SELECT 1 FROM producoes WHERE ficha_id = ? LIMIT 1`, fichaId);

/** Despesas compartilhadas rateadas ao produto e ainda não apropriadas a nenhuma produção. */
export const rateiosPendentesDoProduto = (db: Db, produtoId: number): number =>
  escalar<number>(
    db,
    `SELECT COALESCE(SUM(r.valor), 0)
       FROM despesas_rateios r JOIN despesas_compartilhadas d ON d.id = r.despesa_id
      WHERE r.destino_tipo = 'produto' AND r.destino_id = ? AND r.producao_id IS NULL AND d.status = 'rateada'`,
    produtoId,
  );

export const apropriarRateiosPendentes = (db: Db, produtoId: number, producaoId: number): void => {
  executar(
    db,
    `UPDATE despesas_rateios SET producao_id = ?
      WHERE destino_tipo = 'produto' AND destino_id = ? AND producao_id IS NULL
        AND despesa_id IN (SELECT id FROM despesas_compartilhadas WHERE status = 'rateada')`,
    producaoId,
    produtoId,
  );
};

export const liberarRateiosDaProducao = (db: Db, producaoId: number): void => {
  executar(
    db,
    `UPDATE despesas_rateios SET producao_id = NULL WHERE destino_tipo = 'produto' AND producao_id = ?`,
    producaoId,
  );
};

/* ------------------------------- precificações ------------------------------- */

export function inserirPrecificacao(
  db: Db,
  p: Omit<Precificacao, 'id' | 'aplicadoAoProduto'> & {
    aplicadoAoProduto: boolean;
    usuarioId: number | null;
  },
): number {
  return executar(
    db,
    `INSERT INTO precificacoes (produto_id, ficha_id, modo, parametro, custo_base, taxas_fixas, taxas_percentuais,
                                preco_sugerido, preco_final, lucro_previsto, margem_efetiva, aplicado_ao_produto,
                                data, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    p.produtoId,
    p.fichaId,
    p.modo,
    p.parametro,
    p.custoBase,
    p.taxasFixas,
    p.taxasPercentuais,
    p.precoSugerido,
    p.precoFinal,
    p.lucroPrevisto,
    p.margemEfetiva,
    p.aplicadoAoProduto ? 1 : 0,
    p.data,
    p.usuarioId,
  ).id;
}

export const listarPrecificacoes = (db: Db, produtoId: number): Precificacao[] =>
  todos<Omit<Precificacao, 'aplicadoAoProduto'> & { aplicadoAoProduto: number }>(
    db,
    `SELECT id, produto_id AS produtoId, ficha_id AS fichaId, modo, parametro, custo_base AS custoBase,
            taxas_fixas AS taxasFixas, taxas_percentuais AS taxasPercentuais, preco_sugerido AS precoSugerido,
            preco_final AS precoFinal, lucro_previsto AS lucroPrevisto, margem_efetiva AS margemEfetiva,
            aplicado_ao_produto AS aplicadoAoProduto, data
       FROM precificacoes WHERE produto_id = ? ORDER BY id DESC`,
    produtoId,
  ).map((p) => ({ ...p, aplicadoAoProduto: comoBooleano(p.aplicadoAoProduto) }));

export const marcarAtualizacao = (db: Db, produtoId: number): void => {
  executar(db, `UPDATE produtos SET atualizado_em = ? WHERE id = ?`, agora(), produtoId);
};
