import express, { Router } from 'express';
import { hojeISO } from '@pitanga/shared';
import { z } from 'zod';
import { removerFoto, salvarFoto, TAMANHO_MAXIMO_FOTO } from '../arquivos/fotos';
import * as fichas from '../services/fichas.service';
import * as despesas from '../services/despesas.service';
import * as producao from '../services/producao.service';
import * as produtos from '../services/produtos.service';
import { RegistroNaoEncontrado } from '../erros';
import { type Dependencias, consulta, ctxDe, idDe, lista, ok, paginaPadrao } from './helpers';

export function producaoRoutes(deps: Dependencias): Router {
  const r = Router();

  /* --------------------------------- produtos --------------------------------- */
  r.get('/produtos', (req, res) => {
    const f = z
      .object({
        busca: consulta.texto,
        categoria: consulta.inteiroOpcional,
        ativo: consulta.booleano,
        comEstoque: consulta.booleano,
        ...paginaPadrao.shape,
      })
      .parse(req.query);
    lista(
      res,
      produtos.listarProdutos(ctxDe(deps, req), { ...f, categoriaId: f.categoria }),
      f.pagina,
      f.porPagina,
    );
  });
  r.post('/produtos', (req, res) =>
    ok(res, produtos.criarProduto(ctxDe(deps, req), req.body), 201),
  );
  r.get('/produtos/:id', (req, res) => ok(res, produtos.obterProduto(ctxDe(deps, req), idDe(req))));
  r.put('/produtos/:id', (req, res) =>
    ok(res, produtos.atualizarProduto(ctxDe(deps, req), idDe(req), req.body)),
  );
  r.get('/produtos/:id/movimentos', (req, res) => {
    const f = paginaPadrao.parse(req.query);
    lista(
      res,
      produtos.listarMovimentos(ctxDe(deps, req), idDe(req), f.pagina, f.porPagina),
      f.pagina,
      f.porPagina,
    );
  });
  r.post('/produtos/:id/ajuste', (req, res) =>
    ok(res, produtos.ajustarEstoqueProduto(ctxDe(deps, req), idDe(req), req.body)),
  );

  // Foto: corpo binário (image/*), redimensionado para 1024 px e convertido para WebP.
  r.post(
    '/produtos/:id/foto',
    express.raw({ type: ['image/*', 'application/octet-stream'], limit: TAMANHO_MAXIMO_FOTO }),
    async (req, res) => {
      const ctx = ctxDe(deps, req);
      const id = idDe(req);
      produtos.obterProduto(ctx, id);
      const arquivo = await salvarFoto(
        deps.config.fotosDir,
        Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      );
      const { anterior } = produtos.definirFoto(ctx, id, arquivo);
      await removerFoto(deps.config.fotosDir, anterior);
      ok(res, produtos.obterProduto(ctx, id));
    },
  );
  r.delete('/produtos/:id/foto', async (req, res) => {
    const ctx = ctxDe(deps, req);
    const { anterior } = produtos.definirFoto(ctx, idDe(req), null);
    await removerFoto(deps.config.fotosDir, anterior);
    ok(res, produtos.obterProduto(ctx, idDe(req)));
  });

  /* ------------------------------- fichas técnicas ------------------------------- */
  r.get('/produtos/:id/fichas', (req, res) =>
    ok(res, fichas.listarFichasDoProduto(ctxDe(deps, req), idDe(req))),
  );
  r.post('/produtos/:id/fichas', (req, res) =>
    ok(res, fichas.criarFicha(ctxDe(deps, req), idDe(req), req.body), 201),
  );
  r.get('/produtos/:id/ficha-ativa', (req, res) => {
    const ficha = fichas.fichaAtiva(ctxDe(deps, req), idDe(req));
    if (!ficha) throw new RegistroNaoEncontrado('Ficha técnica');
    ok(res, ficha);
  });
  r.get('/fichas/:id', (req, res) => ok(res, fichas.obterFicha(ctxDe(deps, req), idDe(req))));
  r.put('/fichas/:id', (req, res) =>
    ok(res, fichas.editarFicha(ctxDe(deps, req), idDe(req), req.body)),
  );
  r.get('/fichas/:id/custo', (req, res) => {
    const { quantidade } = z.object({ quantidade: consulta.inteiroOpcional }).parse(req.query);
    ok(res, fichas.custoDaFicha(ctxDe(deps, req), idDe(req), quantidade));
  });

  /* -------------------------------- precificação -------------------------------- */
  r.post('/precificacao/calcular', (req, res) => ok(res, fichas.calcularPrecificacao(req.body)));
  r.post('/precificacao', (req, res) =>
    ok(res, fichas.registrarPrecificacao(ctxDe(deps, req), req.body), 201),
  );
  r.get('/produtos/:id/precificacoes', (req, res) =>
    ok(res, fichas.listarPrecificacoes(ctxDe(deps, req), idDe(req))),
  );

  /* ------------------------------ despesas compartilhadas ------------------------------ */
  r.get('/despesas-compartilhadas', (req, res) =>
    ok(res, despesas.listarDespesas(ctxDe(deps, req))),
  );
  r.post('/despesas-compartilhadas', (req, res) =>
    ok(res, despesas.criarDespesa(ctxDe(deps, req), req.body), 201),
  );
  r.get('/despesas-compartilhadas/:id', (req, res) =>
    ok(res, despesas.obterDespesa(ctxDe(deps, req), idDe(req))),
  );
  r.post('/despesas-compartilhadas/:id/rateio', (req, res) =>
    ok(res, despesas.ratearDespesa(ctxDe(deps, req), idDe(req), req.body)),
  );
  r.post('/despesas-compartilhadas/:id/cancelar', (req, res) =>
    ok(res, despesas.cancelarDespesa(ctxDe(deps, req), idDe(req), hojeISO())),
  );

  /* ---------------------------------- produção ---------------------------------- */
  r.post('/producoes/simular', (req, res) =>
    ok(res, producao.simularProducao(ctxDe(deps, req), req.body)),
  );
  r.post('/producoes', (req, res) =>
    ok(res, producao.registrarProducao(ctxDe(deps, req), req.body), 201),
  );
  r.get('/producoes', (req, res) => {
    const f = z
      .object({
        de: consulta.data,
        ate: consulta.data,
        produto: consulta.inteiroOpcional,
        ...paginaPadrao.shape,
      })
      .parse(req.query);
    lista(
      res,
      producao.listarProducoes(ctxDe(deps, req), { ...f, produtoId: f.produto }),
      f.pagina,
      f.porPagina,
    );
  });
  r.get('/producoes/:id', (req, res) =>
    ok(res, producao.obterProducao(ctxDe(deps, req), idDe(req))),
  );
  r.post('/producoes/:id/cancelar', (req, res) =>
    ok(res, producao.cancelarProducao(ctxDe(deps, req), idDe(req), req.body)),
  );
  return r;
}
