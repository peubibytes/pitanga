# ADR 0004 — Compra de matéria-prima não é despesa de resultado

**Status:** aceita

## Contexto

O planejamento pede para não contabilizar a matéria-prima duas vezes: como despesa **e** como custo de produção.

## Decisão

Comprar matéria-prima é **troca de dinheiro por estoque**. Cada fato é classificado em duas dimensões independentes no razão `financeiro_lancamentos`:

- `afeta_caixa` (na `data_caixa`)
- `afeta_resultado` (na `data_competencia`)

A compra gera um lançamento `compra_material` com `afeta_caixa = 1` e `afeta_resultado = 0`. O valor vira resultado só na venda, como CMV (`afeta_resultado = 1`, `afeta_caixa = 0`). A receita é reconhecida **uma vez**, na venda; o recebimento movimenta só o caixa. Cancelamentos geram lançamentos de estorno com sinal oposto.

A consistência é garantida por uma conferência obrigatória (invariante 10): `variação de caixa + variação de estoque + contas a receber = resultado`.

## Consequências

- Caixa negativo com lucro positivo é possível (dinheiro parado em estoque) e é exibido de forma explícita — caixa e lucro são mostrados separados.
- Todo bloco do resumo financeiro sai da mesma apuração (`apurar`, em `packages/core`), sem cálculo paralelo.
- Despesas que não compõem o custo do material (ex.: estacionamento marcado "não rateia") viram despesa operacional à parte.
