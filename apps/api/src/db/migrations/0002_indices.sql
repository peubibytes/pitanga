-- 0002_indices: índices de consulta e restrições parciais.

CREATE INDEX idx_clientes_nome      ON clientes (nome);
CREATE INDEX idx_clientes_telefone  ON clientes (telefone);
CREATE INDEX idx_fornecedores_nome  ON fornecedores (nome_loja);

CREATE INDEX idx_materiais_nome       ON materiais (nome);
CREATE INDEX idx_materiais_categoria  ON materiais (categoria_id);
-- Painel: materiais com estoque abaixo do mínimo.
CREATE INDEX idx_materiais_estoque_baixo ON materiais (estoque_atual, estoque_minimo)
  WHERE ativo = 1 AND estoque_minimo IS NOT NULL;

CREATE INDEX idx_mat_mov_material ON materiais_movimentos (material_id, data, id);
CREATE INDEX idx_mat_mov_ref      ON materiais_movimentos (referencia_tipo, referencia_id);

CREATE INDEX idx_compras_data       ON compras (data);
CREATE INDEX idx_compras_fornecedor ON compras (fornecedor_id);
CREATE INDEX idx_compras_itens_compra   ON compras_itens (compra_id);
CREATE INDEX idx_compras_itens_material ON compras_itens (material_id);
CREATE INDEX idx_compras_desp_compra    ON compras_despesas (compra_id);

CREATE INDEX idx_produtos_nome      ON produtos (nome);
CREATE INDEX idx_produtos_categoria ON produtos (categoria_id);
-- No máximo uma ficha ativa por produto.
CREATE UNIQUE INDEX idx_fichas_ativa_unica ON fichas_tecnicas (produto_id) WHERE ativa = 1;
CREATE INDEX idx_fichas_itens_ficha   ON fichas_itens (ficha_id);
CREATE INDEX idx_fichas_itens_material ON fichas_itens (material_id);
CREATE INDEX idx_fichas_extras_ficha  ON fichas_custos_extras (ficha_id);

CREATE INDEX idx_precificacoes_produto ON precificacoes (produto_id, data);

CREATE INDEX idx_producoes_data    ON producoes (data);
CREATE INDEX idx_producoes_produto ON producoes (produto_id);
CREATE INDEX idx_prod_consumos_producao ON producoes_consumos (producao_id);
CREATE INDEX idx_rateios_despesa   ON despesas_rateios (despesa_id);
CREATE INDEX idx_rateios_destino   ON despesas_rateios (destino_tipo, destino_id);

CREATE INDEX idx_prod_mov_produto ON produtos_movimentos (produto_id, data, id);
CREATE INDEX idx_prod_mov_ref     ON produtos_movimentos (referencia_tipo, referencia_id);

CREATE INDEX idx_vendas_data    ON vendas (data);
CREATE INDEX idx_vendas_cliente ON vendas (cliente_id);
CREATE INDEX idx_vendas_status  ON vendas (status);
CREATE INDEX idx_vendas_itens_venda   ON vendas_itens (venda_id);
CREATE INDEX idx_vendas_itens_produto ON vendas_itens (produto_id);
CREATE INDEX idx_receb_venda ON vendas_recebimentos (venda_id);

CREATE INDEX idx_lanc_competencia ON financeiro_lancamentos (data_competencia);
CREATE INDEX idx_lanc_caixa       ON financeiro_lancamentos (data_caixa);
CREATE INDEX idx_lanc_ref         ON financeiro_lancamentos (referencia_tipo, referencia_id);
CREATE INDEX idx_lanc_natureza    ON financeiro_lancamentos (natureza, status);

CREATE INDEX idx_sessoes_expira ON sessoes (expira_em);
CREATE INDEX idx_auditoria_entidade ON auditoria (entidade, entidade_id);
