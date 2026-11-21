import { Router } from 'express';
import { NATUREZAS, STATUS_LANCAMENTO, STATUS_VENDA, hojeISO } from '@pitanga/shared';
import { z } from 'zod';
import { exigirAdministradora } from '../middleware';
import { gerarRelatorio, NOMES_DE_RELATORIOS, paraCsv } from '../relatorios';
import * as financeiro from '../services/financeiro.service';
import { intervaloDoPeriodo, montarPainel, type PeriodoPainel } from '../services/painel.service';
import * as vendas from '../services/vendas.service';
import { type Dependencias, consulta, ctxDe, idDe, lista, ok, paginaPadrao } from './helpers';

export function vendasRoutes(deps: Dependencias): Router {
  const r = Router();

  /* ---------------------------------- vendas ---------------------------------- */
  r.post('/vendas', (req, res) => ok(res, vendas.registrarVenda(ctxDe(deps, req), req.body), 201));
  r.get('/vendas', (req, res) => {
    const f = z
      .object({
        de: consulta.data,
        ate: consulta.data,
        cliente: consulta.inteiroOpcional,
        status: z.enum(STATUS_VENDA).optional(),
        busca: consulta.texto,
        ...paginaPadrao.shape,
      })
      .parse(req.query);
    lista(
      res,
      vendas.listarVendas(ctxDe(deps, req), { ...f, clienteId: f.cliente }),
      f.pagina,
      f.porPagina,
    );
  });
  r.get('/vendas/:id', (req, res) => ok(res, vendas.obterVenda(ctxDe(deps, req), idDe(req))));
  r.post('/vendas/:id/recebimentos', (req, res) =>
    ok(res, vendas.registrarRecebimento(ctxDe(deps, req), idDe(req), req.body), 201),
  );
  r.post('/vendas/:id/cancelar', (req, res) =>
    ok(res, vendas.cancelarVenda(ctxDe(deps, req), idDe(req), req.body)),
  );

  /* --------------------------------- financeiro --------------------------------- */
  r.get('/financeiro/lancamentos', (req, res) => {
    const f = z
      .object({
        de: consulta.data,
        ate: consulta.data,
        natureza: z.enum(NATUREZAS).optional(),
        status: z.enum(STATUS_LANCAMENTO).optional(),
        busca: consulta.texto,
        ...paginaPadrao.shape,
      })
      .parse(req.query);
    lista(res, financeiro.listarLancamentos(ctxDe(deps, req), f), f.pagina, f.porPagina);
  });
  r.post('/financeiro/lancamentos', (req, res) =>
    ok(res, financeiro.criarLancamentoManual(ctxDe(deps, req), req.body), 201),
  );
  r.post('/financeiro/lancamentos/:id/realizar', (req, res) =>
    ok(res, financeiro.realizarLancamento(ctxDe(deps, req), idDe(req), req.body)),
  );
  r.post('/financeiro/lancamentos/:id/cancelar', (req, res) =>
    ok(res, financeiro.cancelarLancamento(ctxDe(deps, req), idDe(req))),
  );
  r.get('/financeiro/resumo', (req, res) => {
    const { de, ate } = z.object({ de: consulta.data, ate: consulta.data }).parse(req.query);
    ok(res, financeiro.resumoFinanceiro(ctxDe(deps, req), de ?? null, ate ?? null));
  });
  r.get('/financeiro/caixa', (req, res) => {
    const { de, ate } = z.object({ de: consulta.data, ate: consulta.data }).parse(req.query);
    const hoje = hojeISO();
    ok(res, financeiro.caixaDiario(ctxDe(deps, req), de ?? `${hoje.slice(0, 7)}-01`, ate ?? hoje));
  });

  /* ----------------------------------- painel ----------------------------------- */
  r.get('/painel', (req, res) => {
    const q = z
      .object({
        periodo: z.enum(['hoje', 'semana', 'mes', 'ano']).default('mes'),
        de: consulta.data,
        ate: consulta.data,
      })
      .parse(req.query);
    const intervalo =
      q.de && q.ate ? { de: q.de, ate: q.ate } : intervaloDoPeriodo(q.periodo as PeriodoPainel);
    ok(res, montarPainel(ctxDe(deps, req), intervalo));
  });

  /* --------------------------------- relatórios --------------------------------- */
  r.get('/relatorios', (_req, res) => ok(res, NOMES_DE_RELATORIOS));
  r.get('/relatorios/:nome', (req, res) => {
    const q = z
      .object({
        de: consulta.data,
        ate: consulta.data,
        formato: z.enum(['json', 'csv']).default('json'),
      })
      .parse(req.query);
    const nome = String(req.params.nome);
    const relatorio = gerarRelatorio(ctxDe(deps, req).db, nome, q);
    if (q.formato === 'csv') {
      res
        .status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="${nome}-${hojeISO()}.csv"`)
        .send(paraCsv(relatorio));
      return;
    }
    ok(res, relatorio);
  });
  return r;
}

export { exigirAdministradora };
