import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consistente, criar, criarAmbiente, obter, type Ambiente } from './ambiente';

const LITRO = { novaUnidade: 'un', quantidadeNova: 1000, quantidadeAtual: 1_000_000 }; // 1 un = 1000 ml

describe('troca de unidade em material já usado', () => {
  let amb: Ambiente;
  let alcool: any;
  let compra: any;
  beforeEach(async () => {
    amb = await criarAmbiente();
    alcool = await criar(amb.api, '/api/materiais', {
      nome: 'Álcool de Cereais 1lt',
      unidade: 'ml',
      estoqueMinimo: 200_000,
    });
    compra = await comprar(2, 5_600);
  });
  afterEach(() => amb.limpar());

  /** Compra em litros: entra em ml. */
  const comprar = (litros: number, valorTotal: number, unidadeInformada = 'l') =>
    criar(amb.api, '/api/compras', {
      data: '2026-11-01',
      itens: [
        {
          materialId: alcool.id,
          quantidadeInformada: litros * 1000,
          unidadeInformada,
          valorTotal,
        },
      ],
    });

  async function produto(nome: string, mililitros: number) {
    const p = await criar(amb.api, '/api/produtos', { nome });
    const ficha = await criar(amb.api, `/api/produtos/${p.id}/fichas`, {
      itens: [{ materialId: alcool.id, quantidade: Math.round(mililitros * 1000) }],
      extras: [{ descricao: 'Caixa', valor: 150, tipo: 'embalagem', porUnidade: true }],
    });
    return { ...p, ficha };
  }
  const produzir = (produtoId: number, quantidade: number) =>
    criar(amb.api, '/api/producoes', { produtoId, quantidade, data: '2026-11-10' });

  const previa = (corpo: object = LITRO) =>
    criar(amb.api, `/api/materiais/${alcool.id}/trocar-unidade/previa`, corpo, 200);
  async function trocar(corpo: any = LITRO, extra: object = {}) {
    const p = await previa(corpo);
    return amb.api
      .post(`/api/materiais/${alcool.id}/trocar-unidade`)
      .send({ ...corpo, assinatura: p.assinatura, ...extra });
  }
  const material = () => obter(amb.api, `/api/materiais/${alcool.id}`);
  /** Retrato do banco, para provar que nada mudou. */
  const retrato = () =>
    JSON.stringify(
      [
        'materiais',
        'materiais_movimentos',
        'compras_itens',
        'fichas_tecnicas',
        'fichas_itens',
        'producoes_consumos',
      ].map((t) => amb.conexao.db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()),
    );
  const somaEmReais = () =>
    amb.conexao.db
      .prepare(`SELECT SUM(custo_total) FROM materiais_movimentos WHERE material_id = ?`)
      .pluck()
      .get(alcool.id);

  it('a prévia mostra antes e depois sem gravar nada', async () => {
    await produto('Home spray', 120);
    const antes = retrato();
    const p = await previa();
    expect(p.antes).toEqual({
      unidade: 'ml',
      estoque: 2_000_000,
      estoqueMinimo: 200_000,
      custoMedio: 28_000,
      valorEmEstoque: 5_600,
    });
    expect(p.depois).toEqual({
      unidade: 'un',
      estoque: 2_000,
      estoqueMinimo: 200,
      custoMedio: 28_000_000,
      valorEmEstoque: 5_600,
    });
    expect(p.receitas).toEqual([
      expect.objectContaining({
        produtoNome: 'Home spray',
        quantidadeAtual: 120_000,
        quantidadeNova: 120,
        custoAtual: 3_360_000,
        custoNovo: 3_360_000,
        desvio: 0,
        exigeDecisao: false,
      }),
    ]);
    expect(p.contagem).toEqual({ movimentos: 1, compras: 1, producoes: 0, receitasAntigas: 0 });
    expect(retrato()).toBe(antes);
  });

  it('converte tudo, bate com a prévia e mantém o dinheiro e o custo dos produtos', async () => {
    const a = await produto('Difusor', 120);
    const b = await produto('Home spray', 140);
    await produzir(a.id, 5);
    await criar(
      amb.api,
      `/api/materiais/${alcool.id}/ajuste`,
      { tipo: 'saida', quantidade: 35_000, justificativa: 'Derramou', unidade: 'ml' },
      200,
    );
    const custos = async () =>
      Promise.all(
        [a, b].map(async (p) => (await obter(amb.api, `/api/fichas/${p.ficha.id}/custo`)).custo),
      );
    const custosAntes = await custos();
    const reaisAntes = somaEmReais();
    const resumoAntes = await obter(amb.api, '/api/financeiro/resumo');
    const p = await previa();

    const r = await trocar(LITRO, { motivo: 'Conto por frasco' });
    expect(r.status).toBe(200);
    expect(r.body.dados).toMatchObject({
      unidade: 'un',
      estoqueAtual: p.depois.estoque,
      estoqueMinimo: p.depois.estoqueMinimo,
      custoMedio: p.depois.custoMedio,
    });
    expect(await custos()).toEqual(custosAntes);
    expect(somaEmReais()).toBe(reaisAntes);
    expect(await obter(amb.api, '/api/financeiro/resumo')).toEqual(resumoAntes);
    await consistente(amb.api);

    const movimentos = await obter<any[]>(amb.api, `/api/materiais/${alcool.id}/movimentos`);
    expect(movimentos.map((m) => [m.tipo, m.quantidade, m.saldoApos])).toEqual([
      ['ajuste', -35, 1_365],
      ['consumo', -600, 1_400],
      ['compra', 2_000, 2_000],
    ]);
    // Na compra, o que foi digitado continua igual; só muda o que entrou no estoque.
    expect((await obter(amb.api, `/api/compras/${compra.id}`)).itens[0]).toMatchObject({
      quantidadeInformada: 2000,
      unidadeInformada: 'l',
      valorTotal: 5_600,
      quantidadeBase: 2_000,
      unidadeBase: 'un',
      custoUnitarioFinal: 28_000_000,
    });
  });

  it('guarda backup antes e registra na auditoria o fator, o motivo e os números originais', async () => {
    const r = await trocar(LITRO, { motivo: 'Conto por frasco' });
    expect(r.status).toBe(200);
    const dados = JSON.parse(
      amb.conexao.db
        .prepare(`SELECT dados_json FROM auditoria WHERE acao = 'trocar_unidade'`)
        .pluck()
        .get() as string,
    );
    expect(dados).toMatchObject({
      de: 'ml',
      para: 'un',
      fator: { nova: 1000, atual: 1_000_000 },
      motivo: 'Conto por frasco',
    });
    expect(dados.originais.movimentos[0].slice(1)).toEqual([2_000_000, 28_000, 2_000_000, 28_000]);
    expect(dados.originais.compras[0].slice(1)).toEqual([2_000_000, 28_000]);
    expect(dados.backup).toMatch(/^pre-troca-unidade-.*\.zip$/);
    expect(fs.existsSync(`${amb.config.backupsDir}/${dados.backup}`)).toBe(true);
  });

  it('compras, produções e cancelamentos continuam funcionando depois da troca', async () => {
    const p = await produto('Difusor', 120);
    const lote = await produzir(p.id, 5);
    expect((await trocar()).status).toBe(200);

    // Compra nova: agora por unidade; litro não serve mais.
    const recusa = await amb.api.post('/api/compras').send({
      data: '2026-11-12',
      itens: [
        {
          materialId: alcool.id,
          quantidadeInformada: 1000,
          unidadeInformada: 'l',
          valorTotal: 2_800,
        },
      ],
    });
    expect(recusa.status).toBe(400);
    await comprar(1, 3_000, 'un');
    expect((await material()).estoqueAtual).toBe(1_400 + 1_000);

    const novo = await produzir(p.id, 1);
    expect(novo.consumos[0].quantidade).toBe(120);
    for (const id of [novo.id, lote.id]) {
      const r = await amb.api.post(`/api/producoes/${id}/cancelar`).send({ motivo: 'teste' });
      expect(r.status).toBe(200);
    }
    expect((await material()).estoqueAtual).toBe(3_000);
    const r = await amb.api.post(`/api/compras/${compra.id}/cancelar`).send({ motivo: 'teste' });
    expect(r.status).toBe(200);
    expect((await material()).estoqueAtual).toBe(1_000);
    await consistente(amb.api);
  });

  it('com fator que nunca dá exato, o razão fecha e os cancelamentos devolvem o que entrou', async () => {
    const p = await produto('Difusor', 141);
    const lotes = [];
    for (let i = 0; i < 4; i++) lotes.push(await produzir(p.id, 1 + (i % 2)));
    const c2 = await comprar(1.234, 4_111);
    const reais = somaEmReais();
    const fator = { novaUnidade: 'un', quantidadeNova: 1000, quantidadeAtual: 750_000 };
    expect((await trocar(fator)).status).toBe(200);
    expect(somaEmReais()).toBe(reais);
    await consistente(amb.api);
    for (const l of lotes) {
      expect((await amb.api.post(`/api/producoes/${l.id}/cancelar`).send({})).status).toBe(200);
    }
    for (const c of [c2, compra]) {
      expect((await amb.api.post(`/api/compras/${c.id}/cancelar`).send({})).status).toBe(200);
    }
    expect((await material()).estoqueAtual).toBe(0);
    await consistente(amb.api);
  });

  it('de un para ml as receitas não perdem precisão', async () => {
    const frasco = await criar(amb.api, '/api/materiais', { nome: 'Frasco', unidade: 'un' });
    await criar(amb.api, '/api/compras', {
      data: '2026-11-01',
      itens: [
        {
          materialId: frasco.id,
          quantidadeInformada: 10_000,
          unidadeInformada: 'un',
          valorTotal: 3_333,
        },
      ],
    });
    const p = await criar(amb.api, '/api/produtos', { nome: 'Kit' });
    await criar(amb.api, `/api/produtos/${p.id}/fichas`, {
      itens: [{ materialId: frasco.id, quantidade: 1_500 }],
    });
    const corpo = { novaUnidade: 'ml', quantidadeNova: 200_000, quantidadeAtual: 1000 };
    const url = `/api/materiais/${frasco.id}/trocar-unidade`;
    const v = await criar(amb.api, `${url}/previa`, corpo, 200);
    expect(v.receitas[0]).toMatchObject({ quantidadeNova: 300_000, desvio: 0 });
    const r = await amb.api.post(url).send({ ...corpo, assinatura: v.assinatura });
    expect(r.body.dados).toMatchObject({ unidade: 'ml', estoqueAtual: 2_000_000 });
    await consistente(amb.api);
  });

  describe('receitas que não cabem certinho', () => {
    it('exige uma decisão para cada receita e usa a quantidade escolhida', async () => {
      const spray = await produto('Home spray', 2.5);
      const gota = await produto('Gotas', 0.4);
      const ok = await produto('Difusor', 120);
      const p = await previa();
      expect(p.receitas.map((r: any) => [r.produtoNome, r.quantidadeNova, r.exigeDecisao])).toEqual(
        [
          ['Difusor', 120, false],
          ['Gotas', 0, true],
          ['Home spray', 3, true],
        ],
      );

      const antes = retrato();
      const sem = await trocar();
      expect(sem.status).toBe(400);
      expect(sem.body.erro.mensagem).toMatch(/receita de Gotas/);
      const zero = await trocar(LITRO, {
        receitas: [
          { fichaId: spray.ficha.id, quantidade: 3 },
          { fichaId: gota.ficha.id, quantidade: 0 },
        ],
      });
      expect(zero.status).toBe(422);
      const aMais = await trocar(LITRO, {
        receitas: [
          { fichaId: spray.ficha.id, quantidade: 3 },
          { fichaId: gota.ficha.id, quantidade: 1 },
          { fichaId: ok.ficha.id, quantidade: 500 },
        ],
      });
      expect(aMais.status).toBe(400);
      expect(retrato()).toBe(antes);

      const r = await trocar(LITRO, {
        receitas: [
          { fichaId: spray.ficha.id, quantidade: 5 },
          { fichaId: gota.ficha.id, quantidade: 1 },
        ],
      });
      expect(r.status).toBe(200);
      const q = async (id: number) =>
        (await obter(amb.api, `/api/produtos/${id}/ficha-ativa`)).itens[0].quantidade;
      expect([await q(spray.id), await q(gota.id), await q(ok.id)]).toEqual([5, 1, 120]);
      const dados = JSON.parse(
        amb.conexao.db
          .prepare(`SELECT dados_json FROM auditoria WHERE acao = 'trocar_unidade'`)
          .pluck()
          .get() as string,
      );
      expect(dados.receitasDecididas).toEqual([
        {
          fichaId: gota.ficha.id,
          quantidadeAtual: 400,
          convertida: 1,
          escolhida: 1,
          novaFichaId: null,
        },
        {
          fichaId: spray.ficha.id,
          quantidadeAtual: 2_500,
          convertida: 3,
          escolhida: 5,
          novaFichaId: null,
        },
      ]);
    });

    it('receita já usada em produção ganha versão nova com a quantidade escolhida', async () => {
      const p = await produto('Home spray', 2.5);
      const lote = await produzir(p.id, 2);
      const r = await trocar(LITRO, { receitas: [{ fichaId: p.ficha.id, quantidade: 4 }] });
      expect(r.status).toBe(200);
      const versoes = await obter<any[]>(amb.api, `/api/produtos/${p.id}/fichas`);
      expect(versoes.map((f) => [f.versao, f.ativa, f.itens[0].quantidade])).toEqual([
        [2, true, 4],
        [1, false, 3],
      ]);
      expect(versoes[0].extras[0]).toMatchObject({ descricao: 'Caixa', valor: 150 });
      expect((await obter(amb.api, `/api/producoes/${lote.id}`)).fichaId).toBe(p.ficha.id);
      await consistente(amb.api);
    });
  });

  describe('recusas (nada é gravado)', () => {
    it('prévia desatualizada: algo mudou entre ver e confirmar', async () => {
      const p = await previa();
      await comprar(1, 3_000);
      const antes = retrato();
      const r = await amb.api
        .post(`/api/materiais/${alcool.id}/trocar-unidade`)
        .send({ ...LITRO, assinatura: p.assinatura });
      expect(r.status).toBe(409);
      expect(r.body.erro.codigo).toBe('PREVIA_DESATUALIZADA');
      // Trocar o fator depois de ver a prévia também não vale.
      const outro = await amb.api
        .post(`/api/materiais/${alcool.id}/trocar-unidade`)
        .send({ ...LITRO, quantidadeAtual: 500_000, assinatura: (await previa()).assinatura });
      expect(outro.body.erro.codigo).toBe('PREVIA_DESATUALIZADA');
      expect(retrato()).toBe(antes);
    });

    it('mesma unidade, unidade desconhecida, fator inválido ou que zeraria estoque e custo', async () => {
      const url = `/api/materiais/${alcool.id}/trocar-unidade/previa`;
      const status = async (c: object) => (await amb.api.post(url).send(c)).status;
      expect(await status({ ...LITRO, novaUnidade: 'ml' })).toBe(400);
      expect(await status({ ...LITRO, novaUnidade: 'l' })).toBe(422);
      expect(await status({ ...LITRO, quantidadeAtual: 0 })).toBe(422);
      expect(await status({ ...LITRO, quantidadeNova: 1, quantidadeAtual: 1e9 })).toBe(400);
      expect(await status({ ...LITRO, quantidadeNova: 1e9, quantidadeAtual: 1 })).toBe(400);
      expect(
        (await amb.api.post('/api/materiais/999/trocar-unidade/previa').send(LITRO)).status,
      ).toBe(404);
    });

    it('falha no meio da conversão desfaz tudo', async () => {
      const p = await produto('Difusor', 120);
      await produzir(p.id, 2);
      const antes = retrato();
      amb.conexao.db.exec(
        `CREATE TRIGGER falha BEFORE UPDATE ON producoes_consumos
         BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`,
      );
      expect((await trocar()).status).toBeGreaterThanOrEqual(400);
      amb.conexao.db.exec('DROP TRIGGER falha');
      expect(retrato()).toBe(antes);
      const n = amb.conexao.db
        .prepare(`SELECT COUNT(*) FROM auditoria WHERE acao = 'trocar_unidade'`)
        .pluck()
        .get();
      expect(n).toBe(0);
      expect((await trocar()).status).toBe(200);
    });

    it('se o backup falhar, nada é alterado', async () => {
      const antes = retrato();
      fs.rmSync(amb.config.backupsDir, { recursive: true, force: true });
      fs.writeFileSync(amb.config.backupsDir, 'no lugar da pasta');
      const r = await trocar();
      expect(r.status).toBe(409);
      expect(r.body.erro.codigo).toBe('BACKUP_FALHOU');
      expect(retrato()).toBe(antes);
    });

    it('tela aberta com a unidade antiga não grava receita nem ajuste', async () => {
      const p = await produto('Difusor', 120);
      expect((await trocar()).status).toBe(200);
      const receita = await amb.api.put(`/api/fichas/${p.ficha.id}`).send({
        itens: [{ materialId: alcool.id, quantidade: 120_000, unidade: 'ml' }],
      });
      expect(receita.status).toBe(409);
      expect(receita.body.erro.codigo).toBe('UNIDADE_DESATUALIZADA');
      const ajuste = await amb.api.post(`/api/materiais/${alcool.id}/ajuste`).send({
        tipo: 'saida',
        quantidade: 1_000,
        justificativa: 'Perda',
        unidade: 'ml',
      });
      expect(ajuste.body.erro.codigo).toBe('UNIDADE_DESATUALIZADA');
      const certa = await amb.api.put(`/api/fichas/${p.ficha.id}`).send({
        itens: [{ materialId: alcool.id, quantidade: 130, unidade: 'un' }],
      });
      expect(certa.status).toBe(200);
    });
  });
});
