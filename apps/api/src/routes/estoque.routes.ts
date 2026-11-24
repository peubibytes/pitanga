import { Router } from 'express';
import { STATUS_COMPRA } from '@pitanga/shared';
import { z } from 'zod';
import * as comprasRepo from '../repositories/compras.repo';
import * as compras from '../services/compras.service';
import * as materiais from '../services/materiais.service';
import * as trocaUnidade from '../services/troca-unidade.service';
import { type Dependencias, consulta, ctxDe, idDe, lista, ok, paginaPadrao } from './helpers';

export function estoqueRoutes(deps: Dependencias): Router {
  const r = Router();

  /* -------------------------------- materiais -------------------------------- */
  r.get('/materiais', (req, res) => {
    const f = z
      .object({
        busca: consulta.texto,
        categoria: consulta.inteiroOpcional,
        estoqueBaixo: consulta.booleano,
        ativo: consulta.booleano,
        ...paginaPadrao.shape,
      })
      .parse(req.query);
    lista(
      res,
      materiais.listarMateriais(ctxDe(deps, req), { ...f, categoriaId: f.categoria }),
      f.pagina,
      f.porPagina,
    );
  });
  r.post('/materiais', (req, res) =>
    ok(res, materiais.criarMaterial(ctxDe(deps, req), req.body), 201),
  );
  r.get('/materiais/:id', (req, res) =>
    ok(res, materiais.obterMaterial(ctxDe(deps, req), idDe(req))),
  );
  r.put('/materiais/:id', (req, res) =>
    ok(res, materiais.atualizarMaterial(ctxDe(deps, req), idDe(req), req.body)),
  );
  r.get('/materiais/:id/movimentos', (req, res) => {
    const f = paginaPadrao.parse(req.query);
    lista(
      res,
      materiais.listarMovimentos(ctxDe(deps, req), idDe(req), f.pagina, f.porPagina),
      f.pagina,
      f.porPagina,
    );
  });
  r.get('/materiais/:id/compras', (req, res) => {
    const ctx = ctxDe(deps, req);
    const id = idDe(req);
    ok(res, materiais.historicoDeCustos(ctx, id));
  });
  r.post('/materiais/:id/ajuste', (req, res) =>
    ok(res, materiais.ajustarEstoque(ctxDe(deps, req), idDe(req), req.body)),
  );

  r.post('/materiais/:id/trocar-unidade/previa', (req, res) =>
    ok(res, trocaUnidade.previaDaTroca(ctxDe(deps, req), idDe(req), req.body)),
  );
  r.post('/materiais/:id/trocar-unidade', (req, res) =>
    ok(res, trocaUnidade.trocarUnidade(ctxDe(deps, req), deps.config, idDe(req), req.body)),
  );

  /* --------------------------------- compras --------------------------------- */
  r.get('/compras', (req, res) => {
    const f = z
      .object({
        de: consulta.data,
        ate: consulta.data,
        fornecedor: consulta.inteiroOpcional,
        material: consulta.inteiroOpcional,
        status: z.enum(STATUS_COMPRA).optional(),
        ...paginaPadrao.shape,
      })
      .parse(req.query);
    lista(
      res,
      comprasRepo.listarCompras(ctxDe(deps, req).db, {
        ...f,
        fornecedorId: f.fornecedor,
        materialId: f.material,
      }),
      f.pagina,
      f.porPagina,
    );
  });
  r.post('/compras', (req, res) =>
    ok(res, compras.registrarCompra(ctxDe(deps, req), req.body), 201),
  );
  r.get('/compras/:id', (req, res) => ok(res, compras.obterCompra(ctxDe(deps, req), idDe(req))));
  r.post('/compras/:id/cancelar', (req, res) =>
    ok(res, compras.cancelarCompra(ctxDe(deps, req), idDe(req), req.body)),
  );
  return r;
}
