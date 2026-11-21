# ADR 0003 — Inteiros para dinheiro e quantidade

**Status:** aceita

## Contexto

Ponto flutuante acumula erro (0,1 + 0,2 ≠ 0,3) e faz somas de rateios deixarem de fechar. O sistema precisa que "a soma das partes seja exatamente o todo".

## Decisão

Toda grandeza é inteira:

| Grandeza          | Unidade                        | Exemplo                |
| ----------------- | ------------------------------ | ---------------------- |
| Totais monetários | centavos                       | R$ 1.234,56 → `123456` |
| Valores unitários | micro-reais (R$ × 10⁻⁶)        | R$ 0,0375/ml → `37500` |
| Quantidades       | mili-unidades (× 10⁻³)         | 250 ml → `250000`      |
| Percentuais       | centésimos de ponto percentual | 12,5% → `1250`         |

O cálculo é em inteiros; `mulDiv(a, b, d)` usa BigInt e arredonda meio-para-cima (para longe do zero nos negativos) **só na fronteira**. Rateios usam `ratear`, que põe a diferença de arredondamento na maior parcela. Formatação e leitura de entrada em `packages/shared` (`Intl` pt-BR). Os valores trafegam na API sempre inteiros, nunca formatados.

## Consequências

- Somas exatas e testáveis; nenhum `Number` com casas decimais no domínio.
- O estoque de materiais é controlado na **unidade base** (`un`, `ml`, `g`, `m`); 1,5 kg é 1.500 g, ou seja, `1.500.000` mili-gramas (o exemplo "1500 base kg" do plano refere-se a mili-kg; aqui a base é o grama, conforme a seção 4.3).
- Desenvolvedores precisam saber a escala de cada campo — documentada em `docs/modelo-de-dados.md`.
