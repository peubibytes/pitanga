import type { Painel } from '@pitanga/shared';
import { dataISO, hojeISO, primeiroDiaDoMes, somarDias, ultimoDiaDoMes } from '@pitanga/shared';
import type { Contexto } from '../db/util';
import { faturamentoPorDia } from '../repositories/financeiro.repo';
import { materiaisComEstoqueBaixo } from '../repositories/materiais.repo';
import { lerConfiguracao } from '../repositories/sistema.repo';
import {
  contarVendas,
  contarVendasPendentes,
  produtosMaisVendidos,
} from '../repositories/vendas.repo';
import { resumoFinanceiro } from './financeiro.service';

export type PeriodoPainel = 'hoje' | 'semana' | 'mes' | 'ano';

export function intervaloDoPeriodo(
  periodo: PeriodoPainel,
  hoje = hojeISO(),
): { de: string; ate: string } {
  switch (periodo) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    case 'semana':
      return { de: somarDias(hoje, -6), ate: hoje };
    case 'ano':
      return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
    default:
      return { de: primeiroDiaDoMes(hoje), ate: ultimoDiaDoMes(hoje) };
  }
}

function diasEntre(de: string, ate: string): string[] {
  const dias: string[] = [];
  const fim = new Date(`${ate}T00:00:00`);
  for (let d = new Date(`${de}T00:00:00`); d <= fim; d.setDate(d.getDate() + 1))
    dias.push(dataISO(d));
  return dias;
}

/** Todos os indicadores do painel numa única consulta (a tela abre com uma requisição). */
export function montarPainel(ctx: Contexto, intervalo: { de: string; ate: string }): Painel {
  const { de, ate } = intervalo;
  const porDia = new Map(faturamentoPorDia(ctx.db, de, ate).map((p) => [p.data, p.valor]));
  // Para períodos longos (ano) o gráfico mostra os dias com venda; para curtos, preenche os vazios.
  const dias = diasEntre(de, ate);
  const serie =
    dias.length <= 62
      ? dias.map((data) => ({ data, valor: porDia.get(data) ?? 0 }))
      : [...porDia].map(([data, valor]) => ({ data, valor }));

  const ultimo = lerConfiguracao(ctx.db, 'ultimo_backup_em') || null;
  let diasDesdeBackup: number | null = null;
  if (ultimo) {
    diasDesdeBackup = Math.floor(
      (Date.now() - new Date(ultimo.replace(' ', 'T')).getTime()) / 86_400_000,
    );
  }
  return {
    periodo: { de, ate },
    vendasNoPeriodo: contarVendas(ctx.db, de, ate),
    resumo: resumoFinanceiro(ctx, de, ate),
    faturamentoPorDia: serie,
    produtosMaisVendidos: produtosMaisVendidos(ctx.db, de, ate, 5),
    materiaisEstoqueBaixo: materiaisComEstoqueBaixo(ctx.db, 8),
    ultimoBackupEm: ultimo,
    diasDesdeBackup,
    vendasPendentes: contarVendasPendentes(ctx.db),
  };
}
