# Manual da usuária — Flor de Pitanga

Este guia usa a ordem em que o trabalho acontece no ateliê: cadastrar, comprar, montar a ficha, produzir, vender e acompanhar. Você não precisa saber nada de computação.

## 1. Abrindo o sistema

O Flor de Pitanga roda só no seu computador, em `http://127.0.0.1:1971`, e não pede usuário nem senha: ao abrir, você já vê o **Painel**. O menu à esquerda leva a todas as telas; o botão _Recolher_ deixa só os ícones.

## 2. Cadastros

- **Clientes** — nome, telefone e observações (aromas favoritos, datas especiais). Na ficha do cliente você vê o total comprado, as compras e o que ele ainda deve. Vendas sem cliente ficam como "consumidor não identificado".
- **Fornecedores** — as lojas onde você compra.
- **Materiais** — essências, frascos, varetas, cera… Escolha a **unidade de controle** (unidade, ml, g ou metro). Você pode comprar em litro, quilo ou caixa: o sistema converte. Defina o **estoque mínimo** para ser avisada. Para corrigir um cadastro, use o botão **Editar** na linha do material.
- **Produtos** — o que você vende, com foto, descrição e categoria.

## 3. Comprar material

_Compras → Registrar compra._ Informe os itens, a quantidade, a unidade e **quanto pagou**. Se pagou transporte ou estacionamento, adicione em _Despesas da compra_:

- **Ratear por valor/quantidade**: o custo extra entra no custo do material (é o custo "posto no ateliê").
- **Não compõe o custo**: é uma despesa à parte.

Enquanto digita, a tela mostra quanto entra no estoque e como o **custo médio** muda. Errou? Abra a compra e use **Cancelar compra** (só se o material ainda não foi usado).

> Comprar material **não é gasto do mês**: é dinheiro que virou estoque. O gasto só aparece quando você vende o produto.

## 4. Ficha técnica

_Produtos → (produto) → Ficha técnica._ Liste o que entra em **uma peça** (ou em um lote — informe quantas peças ele rende), a **mão de obra** (por hora ou valor fixo) e outros custos (embalagem, transporte). À direita você vê o **custo da peça** mudando enquanto digita.

Se editar uma ficha que já foi usada em produção, ela vira a **versão seguinte** — os lotes antigos continuam com o custo que tinham.

## 5. Preço

_Precificar_ oferece três jeitos de chegar ao preço: **lucro em reais**, **acréscimo sobre o custo** ou **margem sobre o preço**. Marque as taxas que incidem (taxa de cartão, comissão). Você pode ajustar o preço à mão (R$ 36,90, por exemplo) e ver na hora o **lucro** e a **margem**. Se o preço ficar abaixo do custo, aparece o alerta de **prejuízo** em vermelho-pitanga. Use _Salvar e aplicar ao produto_ para valer.

Despesas que servem a vários produtos (frete da feira, embalagens de uma campanha) vão em _Financeiro → Despesas compartilhadas_: você paga **uma vez** e distribui o custo entre os produtos.

## 6. Produzir

_Produção → Registrar produção._ Escolha o produto e a quantidade. A tela mostra cada material necessário, o que há em estoque e o que **falta** (em vermelho). Registrando, os materiais saem do estoque e as peças entram no estoque de produtos. O custo do lote fica guardado: compras futuras mais caras não mudam o que aquele lote custou.

Se faltar material, o sistema recusa e diz exatamente o quê. (Nas _Configurações_ a administradora pode permitir produzir com estoque negativo, sempre com justificativa.)

## 7. Vender

_Vendas → Nova venda._ Escolha o cliente (ou deixe em branco), os produtos, descontos e a forma de pagamento. O preço vem do cadastro e você pode alterá-lo. Em _Recebimento_ diga se recebeu **tudo**, **uma parte** ou **só depois**. Vendas pendentes aparecem em _A receber_; use **Registrar recebimento** quando o dinheiro chegar — a venda não conta duas vezes.

Cancelar uma venda devolve as peças ao estoque e desfaz os valores; nada é apagado.

## 8. Entender os números

**Painel** — vendas, faturamento, lucro ou prejuízo, saldo de caixa, o que falta receber, produtos mais vendidos e materiais acabando.

**Financeiro** — _Resumo_ (faturamento, recebido, despesas, custo dos produtos vendidos, lucro, caixa, a receber), _Extrato_ (cada lançamento), _Caixa_ (saldo por dia) e _Despesas compartilhadas_.

Lembre-se: **caixa negativo com lucro positivo é normal** — o dinheiro está parado em estoque. Por isso os dois aparecem separados. A linha _Lucro após seu trabalho_ mostra o resultado descontando o valor da sua mão de obra.

**Relatórios** — vendas, compras, estoque, financeiro e mais. _Baixar CSV_ abre direto no Excel; _Imprimir_ usa uma folha limpa.

## 9. Cuide dos seus dados

- O sistema faz **um backup por dia**. Na tela _Backup_ você também pode fazer um agora.
- De vez em quando, **copie o arquivo .zip** do backup para um pendrive ou para a nuvem.
- Se o computador der problema: instale o aplicativo na outra máquina, importe o .zip em _Backup_ e restaure.
- **Nunca** coloque a pasta de dados dentro do OneDrive ou Dropbox.

## 10. Dúvidas frequentes

**O custo de um material mudou sozinho.** É o custo médio: a cada compra ele é recalculado com o que você pagou.
**Não consigo cancelar uma compra.** O material já foi usado em produção. Use um ajuste de estoque com justificativa.
**Não consigo cancelar uma produção.** Parte das peças já foi vendida; cancele as vendas antes.
