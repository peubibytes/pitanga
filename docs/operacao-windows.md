# Operação no Windows

## Instalar e iniciar

**Pasta portátil** (`npm run dist:win` gera `release/Flor de Pitanga/` e o `.zip`):

1. Copie a pasta para o computador (por exemplo `C:\Flor de Pitanga`; evite OneDrive e `Program Files`).
2. Dê dois cliques em **`iniciar.bat`**. O navegador abre em `http://127.0.0.1:1971`. Não feche a janela preta enquanto usa.
3. Primeira vez: o aplicativo pede para criar a administradora.
4. Para encerrar, feche a janela preta ou use **`parar.bat`**.

**Instalador com janela própria** (opcional): `npm run dist:win -- --instalador` gera, com o Electron, um `.exe` com atalho na área de trabalho e janela sem barra de endereço. O Electron só sobe a API como processo filho com o Node embutido — o módulo nativo `better-sqlite3` não precisa ser recompilado.

**Iniciar com o Windows** (opcional, sem administrador): `powershell -ExecutionPolicy Bypass -File instalar-servico.ps1` (`-Remover` desfaz).

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

Feche o aplicativo, faça um backup, substitua a pasta `app/` (e `runtime/`) pela nova versão mantendo `%LOCALAPPDATA%\FlorDePitanga`, e inicie. As migrations pendentes rodam sozinhas, com cópia de segurança antes.

## Problemas comuns

| Sintoma                                          | O que fazer                                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| "A porta 1971 já está em uso"                    | Há outra instância aberta: use `parar.bat`, ou defina outra `FDP_PORT`.                                                                            |
| O app não inicia e cita OneDrive/Dropbox         | Escolha outra pasta com `FDP_DATA_DIR` (ex.: `C:\FlorDePitanga\dados`).                                                                            |
| SmartScreen: "aplicativo não reconhecido"        | O programa não é assinado digitalmente: _Mais informações → Executar assim mesmo_. Assinar o instalador exige certificado.                         |
| Erro de módulo nativo depois de atualizar o Node | Versão do Node fixada em `engines`/`.nvmrc`; rode `npm rebuild`. A tela _Configurações → Sistema_ e `GET /api/saude` mostram versão e integridade. |

## Limitações

Sem acesso simultâneo por rede ou internet, sem emissão de nota fiscal, sem integração bancária ou com marketplace, sem aplicativo móvel e sem multiempresa. Cada um desses itens muda a arquitetura e deve ser tratado como projeto novo. Dois computadores usando o mesmo banco ao mesmo tempo **não** é suportado.
