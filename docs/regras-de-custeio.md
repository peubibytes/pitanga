# Regras de custeio

Todas as fórmulas vivem em `packages/core` como **funções puras** (sem banco) e são cobertas por testes. A mesma função roda no navegador (cálculo em tempo real) e no servidor (autoridade final na gravação).

Unidades: totais em **centavos**; valores unitários em **micro-reais** (R$ × 10⁻⁶); quantidades em **mili-unidades**; percentuais em **centésimos de ponto percentual** (12,5% → `1250`). O arredondamento é meio-para-cima e só acontece na fronteira (`mulDiv` usa BigInt, sem perder precisão).

## 1. Custo médio móvel da matéria-prima

A cada compra, por item:

```
custo_unitario_final = (valor_total_item + despesa_rateada) ÷ quantidade_base
custo_medio_novo     = (estoque × custo_medio + valor_da_entrada) ÷ (estoque + quantidade_base)
```

Despesas da compra são rateadas entre os itens **por valor** ou **por quantidade**; a sobra de arredondamento vai para o item de maior peso, de modo que a soma fecha exatamente com a despesa. Uma despesa marcada "não rateia" é desembolso à parte (despesa do período) e não compõe o custo do material.

**Exemplo** (teste `core.test.ts` e `fluxo.test.ts`): estoque de 500 ml a R$ 0,18/ml; compra de 1 L por R$ 150,00 com R$ 10,00 de transporte por valor.

- custo final da compra: (150,00 + 10,00) ÷ 1000 = **R$ 0,160000/ml**
- novo custo médio: (500 × 0,18 + 1000 × 0,16) ÷ 1500 = **R$ 0,166667/ml**

Com estoque zerado ou negativo, o custo médio passa a ser o custo da própria entrada. Cancelar uma compra desfaz a entrada **pelo valor original** (e recompõe o custo médio); se o material já foi consumido, o cancelamento é recusado.

## 2. Custo da ficha técnica (por peça)

```
materiais   = Σ (quantidade_do_item × custo_medio_do_material) ÷ rendimento
mao_de_obra = hora → valor_hora × minutos ÷ 60   |   fixo → valor_fixo   (por rendimento, ÷ rendimento)
extras      = Σ extras por peça  +  Σ extras do lote ÷ rendimento
rateios     = despesas compartilhadas ainda não apropriadas ÷ peças
custo_unitario = materiais + mao_de_obra + extras + rateios
```

A ficha guarda a **versão**; o custo é recalculado com o custo médio vigente ao abrir a tela e **congelado** ao registrar uma produção.

## 3. Custo do lote: gerencial × estoque

Ao registrar uma produção o servidor grava dois custos diferentes:

| Coluna                                           | Conteúdo                                             | Para quê                           |
| ------------------------------------------------ | ---------------------------------------------------- | ---------------------------------- |
| `custo_total` / `custo_unitario`                 | materiais + mão de obra + extras + rateios           | formação de preço e rentabilidade  |
| `custo_estoque_total` / `custo_estoque_unitario` | materiais consumidos (+ mão de obra **se foi paga**) | valor do estoque de acabados e CMV |

O trabalho da artesã **entra no preço** mas **não infla o estoque** enquanto não houver desembolso. Com `remunera_mao_obra_propria = 1` a produção gera um lançamento de caixa (`mao_obra`, sem efeito no resultado) e a mão de obra passa a integrar o estoque.

> **Decisão de interpretação:** extras da ficha e despesas compartilhadas aparecem só no custo **gerencial**, não no de estoque. O desembolso correspondente já foi (ou será) lançado como compra ou despesa no seu próprio dia; somá-lo também ao estoque contaria o mesmo dinheiro duas vezes e quebraria a invariante 10. Veja ADR 0006.

## 4. Formação do preço

`C` = custo base, `F` = taxas fixas, `p` = taxas percentuais sobre o preço. `lucro(P) = P × (1 − p) − (C + F)`.

| Modalidade              | Entrada | Preço sugerido                    |
| ----------------------- | ------- | --------------------------------- |
| Lucro em valor          | `L`     | `P = (C + F + L) ÷ (1 − p)`       |
| Acréscimo sobre o custo | `a`     | `P = (C + F) × (1 + a) ÷ (1 − p)` |
| Margem sobre o preço    | `m`     | `P = (C + F) ÷ (1 − p − m)`       |

Erros explicativos: taxas ≥ 100%; margem + taxas ≥ 100% do preço. Taxa percentual "sobre o custo" vira valor fixo. Depois de ajustar o preço à mão: `lucro_previsto`, `margem_efetiva` e alerta de **prejuízo** (preço abaixo do custo), além do preço de equilíbrio.

**Exemplo — difusor de 200 ml** (materiais R$ 15,85 + 12 min a R$ 25/h = R$ 5,00 → C = R$ 20,85; cartão 3,5%):

| Modalidade              | Entrada  | Preço    | Lucro    | Margem |
| ----------------------- | -------- | -------- | -------- | ------ |
| Lucro em valor          | R$ 15,00 | R$ 37,15 | R$ 15,00 | 40,4%  |
| Acréscimo sobre o custo | 70%      | R$ 36,73 | R$ 14,59 | 39,7%  |
| Margem sobre o preço    | 40%      | R$ 36,90 | R$ 14,76 | 40,0%  |

## 5. CMV e lucro por venda

O estoque de acabados é avaliado por **custo médio ponderado**. Na venda, o custo unitário é copiado e congelado em `vendas_itens`:

```
cmv_da_venda   = Σ quantidade × custo_unitario_congelado
lucro_estimado = total_da_venda − cmv_da_venda
```

Cancelar a venda devolve o estoque pelo custo **original**.

## 6. Resultado × caixa (prevenção de dupla contagem)

Cada operação é classificada em duas dimensões independentes: `afeta_caixa` (na `data_caixa`) e `afeta_resultado` (na `data_competencia`).

| Operação                | Caixa           | Resultado               |
| ----------------------- | --------------- | ----------------------- |
| Compra de matéria-prima | **sim**         | não                     |
| Despesa operacional     | sim             | sim                     |
| Mão de obra paga        | sim             | não (integra o estoque) |
| Produção de lote        | —               | —                       |
| Venda (receita)         | não, no momento | **sim**                 |
| Recebimento da venda    | **sim**         | não                     |
| CMV na venda            | não             | **sim**                 |
| Ajuste de estoque       | não             | sim                     |
| Aporte / retirada       | sim             | não                     |

```
Faturamento    = Σ receitas de venda por competência
Recebido       = Σ recebimentos e outras receitas no caixa
Despesas pagas = Σ despesa operacional + mão de obra no caixa (sem compra de material)
CMV            = Σ lançamentos de natureza cmv
Lucro          = Σ (afeta resultado): receitas − despesas
Saldo de caixa = Σ (afeta caixa): receitas − despesas
A receber      = Σ (total − recebimentos) das vendas não canceladas
```

Estornos entram com sinal oposto e anulam o original sem apagá-lo.

**Exemplo de um mês** (teste de ciclo completo): compra R$ 500,00 à vista; produção de 20 difusores (R$ 317,00 de material); venda de 10 a R$ 36,90 recebida na hora; CMV de 10 × R$ 15,85.

|           | Caixa        | Resultado    | Estoque             |
| --------- | ------------ | ------------ | ------------------- |
| Compra    | − 500,00     | —            | + 500,00            |
| Produção  | —            | —            | − 317,00 / + 317,00 |
| Venda     | + 369,00     | + 369,00     | —                   |
| CMV       | —            | − 158,50     | − 158,50            |
| **Total** | **− 131,00** | **+ 210,50** | **+ 341,50**        |

`variação de caixa + variação de estoque + contas a receber = resultado` → −131,00 + 341,50 + 0 = **210,50** ✔. Caixa negativo com lucro positivo é normal em artesanato: dinheiro parado em estoque.

Linha opcional **"lucro após remunerar o próprio trabalho"**: o resultado menos a mão de obra própria (não paga) das peças vendidas, calculada com o valor congelado em cada item vendido.
