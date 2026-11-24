# Plano de construção do repositório — rastreabilidade

O documento de engenharia original ("Flor de Pitanga — Plano de Construção do Repositório") foi a especificação desta implementação. Este arquivo mapeia **cada seção do plano ao código que a atende**, e registra com clareza onde a implementação interpretou ou se afastou do texto.

## Mapa seção → implementação

| Seção do plano              | Onde está                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Decisões de arquitetura  | Monorepo npm workspaces; Express 5; `better-sqlite3` sem ORM; Zod em `packages/shared`; Vite + TanStack Query + react-hook-form; Tailwind; Recharts; Vitest + Supertest; pino (+ pino-roll); argon2. ADRs 0001–0006.            |
| 2. Estrutura do repositório | Idêntica à do plano (`packages/{shared,core}`, `apps/{api,web,desktop}`, `tools/`, `docs/`, `dados/` ignorado pelo git).                                                                                                        |
| 3. Convenções               | Português no domínio; camadas rota → serviço → repositório; transações no serviço; erros de domínio (`apps/api/src/erros.ts`); nada de exclusão física.                                                                         |
| 4. Camada de dados          | `db/connection.ts` (PRAGMAs, função `norm` para buscas sem acento); `db/migrate.ts` (checksum, cópia pré-migração); inteiros para dinheiro/quantidade em `packages/shared/src/money.ts` e `quantity.ts`; conversão de unidades. |
| 5. Modelo de dados          | `db/migrations/0001_inicial.sql` + `0002_indices.sql` + `0003_dados_base.sql`. Ver [modelo-de-dados.md](modelo-de-dados.md).                                                                                                    |
| 6. Regras de cálculo        | `packages/core/src/{estoque,custeio,precificacao}`. Ver [regras-de-custeio.md](regras-de-custeio.md). Testes reproduzem os exemplos numéricos do plano.                                                                         |
| 7. Regras financeiras       | `packages/core/src/financeiro` (matriz de lançamentos e `apurar`); `apps/api/src/services/financeiro.service.ts`.                                                                                                               |
| 8. API local                | `apps/api/src/routes/*` — escuta só em `127.0.0.1:1971`, envelope `{dados, paginacao}` / `{erro}`, `Idempotency-Key`, validação Zod, checagem de origem. Invariantes: `services/invariantes.service.ts`.                        |
| 9. Frontend                 | `apps/web/src/features/*` por funcionalidade; `components/ui`; `lib/api.ts` único; cálculo em tempo real com `@pitanga/core`; fontes e ícones empacotados; `pages/guia-de-estilo.tsx`.                                          |
| 10. Backup e integridade    | `apps/api/src/backup/index.ts` (VACUUM INTO, integrity_check, manifesto com sha256, restauração com cópia prévia, retenção, rotina diária); CSV em `relatorios/`.                                                               |
| 11. Testes                  | Vitest em todos os pacotes; Supertest; verificação das dez invariantes em teste e em `db:check`. Playwright: ver "Pendências".                                                                                                  |
| 12. Empacotamento           | `tools/dist-win.mjs` (instalador, pasta com Node embutido e testes de fumaça), `tools/windows/*` (modo suporte), `apps/desktop` (Electron).                                                                                     |
| 13. Riscos                  | Mitigações no código: recusa de pasta sincronizada, `engines`/`.nvmrc`, `GET /saude`, backup automático, redimensionamento de fotos, CLI de redefinição de senha.                                                               |
| 14. Etapas 0–8              | Todas entregues (veja CHANGELOG). Etapa 9 (estabilização com uso real) depende de uso e fica aberta.                                                                                                                            |

## Interpretações e desvios (leia antes de usar em produção)

1. **Custo de estoque × custo gerencial.** O plano (6.3) diz que o custo de estoque inclui "extras e rateios pagos a terceiros", mas também exige que a produção não gere lançamento financeiro (7.1) e que a invariante 10 (caixa + estoque + a receber = resultado) feche. As três coisas só são compatíveis se extras e rateios ficarem **fora** do estoque (seu desembolso já foi lançado como compra/despesa). Implementado assim; ver ADR 0006.
2. **Despesas compartilhadas** sempre afetam o resultado no dia do pagamento (o plano diz "0 ou 1, conforme o tipo"); o rateio é só de custeio. Pela mesma razão do item 1.
3. **Compra com despesa "não rateia"**: gera um lançamento de despesa operacional separado (resultado = sim), para que o caixa e o resultado fechem; a parte rateada segue num único lançamento `compra_material` (resultado = não).
4. **"Recebido"** soma recebimentos de vendas e outras receitas no caixa; **aportes** da sócia ficam fora (aparecem no saldo de caixa).
5. **`PUT /fichas/:id`**: se a ficha nunca foi usada em produção é corrigida no lugar; se foi usada, cria a versão seguinte (o plano diz "cria nova versão" sempre — aqui evitamos poluir o histórico com rascunhos).
6. **Estoque negativo**: a autorização no diálogo só vale com `permite_estoque_negativo = 1` nas Configurações (padrão desligado); com a opção desligada o sistema sempre recusa e lista o que falta.
7. **Tabelas e colunas acrescentadas**: `sessoes`, `idempotencia`, `despesas_rateios.producao_id`, `produtos.mao_obra_pendente_media`, `vendas_itens.mao_obra_unitaria`.
8. **Node**: o plano fixa o Node 22 LTS; o código roda no 22 e foi desenvolvido/testado no Node 26.
9. **Seção 11 e a seção 8 do _Planejamento v2_** (tokens de design e a lista dos "sete blocos") não estavam disponíveis. Os tokens (paleta pitanga/folha/creme, Fraunces + Inter) foram desenhados aqui, em `apps/web/src/styles/tokens.css`; os sete blocos seguem as fórmulas da seção 7.1 (Faturamento, Recebido, Despesas pagas, CMV, Lucro/Prejuízo, Saldo de caixa, Contas a receber). Revise ambos contra o documento de requisitos.
10. **Tailwind 3 + componentes próprios** no estilo shadcn/ui (sem rodar o CLI do shadcn), para manter a dependência sob controle do repositório.

## Pendências

- **Playwright** (opcional, etapa 8): não implementado. O fluxo comprar → produzir → vender → receber está coberto por testes de API (Supertest) e foi verificado manualmente no navegador.
- **Instalador `.exe`**: gerado por `npm run dist:win` (e no CI), com teste de fumaça do conteúdo. Falta validar em Windows 11 limpo, com conta padrão.
- **Validação em Windows 11 limpo**, treinamento das usuárias e etapa 9 dependem de pessoas e de uso real.
- Assinatura digital do instalador: dispensada pelo cliente (ADR 0007).
