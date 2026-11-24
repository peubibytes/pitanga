import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criar, criarAmbiente, obter, type Ambiente } from './ambiente';

describe('gestão de categorias', () => {
  let amb: Ambiente;
  beforeEach(async () => {
    amb = await criarAmbiente();
  });
  afterEach(() => amb.limpar());

  const nova = (nome: string, tipo: 'produto' | 'material' = 'produto') =>
    criar(amb.api, '/api/categorias', { nome, tipo });
  const listar = (tipo: string) => obter<any[]>(amb.api, `/api/categorias?tipo=${tipo}`);
  const auditoria = (id: number) =>
    (
      amb.conexao.db
        .prepare(
          `SELECT acao, dados_json AS dados FROM auditoria
            WHERE entidade = 'categoria' AND entidade_id = ? ORDER BY id`,
        )
        .all(id) as { acao: string; dados: string }[]
    ).map((a) => ({ acao: a.acao, ...JSON.parse(a.dados) }));

  it('cria, renomeia e remove uma categoria vazia, com auditoria de cada passo', async () => {
    const c = await nova('Caixas');
    expect(c).toMatchObject({ nome: 'Caixas', tipo: 'produto', emUso: 0 });

    const r = await amb.api.put(`/api/categorias/${c.id}`).send({ nome: '  Caixas para pintar ' });
    expect(r.status).toBe(200);
    expect(r.body.dados).toMatchObject({ id: c.id, nome: 'Caixas para pintar', tipo: 'produto' });

    const d = await amb.api.delete(`/api/categorias/${c.id}`);
    expect(d.status).toBe(200);
    expect(d.body.dados).toEqual({ id: c.id, movidos: 0 });
    expect((await listar('produto')).map((x) => x.id)).not.toContain(c.id);

    expect(auditoria(c.id)).toEqual([
      { acao: 'criar', nome: 'Caixas', tipo: 'produto' },
      { acao: 'editar', tipo: 'produto', de: 'Caixas', para: 'Caixas para pintar' },
      { acao: 'excluir', nome: 'Caixas para pintar', tipo: 'produto' },
    ]);
  });

  it('recusa nome repetido no mesmo tipo, sem distinguir maiúsculas nem acentos', async () => {
    const c = await nova('Bandejas de gesso');
    for (const nome of ['bandejas de gesso', 'BANDEJAS DE GESSO', ' Bandejas de géssó ']) {
      const r = await amb.api.post('/api/categorias').send({ nome, tipo: 'produto' });
      expect(r.status).toBe(400);
    }
    const r = await amb.api.put(`/api/categorias/${c.id}`).send({ nome: 'velas' });
    expect(r.status).toBe(400);
    expect(r.body.erro.mensagem).toMatch(/Já existe/);
    // Mudar só a grafia da própria categoria é permitido, e o outro tipo pode repetir o nome.
    const grafia = await amb.api.put(`/api/categorias/${c.id}`).send({ nome: 'BANDEJAS de Gesso' });
    expect(grafia.status).toBe(200);
    await nova('Bandejas de gesso', 'material');
  });

  it('valida o nome e o identificador', async () => {
    const c = await nova('Temporária');
    expect((await amb.api.put(`/api/categorias/${c.id}`).send({ nome: '  ' })).status).toBe(422);
    expect((await amb.api.put('/api/categorias/99999').send({ nome: 'X' })).status).toBe(404);
    expect((await amb.api.delete('/api/categorias/99999')).status).toBe(404);
  });

  it.each(['produto', 'material'] as const)(
    'categoria de %s em uso só sai movendo os itens, ativos ou não',
    async (tipo) => {
      const rota = tipo === 'produto' ? '/api/produtos' : '/api/materiais';
      const origem = await nova('De saída', tipo);
      const destino = await nova('Destino', tipo);
      const ids: number[] = [];
      for (const ativo of [true, false]) {
        const item = await criar(amb.api, rota, {
          nome: `Item ${ativo}`,
          unidade: 'un',
          categoriaId: origem.id,
          ativo,
        });
        ids.push(item.id);
      }
      expect((await listar(tipo)).find((c) => c.id === origem.id).emUso).toBe(2);

      const recusa = await amb.api.delete(`/api/categorias/${origem.id}`);
      expect(recusa.status).toBe(409);
      expect(recusa.body.erro).toMatchObject({
        codigo: 'CATEGORIA_EM_USO',
        detalhes: { itens: 2 },
      });

      const r = await amb.api.delete(`/api/categorias/${origem.id}?moverPara=${destino.id}`);
      expect(r.status).toBe(200);
      expect(r.body.dados.movidos).toBe(2);
      for (const id of ids) {
        expect((await obter(amb.api, `${rota}/${id}`)).categoriaId).toBe(destino.id);
      }
      expect(auditoria(origem.id).at(-1)).toEqual({
        acao: 'excluir',
        nome: 'De saída',
        tipo,
        movidosPara: { id: destino.id, nome: 'Destino' },
        itens: ids,
      });
    },
  );

  it('recusa mover para a própria categoria, para outro tipo ou para uma que não existe', async () => {
    const c = await nova('Origem');
    const outra = await nova('De material', 'material');
    await criar(amb.api, '/api/produtos', { nome: 'P', categoriaId: c.id });
    for (const [destino, status] of [
      [c.id, 400],
      [outra.id, 400],
      [99_999, 404],
    ]) {
      const r = await amb.api.delete(`/api/categorias/${c.id}?moverPara=${destino}`);
      expect(r.status).toBe(status);
    }
    expect((await listar('produto')).find((x) => x.id === c.id).emUso).toBe(1);
  });

  it('se a remoção falhar no meio, nenhum item é movido', async () => {
    const origem = await nova('Origem');
    const destino = await nova('Destino');
    const p = await criar(amb.api, '/api/produtos', { nome: 'P', categoriaId: origem.id });
    amb.conexao.db.exec(
      `CREATE TRIGGER falha BEFORE DELETE ON categorias BEGIN SELECT RAISE(ABORT, 'simulada'); END`,
    );
    const r = await amb.api.delete(`/api/categorias/${origem.id}?moverPara=${destino.id}`);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect((await obter(amb.api, `/api/produtos/${p.id}`)).categoriaId).toBe(origem.id);
  });

  it('categorias de fábrica removidas não voltam ao reiniciar', async () => {
    const [velas] = (await listar('produto')).filter((c) => c.nome === 'Velas');
    expect((await amb.api.delete(`/api/categorias/${velas.id}`)).status).toBe(200);
    const { migrar } = await import('../db/migrate');
    migrar(amb.conexao.db);
    expect((await listar('produto')).map((c) => c.nome)).not.toContain('Velas');
  });
});
