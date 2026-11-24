# ADR 0007 — Abertura sem terminal: instalador com janela própria

**Status:** aceita (complementa a [ADR 0005](0005-empacotamento-no-windows.md); a casca Electron deixa de ser opcional)

## Contexto

A primeira entrega foi a pasta portátil com `iniciar.bat`. Na prática a usuária via a janela preta, precisava mantê-la aberta e, dependendo da pasta, o Windows pedia administrador. O cliente escolheu a janela própria e dispensou a assinatura de código.

## Opções

1. **Instalador Electron** com janela própria (a casca já existia em `apps/desktop`).
2. Lançador `.exe` que abre o navegador e desliga a API por presença (SSE).

## Decisão

Opção 1. `npm run dist:win` gera o instalador por padrão (`--sem-instalador` gera só a pasta portátil).

- **Sem administrador.** NSIS com `oneClick: true`, `perMachine: false` e `asInvoker`: instala em `%LOCALAPPDATA%\Programs`, sem perguntas. `perMachine: false` sozinho não bastaria: com `oneClick: false`, o electron-builder mostra a página "só para mim / para todos", que pode pedir elevação, e deixaria escolher `Program Files`.
- **Sem terminal.** A API é processo filho com `windowsHide` e o Node embutido. O `iniciar.bat` sai da raiz do pacote e vai para `suporte/`, como modo suporte (com console).
- **Encerramento limpo por IPC.** No Windows, `kill()` encerra o processo na hora e os sinais não chegam à API. A casca pede `{ tipo: 'encerrar' }`; a API para de aceitar requisições, consolida o WAL, fecha o banco e sai. O `kill()` só é usado após 8 s. Se a casca cair, a API percebe o canal fechado e encerra sozinha.
- **Backup em andamento não é cortado.** Backup e restauração são síncronos e travam a API, então ela avisa `ocupado` antes e `livre` depois. Esse tempo não conta nos 8 s (teto de 10 minutos).
- **Alterações não salvas.** O front pede confirmação por `beforeunload` (`useAvisoDeSaida`) só com formulário aberto e modificado. O Electron não mostra esse aviso: a casca trata `will-prevent-unload`. O pedido de encerrar sai em `will-quit`, quando a janela já fechou e não há mais como desistir.
- **Outra API no ar.** A casca lê a versão em `/api/saude`. Mesma versão (modo suporte): só abre a janela e não a encerra ao sair. Versão diferente (pasta antiga, tarefa agendada): pede para fechar a antiga, em vez de abrir a velha sem avisar.
- **Sem assinatura de código.** O SmartScreen avisa na instalação; o manual ensina "Mais informações → Executar assim mesmo".

## Consequências

- Os dados continuam em `%LOCALAPPDATA%\FlorDePitanga`, fora da pasta do programa: o banco atual é reconhecido sem migração manual e desinstalar não o apaga.
- O pacote cresce cerca de 100 MB por causa do Electron.
- O endereço `http://127.0.0.1:1971` só responde com a janela aberta.
- O Node embutido é o que executa `dist:win`. O instalador oficial sai do CI (`.nvmrc`), para não depender da máquina de quem gera.
- A versão de `apps/desktop` precisa acompanhar a da raiz; `dist:win` recusa se forem diferentes.
