# Flor de Pitanga

Gestão de ateliê artesanal: **materiais e custo médio, fichas técnicas, formação de preço, produção, vendas, financeiro e backup** — numa aplicação local para Windows 11, com Node.js, React e SQLite.

> Construído a partir do _Plano de Construção do Repositório_ (`docs/plano-repositorio.md` mapeia cada seção do plano ao código).

```
React (navegador ou janela do app)
        │  HTTP/JSON em 127.0.0.1
        ▼
API Node (Express 5) ── serviços ── repositórios (SQL explícito)
        │
        ▼
SQLite (arquivo único)  +  pasta de fotos
```

O navegador nunca toca no banco: a API local é a única dona do arquivo SQLite.

## Requisitos

- **Node.js 22 LTS ou superior** (`.nvmrc` fixa 22; testado também no Node 26) e **npm 10+**.
- Windows 11 (desenvolvimento também funciona em outros sistemas).
- `better-sqlite3`, `argon2` e `sharp` são módulos nativos com binários prontos. Se o npm bloquear scripts de instalação (npm 11), rode `npm install-scripts approve` ou `npm rebuild`.

## Começando

```powershell
npm install
npm run db:reset      # cria o banco com 3 meses de dados fictícios
npm run dev           # API em http://127.0.0.1:1971 e front em http://127.0.0.1:5173
```

O aplicativo roda 100% local, em `http://127.0.0.1:1971`, **sem tela de entrada**: a API só escuta em `127.0.0.1` e toda requisição age como a primeira administradora ativa (criada automaticamente, com o nome "Ateliê", se o banco não tiver nenhuma). Requisições com cabeçalho `Host` ou `Origin` de fora da máquina são recusadas (proteção contra DNS rebinding e CSRF).

Para rodar como em produção (um processo, uma porta):

```powershell
npm run build
npm start             # http://127.0.0.1:1971
```

### Scripts

| Script                                              | Ação                                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run dev`                                       | Sobe API (`tsx watch`) e front (Vite) em paralelo                                                  |
| `npm run build`                                     | Valida `shared` e `core`, empacota a API (tsup) e gera o estático do front                         |
| `npm start`                                         | Roda a API compilada servindo o front já construído                                                |
| `npm run db:migrate`                                | Aplica migrations pendentes                                                                        |
| `npm run db:seed` / `db:reset`                      | Dados fictícios (reset apaga e recria — só em desenvolvimento)                                     |
| `npm run db:check`                                  | Confere as dez invariantes e o `integrity_check`                                                   |
| `npm run backup` / `npm run restore -- <zip> --sim` | Backup e restauração pela linha de comando                                                         |
| `npm run senha -- <usuario> <nova>`                 | Redefine a senha de uma usuária (esquecimento)                                                     |
| `npm test`                                          | Vitest em todos os pacotes                                                                         |
| `npm run lint` / `npm run typecheck`                | ESLint e `tsc --noEmit`                                                                            |
| `npm run dist:win`                                  | Instalador do Windows (`release/instalador/*.exe`); `-- --sem-instalador` gera só a pasta portátil |
| `npm run icone`                                     | Regera o ícone do aplicativo a partir de `favicon.svg`                                             |

### Onde ficam os dados

`dados/` na raiz (desenvolvimento) ou `%LOCALAPPDATA%\FlorDePitanga` (produção no Windows). Contém o banco, `fotos/`, `backups/` e `logs/` — **nunca versionados**. Variáveis: `FDP_DATA_DIR`, `FDP_PORT`, `FDP_RETENCAO_BACKUPS`. O aplicativo **recusa iniciar** se a pasta de dados estiver em OneDrive/Dropbox/Google Drive/iCloud.

## Estrutura

```
packages/shared   contratos (Zod), dinheiro/quantidade em inteiros, formatação pt-BR
packages/core     regras de cálculo puras: custo médio, ficha, lote, preço, apuração financeira
apps/api          Express + better-sqlite3: rotas → serviços → repositórios → SQL
apps/web          React + Vite + TanStack Query + react-hook-form + Tailwind
apps/desktop      casca Electron: janela própria que sobe a API e a encerra ao fechar (ADR 0007)
tools/            CLIs (db, backup, senha), empacotamento e scripts do Windows
docs/             modelo de dados, regras de custeio, manual da usuária, operação, ADRs
```

`shared` e `core` são consumidos como código-fonte TypeScript (a API os embute no build; o Vite os compila no front). O que roda no navegador é **a mesma fórmula** que o servidor usa — e o servidor é sempre a autoridade final na gravação.

## Princípios

1. Dinheiro e quantidade são **inteiros** (centavos, micro-reais, mili-unidades). Nada de ponto flutuante.
2. **Comprar matéria-prima não é despesa**: é troca de dinheiro por estoque; vira custo na venda (CMV).
3. Custo **gerencial** (preço) e custo de **estoque** são números diferentes.
4. Fichas são **versionadas** e o custo de cada lote é **congelado** na gravação.
5. **Nada é apagado**: cancelar é estornar, com rastro em auditoria.
6. Sem ORM, sem nuvem, sem container.

Detalhes em [`docs/`](docs): [modelo de dados](docs/modelo-de-dados.md) · [regras de custeio](docs/regras-de-custeio.md) · [operação no Windows](docs/operacao-windows.md) · [manual da usuária](docs/manual-da-usuaria.md) · [ADRs](docs/adr).

## Convenções

Domínio em português (tabelas, rotas, tipos), termos técnicos em inglês. Commits em [Conventional Commits](https://www.conventionalcommits.org/) (`feat(vendas): registrar recebimento parcial`), branches `feat/<assunto>`, tags semânticas por etapa. Camadas: rota → serviço → repositório → banco; cálculo puro mora em `packages/core`.

## Qualidade

- `packages/core` e `packages/shared`: fórmulas, arredondamentos e exemplos numéricos do plano.
- `apps/api`: Supertest sobre SQLite em arquivo temporário — ciclo comprar → produzir → vender → receber, cancelamentos, backup/restauração, fotos, CSV, idempotência.
- `apps/web`: Testing Library — máscaras de entrada, estados vazio/erro/carregando, confirmações destrutivas.
- CI (`.github/workflows/ci.yml`): lint, typecheck, testes, build e `db:check` sobre a base fictícia.
