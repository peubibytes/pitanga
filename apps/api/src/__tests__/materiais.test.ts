import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criar, criarAmbiente, obter, type Ambiente } from './ambiente';

describe('edição de materiais', () => {
  let amb: Ambiente;
  beforeAll(async () => {
    amb = await criarAmbiente();
  });
  afterAll(() => amb.limpar());

  it('troca nome, categoria e estoque mínimo de um material com compras, com auditoria', async () => {
    const [categoria] = await obter<any[]>(amb.api, '/api/categorias?tipo=material');
    const m = await criar(amb.api, '/api/materiais', { nome: 'Alcol', unidade: 'ml' });
    await criar(amb.api, '/api/compras', {
      data: '2026-11-01',
      itens: [
        {
          materialId: m.id,
          quantidadeInformada: 1000,
          unidadeInformada: 'l',
          valorTotal: 2_800,
        },
      ],
    });
    const r = await amb.api.put(`/api/materiais/${m.id}`).send({
      nome: 'Álcool de Cereais 1lt',
      categoriaId: categoria.id,
      unidade: 'ml',
      estoqueMinimo: 200_000,
      ativo: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.dados).toMatchObject({
      nome: 'Álcool de Cereais 1lt',
      categoriaId: categoria.id,
      estoqueMinimo: 200_000,
      estoqueAtual: 1_000_000,
      unidadeTravada: true,
    });
    const trilha = amb.conexao.db
      .prepare(`SELECT acao FROM auditoria WHERE entidade = 'material' AND entidade_id = ?`)
      .pluck()
      .all(m.id);
    expect(trilha).toEqual(['criar', 'editar']);
  });

  it('a unidade troca livremente enquanto o material não foi usado', async () => {
    const m = await criar(amb.api, '/api/materiais', { nome: 'Novo', unidade: 'ml' });
    expect(m.unidadeTravada).toBe(false);
    const r = await amb.api.put(`/api/materiais/${m.id}`).send({ nome: 'Novo', unidade: 'g' });
    expect(r.status).toBe(200);
    expect(r.body.dados.unidade).toBe('g');
  });

  it('recusa trocar a unidade de um material com movimentos', async () => {
    const m = await criar(amb.api, '/api/materiais', { nome: 'Com ajuste', unidade: 'ml' });
    await criar(
      amb.api,
      `/api/materiais/${m.id}/ajuste`,
      { tipo: 'entrada', quantidade: 1000, custoUnitario: 10_000, justificativa: 'Sobra' },
      200,
    );
    const r = await amb.api
      .put(`/api/materiais/${m.id}`)
      .send({ nome: 'Com ajuste', unidade: 'un' });
    expect(r.status).toBe(409);
    expect(r.body.erro.codigo).toBe('UNIDADE_TRAVADA');
    expect((await obter(amb.api, `/api/materiais/${m.id}`)).unidade).toBe('ml');
  });

  it('recusa trocar a unidade de um material sem movimentos mas usado em receita', async () => {
    const m = await criar(amb.api, '/api/materiais', { nome: 'Só na receita', unidade: 'ml' });
    const p = await criar(amb.api, '/api/produtos', { nome: 'Sachê' });
    await criar(amb.api, `/api/produtos/${p.id}/fichas`, {
      itens: [{ materialId: m.id, quantidade: 250_000 }],
    });
    expect((await obter(amb.api, `/api/materiais/${m.id}`)).unidadeTravada).toBe(true);
    const r = await amb.api
      .put(`/api/materiais/${m.id}`)
      .send({ nome: 'Só na receita', unidade: 'un' });
    expect(r.status).toBe(409);
    expect(r.body.erro.codigo).toBe('UNIDADE_TRAVADA');
  });
});
