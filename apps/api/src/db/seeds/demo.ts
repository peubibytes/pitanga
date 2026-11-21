/**
 * Dados fictícios para desenvolvimento e treinamento: 2 fornecedores, 12 materiais, 6 produtos com
 * ficha, ~3 meses de compras, produções e vendas. Tudo passa pelos serviços reais, então as
 * invariantes (db:check) valem sobre a base gerada. Determinístico: a mesma execução gera a mesma base.
 */
import type { CompraItemEntrada, VendaEntrada } from '@pitanga/shared';
import { dataISO } from '@pitanga/shared';
import type { Db } from '../connection';
import type { Contexto } from '../util';
import { buscarTaxas } from '../../repositories/cadastros.repo';
import { gravarConfiguracao } from '../../repositories/sistema.repo';
import { criarUsuario } from '../../services/auth.service';
import { criarCliente, criarFornecedor, listarCategorias } from '../../services/cadastros.service';
import { registrarCompra, cancelarCompra } from '../../services/compras.service';
import { criarDespesa, ratearDespesa } from '../../services/despesas.service';
import { criarFicha, custoDaFicha, registrarPrecificacao } from '../../services/fichas.service';
import { criarLancamentoManual } from '../../services/financeiro.service';
import { criarMaterial, obterMaterial } from '../../services/materiais.service';
import { registrarProducao, simularProducao } from '../../services/producao.service';
import { criarProduto, listarProdutos } from '../../services/produtos.service';
import {
  cancelarVenda,
  obterVenda,
  registrarRecebimento,
  registrarVenda,
} from '../../services/vendas.service';

export const SENHA_DEMO = 'flor123';

function gerador(semente: number) {
  let s = semente >>> 0;
  const proximo = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    proximo,
    inteiro: (min: number, max: number) => Math.floor(proximo() * (max - min + 1)) + min,
    escolher: <T>(itens: T[]): T => itens[Math.floor(proximo() * itens.length)]!,
    chance: (p: number) => proximo() < p,
  };
}

interface MaterialDemo {
  chave: string;
  nome: string;
  categoria: string;
  unidade: 'un' | 'ml' | 'g' | 'm';
  minimo: number;
  fornecedor: 0 | 1;
  /** Compra-padrão: unidade informada, quantidade (mili), fator e valor total (centavos). */
  compra: { unidade: string; qtdMili: number; fator?: number; valor: number };
}

const MATERIAIS: MaterialDemo[] = [
  {
    chave: 'lav',
    nome: 'Essência de lavanda',
    categoria: 'Essências e fragrâncias',
    unidade: 'ml',
    minimo: 200_000,
    fornecedor: 0,
    compra: { unidade: 'l', qtdMili: 1000, valor: 22_000 },
  },
  {
    chave: 'cer',
    nome: 'Essência de flor de cerejeira',
    categoria: 'Essências e fragrâncias',
    unidade: 'ml',
    minimo: 200_000,
    fornecedor: 0,
    compra: { unidade: 'l', qtdMili: 1000, valor: 26_000 },
  },
  {
    chave: 'alc',
    nome: 'Álcool de cereais',
    categoria: 'Álcool, água e bases',
    unidade: 'ml',
    minimo: 1_000_000,
    fornecedor: 0,
    compra: { unidade: 'l', qtdMili: 5000, valor: 12_000 },
  },
  {
    chave: 'agu',
    nome: 'Água mineral',
    categoria: 'Álcool, água e bases',
    unidade: 'ml',
    minimo: 2_000_000,
    fornecedor: 0,
    compra: { unidade: 'l', qtdMili: 10_000, valor: 2_800 },
  },
  {
    chave: 'fra',
    nome: 'Frasco de vidro 200 ml',
    categoria: 'Frascos e embalagens',
    unidade: 'un',
    minimo: 20_000,
    fornecedor: 1,
    compra: { unidade: 'cx', qtdMili: 5000, fator: 24, valor: 48_000 },
  },
  {
    chave: 'tam',
    nome: 'Tampa dourada',
    categoria: 'Frascos e embalagens',
    unidade: 'un',
    minimo: 20_000,
    fornecedor: 1,
    compra: { unidade: 'cx', qtdMili: 3000, fator: 50, valor: 13_500 },
  },
  {
    chave: 'var',
    nome: 'Varetas de bambu',
    categoria: 'Varetas e acessórios',
    unidade: 'un',
    minimo: 100_000,
    fornecedor: 1,
    compra: { unidade: 'cx', qtdMili: 3000, fator: 100, valor: 7_800 },
  },
  {
    chave: 'rot',
    nome: 'Rótulo adesivo',
    categoria: 'Rótulos e papelaria',
    unidade: 'un',
    minimo: 40_000,
    fornecedor: 1,
    compra: { unidade: 'un', qtdMili: 200_000, valor: 6_400 },
  },
  {
    chave: 'emb',
    nome: 'Embalagem (caixa)',
    categoria: 'Frascos e embalagens',
    unidade: 'un',
    minimo: 20_000,
    fornecedor: 1,
    compra: { unidade: 'un', qtdMili: 100_000, valor: 19_000 },
  },
  {
    chave: 'cera',
    nome: 'Cera de soja',
    categoria: 'Ceras e parafinas',
    unidade: 'g',
    minimo: 1_000_000,
    fornecedor: 0,
    compra: { unidade: 'kg', qtdMili: 5000, valor: 19_000 },
  },
  {
    chave: 'pav',
    nome: 'Pavio de algodão',
    categoria: 'Varetas e acessórios',
    unidade: 'un',
    minimo: 40_000,
    fornecedor: 1,
    compra: { unidade: 'un', qtdMili: 200_000, valor: 6_000 },
  },
  {
    chave: 'fit',
    nome: 'Fita de cetim',
    categoria: 'Outros materiais',
    unidade: 'm',
    minimo: 5_000,
    fornecedor: 1,
    compra: { unidade: 'm', qtdMili: 20_000, valor: 2_400 },
  },
];

interface ProdutoDemo {
  nome: string;
  categoria: string;
  descricao: string;
  ficha: {
    rendimento: number;
    maoObra: { modo: 'hora'; valorHora: number; minutos: number } | { modo: 'fixo'; valor: number };
    itens: [string, number][];
    extras?: {
      descricao: string;
      valor: number;
      tipo: 'embalagem' | 'transporte' | 'outro';
      porUnidade: boolean;
    }[];
  };
}

const PRODUTOS: ProdutoDemo[] = [
  {
    nome: 'Difusor 200 ml — Lavanda',
    categoria: 'Difusores',
    descricao: 'Difusor de ambiente com varetas, aroma de lavanda.',
    ficha: {
      rendimento: 1,
      maoObra: { modo: 'hora', valorHora: 2500, minutos: 12 },
      itens: [
        ['fra', 1000],
        ['tam', 1000],
        ['lav', 40_000],
        ['alc', 120_000],
        ['agu', 40_000],
        ['var', 6000],
        ['rot', 1000],
        ['emb', 1000],
      ],
    },
  },
  {
    nome: 'Difusor 200 ml — Flor de cerejeira',
    categoria: 'Difusores',
    descricao: 'Difusor de ambiente com varetas, aroma de flor de cerejeira.',
    ficha: {
      rendimento: 1,
      maoObra: { modo: 'hora', valorHora: 2500, minutos: 12 },
      itens: [
        ['fra', 1000],
        ['tam', 1000],
        ['cer', 40_000],
        ['alc', 120_000],
        ['agu', 40_000],
        ['var', 6000],
        ['rot', 1000],
        ['emb', 1000],
      ],
    },
  },
  {
    nome: 'Kit presente — Difusor lavanda',
    categoria: 'Kits e presentes',
    descricao: 'Difusor de lavanda em caixa de presente com fita e cartão.',
    ficha: {
      rendimento: 1,
      maoObra: { modo: 'hora', valorHora: 2500, minutos: 20 },
      itens: [
        ['fra', 1000],
        ['tam', 1000],
        ['lav', 40_000],
        ['alc', 120_000],
        ['agu', 40_000],
        ['var', 6000],
        ['rot', 2000],
        ['emb', 2000],
        ['fit', 500],
      ],
      extras: [
        { descricao: 'Cartão de agradecimento', valor: 150, tipo: 'embalagem', porUnidade: true },
      ],
    },
  },
  {
    nome: 'Vela de soja 150 g — Lavanda',
    categoria: 'Velas',
    descricao: 'Vela artesanal de cera de soja, aroma de lavanda.',
    ficha: {
      rendimento: 4,
      maoObra: { modo: 'fixo', valor: 1200 },
      itens: [
        ['fra', 4000],
        ['cera', 600_000],
        ['lav', 32_000],
        ['pav', 4000],
        ['rot', 4000],
        ['emb', 4000],
      ],
      extras: [
        { descricao: 'Transporte do lote', valor: 400, tipo: 'transporte', porUnidade: false },
      ],
    },
  },
  {
    nome: 'Vela de soja 150 g — Flor de cerejeira',
    categoria: 'Velas',
    descricao: 'Vela artesanal de cera de soja, aroma de flor de cerejeira.',
    ficha: {
      rendimento: 4,
      maoObra: { modo: 'fixo', valor: 1200 },
      itens: [
        ['fra', 4000],
        ['cera', 600_000],
        ['cer', 32_000],
        ['pav', 4000],
        ['rot', 4000],
        ['emb', 4000],
      ],
      extras: [
        { descricao: 'Transporte do lote', valor: 400, tipo: 'transporte', porUnidade: false },
      ],
    },
  },
  {
    nome: 'Home spray 200 ml — Lavanda',
    categoria: 'Home sprays',
    descricao: 'Spray de ambiente com aroma de lavanda.',
    ficha: {
      rendimento: 2,
      maoObra: { modo: 'hora', valorHora: 2500, minutos: 10 },
      itens: [
        ['fra', 2000],
        ['alc', 140_000],
        ['agu', 40_000],
        ['lav', 20_000],
        ['rot', 2000],
      ],
    },
  },
];

const CLIENTES = [
  ['Marina Albuquerque', '(11) 98811-2030'],
  ['Patrícia Duarte', '(11) 97722-1010'],
  ['Helena Cardoso', '(21) 99655-4433'],
  ['Beatriz Nogueira', '(31) 98877-6655'],
  ['Carolina Mendes', '(11) 91234-5678'],
  ['Juliana Tavares', '(19) 99888-1212'],
  ['Renata Lacerda', '(11) 93456-7788'],
  ['Fernanda Prado', '(41) 98765-4321'],
  ['Luciana Barros', '(11) 94455-6677'],
  ['Aline Siqueira', '(21) 97766-5544'],
  ['Teresa Moraes', '(11) 92233-4455'],
  ['Sônia Vasconcelos', '(11) 95566-7788'],
] as const;

export interface ResumoSeed {
  materiais: number;
  produtos: number;
  compras: number;
  producoes: number;
  vendas: number;
}

export async function semearDemo(db: Db, hoje = new Date()): Promise<ResumoSeed> {
  const rnd = gerador(20260101);
  const admin = await criarUsuario(
    db,
    { nome: 'Flor de Pitanga', login: 'admin', senha: SENHA_DEMO, perfil: 'administradora' },
    null,
  );
  await criarUsuario(
    db,
    { nome: 'Operadora', login: 'operadora', senha: SENHA_DEMO, perfil: 'operadora' },
    admin.id,
  );
  const ctx: Contexto = { db, usuarioId: admin.id };
  gravarConfiguracao(db, 'ultimo_backup_em', '');

  const fornecedores = [
    criarFornecedor(ctx, {
      nomeLoja: 'Casa das Essências',
      contato: '(11) 3333-0001 — Rosa',
      observacao: 'Essências, álcool, água e cera.',
    }),
    criarFornecedor(ctx, {
      nomeLoja: 'Vidraria Aurora',
      contato: '(11) 3333-0002 — Sr. Paulo',
      observacao: 'Frascos, tampas, varetas e embalagens.',
    }),
  ];
  const clientes = CLIENTES.map(([nome, telefone]) => criarCliente(ctx, { nome, telefone }));

  const catMaterial = new Map(listarCategorias(ctx, 'material').map((c) => [c.nome, c.id]));
  const catProduto = new Map(listarCategorias(ctx, 'produto').map((c) => [c.nome, c.id]));
  const materiais = new Map(
    MATERIAIS.map((m) => [
      m.chave,
      criarMaterial(ctx, {
        nome: m.nome,
        categoriaId: catMaterial.get(m.categoria) ?? null,
        unidade: m.unidade,
        estoqueMinimo: m.minimo,
      }),
    ]),
  );
  const produtos = PRODUTOS.map((p) =>
    criarProduto(ctx, {
      nome: p.nome,
      descricao: p.descricao,
      categoriaId: catProduto.get(p.categoria) ?? null,
    }),
  );

  const dia = (n: number): string =>
    dataISO(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 90 + n));

  /** Uma compra com os materiais indicados, preço ±8% sobre o valor-padrão, com despesa de transporte. */
  let totalCompras = 0;
  const comprar = (data: string, itens: { chave: string; vezes: number }[]): number | null => {
    if (itens.length === 0) return null;
    const porFornecedor = [0, 1].map((f) =>
      itens.filter((i) => MATERIAIS.find((m) => m.chave === i.chave)!.fornecedor === f),
    );
    let ultimo: number | null = null;
    porFornecedor.forEach((grupo, f) => {
      if (grupo.length === 0) return;
      const linhas: CompraItemEntrada[] = grupo.map(({ chave, vezes }) => {
        const m = MATERIAIS.find((x) => x.chave === chave)!;
        const variacao = 0.92 + rnd.proximo() * 0.16;
        return {
          materialId: materiais.get(chave)!.id,
          quantidadeInformada: m.compra.qtdMili * vezes,
          unidadeInformada: m.compra.unidade,
          fatorConversao: m.compra.fator,
          valorTotal: Math.round(m.compra.valor * vezes * variacao),
        };
      });
      const compra = registrarCompra(ctx, {
        fornecedorId: fornecedores[f]!.id,
        data,
        formaPagamento: rnd.escolher(['pix', 'pix', 'cartao_credito', 'transferencia'] as const),
        despesas: [
          {
            tipo: 'transporte',
            descricao: 'Entrega',
            valor: rnd.inteiro(1500, 3500),
            rateio: 'por_valor',
          },
        ],
        itens: linhas,
      });
      ultimo = compra.id;
      totalCompras += 1;
    });
    return ultimo;
  };

  // Aporte inicial e compra inicial de tudo.
  criarLancamentoManual(ctx, {
    tipo: 'receita',
    natureza: 'aporte',
    descricao: 'Aporte inicial da sócia',
    valor: 300_000,
    dataCompetencia: dia(0),
    dataCaixa: dia(0),
  });
  comprar(
    dia(0),
    MATERIAIS.map((m) => ({ chave: m.chave, vezes: 1 })),
  );

  // Fichas e precificação (margem de 40% sobre o preço, com a taxa de cartão padrão).
  produtos.forEach((p, i) => {
    const def = PRODUTOS[i]!.ficha;
    const ficha = criarFicha(ctx, p.id, {
      rendimento: def.rendimento,
      maoObraModo: def.maoObra.modo,
      maoObraValorHora: def.maoObra.modo === 'hora' ? def.maoObra.valorHora : null,
      maoObraMinutos: def.maoObra.modo === 'hora' ? def.maoObra.minutos : null,
      maoObraValorFixo: def.maoObra.modo === 'fixo' ? def.maoObra.valor : null,
      itens: def.itens.map(([chave, quantidade]) => ({
        materialId: materiais.get(chave)!.id,
        quantidade,
      })),
      extras: def.extras ?? [],
    });
    const custo = custoDaFicha(ctx, ficha.id).custo.custoUnitarioCentavos;
    const taxas = buscarTaxas(db, [1]);
    const pct = taxas.reduce((s, t) => s + (t.tipo === 'percentual' ? t.valor : 0), 0);
    const sugerido = Math.ceil((custo * 10_000) / (10_000 - pct - 4000));
    const precoFinal = Math.ceil(sugerido / 100) * 100 - 10;
    registrarPrecificacao(ctx, {
      produtoId: p.id,
      modo: 'margem_percentual',
      parametro: 4000,
      taxaIds: [1],
      precoFinal,
      aplicarAoProduto: true,
    });
  });

  let totalProducoes = 0;
  let totalVendas = 0;
  const aReceber: { vendaId: number; dia: number }[] = [];
  const vendasCanceladas: number[] = [];

  for (let d = 1; d <= 90; d++) {
    const data = dia(d);
    const diaSemana = new Date(`${data}T12:00:00`).getDay();

    // Reposição quinzenal dos materiais abaixo do mínimo.
    if (d % 14 === 0) {
      const baixos = MATERIAIS.filter(
        (m) => obterMaterial(ctx, materiais.get(m.chave)!.id).estoqueAtual < m.minimo * 2,
      ).map((m) => ({ chave: m.chave, vezes: 1 }));
      comprar(data, baixos);
    }

    // Produção: cada produto tem o seu ritmo.
    produtos.forEach((p, i) => {
      if (d < 2 || (d + i * 3) % 11 !== 0) return;
      const rendimento = PRODUTOS[i]!.ficha.rendimento;
      const quantidade =
        rendimento * rnd.inteiro(rendimento === 1 ? 6 : 1, rendimento === 1 ? 12 : 3);
      let sim = simularProducao(ctx, { produtoId: p.id, quantidade });
      if (!sim.possivel) {
        // Falta material: compra o que falta (em múltiplos da compra-padrão) antes de produzir.
        const faltantes = sim.itens
          .filter((it) => it.falta > 0)
          .map((it) => {
            const m = MATERIAIS.find((x) => materiais.get(x.chave)!.id === it.materialId)!;
            const baseMili =
              m.compra.qtdMili *
              (m.compra.fator ??
                (m.compra.unidade === 'l' || m.compra.unidade === 'kg' ? 1000 : 1));
            return { chave: m.chave, vezes: Math.max(1, Math.ceil(it.falta / baseMili)) };
          });
        comprar(data, faltantes);
        sim = simularProducao(ctx, { produtoId: p.id, quantidade });
      }
      if (sim.possivel) {
        registrarProducao(ctx, { produtoId: p.id, quantidade, data });
        totalProducoes += 1;
      }
    });

    // Vendas: segunda a sábado, de 0 a 3 por dia.
    if (diaSemana !== 0) {
      const quantas = rnd.escolher([0, 1, 1, 1, 2, 2, 3]);
      for (let v = 0; v < quantas; v++) {
        const emEstoque = listarProdutos(ctx, { comEstoque: true, pagina: 1, porPagina: 50 }).itens;
        if (emEstoque.length === 0) break;
        const itens: VendaEntrada['itens'] = [];
        const escolhidos = new Set<number>();
        for (let k = rnd.inteiro(1, Math.min(3, emEstoque.length)); k > 0; k--) {
          const prod = rnd.escolher(emEstoque);
          if (escolhidos.has(prod.id)) continue;
          escolhidos.add(prod.id);
          itens.push({
            produtoId: prod.id,
            quantidade: Math.min(prod.estoqueAtual, rnd.inteiro(1, 3)),
            precoUnitario: prod.precoVenda ?? 3_690,
            descontoItem: 0,
          });
        }
        const subtotal = itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
        const pendente = rnd.chance(0.12);
        const parcial = pendente && rnd.chance(0.4);
        const venda = registrarVenda(ctx, {
          clienteId: rnd.chance(0.7) ? rnd.escolher(clientes).id : null,
          data,
          itens,
          desconto: rnd.chance(0.15) ? Math.round(subtotal * 0.1) : 0,
          formaPagamento: rnd.escolher([
            'pix',
            'pix',
            'dinheiro',
            'cartao_credito',
            'cartao_debito',
          ] as const),
          valorRecebido: pendente ? (parcial ? Math.round(subtotal * 0.3) : 0) : undefined,
        });
        totalVendas += 1;
        if (venda.status === 'pendente')
          aReceber.push({ vendaId: venda.id, dia: d + rnd.inteiro(7, 20) });
        if (d === 40 && v === 0) vendasCanceladas.push(venda.id);
      }
    }

    // Recebimentos de vendas pendentes (alguns ficam em aberto até hoje).
    for (const pend of aReceber.filter((p) => p.dia === d)) {
      try {
        registrarRecebimentoRestante(ctx, pend.vendaId, data);
      } catch {
        /* venda já quitada ou cancelada */
      }
    }

    // Despesas e eventos pontuais.
    if (d % 30 === 5)
      criarLancamentoManual(ctx, {
        tipo: 'despesa',
        natureza: 'despesa_operacional',
        descricao: 'Internet e telefone',
        valor: 9_990,
        dataCompetencia: data,
        dataCaixa: data,
      });
    if (d === 25 || d === 70)
      criarLancamentoManual(ctx, {
        tipo: 'despesa',
        natureza: 'despesa_operacional',
        descricao: 'Taxa de participação na feira',
        valor: 3_500,
        dataCompetencia: data,
        dataCaixa: data,
      });
    if (d === 50)
      criarLancamentoManual(ctx, {
        tipo: 'despesa',
        natureza: 'retirada',
        descricao: 'Retirada da sócia',
        valor: 30_000,
        dataCompetencia: data,
        dataCaixa: data,
      });
    if (d === 45) {
      const dsp = criarDespesa(ctx, {
        descricao: 'Frete da feira de artesanato',
        data,
        valorTotal: 4_500,
        tipo: 'transporte',
        criterio: 'manual',
        formaPagamento: 'pix',
      });
      ratearDespesa(ctx, dsp.id, {
        destinos: [
          { destinoTipo: 'produto', destinoId: produtos[0]!.id, valor: 2_250 },
          { destinoTipo: 'produto', destinoId: produtos[1]!.id, valor: 2_250 },
        ],
      });
    }
    if (d === 60) {
      const dsp = criarDespesa(ctx, {
        descricao: 'Embalagens especiais de Dia das Mães',
        data,
        valorTotal: 6_000,
        tipo: 'embalagem',
        criterio: 'por_producao',
        formaPagamento: 'cartao_credito',
      });
      ratearDespesa(ctx, dsp.id, {
        destinos: [
          { destinoTipo: 'produto', destinoId: produtos[3]!.id, peso: 3 },
          { destinoTipo: 'produto', destinoId: produtos[4]!.id, peso: 1 },
        ],
      });
    }
    if (d === 41)
      for (const id of vendasCanceladas)
        cancelarVenda(ctx, id, { motivo: 'Cliente desistiu da compra' });
    if (d === 20) {
      try {
        const compra = comprar(data, [{ chave: 'fit', vezes: 1 }]);
        if (compra) cancelarCompra(ctx, compra, { motivo: 'Fita enviada errada pelo fornecedor' });
      } catch {
        /* se o material já foi consumido, o cancelamento é recusado */
      }
    }
  }

  return {
    materiais: MATERIAIS.length,
    produtos: produtos.length,
    compras: totalCompras,
    producoes: totalProducoes,
    vendas: totalVendas,
  };
}

function registrarRecebimentoRestante(ctx: Contexto, vendaId: number, data: string) {
  const v = obterVenda(ctx, vendaId);
  const emAberto = v.total - v.recebido;
  if (v.status === 'cancelada' || emAberto <= 0) return v;
  return registrarRecebimento(ctx, vendaId, { data, valor: emAberto, formaPagamento: 'pix' });
}
