/**
 * Verificação das dez invariantes (plano, seção 8.3) — usada por `npm run db:check`, pelos testes
 * e pelo backup/restauração. Retorna divergências em texto para a pessoa ler.
 */
import { diferencaDaEquacao } from '@pitanga/core';
import type { Db } from '../db/connection';
import { escalar, todos } from '../db/util';
import { lerConfiguracao } from '../repositories/sistema.repo';
import { contasAReceber } from '../repositories/vendas.repo';

export interface ResultadoInvariante {
  numero: number;
  descricao: string;
  ok: boolean;
  divergencias: string[];
}

const SINAL = `CASE WHEN tipo = 'receita' THEN valor ELSE -valor END`;

export function verificarInvariantes(db: Db): ResultadoInvariante[] {
  const resultados: ResultadoInvariante[] = [];
  const registrar = (numero: number, descricao: string, divergencias: string[]) =>
    resultados.push({ numero, descricao, ok: divergencias.length === 0, divergencias });

  // 1 e 2 — saldo em cache = soma do razão
  registrar(
    1,
    'Estoque de material = soma dos movimentos',
    todos<{ nome: string; atual: number; soma: number }>(
      db,
      `SELECT m.nome, m.estoque_atual AS atual, COALESCE(SUM(mm.quantidade), 0) AS soma
         FROM materiais m LEFT JOIN materiais_movimentos mm ON mm.material_id = m.id
        GROUP BY m.id HAVING m.estoque_atual <> soma`,
    ).map((r) => `Material "${r.nome}": estoque ${r.atual}, movimentos somam ${r.soma}`),
  );
  registrar(
    2,
    'Estoque de produto = soma dos movimentos',
    todos<{ nome: string; atual: number; soma: number }>(
      db,
      `SELECT p.nome, p.estoque_atual AS atual, COALESCE(SUM(pm.quantidade), 0) AS soma
         FROM produtos p LEFT JOIN produtos_movimentos pm ON pm.produto_id = p.id
        GROUP BY p.id HAVING p.estoque_atual <> soma`,
    ).map((r) => `Produto "${r.nome}": estoque ${r.atual}, movimentos somam ${r.soma}`),
  );

  // 3 — nenhum estoque negativo sem autorização
  const permiteNegativo = lerConfiguracao(db, 'permite_estoque_negativo') === '1';
  const negativos = todos<{ nome: string; saldo: number }>(
    db,
    `SELECT m.nome, mm.saldo_apos AS saldo
       FROM materiais_movimentos mm JOIN materiais m ON m.id = mm.material_id
      WHERE mm.saldo_apos < 0 AND mm.tipo <> 'ajuste'
        AND NOT EXISTS (SELECT 1 FROM producoes p
                         WHERE mm.referencia_tipo = 'producao' AND p.id = mm.referencia_id
                           AND p.autorizou_estoque_negativo = 1
                           AND mm.justificativa IS NOT NULL)`,
  ).map((r) => `Material "${r.nome}" ficou com saldo ${r.saldo} sem autorização e justificativa`);
  if (!permiteNegativo) {
    negativos.push(
      ...todos<{ nome: string; saldo: number }>(
        db,
        `SELECT nome, estoque_atual AS saldo FROM produtos WHERE estoque_atual < 0`,
      ).map((r) => `Produto "${r.nome}" está com estoque negativo (${r.saldo})`),
    );
  }
  registrar(3, 'Nenhum estoque negativo sem autorização', negativos);

  // 4 — totais da venda
  registrar(
    4,
    'Total da venda = subtotal − desconto = soma dos itens',
    todos<{ id: number }>(
      db,
      `SELECT v.id FROM vendas v
        WHERE v.total <> v.subtotal - v.desconto
           OR v.subtotal <> COALESCE((SELECT SUM(total) FROM vendas_itens WHERE venda_id = v.id), 0)`,
    ).map((r) => `Venda #${r.id}: totais não conferem`),
  );

  // 5 e 6 — recebimentos e situação
  registrar(
    5,
    'Recebimentos ≤ total da venda',
    todos<{ id: number; total: number; recebido: number }>(
      db,
      `SELECT v.id, v.total, COALESCE(SUM(r.valor), 0) AS recebido
         FROM vendas v LEFT JOIN vendas_recebimentos r ON r.venda_id = v.id
        WHERE v.status <> 'cancelada' GROUP BY v.id HAVING recebido > v.total`,
    ).map((r) => `Venda #${r.id}: recebido ${r.recebido} > total ${r.total}`),
  );
  registrar(
    6,
    'Situação da venda coerente com os recebimentos',
    todos<{ id: number; status: string }>(
      db,
      `SELECT v.id, v.status FROM vendas v
        WHERE v.status <> 'cancelada'
          AND v.status <> CASE WHEN COALESCE((SELECT SUM(valor) FROM vendas_recebimentos WHERE venda_id = v.id), 0) >= v.total
                               THEN 'concluida' ELSE 'pendente' END`,
    ).map((r) => `Venda #${r.id}: situação "${r.status}" não confere com os recebimentos`),
  );

  // 7 — um lançamento de receita e um de CMV por venda não cancelada
  const vigentes = (ref: string, natureza: string) =>
    `(SELECT COUNT(*) FROM financeiro_lancamentos l
       WHERE l.referencia_tipo = 'venda' AND l.referencia_id = v.id AND l.natureza = '${natureza}'
         AND l.afeta_resultado = 1 AND l.estorna_lancamento_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos e WHERE e.estorna_lancamento_id = l.id)${ref})`;
  registrar(
    7,
    'Toda venda não cancelada tem um lançamento de receita e um de CMV',
    todos<{ id: number; receitas: number; cmvs: number; total: number; cmv: number }>(
      db,
      `SELECT v.id, v.total, v.cmv, ${vigentes('', 'venda')} AS receitas, ${vigentes('', 'cmv')} AS cmvs
         FROM vendas v WHERE v.status <> 'cancelada'`,
    )
      .filter((r) => r.receitas !== (r.total > 0 ? 1 : 0) || r.cmvs !== (r.cmv > 0 ? 1 : 0))
      .map((r) => `Venda #${r.id}: ${r.receitas} lançamento(s) de receita e ${r.cmvs} de CMV`),
  );

  // 8 — compra de matéria-prima nunca afeta o resultado
  registrar(
    8,
    'Compra de matéria-prima não afeta o resultado',
    todos<{ id: number }>(
      db,
      `SELECT id FROM financeiro_lancamentos WHERE natureza = 'compra_material' AND afeta_resultado = 1`,
    ).map((r) => `Lançamento #${r.id}: compra de material marcada como afetando o resultado`),
  );

  // 9 — soma dos rateios
  registrar(
    9,
    'Soma dos rateios = valor da despesa compartilhada',
    todos<{ id: number; valor: number; soma: number }>(
      db,
      `SELECT d.id, d.valor_total AS valor, COALESCE(SUM(r.valor), 0) AS soma
         FROM despesas_compartilhadas d LEFT JOIN despesas_rateios r ON r.despesa_id = d.id
        WHERE d.status = 'rateada' GROUP BY d.id HAVING soma <> d.valor_total`,
    ).map((r) => `Despesa #${r.id}: valor ${r.valor}, rateios somam ${r.soma}`),
  );

  // 10 — caixa operacional + estoque + contas a receber = resultado
  const caixa = escalar<number>(
    db,
    `SELECT COALESCE(SUM(${SINAL}), 0) FROM financeiro_lancamentos
      WHERE status = 'realizado' AND afeta_caixa = 1 AND data_caixa IS NOT NULL
        AND natureza NOT IN ('aporte','retirada')`,
  );
  const resultado = escalar<number>(
    db,
    `SELECT COALESCE(SUM(${SINAL}), 0) FROM financeiro_lancamentos
      WHERE status = 'realizado' AND afeta_resultado = 1`,
  );
  const estoque =
    escalar<number>(db, `SELECT COALESCE(SUM(custo_total), 0) FROM materiais_movimentos`) +
    escalar<number>(db, `SELECT COALESCE(SUM(custo_total), 0) FROM produtos_movimentos`);
  const aReceber = contasAReceber(db, null);
  const diferenca = diferencaDaEquacao({
    variacaoCaixaOperacional: caixa,
    variacaoEstoque: estoque,
    contasAReceber: aReceber,
    resultado,
  });
  registrar(
    10,
    'Caixa + estoque + contas a receber = resultado',
    diferenca === 0
      ? []
      : [
          `Diferença de ${diferenca} centavos (caixa ${caixa}, estoque ${estoque}, a receber ${aReceber}, resultado ${resultado})`,
        ],
  );
  return resultados;
}
