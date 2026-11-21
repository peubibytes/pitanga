-- 0003_dados_base: unidades, categorias, taxas e configurações iniciais.

INSERT INTO unidades (codigo, nome, base, fator) VALUES
  ('un', 'Unidade',     'un', 1),
  ('ml', 'Mililitro',   'ml', 1),
  ('l',  'Litro',       'ml', 1000),
  ('g',  'Grama',       'g',  1),
  ('kg', 'Quilograma',  'g',  1000),
  ('cx', 'Caixa',       'un', NULL),
  ('m',  'Metro',       'm',  1);

INSERT INTO categorias (nome, tipo) VALUES
  ('Essências e fragrâncias', 'material'),
  ('Frascos e embalagens',    'material'),
  ('Varetas e acessórios',    'material'),
  ('Álcool, água e bases',    'material'),
  ('Ceras e parafinas',       'material'),
  ('Rótulos e papelaria',     'material'),
  ('Outros materiais',        'material'),
  ('Difusores',               'produto'),
  ('Velas',                   'produto'),
  ('Home sprays',             'produto'),
  ('Sabonetes',               'produto'),
  ('Kits e presentes',        'produto');

INSERT INTO taxas (nome, tipo, valor, aplica_em, padrao) VALUES
  ('Taxa de cartão', 'percentual', 350, 'preco', 1),
  ('Comissão de feira', 'percentual', 1000, 'preco', 0);

INSERT INTO configuracoes (chave, valor) VALUES
  ('nome_empresa', 'Flor de Pitanga'),
  ('valor_hora_padrao', '2500'),
  ('remunera_mao_obra_propria', '0'),
  ('permite_estoque_negativo', '0'),
  ('ultimo_backup_em', '');
