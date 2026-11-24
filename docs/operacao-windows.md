# Operação no Windows

## Instalar e iniciar

`npm run dist:win` gera `release/instalador/Flor-de-Pitanga-Instalador-<versão>.exe`. O mesmo arquivo sai no CI, como artefato `instalador-windows` de cada execução — prefira esse, porque o Node embutido é o do `.nvmrc`.

1. Copie o instalador para o computador e dê dois cliques. Ele instala só para a usuária atual, em `%LOCALAPPDATA%\Programs`, e **não pede administrador**.
2. Como o programa não é assinado, o Windows mostra **"O Windows protegeu o computador"** (SmartScreen). Clique em **Mais informações** e depois em **Executar assim mesmo**.
3. O programa abre sozinho ao terminar. Depois, use o ícone **Flor de Pitanga** na Área de Trabalho ou no menu Iniciar.
4. Para encerrar, feche a janela. A API termina junto, depois de concluir qualquer backup em andamento.

Não há senha nem primeiro acesso. Com a janela fechada, `http://127.0.0.1:1971` não responde.

### Como funciona por baixo

A janela (Electron) sobe a API como processo filho, com o Node embutido e sem console. Ao fechar, pede o encerramento por IPC e espera até 8 s (o tempo de backup ou restauração não conta). Só então força o fim do processo. Se a janela cair, a API encerra sozinha. Ver [ADR 0007](adr/0007-abertura-sem-terminal.md).

### Modo suporte (com console)

Para diagnóstico, feche a janela e abra `suporte\iniciar.bat`, dentro da pasta do programa (`%LOCALAPPDATA%\Programs\<pasta do programa>\resources\suporte`): o servidor roda com console e o navegador abre em `http://127.0.0.1:1971`. `parar.bat` encerra. Se abrir o ícone com o modo suporte ligado, a janela usa o servidor que já está no ar e **não o encerra** ao fechar.

`npm run dist:win -- --sem-instalador` gera só a pasta portátil (`release/Flor de Pitanga/` e `.zip`), com os mesmos scripts em `suporte/`.

`instalar-servico.ps1` deixa a API rodando ao entrar no Windows e não é necessário com a janela. Se já tiver sido usado, remova: `powershell -ExecutionPolicy Bypass -File instalar-servico.ps1 -Remover`.

### Trocar a pasta portátil antiga pelo instalador

1. Na versão antiga, faça um backup na tela _Backup_ e copie o `.zip` para um pendrive.
2. Feche a janela preta (ou use `parar.bat`). Se a tarefa agendada foi instalada, remova-a (acima).
3. Instale a versão nova. Ela encontra o banco em `%LOCALAPPDATA%\FlorDePitanga` e, se houver atualização de banco, guarda antes uma cópia `pre-migracao-*.db`.
4. Confira no _Painel_ se os números são os mesmos. Só então apague a pasta antiga e os atalhos dela.

## Onde ficam os dados

`%LOCALAPPDATA%\FlorDePitanga\` — fora de `Program Files`, sem exigir administrador:

| Pasta/arquivo                           | Conteúdo                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `flor-de-pitanga.db` (+ `-wal`, `-shm`) | O banco                                                                      |
| `fotos/`                                | Fotos dos produtos (WebP ≤ 1024 px)                                          |
| `backups/`                              | Backups `.zip` e cópias de segurança (`pre-migracao-*`, `pre-restauracao-*`) |
| `logs/`                                 | `api.AAAA-MM-DD.N.log`, rotação diária, 14 arquivos                          |

Defina `FDP_DATA_DIR` para mudar o local e `FDP_PORT` para mudar a porta. **Nunca** coloque a pasta de dados em OneDrive, Dropbox, Google Drive ou iCloud: a sincronização pode corromper o SQLite em uso — o aplicativo recusa iniciar nesses caminhos. O `.zip` de backup, fechado, pode ser copiado para a nuvem sem risco.

## Backup e restauração

- **Automático:** ao iniciar, se o último backup tem mais de 24 h (e a cada 6 h com o app aberto). Mantém os 30 mais recentes (`FDP_RETENCAO_BACKUPS`). O painel avisa se o último passou de 7 dias.
- **Manual:** tela _Backup_ → "Fazer backup agora", ou `npm run backup`.
- **Antes de atualizar o banco:** cópia `pre-migracao-*.db` automática.
- **Verificar:** "Verificar" confere o sha256 do manifesto e o `integrity_check`.
- **Restaurar (administradora):** tela _Backup_ → "Restaurar" (digite `RESTAURAR`). O sistema valida, guarda o estado atual em `pre-restauracao-*.zip`, troca banco e fotos, aplica migrations pendentes e confere a integridade. Backup de versão **mais nova** que o aplicativo é recusado. Pela linha de comando, com o aplicativo fechado: `npm run restore -- arquivo.zip --sim`.
- **Outra máquina:** copie o `.zip` para a pasta `backups/` (ou use "Importar backup") e restaure. Os mesmos números devem aparecer.

## Atualizar

Faça um backup, feche a janela e execute o instalador novo por cima. Os dados em `%LOCALAPPDATA%\FlorDePitanga` não são tocados. As migrations pendentes rodam sozinhas, com cópia de segurança antes. Desinstalar pelo Windows remove só o programa; os dados ficam.

## Problemas comuns

| Sintoma                                          | O que fazer                                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Outra versão do Flor de Pitanga já está aberta" | A pasta antiga (janela preta) ou a tarefa agendada está no ar. Feche a janela preta ou use `parar.bat` e clique em _Tentar de novo_.               |
| "Não consegui abrir o programa"                  | Outro programa usa a porta 1971, ou a API falhou ao subir: veja os logs. Para trocar a porta, defina `FDP_PORT`.                                   |
| "A porta 1971 já está em uso" (modo suporte)     | A janela do programa está aberta: feche-a antes.                                                                                                   |
| O app não inicia e cita OneDrive/Dropbox         | Escolha outra pasta com `FDP_DATA_DIR` (ex.: `C:\FlorDePitanga\dados`).                                                                            |
| SmartScreen: "O Windows protegeu o computador"   | O programa não é assinado digitalmente (decisão do cliente): _Mais informações → Executar assim mesmo_.                                            |
| Erro de módulo nativo depois de atualizar o Node | Versão do Node fixada em `engines`/`.nvmrc`; rode `npm rebuild`. A tela _Configurações → Sistema_ e `GET /api/saude` mostram versão e integridade. |

## Limitações

Sem acesso simultâneo por rede ou internet, sem emissão de nota fiscal, sem integração bancária ou com marketplace, sem aplicativo móvel e sem multiempresa. Cada um desses itens muda a arquitetura e deve ser tratado como projeto novo. Dois computadores usando o mesmo banco ao mesmo tempo **não** é suportado.
