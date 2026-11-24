# ADR 0005 — Empacotamento no Windows

**Status:** aceita; a Fase 2 virou o entregável padrão na [ADR 0007](0007-abertura-sem-terminal.md)

## Contexto

A usuária final não deve ver navegador, porta ou terminal no longo prazo, mas a primeira entrega precisa ser simples e inspecionável. O `better-sqlite3` é módulo nativo.

## Opções

1. **Pasta portátil** com Node embutido e `iniciar.bat`.
2. **Electron** (janela própria, instalador `.exe`).
3. Executável único (`node --experimental-sea` / `pkg`).

## Decisão

- **Fase 1 (entregue):** pasta portátil — `runtime/node.exe` + API empacotada (tsup) + front estático + dependências de produção instaladas para **esse** Node. `tools/dist-win.mjs` monta, instala e executa um teste de fumaça.
- **Fase 2 (opcional):** casca Electron em `apps/desktop` que sobe a API como processo filho **com o Node embutido** e abre uma janela única. Isso evita recompilar o `better-sqlite3` para o ABI do Electron.
- **Descartado:** executável único. Módulos nativos por versão de Node/arquitetura tornam `pkg`/SEA frágeis.

Dados em `%LOCALAPPDATA%\FlorDePitanga`, fora de `Program Files`, sem exigir administrador. Recusa de pastas sincronizadas na nuvem. SmartScreen pode alertar sobre binário sem assinatura: documentado no manual; assinar o instalador exige certificado.

## Consequências

- A pasta portátil funciona sem instalação e é fácil de atualizar (trocar `app/` e `runtime/`).
- Atualizar o Node exige reempacotar (o módulo nativo acompanha a versão).
