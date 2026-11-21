# ADR 0001 — SQLite com better-sqlite3

**Status:** aceita

## Contexto

O sistema roda em um computador, com duas usuárias e uma única API. Os dados são financeiros: durabilidade e transações reais importam mais que velocidade ou escala.

## Decisão

Usar **SQLite** (arquivo único) pelo driver **better-sqlite3**, síncrono, com `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = FULL`, `busy_timeout = 5000`. A API é o único processo escritor; transações curtas. Backups por `VACUUM INTO` e verificação por `PRAGMA integrity_check`.

## Consequências

- Sem servidor de banco para instalar ou manter; backup é copiar um arquivo consistente.
- A API síncrona simplifica transações (sem pool, sem `await` dentro de transação).
- Módulo nativo: exige binário compatível com a versão do Node (`engines`/`.nvmrc`, `npm rebuild`).
- Um escritor por vez e acesso só pela máquina local; uso por duas máquinas ao mesmo tempo **não** é suportado. Se um dia for preciso, a API passa a escutar na rede local e o front continua falando só com ela.
- Pasta sincronizada na nuvem corrompe o arquivo em uso: o aplicativo recusa iniciar nesses caminhos.
