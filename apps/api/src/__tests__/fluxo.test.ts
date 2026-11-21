import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consistente, criar, criarAmbiente, obter, type Ambiente } from './ambiente';

const DATA = '2026-11-10';

describe('compra, custo médio e estoque (seção 6.1)', () => {
  let amb: Ambiente;
  let essencia: any;
  beforeAll(async () => {
    amb = await criarAmbiente();
    essencia = await criar(amb.api, '/api/materiais', {
      nome: 'Essência',
      unidade: 'ml',
      estoqueMinimo: 100_000,
    });
  });
  afterAll(() => amb.limpar());

  it('reproduz o exemplo: 500 ml a R$ 0,18 + 1 L por R$ 150 com R$ 10 de transporte → R$ 0,166667/ml', async () => {
    await criar(amb.api, '/api/compras', {
      data: '2026-11-01',
      itens: [
        {
          materialId: essencia.id,
          quantidadeInformada: 500_000,
          unidadeInformada: 'ml',
          valorTotal: 9_000,
        },
      ],
    });
    expect((await obter(amb.api, `/api/materiais/${essencia.id}`)).custoMedio).toBe(180_000);

    const compra = await criar(amb.api, '/api/compras', {
      data: DATA,
      itens: [
        {
          materialId: essencia.id,
          quantidadeInformada: 1000,
          unidadeInformada: 'l',
          valorTotal: 15_000,
        },
      ],
      despesas: [{ tipo: 'transporte', valor: 1_000, rateio: 'por_valor' }],
    });
    expect(compra.itens[0]).toMatchObject({
      quantidadeBase: 1_000_000,
      fatorConversao: 1000,
      despesaRateada: 1_000,
      custoUnitarioFinal: 160_000,
    });
    expect(compra.total).toBe(16_000);

    const m = await obter(amb.api, `/api/materiais/${essencia.id}`);
    expect(m).toMatchObject({ estoqueAtual: 1_500_000, custoMedio: 166_667 });

    const movimentos = await obter<any[]>(amb.api, `/api/materiais/${essencia.id}/movimentos`);
    expect(movimentos[0]).toMatchObject({ tipo: 'compra', saldoApos: 1_500_000 });
    const historico = await obter<any[]>(amb.api, `/api/materiais/${essencia.id}/compras`);
    expect(historico.map((h) => h.custoUnitarioFinal)).toEqual([180_000, 160_000]);
  });

  it('a compra de matéria-prima movimenta o caixa mas não o resultado', async () => {
    const resumo = await obter(amb.api, '/api/financeiro/resumo');
    expect(resumo).toMatchObject({ lucroPrejuizo: 0, despesasPagas: 0, variacaoCaixa: -25_000 });
    await consistente(amb.api);
  });

  it('exige unidade compatível e fator para caixa', async () => {
    const r1 = await amb.api.post('/api/compras').send({
      data: DATA,
      itens: [
        {
          materialId: essencia.id,
          quantidadeInformada: 1000,
          unidadeInformada: 'kg',
          valorTotal: 100,
        },
      ],
    });
    expect(r1.status).toBe(400);
    const r2 = await amb.api.post('/api/compras').send({
      data: DATA,
      itens: [
        {
          materialId: essencia.id,
          quantidadeInformada: 1000,
          unidadeInformada: 'cx',
          valorTotal: 100,
        },
      ],
    });
    expect(r2.status).toBe(400);
    expect(r2.body.erro.mensagem).toMatch(/caixa/);
  });

  it('despesa que não compõe o custo vira despesa à parte e a conta ainda fecha', async () => {
    const antes = await obter(amb.api, '/api/financeiro/resumo');
    await criar(amb.api, '/api/compras', {
      data: DATA,
      itens: [
        {
          materialId: essencia.id,
          quantidadeInformada: 100_000,
          unidadeInformada: 'ml',
          valorTotal: 1_800,
        },
      ],
      despesas: [{ tipo: 'estacionamento', valor: 700, rateio: 'nao_rateia' }],
    });
    const depois = await obter(amb.api, '/api/financeiro/resumo');
    expect(depois.despesasPagas - antes.despesasPagas).toBe(700);
    expect(depois.lucroPrejuizo - antes.lucroPrejuizo).toBe(-700);
    await consistente(amb.api);
  });

  it('ajuste manual exige justificativa e gera lançamento de ajuste', async () => {
    const sem = await amb.api
      .post(`/api/materiais/${essencia.id}/ajuste`)
      .send({ tipo: 'saida', quantidade: 10_000 });
    expect(sem.status).toBe(422);
    const m = await criar(
      amb.api,
      `/api/materiais/${essencia.id}/ajuste`,
      { tipo: 'saida', quantidade: 10_000, justificativa: 'Derramou ao medir' },
      200,
    );
    expect(m.estoqueAtual).toBe(1_500_000 + 100_000 - 10_000);
    const lanc = await obter<any[]>(amb.api, '/api/financeiro/lancamentos?natureza=ajuste');
    expect(lanc[0]).toMatchObject({ tipo: 'despesa', afetaResultado: true, afetaCaixa: false });
    await consistente(amb.api);
  });

  it('cancelar compra devolve o estoque e anula o caixa; se já foi consumida, recusa', async () => {
    const m0 = await obter(amb.api, `/api/materiais/${essencia.id}`);
    const caixa0 = (await obter(amb.api, '/api/financeiro/resumo')).saldoCaixa;
    const compra = await criar(amb.api, '/api/compras', {
      data: DATA,
      itens: [
        {
          materialId: essencia.id,
          quantidadeInformada: 200_000,
          unidadeInformada: 'ml',
          valorTotal: 5_000,
        },
      ],
    });
    const c = await criar(
      amb.api,
      `/api/compras/${compra.id}/cancelar`,
      { motivo: 'Pedido errado' },
      200,
    );
    expect(c.status).toBe('cancelada');
    const m1 = await obter(amb.api, `/api/materiais/${essencia.id}`);
    expect(m1.estoqueAtual).toBe(m0.estoqueAtual);
    expect(m1.custoMedio).toBeGreaterThanOrEqual(m0.custoMedio - 1);
    expect(m1.custoMedio).toBeLessThanOrEqual(m0.custoMedio + 1);
    expect((await obter(amb.api, '/api/financeiro/resumo')).saldoCaixa).toBe(caixa0);
    expect((await amb.api.post(`/api/compras/${compra.id}/cancelar`).send({})).status).toBe(409);
    await consistente(amb.api);
  });
});

describe('ciclo completo: comprar → produzir → vender → receber (seção 7.2)', () => {
  let amb: Ambiente;
  let insumo: any;
  let produto: any;
  let cliente: any;

  beforeAll(async () => {
    amb = await criarAmbiente();
    insumo = await criar(amb.api, '/api/materiais', { nome: 'Insumo do difusor', unidade: 'un' });
    const extra = await criar(amb.api, '/api/materiais', { nome: 'Estoque parado', unidade: 'un' });
    produto = await criar(amb.api, '/api/produtos', { nome: 'Difusor 200 ml' });
    cliente = await criar(amb.api, '/api/clientes', { nome: 'Cliente Teste' });
    // R$ 500,00 de compras à vista: R$ 317,00 de insumo (20 un a R$ 15,85) + R$ 183,00 de estoque parado
    await criar(amb.api, '/api/compras', {
      data: DATA,
      itens: [
        {
          materialId: insumo.id,
          quantidadeInformada: 20_000,
          unidadeInformada: 'un',
          valorTotal: 31_700,
        },
        {
          materialId: extra.id,
          quantidadeInformada: 10_000,
          unidadeInformada: 'un',
          valorTotal: 18_300,
        },
      ],
    });
    await criar(amb.api, `/api/produtos/${produto.id}/fichas`, {
      rendimento: 1,
      itens: [{ materialId: insumo.id, quantidade: 1000 }],
    });
  });
  afterAll(() => amb.limpar());

  it('produzir 20 move os dois estoques e fotografa o custo, sem lançamento financeiro', async () => {
    const lancamentosAntes = (await amb.api.get('/api/financeiro/lancamentos')).body.paginacao
      .total;
    const sim = await criar(
      amb.api,
      '/api/producoes/simular',
      { produtoId: produto.id, quantidade: 20 },
      200,
    );
    expect(sim).toMatchObject({
      possivel: true,
      custoMateriais: 31_700,
      custoEstoqueTotal: 31_700,
    });

    const producao = await criar(amb.api, '/api/producoes', {
      produtoId: produto.id,
      quantidade: 20,
      data: DATA,
    });
    expect(producao).toMatchObject({
      custoMateriais: 31_700,
      custoTotal: 31_700,
      custoEstoqueTotal: 31_700,
      custoEstoqueUnitario: 15_850_000,
      remunerouMaoObra: false,
    });
    expect(producao.consumos).toHaveLength(1);
    expect((await obter(amb.api, `/api/materiais/${insumo.id}`)).estoqueAtual).toBe(0);
    expect(await obter(amb.api, `/api/produtos/${produto.id}`)).toMatchObject({
      estoqueAtual: 20,
      custoProducao: 15_850_000,
    });
    expect((await amb.api.get('/api/financeiro/lancamentos')).body.paginacao.total).toBe(
      lancamentosAntes,
    );
  });

  it('vender 10 a R$ 36,90 recebidos na hora: caixa −131,00, resultado +210,50, estoque +341,50', async () => {
    const venda = await criar(amb.api, '/api/vendas', {
      clienteId: cliente.id,
      data: DATA,
      itens: [{ produtoId: produto.id, quantidade: 10, precoUnitario: 3_690 }],
      formaPagamento: 'pix',
    });
    expect(venda).toMatchObject({
      total: 36_900,
      cmv: 15_850,
      lucroEstimado: 21_050,
      status: 'concluida',
      recebido: 36_900,
    });
    expect(venda.itens[0]).toMatchObject({ custoUnitario: 15_850_000, custoTotal: 15_850 });

    const r = await obter(amb.api, '/api/financeiro/resumo?de=2026-11-01&ate=2026-11-30');
    expect(r).toMatchObject({
      faturamento: 36_900,
      recebido: 36_900,
      custoProdutosVendidos: 15_850,
      lucroPrejuizo: 21_050,
      variacaoCaixa: -13_100,
      saldoCaixa: -13_100,
      despesasPagas: 0,
      contasAReceber: 0,
    });
    // O resumo exige que a conferência da seção 7.2 feche (invariante 10).
    await consistente(amb.api);
    expect((await obter(amb.api, `/api/produtos/${produto.id}`)).estoqueAtual).toBe(10);
  });

  it('venda pendente: dois recebimentos parciais quitam sem alterar o faturamento', async () => {
    const antes = await obter(amb.api, '/api/financeiro/resumo');
    const venda = await criar(amb.api, '/api/vendas', {
      clienteId: cliente.id,
      data: DATA,
      itens: [{ produtoId: produto.id, quantidade: 2, precoUnitario: 3_690 }],
      valorRecebido: 0,
    });
    expect(venda).toMatchObject({ status: 'pendente', recebido: 0, total: 7_380 });
    let r = await obter(amb.api, '/api/financeiro/resumo');
    expect(r.faturamento - antes.faturamento).toBe(7_380);
    expect(r.contasAReceber).toBe(7_380);
    expect(r.variacaoCaixa).toBe(antes.variacaoCaixa);
    const resumoCliente = await obter(amb.api, `/api/clientes/${cliente.id}/resumo`);
    expect(resumoCliente.totalPendente).toBe(7_380);

    await criar(amb.api, `/api/vendas/${venda.id}/recebimentos`, { data: DATA, valor: 3_000 });
    const meio = await obter(amb.api, `/api/vendas/${venda.id}`);
    expect(meio.status).toBe('pendente');
    const final = await criar(amb.api, `/api/vendas/${venda.id}/recebimentos`, {
      data: DATA,
      valor: 4_380,
    });
    expect(final).toMatchObject({ status: 'concluida', recebido: 7_380 });
    r = await obter(amb.api, '/api/financeiro/resumo');
    expect(r.faturamento - antes.faturamento).toBe(7_380); // a receita não duplicou
    expect(r.contasAReceber).toBe(0);
    expect(r.variacaoCaixa - antes.variacaoCaixa).toBe(7_380);

    const excedente = await amb.api
      .post(`/api/vendas/${venda.id}/recebimentos`)
      .send({ data: DATA, valor: 1 });
    expect(excedente.status).toBe(409);
    await consistente(amb.api);
  });

  it('cancelar a venda devolve o estoque ao custo original e zera os efeitos', async () => {
    const antes = await obter(amb.api, '/api/financeiro/resumo');
    const estoque0 = (await obter(amb.api, `/api/produtos/${produto.id}`)).estoqueAtual;
    const venda = await criar(amb.api, '/api/vendas', {
      data: DATA,
      itens: [{ produtoId: produto.id, quantidade: 3, precoUnitario: 3_690 }],
      desconto: 190,
    });
    expect(venda.total).toBe(3 * 3_690 - 190);
    expect(venda.clienteId).toBeNull();
    const cancelada = await criar(
      amb.api,
      `/api/vendas/${venda.id}/cancelar`,
      { motivo: 'Desistência' },
      200,
    );
    expect(cancelada.status).toBe('cancelada');
    const depois = await obter(amb.api, '/api/financeiro/resumo');
    expect(depois).toMatchObject({
      faturamento: antes.faturamento,
      lucroPrejuizo: antes.lucroPrejuizo,
      custoProdutosVendidos: antes.custoProdutosVendidos,
      saldoCaixa: antes.saldoCaixa,
      contasAReceber: antes.contasAReceber,
    });
    const produtoDepois = await obter(amb.api, `/api/produtos/${produto.id}`);
    expect(produtoDepois.estoqueAtual).toBe(estoque0);
    expect(produtoDepois.custoProducao).toBe(15_850_000);
    expect((await amb.api.post(`/api/vendas/${venda.id}/cancelar`).send({})).status).toBe(409);
    await consistente(amb.api);
  });

  it('recusa vender mais do que há em estoque e lista o que falta', async () => {
    const r = await amb.api.post('/api/vendas').send({
      data: DATA,
      itens: [{ produtoId: produto.id, quantidade: 999, precoUnitario: 3_690 }],
    });
    expect(r.status).toBe(409);
    expect(r.body.erro.codigo).toBe('ESTOQUE_INSUFICIENTE');
    expect(r.body.erro.detalhes[0]).toMatchObject({ nome: 'Difusor 200 ml', unidade: 'un' });
    // Autorizar estoque negativo sem a configuração liberada também é recusado.
    const r2 = await amb.api.post('/api/vendas').send({
      data: DATA,
      itens: [{ produtoId: produto.id, quantidade: 999, precoUnitario: 3_690 }],
      autorizarEstoqueNegativo: true,
    });
    expect(r2.status).toBe(409);
    expect(r2.body.erro.codigo).toBe('ESTOQUE_NEGATIVO_BLOQUEADO');
  });

  it('idempotência: a mesma chave não registra duas vendas', async () => {
    const corpo = {
      data: DATA,
      itens: [{ produtoId: produto.id, quantidade: 1, precoUnitario: 3_690 }],
    };
    const a = await amb.api
      .post('/api/vendas')
      .set('Idempotency-Key', 'clique-duplo-1')
      .send(corpo);
    const b = await amb.api
      .post('/api/vendas')
      .set('Idempotency-Key', 'clique-duplo-1')
      .send(corpo);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers['idempotent-replay']).toBe('true');
    expect(b.body.dados.id).toBe(a.body.dados.id);
    const vendas = await amb.api.get('/api/vendas');
    expect(vendas.body.dados.filter((v: any) => v.id === a.body.dados.id)).toHaveLength(1);
  });

  it('produção sem material suficiente é recusada e lista exatamente o que falta', async () => {
    const r = await amb.api
      .post('/api/producoes')
      .send({ produtoId: produto.id, quantidade: 5, data: DATA });
    expect(r.status).toBe(409);
    expect(r.body.erro).toMatchObject({
      codigo: 'ESTOQUE_INSUFICIENTE',
      mensagem: 'Faltam 5 un de Insumo do difusor.',
    });
    expect(r.body.erro.detalhes[0]).toMatchObject({
      falta: 5_000,
      necessario: 5_000,
      disponivel: 0,
    });
  });

  it('cancelar a produção devolve materiais e retira os acabados — só se nada foi vendido', async () => {
    // Já há vendas: parte das peças saiu, então o cancelamento integral é recusado.
    const lote = (await obter<any[]>(amb.api, '/api/producoes'))[0];
    const r = await amb.api.post(`/api/producoes/${lote.id}/cancelar`).send({});
    expect(r.status).toBe(409);
    expect(r.body.erro.codigo).toBe('PRODUCAO_JA_VENDIDA');
  });
});

describe('ficha técnica, mão de obra, custo congelado e precificação', () => {
  let amb: Ambiente;
  let frasco: any;
  let oleo: any;
  let produto: any;

  beforeAll(async () => {
    amb = await criarAmbiente();
    frasco = await criar(amb.api, '/api/materiais', { nome: 'Frasco', unidade: 'un' });
    oleo = await criar(amb.api, '/api/materiais', { nome: 'Óleo', unidade: 'ml' });
    produto = await criar(amb.api, '/api/produtos', { nome: 'Difusor' });
    await criar(amb.api, '/api/compras', {
      data: DATA,
      itens: [
        {
          materialId: frasco.id,
          quantidadeInformada: 50_000,
          unidadeInformada: 'un',
          valorTotal: 20_000,
        }, // R$ 4,00/un
        {
          materialId: oleo.id,
          quantidadeInformada: 1_000,
          unidadeInformada: 'l',
          valorTotal: 2_000,
        }, // R$ 0,02/ml
      ],
    });
  });
  afterAll(() => amb.limpar());

  it('calcula o custo da ficha (materiais + mão de obra) e a ficha é versionada', async () => {
    const ficha = await criar(amb.api, `/api/produtos/${produto.id}/fichas`, {
      rendimento: 1,
      maoObraModo: 'hora',
      maoObraValorHora: 2_500,
      maoObraMinutos: 12,
      itens: [
        { materialId: frasco.id, quantidade: 1000 },
        { materialId: oleo.id, quantidade: 100_000 },
      ],
      extras: [{ descricao: 'Embalagem', valor: 150, tipo: 'embalagem', porUnidade: true }],
    });
    expect(ficha.versao).toBe(1);
    const custo = await obter(amb.api, `/api/fichas/${ficha.id}/custo`);
    // 4,00 + 2,00 (materiais) + 5,00 (mão de obra) + 1,50 (extra) = 12,50
    expect(custo.custo.custoUnitarioCentavos).toBe(1_250);
    expect(custo.custo).toMatchObject({
      unitarioMateriaisMicro: 6_000_000,
      unitarioMaoObraMicro: 5_000_000,
      unitarioExtrasMicro: 1_500_000,
    });
  });

  it('com a mão de obra não remunerada, o estoque de acabados só recebe o material', async () => {
    const lote = await criar(amb.api, '/api/producoes', {
      produtoId: produto.id,
      quantidade: 10,
      data: DATA,
    });
    expect(lote).toMatchObject({
      custoMateriais: 6_000,
      custoMaoObra: 5_000,
      custoExtras: 1_500,
      custoTotal: 12_500,
      custoEstoqueTotal: 6_000,
      remunerouMaoObra: false,
    });
    await consistente(amb.api);
  });

  it('editar uma ficha já usada cria a versão seguinte; o custo do lote antigo não muda', async () => {
    const ficha = await obter(amb.api, `/api/produtos/${produto.id}/ficha-ativa`);
    const r = await amb.api.put(`/api/fichas/${ficha.id}`).send({
      rendimento: 1,
      maoObraModo: 'nenhuma',
      itens: [{ materialId: frasco.id, quantidade: 1000 }],
    });
    expect(r.status).toBe(200);
    expect(r.body.dados.versao).toBe(2);
    const versoes = await obter<any[]>(amb.api, `/api/produtos/${produto.id}/fichas`);
    expect(versoes.map((v) => [v.versao, v.ativa])).toEqual([
      [2, true],
      [1, false],
    ]);
    const lote = (await obter<any[]>(amb.api, '/api/producoes'))[0];
    expect(lote.fichaVersao).toBe(1);
    expect(lote.custoTotal).toBe(12_500);

    // Um novo preço de compra encarece o frasco; o lote já produzido continua igual.
    await criar(amb.api, '/api/compras', {
      data: DATA,
      itens: [
        {
          materialId: frasco.id,
          quantidadeInformada: 10_000,
          unidadeInformada: 'un',
          valorTotal: 9_000,
        },
      ],
    });
    expect((await obter<any[]>(amb.api, '/api/producoes'))[0].custoTotal).toBe(12_500);
  });

  it('precificação: as três modalidades, com taxa de cartão, e aplica o preço ao produto', async () => {
    const calc = (modo: string, parametro: number) =>
      criar(
        amb.api,
        '/api/precificacao/calcular',
        { custoBase: 2_085, taxasPercentuais: 350, modo, parametro },
        200,
      );
    expect(await calc('lucro_valor', 1_500)).toMatchObject({
      precoSugerido: 3_715,
      lucroPrevisto: 1_500,
    });
    expect(await calc('acrescimo_percentual', 7_000)).toMatchObject({
      precoSugerido: 3_673,
      lucroPrevisto: 1_459,
    });
    expect(await calc('margem_percentual', 4_000)).toMatchObject({
      precoSugerido: 3_690,
      lucroPrevisto: 1_476,
    });

    const invalido = await amb.api.post('/api/precificacao/calcular').send({
      custoBase: 2_085,
      taxasPercentuais: 350,
      modo: 'margem_percentual',
      parametro: 9_650,
    });
    expect(invalido.status).toBe(400);
    expect(invalido.body.erro.mensagem).toMatch(/100%/);

    const prejuizo = await criar(
      amb.api,
      '/api/precificacao/calcular',
      {
        custoBase: 2_085,
        taxasPercentuais: 350,
        modo: 'lucro_valor',
        parametro: 0,
        precoFinal: 1_000,
      },
      200,
    );
    expect(prejuizo.prejuizo).toBe(true);

    const salvo = await criar(amb.api, '/api/precificacao', {
      produtoId: produto.id,
      modo: 'margem_percentual',
      parametro: 4_000,
      taxaIds: [1],
      precoFinal: 3_000,
      aplicarAoProduto: true,
    });
    expect(salvo).toMatchObject({
      precoFinal: 3_000,
      aplicadoAoProduto: true,
      taxasPercentuais: 350,
    });
    expect((await obter(amb.api, `/api/produtos/${produto.id}`)).precoVenda).toBe(3_000);
    expect(await obter<any[]>(amb.api, `/api/produtos/${produto.id}/precificacoes`)).toHaveLength(
      1,
    );
  });

  it('estoque negativo só passa com a configuração liberada, autorização e justificativa', async () => {
    const corpo = { produtoId: produto.id, quantidade: 1_000, data: DATA };
    expect((await amb.api.post('/api/producoes').send(corpo)).status).toBe(409);
    const bloqueado = await amb.api.post('/api/producoes').send({
      ...corpo,
      autorizarEstoqueNegativo: true,
      justificativaEstoqueNegativo: 'Compra chega amanhã',
    });
    expect(bloqueado.body.erro.codigo).toBe('ESTOQUE_NEGATIVO_BLOQUEADO');

    await amb.api.put('/api/configuracoes').send({ permite_estoque_negativo: '1' });
    const semJustificativa = await amb.api
      .post('/api/producoes')
      .send({ ...corpo, autorizarEstoqueNegativo: true });
    expect(semJustificativa.status).toBe(400);
    // 60 peças exigem 60 frascos e há 50: produz com autorização, justificativa e a configuração liberada.
    const ok = await criar(amb.api, '/api/producoes', {
      ...corpo,
      quantidade: 60,
      autorizarEstoqueNegativo: true,
      justificativaEstoqueNegativo: 'Compra chega amanhã',
    });
    expect(ok.autorizouEstoqueNegativo).toBe(true);
    expect((await obter(amb.api, `/api/materiais/${frasco.id}`)).estoqueAtual).toBe(-10_000);
    await consistente(amb.api);
    // A compra que chega cobre o saldo negativo e o custo médio passa a ser o da compra.
    await criar(amb.api, '/api/compras', {
      data: DATA,
      itens: [
        {
          materialId: frasco.id,
          quantidadeInformada: 100_000,
          unidadeInformada: 'un',
          valorTotal: 40_000,
        },
      ],
    });
    expect(await obter(amb.api, `/api/materiais/${frasco.id}`)).toMatchObject({
      estoqueAtual: 90_000,
      custoMedio: 4_000_000,
    });
    await consistente(amb.api);
  });

  it('mão de obra remunerada vira desembolso de caixa que integra o estoque (não o resultado)', async () => {
    await amb.api.put('/api/configuracoes').send({ remunera_mao_obra_propria: '1' });
    const ficha = await criar(amb.api, `/api/produtos/${produto.id}/fichas`, {
      rendimento: 2,
      maoObraModo: 'fixo',
      maoObraValorFixo: 1_000,
      itens: [{ materialId: frasco.id, quantidade: 2000 }],
    });
    expect(ficha.versao).toBe(3);
    const antes = await obter(amb.api, '/api/financeiro/resumo');
    const lote = await criar(amb.api, '/api/producoes', {
      produtoId: produto.id,
      quantidade: 4,
      data: DATA,
    });
    expect(lote).toMatchObject({ custoMaoObra: 2_000, remunerouMaoObra: true });
    expect(lote.custoEstoqueTotal).toBe(lote.custoMateriais + 2_000);
    const depois = await obter(amb.api, '/api/financeiro/resumo');
    expect(depois.variacaoCaixa - antes.variacaoCaixa).toBe(-2_000);
    expect(depois.lucroPrejuizo).toBe(antes.lucroPrejuizo);
    await consistente(amb.api);
  });
});

describe('despesas compartilhadas: um só desembolso, rateio só de custeio', () => {
  let amb: Ambiente;
  let p1: any;
  let p2: any;
  beforeAll(async () => {
    amb = await criarAmbiente();
    p1 = await criar(amb.api, '/api/produtos', { nome: 'Produto 1' });
    p2 = await criar(amb.api, '/api/produtos', { nome: 'Produto 2' });
  });
  afterAll(() => amb.limpar());

  it('o rateio manual precisa fechar com o valor; o caixa é tocado uma única vez', async () => {
    const d = await criar(amb.api, '/api/despesas-compartilhadas', {
      descricao: 'Frete',
      data: DATA,
      valorTotal: 10_001,
      tipo: 'transporte',
      criterio: 'manual',
    });
    expect(d.lancamentoId).toBeGreaterThan(0);
    const errado = await amb.api.post(`/api/despesas-compartilhadas/${d.id}/rateio`).send({
      destinos: [
        { destinoTipo: 'produto', destinoId: p1.id, valor: 5_000 },
        { destinoTipo: 'produto', destinoId: p2.id, valor: 5_000 },
      ],
    });
    expect(errado.status).toBe(400);
    const caixaAntes = (await obter(amb.api, '/api/financeiro/resumo')).saldoCaixa;
    const ok = await criar(
      amb.api,
      `/api/despesas-compartilhadas/${d.id}/rateio`,
      {
        destinos: [
          { destinoTipo: 'produto', destinoId: p1.id, valor: 5_001 },
          { destinoTipo: 'produto', destinoId: p2.id, valor: 5_000 },
        ],
      },
      200,
    );
    expect(ok.status).toBe('rateada');
    expect(ok.rateios.reduce((s: number, r: any) => s + r.valor, 0)).toBe(10_001);
    expect((await obter(amb.api, '/api/financeiro/resumo')).saldoCaixa).toBe(caixaAntes);
    expect(caixaAntes).toBe(-10_001);
    expect(
      (
        await amb.api
          .post(`/api/despesas-compartilhadas/${d.id}/rateio`)
          .send({ destinos: [{ destinoTipo: 'produto', destinoId: p1.id, valor: 10_001 }] })
      ).status,
    ).toBe(409);
  });

  it('rateio por peso divide proporcionalmente e a sobra vai para a maior parcela', async () => {
    const d = await criar(amb.api, '/api/despesas-compartilhadas', {
      descricao: 'Embalagens',
      data: DATA,
      valorTotal: 1_000,
      tipo: 'embalagem',
      criterio: 'por_producao',
    });
    const r = await criar(
      amb.api,
      `/api/despesas-compartilhadas/${d.id}/rateio`,
      {
        destinos: [
          { destinoTipo: 'produto', destinoId: p1.id, peso: 1 },
          { destinoTipo: 'produto', destinoId: p2.id, peso: 2 },
        ],
      },
      200,
    );
    expect(r.rateios.map((x: any) => x.valor)).toEqual([333, 667]);
    await consistente(amb.api);
  });

  it('cancelar a despesa estorna o desembolso', async () => {
    const d = await criar(amb.api, '/api/despesas-compartilhadas', {
      descricao: 'Engano',
      data: DATA,
      valorTotal: 500,
      criterio: 'manual',
    });
    const antes = (await obter(amb.api, '/api/financeiro/resumo')).saldoCaixa;
    await criar(amb.api, `/api/despesas-compartilhadas/${d.id}/cancelar`, {}, 200);
    expect((await obter(amb.api, '/api/financeiro/resumo')).saldoCaixa).toBe(antes + 500);
    await consistente(amb.api);
  });
});

describe('lançamentos manuais e relatórios', () => {
  let amb: Ambiente;
  beforeAll(async () => {
    amb = await criarAmbiente();
  });
  afterAll(() => amb.limpar());

  it('despesa operacional afeta caixa e resultado; aporte só o caixa', async () => {
    await criar(amb.api, '/api/financeiro/lancamentos', {
      tipo: 'despesa',
      natureza: 'despesa_operacional',
      descricao: 'Internet',
      valor: 9_990,
      dataCompetencia: DATA,
      dataCaixa: DATA,
    });
    await criar(amb.api, '/api/financeiro/lancamentos', {
      tipo: 'receita',
      natureza: 'aporte',
      descricao: 'Aporte',
      valor: 100_000,
      dataCompetencia: DATA,
      dataCaixa: DATA,
    });
    const r = await obter(amb.api, '/api/financeiro/resumo');
    expect(r).toMatchObject({ despesasPagas: 9_990, lucroPrejuizo: -9_990, saldoCaixa: 90_010 });
    const invalido = await amb.api.post('/api/financeiro/lancamentos').send({
      tipo: 'receita',
      natureza: 'retirada',
      descricao: 'x',
      valor: 1,
      dataCompetencia: DATA,
    });
    expect(invalido.status).toBe(400);
    await consistente(amb.api);
  });

  it('lançamento previsto não conta até ser realizado, e cancelar realizado gera estorno', async () => {
    const prev = await criar(amb.api, '/api/financeiro/lancamentos', {
      tipo: 'despesa',
      natureza: 'despesa_operacional',
      descricao: 'Aluguel',
      valor: 50_000,
      dataCompetencia: DATA,
    });
    expect(prev.status).toBe('previsto');
    expect((await obter(amb.api, '/api/financeiro/resumo')).despesasPagas).toBe(9_990);
    await criar(
      amb.api,
      `/api/financeiro/lancamentos/${prev.id}/realizar`,
      { dataCaixa: DATA },
      200,
    );
    expect((await obter(amb.api, '/api/financeiro/resumo')).despesasPagas).toBe(59_990);
    await criar(amb.api, `/api/financeiro/lancamentos/${prev.id}/cancelar`, {}, 200);
    expect((await obter(amb.api, '/api/financeiro/resumo')).despesasPagas).toBe(9_990);
    expect(
      (await amb.api.post(`/api/financeiro/lancamentos/${prev.id}/cancelar`).send({})).status,
    ).toBe(409);
    await consistente(amb.api);
  });

  it('o painel traz todos os indicadores em uma requisição', async () => {
    const p = await obter(amb.api, '/api/painel?periodo=ano');
    expect(p).toHaveProperty('resumo.lucroPrejuizo');
    expect(p).toHaveProperty('produtosMaisVendidos');
    expect(p).toHaveProperty('materiaisEstoqueBaixo');
    expect(p).toHaveProperty('faturamentoPorDia');
  });

  it('CSV: UTF-8 com BOM, separador ";" e decimal com vírgula', async () => {
    const r = await amb.api.get('/api/relatorios/lancamentos').query({ formato: 'csv' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    const texto = r.text;
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    const linhas = texto.slice(1).trim().split('\r\n');
    expect(linhas[0]).toBe(
      'Competência;Caixa;Tipo;Natureza;Descrição;Valor;Afeta resultado;Afeta caixa;Situação',
    );
    expect(linhas.find((l) => l.includes('Internet'))).toBe(
      '10/11/2026;10/11/2026;despesa;despesa_operacional;Internet;99,90;Sim;Sim;realizado',
    );
    expect((await amb.api.get('/api/relatorios/inexistente')).status).toBe(400);
  });
});
