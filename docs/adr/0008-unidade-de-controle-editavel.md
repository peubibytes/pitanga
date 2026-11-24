# ADR 0008 — Troca da unidade de controle de um material já usado

**Status:** aceita

## Contexto

A unidade de um material (`un`, `ml`, `g`, `m`) travava assim que houvesse movimento. O cliente precisa trocar mesmo assim (ex.: "Álcool de Cereais 1lt", cadastrado em ml e já comprado). As quatro unidades têm bases diferentes, então toda troca exige um fator informado ("1 un = 1000 ml"). As quantidades são inteiras em mili-unidades ([ADR 0003](0003-inteiros-para-dinheiro-e-quantidade.md)): passar para uma unidade maior pode arredondar.

## Opções

1. **Converter tudo no lugar**, com os números originais na auditoria.
2. **Registrar a virada** e manter o histórico na unidade antiga. Exigiria unidade por linha em quatro tabelas e fator encadeado em cancelamentos, gráfico de custo e relatórios.

## Decisão

Opção 1. As unidades de controle continuam as quatro: `l`, `kg` ou `cm` como controle exigiriam fator fracionário nas compras e teriam a mesma perda de precisão.

| Tabela                 | Converte                                       | Não muda                                              |
| ---------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `materiais`            | unidade, estoque, mínimo, custo médio          |                                                       |
| `materiais_movimentos` | quantidade, saldo, custo unitário, custo médio | `custo_total`                                         |
| `compras_itens`        | `quantidade_base`, `custo_unitario_final`      | o que foi digitado, valores pagos e `fator_conversao` |
| `fichas_itens`         | quantidade, em todas as versões                |                                                       |
| `producoes_consumos`   | quantidade, custo unitário                     | `custo_total`                                         |

Produções, preços, vendas e financeiro só guardam dinheiro ou peças. `fator_conversao` é inteiro e descreve a compra no dia em que foi feita; nada o lê depois.

**Arredondamento**

- _Fator_ em dois inteiros (`nova`, `atual`), nunca decimal. Quantidade: `× nova ÷ atual`; custo: `× atual ÷ nova`.
- _Movimentos:_ converte-se o saldo acumulado, e cada movimento é a diferença entre saldos. Linha a linha, a soma foge do saldo e quebra a invariante 1.
- _Compras e consumos_ copiam a quantidade do próprio movimento, para os cancelamentos devolverem exatamente o que entrou ou saiu.
- _Dinheiro:_ nenhum `custo_total` muda; caixa, resultado e invariante 10 ficam idênticos. O "valor em estoque" exibido (estoque × custo médio) pode variar centavos, e a prévia mostra.
- _Receitas ativas:_ até 1% de diferença passa direto e aparece na prévia. Acima disso, ou se zerar, a usuária aceita a mais próxima ou digita outra, receita por receita. Se a receita já foi usada em produção, a versão usada só muda de unidade e a quantidade escolhida vai para uma versão nova.
- Estoque ou custo que virariam zero são recusados (fator provavelmente errado).

**Segurança**

- A prévia não grava. A confirmação leva a assinatura (sha256 de tudo o que entra na conta) e é recusada se algo mudou (`PREVIA_DESATUALIZADA`).
- Backup `pre-troca-unidade-*.zip` antes; se falhar, nada acontece. Origem `automatico`, para não exigir migration em `backups`.
- Uma transação converte tudo, confere as invariantes e grava a auditoria com fator, motivo, decisões, backup e os valores originais de cada linha.
- Receitas e ajustes enviam a unidade que a tela mostrava; se ela mudou, a API recusa (`UNIDADE_DESATUALIZADA`). O front descarta o cache das outras telas depois da troca.
- O `PUT` comum continua recusando a troca (`UNIDADE_TRAVADA`) se houver movimentos ou receitas.

## Consequências

- Esta é a única operação que reescreve linhas do razão. Os originais ficam na auditoria e no backup.
- Depois de ir para uma unidade maior, toda receita nova tem passo mínimo de 0,001 dessa unidade (1 ml, se 1 un = 1000 ml). Voltar não recupera o que foi arredondado; o assistente avisa.
- Sem migration: funciona sobre o banco existente.
