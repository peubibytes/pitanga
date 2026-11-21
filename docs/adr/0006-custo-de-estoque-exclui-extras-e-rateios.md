# ADR 0006 — Custo de estoque não inclui extras da ficha nem rateios

**Status:** aceita (interpretação do plano, seções 6.3 e 7)

## Contexto

O plano define dois custos por lote: o **gerencial** (materiais + mão de obra + extras + rateios, para formar preço) e o **de estoque** (para valorar acabados e calcular o CMV). Diz que o de estoque inclui "materiais consumidos + extras e rateios pagos a terceiros", mas também que a produção **não gera lançamento financeiro** (exceto mão de obra paga) e que a conferência `variação de caixa + variação de estoque + contas a receber = resultado` deve fechar.

Se extras e rateios entrassem no estoque sem lançamento financeiro, o estoque cresceria sem contrapartida em caixa ou resultado; se entrassem **e** gerassem despesa na produção, o mesmo dinheiro seria contado duas vezes (já foi pago como compra, despesa operacional ou despesa compartilhada).

## Decisão

O custo de estoque contém:

- os **materiais consumidos**, ao custo médio do momento; e
- a **mão de obra**, **somente se foi paga** (`remunera_mao_obra_propria = 1`), com o lançamento de caixa correspondente (`mao_obra`, sem efeito no resultado).

Extras da ficha e rateios de despesas compartilhadas ficam **só no custo gerencial**: orientam o preço, não o valor do estoque. Despesas compartilhadas afetam o resultado no dia do pagamento; o rateio é puramente de custeio.

## Consequências

- A invariante 10 fecha por construção e é verificada em testes e em `db:check`.
- O CMV de uma venda reflete o que realmente saiu do estoque; custos como transporte e embalagem aparecem no resultado do período em que foram pagos, e não "escondidos" no estoque.
- A margem real de um produto pode ser um pouco mais otimista no CMV que o custo gerencial usado no preço; a tela de venda e o resumo mostram também o lucro após remunerar o próprio trabalho.
- Se o negócio preferir capitalizar esses custos no estoque, é uma mudança deliberada: exige um lançamento de contrapartida na produção e novo ADR.
