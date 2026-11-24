<#
  Flor de Pitanga - MODO SUPORTE: deixa a API rodando ao entrar no Windows, sem a janela do aplicativo.
  Nao e necessario no uso normal: o icone "Flor de Pitanga" abre e encerra tudo sozinho.
  Cria uma tarefa agendada do usuario atual (nao precisa de administrador) que roda sem janela.

  Instalar:    powershell -ExecutionPolicy Bypass -File instalar-servico.ps1
  Remover:     powershell -ExecutionPolicy Bypass -File instalar-servico.ps1 -Remover
#>
param([switch]$Remover)

$nome = 'FlorDePitanga'
if ($Remover) {
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Inicializacao automatica removida.'
  exit 0
}

# O script fica em suporte\; runtime\ e app\ ficam ao lado dessa pasta.
$pasta = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = Join-Path $pasta 'runtime\node.exe'
if (-not (Test-Path $node)) { $node = 'node' }
$principal = Join-Path $pasta 'app\apps\api\dist\main.js'
if (-not (Test-Path $principal)) { Write-Error "Nao encontrei $principal"; exit 1 }

$dados = Join-Path $env:LOCALAPPDATA 'FlorDePitanga'
$comando = "set NODE_ENV=production&& set FDP_DATA_DIR=$dados&& `"$node`" `"$principal`""
$acao = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $comando" -WorkingDirectory $pasta
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config -Description 'Flor de Pitanga - API local' -Force | Out-Null
Write-Host "Pronto. O Flor de Pitanga passara a iniciar com o Windows. Acesse http://127.0.0.1:1971"
Write-Host "Dados em: $dados"
