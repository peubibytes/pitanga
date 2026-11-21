-- 0001_inicial: todas as tabelas do modelo de dados (plano, seção 5).
-- Dinheiro em centavos (totais) e micro-reais (unitários); quantidades em mili-unidades;
-- percentuais em centésimos de ponto percentual; datas de negócio em ISO AAAA-MM-DD.

/* ----------------------------- cadastros de apoio ----------------------------- */

CREATE TABLE categorias (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT    NOT NULL,
  tipo      TEXT    NOT NULL CHECK (tipo IN ('material','produto')),
  ativo     INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (nome, tipo)
);

CREATE TABLE unidades (
  codigo TEXT PRIMARY KEY,
  nome   TEXT NOT NULL,
  base   TEXT NOT NULL,
  fator  INTEGER            -- NULL: informado a cada compra (ex.: caixa)
);

CREATE TABLE taxas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  tipo          TEXT    NOT NULL CHECK (tipo IN ('percentual','fixo')),
  valor         INTEGER NOT NULL CHECK (valor >= 0),   -- centésimos de % ou centavos
  aplica_em     TEXT    NOT NULL DEFAULT 'preco' CHECK (aplica_em IN ('preco','custo')),
  padrao        INTEGER NOT NULL DEFAULT 0 CHECK (padrao IN (0,1)),
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT
);

CREATE TABLE configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  login         TEXT    NOT NULL UNIQUE,
  senha_hash    TEXT    NOT NULL,
  perfil        TEXT    NOT NULL CHECK (perfil IN ('administradora','operadora')),
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT
);

CREATE TABLE sessoes (
  token_hash TEXT    PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  expira_em  TEXT    NOT NULL
);

CREATE TABLE auditoria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER REFERENCES usuarios(id),
  acao        TEXT    NOT NULL,
  entidade    TEXT    NOT NULL,
  entidade_id INTEGER,
  dados_json  TEXT,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE idempotencia (
  chave       TEXT    NOT NULL,
  rota        TEXT    NOT NULL,
  usuario_id  INTEGER,
  status_http INTEGER NOT NULL,
  resposta    TEXT    NOT NULL,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (chave, rota)
);

/* ------------------------------ clientes e fornecedores ------------------------------ */

CREATE TABLE clientes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  telefone      TEXT,
  observacao    TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT
);

CREATE TABLE fornecedores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_loja     TEXT    NOT NULL,
  contato       TEXT,
  observacao    TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT
);

/* ------------------------------------ materiais ------------------------------------ */

CREATE TABLE materiais (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT    NOT NULL,
  categoria_id   INTEGER REFERENCES categorias(id),
  unidade        TEXT    NOT NULL REFERENCES unidades(codigo),
  estoque_atual  INTEGER NOT NULL DEFAULT 0,        -- mili-unidades (cache do razão)
  estoque_minimo INTEGER CHECK (estoque_minimo IS NULL OR estoque_minimo >= 0),
  custo_medio    INTEGER NOT NULL DEFAULT 0 CHECK (custo_medio >= 0), -- micro-reais por unidade base
  ativo          INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em  TEXT
);

CREATE TABLE materiais_movimentos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id      INTEGER NOT NULL REFERENCES materiais(id),
  tipo             TEXT    NOT NULL CHECK (tipo IN ('compra','consumo','ajuste','estorno')),
  quantidade       INTEGER NOT NULL,                -- sinalizado: positivo entra, negativo sai
  custo_unitario   INTEGER NOT NULL,                -- micro-reais por unidade base
  custo_total      INTEGER NOT NULL,                -- centavos, mesmo sinal da quantidade
  saldo_apos       INTEGER NOT NULL,
  custo_medio_apos INTEGER NOT NULL,
  referencia_tipo  TEXT,
  referencia_id    INTEGER,
  data             TEXT    NOT NULL,
  justificativa    TEXT,
  usuario_id       INTEGER REFERENCES usuarios(id),
  criado_em        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (tipo <> 'ajuste' OR (justificativa IS NOT NULL AND length(trim(justificativa)) > 0))
);

/* ------------------------------------- compras ------------------------------------- */

CREATE TABLE compras (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor_id   INTEGER REFERENCES fornecedores(id),
  data            TEXT    NOT NULL,
  total_itens     INTEGER NOT NULL DEFAULT 0,
  total_despesas  INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL DEFAULT 0,
  forma_pagamento TEXT,
  status          TEXT    NOT NULL DEFAULT 'registrada' CHECK (status IN ('registrada','cancelada')),
  observacao      TEXT,
  usuario_id      INTEGER REFERENCES usuarios(id),
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em   TEXT
);

CREATE TABLE compras_itens (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id            INTEGER NOT NULL REFERENCES compras(id),
  material_id          INTEGER NOT NULL REFERENCES materiais(id),
  quantidade_informada INTEGER NOT NULL,           -- mili-unidades da unidade informada
  unidade_informada    TEXT    NOT NULL REFERENCES unidades(codigo),
  fator_conversao      INTEGER NOT NULL DEFAULT 1, -- unidades base por unidade informada
  quantidade_base      INTEGER NOT NULL,           -- mili-unidades da base: o que entra no estoque
  valor_unitario       INTEGER NOT NULL,           -- micro-reais por unidade informada
  valor_total          INTEGER NOT NULL,           -- centavos
  despesa_rateada      INTEGER NOT NULL DEFAULT 0, -- centavos
  custo_unitario_final INTEGER NOT NULL            -- micro-reais por unidade base
);

CREATE TABLE compras_despesas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  tipo      TEXT    NOT NULL CHECK (tipo IN ('transporte','estacionamento','frete','outro')),
  descricao TEXT,
  valor     INTEGER NOT NULL CHECK (valor >= 0),
  rateio    TEXT    NOT NULL DEFAULT 'por_valor' CHECK (rateio IN ('por_valor','por_quantidade','nao_rateia'))
);

/* ------------------------------ produtos e fichas técnicas ------------------------------ */

CREATE TABLE produtos (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                    TEXT    NOT NULL,
  descricao               TEXT,
  categoria_id            INTEGER REFERENCES categorias(id),
  foto_arquivo            TEXT,
  preco_venda             INTEGER CHECK (preco_venda IS NULL OR preco_venda >= 0),
  custo_producao          INTEGER NOT NULL DEFAULT 0,  -- custo médio do estoque de acabados (micro-reais)
  mao_obra_pendente_media INTEGER NOT NULL DEFAULT 0,  -- mão de obra própria não paga, média (micro-reais)
  estoque_atual           INTEGER NOT NULL DEFAULT 0,  -- unidades inteiras (cache do razão)
  ativo                   INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em               TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em           TEXT
);

CREATE TABLE fichas_tecnicas (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id         INTEGER NOT NULL REFERENCES produtos(id),
  versao             INTEGER NOT NULL,
  rendimento         INTEGER NOT NULL DEFAULT 1 CHECK (rendimento >= 1),
  mao_obra_modo      TEXT    NOT NULL DEFAULT 'nenhuma' CHECK (mao_obra_modo IN ('hora','fixo','nenhuma')),
  mao_obra_valor_hora INTEGER,                 -- centavos por hora
  mao_obra_minutos   INTEGER,
  mao_obra_valor_fixo INTEGER,                 -- centavos por rendimento
  ativa              INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0,1)),
  observacao         TEXT,
  criado_em          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (produto_id, versao)
);

CREATE TABLE fichas_itens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id    INTEGER NOT NULL REFERENCES fichas_tecnicas(id),
  material_id INTEGER NOT NULL REFERENCES materiais(id),
  quantidade  INTEGER NOT NULL CHECK (quantidade > 0),  -- mili-unidades, por rendimento da ficha
  observacao  TEXT,
  UNIQUE (ficha_id, material_id)
);

CREATE TABLE fichas_custos_extras (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id    INTEGER NOT NULL REFERENCES fichas_tecnicas(id),
  descricao   TEXT    NOT NULL,
  valor       INTEGER NOT NULL CHECK (valor >= 0),      -- centavos
  tipo        TEXT    NOT NULL DEFAULT 'outro' CHECK (tipo IN ('embalagem','transporte','estacionamento','outro')),
  por_unidade INTEGER NOT NULL DEFAULT 1 CHECK (por_unidade IN (0,1))
);

/* ---------------------------------- precificação ---------------------------------- */

CREATE TABLE precificacoes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id          INTEGER NOT NULL REFERENCES produtos(id),
  ficha_id            INTEGER REFERENCES fichas_tecnicas(id),
  modo                TEXT    NOT NULL CHECK (modo IN ('lucro_valor','acrescimo_percentual','margem_percentual')),
  parametro           INTEGER NOT NULL,
  custo_base          INTEGER NOT NULL,
  taxas_fixas         INTEGER NOT NULL DEFAULT 0,
  taxas_percentuais   INTEGER NOT NULL DEFAULT 0,
  preco_sugerido      INTEGER NOT NULL,
  preco_final         INTEGER NOT NULL,
  lucro_previsto      INTEGER NOT NULL,
  margem_efetiva      INTEGER NOT NULL,
  aplicado_ao_produto INTEGER NOT NULL DEFAULT 0 CHECK (aplicado_ao_produto IN (0,1)),
  data                TEXT    NOT NULL,
  usuario_id          INTEGER REFERENCES usuarios(id),
  criado_em           TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

/* ------------------------------------ financeiro ------------------------------------ */

CREATE TABLE financeiro_lancamentos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo                  TEXT    NOT NULL CHECK (tipo IN ('receita','despesa')),
  natureza              TEXT    NOT NULL CHECK (natureza IN
                          ('venda','compra_material','despesa_operacional','mao_obra','cmv','ajuste','aporte','retirada')),
  descricao             TEXT    NOT NULL,
  valor                 INTEGER NOT NULL CHECK (valor >= 0),  -- centavos, sempre positivo
  data_competencia      TEXT    NOT NULL,
  data_caixa            TEXT,
  afeta_resultado       INTEGER NOT NULL CHECK (afeta_resultado IN (0,1)),
  afeta_caixa           INTEGER NOT NULL CHECK (afeta_caixa IN (0,1)),
  status                TEXT    NOT NULL DEFAULT 'realizado' CHECK (status IN ('previsto','realizado','cancelado')),
  referencia_tipo       TEXT,
  referencia_id         INTEGER,
  estorna_lancamento_id INTEGER REFERENCES financeiro_lancamentos(id),
  usuario_id            INTEGER REFERENCES usuarios(id),
  criado_em             TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em         TEXT
);

/* ------------------------------ despesas compartilhadas ------------------------------ */

CREATE TABLE despesas_compartilhadas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao     TEXT    NOT NULL,
  data          TEXT    NOT NULL,
  valor_total   INTEGER NOT NULL CHECK (valor_total > 0),
  tipo          TEXT    NOT NULL DEFAULT 'outro'
                CHECK (tipo IN ('transporte','estacionamento','embalagem','energia','aluguel','outro')),
  criterio      TEXT    NOT NULL DEFAULT 'manual' CHECK (criterio IN ('manual','por_producao','por_valor')),
  lancamento_id INTEGER REFERENCES financeiro_lancamentos(id),  -- o único lançamento de caixa
  status        TEXT    NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','rateada','cancelada')),
  usuario_id    INTEGER REFERENCES usuarios(id),
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT
);

/* -------------------------------------- produção -------------------------------------- */

CREATE TABLE producoes (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id                 INTEGER NOT NULL REFERENCES produtos(id),
  ficha_id                   INTEGER NOT NULL REFERENCES fichas_tecnicas(id),   -- versão usada
  quantidade                 INTEGER NOT NULL CHECK (quantidade >= 1),
  data                       TEXT    NOT NULL,
  custo_materiais            INTEGER NOT NULL DEFAULT 0,
  custo_mao_obra             INTEGER NOT NULL DEFAULT 0,
  custo_extras               INTEGER NOT NULL DEFAULT 0,
  custo_rateios              INTEGER NOT NULL DEFAULT 0,
  custo_total                INTEGER NOT NULL DEFAULT 0,   -- gerencial
  custo_unitario             INTEGER NOT NULL DEFAULT 0,   -- micro-reais
  custo_estoque_total        INTEGER NOT NULL DEFAULT 0,   -- o que entra no estoque de acabados
  custo_estoque_unitario     INTEGER NOT NULL DEFAULT 0,   -- micro-reais
  remunerou_mao_obra         INTEGER NOT NULL DEFAULT 0 CHECK (remunerou_mao_obra IN (0,1)),
  status                     TEXT    NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida','cancelada')),
  autorizou_estoque_negativo INTEGER NOT NULL DEFAULT 0 CHECK (autorizou_estoque_negativo IN (0,1)),
  observacao                 TEXT,
  usuario_id                 INTEGER REFERENCES usuarios(id),
  criado_em                  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em              TEXT
);

CREATE TABLE producoes_consumos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  producao_id    INTEGER NOT NULL REFERENCES producoes(id),
  material_id    INTEGER NOT NULL REFERENCES materiais(id),
  quantidade     INTEGER NOT NULL,       -- mili-unidades consumidas
  custo_unitario INTEGER NOT NULL,       -- micro-reais, congelado no consumo
  custo_total    INTEGER NOT NULL        -- centavos
);

CREATE TABLE despesas_rateios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  despesa_id  INTEGER NOT NULL REFERENCES despesas_compartilhadas(id),
  destino_tipo TEXT   NOT NULL CHECK (destino_tipo IN ('produto','producao')),
  destino_id  INTEGER NOT NULL,
  valor       INTEGER NOT NULL CHECK (valor >= 0),
  producao_id INTEGER REFERENCES producoes(id)   -- produção que absorveu este rateio de produto
);

/* ---------------------------------- produtos acabados ---------------------------------- */

CREATE TABLE produtos_movimentos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id       INTEGER NOT NULL REFERENCES produtos(id),
  tipo             TEXT    NOT NULL CHECK (tipo IN ('producao','venda','ajuste','estorno')),
  quantidade       INTEGER NOT NULL,       -- unidades, sinalizado
  custo_unitario   INTEGER NOT NULL,       -- micro-reais
  custo_total      INTEGER NOT NULL,       -- centavos, mesmo sinal da quantidade
  saldo_apos       INTEGER NOT NULL,
  custo_medio_apos INTEGER NOT NULL,
  referencia_tipo  TEXT,
  referencia_id    INTEGER,
  data             TEXT    NOT NULL,
  justificativa    TEXT,
  usuario_id       INTEGER REFERENCES usuarios(id),
  criado_em        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (tipo <> 'ajuste' OR (justificativa IS NOT NULL AND length(trim(justificativa)) > 0))
);

/* -------------------------------------- vendas -------------------------------------- */

CREATE TABLE vendas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id      INTEGER REFERENCES clientes(id),   -- NULL = consumidor não identificado
  data            TEXT    NOT NULL,
  subtotal        INTEGER NOT NULL DEFAULT 0,
  desconto        INTEGER NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  total           INTEGER NOT NULL DEFAULT 0,
  forma_pagamento TEXT,
  status          TEXT    NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida','pendente','cancelada')),
  cmv             INTEGER NOT NULL DEFAULT 0,
  lucro_estimado  INTEGER NOT NULL DEFAULT 0,
  observacao      TEXT,
  usuario_id      INTEGER REFERENCES usuarios(id),
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em   TEXT
);

CREATE TABLE vendas_itens (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id          INTEGER NOT NULL REFERENCES vendas(id),
  produto_id        INTEGER NOT NULL REFERENCES produtos(id),
  quantidade        INTEGER NOT NULL CHECK (quantidade >= 1),
  preco_unitario    INTEGER NOT NULL,   -- centavos
  desconto_item     INTEGER NOT NULL DEFAULT 0,
  total             INTEGER NOT NULL,   -- centavos
  custo_unitario    INTEGER NOT NULL,   -- micro-reais, congelado
  custo_total       INTEGER NOT NULL,   -- centavos
  mao_obra_unitaria INTEGER NOT NULL DEFAULT 0  -- micro-reais de mão de obra própria não paga, congelado
);

CREATE TABLE vendas_recebimentos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id        INTEGER NOT NULL REFERENCES vendas(id),
  data            TEXT    NOT NULL,
  valor           INTEGER NOT NULL CHECK (valor > 0),
  forma_pagamento TEXT,
  lancamento_id   INTEGER REFERENCES financeiro_lancamentos(id),
  usuario_id      INTEGER REFERENCES usuarios(id),
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

/* -------------------------------------- backup -------------------------------------- */

CREATE TABLE backups (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo        TEXT    NOT NULL,
  data           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  tamanho_bytes  INTEGER NOT NULL DEFAULT 0,
  hash_sha256    TEXT    NOT NULL,
  integridade_ok INTEGER NOT NULL DEFAULT 1 CHECK (integridade_ok IN (0,1)),
  origem         TEXT    NOT NULL CHECK (origem IN ('manual','automatico','pre_migracao','pre_restauracao'))
);
