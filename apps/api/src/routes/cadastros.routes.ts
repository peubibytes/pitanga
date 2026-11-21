import { Router } from 'express';
import { TIPOS_CATEGORIA } from '@pitanga/shared';
import { z } from 'zod';
import { exigirAdministradora } from '../middleware';
import * as cadastros from '../services/cadastros.service';
import * as vendas from '../repositories/vendas.repo';
import { type Dependencias, consulta, ctxDe, idDe, lista, ok, paginaPadrao } from './helpers';

const filtroLista = z.object({
  busca: consulta.texto,
  ativo: consulta.booleano,
  ...paginaPadrao.shape,
});

export function cadastrosRoutes(deps: Dependencias): Router {
  const r = Router();

  /* -------------------------------- clientes -------------------------------- */
  r.get('/clientes', (req, res) => {
    const f = filtroLista.parse(req.query);
    lista(res, cadastros.listarClientes(ctxDe(deps, req), f), f.pagina, f.porPagina);
  });
  r.post('/clientes', (req, res) =>
    ok(res, cadastros.criarCliente(ctxDe(deps, req), req.body), 201),
  );
  r.get('/clientes/:id', (req, res) =>
    ok(res, cadastros.obterCliente(ctxDe(deps, req), idDe(req))),
  );
  r.put('/clientes/:id', (req, res) =>
    ok(res, cadastros.atualizarCliente(ctxDe(deps, req), idDe(req), req.body)),
  );
  r.get('/clientes/:id/resumo', (req, res) =>
    ok(res, cadastros.resumoDoCliente(ctxDe(deps, req), idDe(req))),
  );
  r.get('/clientes/:id/compras', (req, res) => {
    const ctx = ctxDe(deps, req);
    const id = idDe(req);
    cadastros.obterCliente(ctx, id);
    const f = paginaPadrao.parse(req.query);
    lista(res, vendas.listarVendas(ctx.db, { clienteId: id, ...f }), f.pagina, f.porPagina);
  });

  /* ------------------------------- fornecedores ------------------------------- */
  r.get('/fornecedores', (req, res) => {
    const f = filtroLista.parse(req.query);
    lista(res, cadastros.listarFornecedores(ctxDe(deps, req), f), f.pagina, f.porPagina);
  });
  r.post('/fornecedores', (req, res) =>
    ok(res, cadastros.criarFornecedor(ctxDe(deps, req), req.body), 201),
  );
  r.get('/fornecedores/:id', (req, res) =>
    ok(res, cadastros.obterFornecedor(ctxDe(deps, req), idDe(req))),
  );
  r.put('/fornecedores/:id', (req, res) =>
    ok(res, cadastros.atualizarFornecedor(ctxDe(deps, req), idDe(req), req.body)),
  );

  /* ----------------------------- categorias e unidades ----------------------------- */
  r.get('/categorias', (req, res) => {
    const { tipo } = z.object({ tipo: z.enum(TIPOS_CATEGORIA).optional() }).parse(req.query);
    ok(res, cadastros.listarCategorias(ctxDe(deps, req), tipo));
  });
  r.post('/categorias', (req, res) =>
    ok(res, cadastros.criarCategoria(ctxDe(deps, req), req.body), 201),
  );
  r.get('/unidades', (req, res) => ok(res, cadastros.listarUnidades(ctxDe(deps, req))));

  /* ----------------------------------- taxas ----------------------------------- */
  r.get('/taxas', (req, res) => ok(res, cadastros.listarTaxas(ctxDe(deps, req))));
  r.post('/taxas', exigirAdministradora, (req, res) =>
    ok(res, cadastros.criarTaxa(ctxDe(deps, req), req.body), 201),
  );
  r.put('/taxas/:id', exigirAdministradora, (req, res) =>
    ok(res, cadastros.atualizarTaxa(ctxDe(deps, req), idDe(req), req.body)),
  );

  /* -------------------------------- configurações -------------------------------- */
  r.get('/configuracoes', (req, res) => ok(res, cadastros.obterConfiguracoes(ctxDe(deps, req))));
  r.put('/configuracoes', exigirAdministradora, (req, res) =>
    ok(res, cadastros.atualizarConfiguracoes(ctxDe(deps, req), req.body)),
  );
  return r;
}
