# ADR 0002 — Sem ORM: SQL explícito em repositórios

**Status:** aceita

## Contexto

Custeio e CMV dependem de consultas previsíveis: movimento de estoque, custo congelado, lançamentos com duas dimensões (caixa e resultado). Um ORM esconderia o SQL justamente onde precisamos auditá-lo.

## Decisão

Escrever SQL à mão em `apps/api/src/repositories/`, com mapeamento explícito `snake_case` → `camelCase` por alias. Regra de negócio fica nos serviços (que abrem as transações); cálculo puro fica em `packages/core`; rotas não escrevem SQL. Migrations são arquivos `.sql` numerados, aplicados por um runner próprio com checksum.

## Consequências

- Consultas legíveis e revisáveis por qualquer desenvolvedor; nenhuma "mágica" de carregamento.
- Mais texto de SQL e mapeadores manuais; compensado por tipos nos repositórios e pelos testes de integração.
- Sem lock-in e com o menor número de dependências para o cliente manter.
