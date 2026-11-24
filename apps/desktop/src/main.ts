/**
 * Flor de Pitanga — casca desktop (Electron).
 * Sobe a API local como processo filho (com o Node embutido, o mesmo do pacote — assim o módulo
 * nativo better-sqlite3 não precisa ser recompilado para o Electron) e abre uma janela única, sem
 * barra de endereço. O navegador nunca toca no banco: tudo passa pela API em 127.0.0.1.
 * Fechar a janela encerra a API (ADR 0007).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { BrowserWindow, Menu, app, dialog, shell } from 'electron';
import { encerrarFilho, vigiar, type Vigia } from './encerrar-filho';

const PORTA = Number(process.env.FDP_PORT ?? 1971);
const ENDERECO = `http://127.0.0.1:${PORTA}`;

let api: ChildProcess | null = null;
let vigia: Vigia = { ocupado: () => false };
let janela: BrowserWindow | null = null;
let abrindo = true;
let encerrando = false;
/** Pediram para abrir de novo enquanto a API ainda fechava. */
let reabrir = false;

function caminhos(): { node: string; principal: string; cwd: string } {
  if (app.isPackaged) {
    const base = process.resourcesPath;
    return {
      node: path.join(base, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'),
      principal: path.join(base, 'app', 'apps', 'api', 'dist', 'main.js'),
      cwd: path.join(base, 'app'),
    };
  }
  // Desenvolvimento: usa o build da raiz do repositório (npm run build) e o Node do sistema.
  const raiz = path.resolve(__dirname, '..', '..', '..');
  return { node: 'node', principal: path.join(raiz, 'apps', 'api', 'dist', 'main.js'), cwd: raiz };
}

/** Versão da API que está no ar, ou `null` se nada (ou outra coisa) responde na porta. */
function versaoNoAr(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.get(`${ENDERECO}/api/saude`, (res) => {
      let corpo = '';
      res.setEncoding('utf8');
      res.on('data', (parte) => (corpo += parte));
      res.on('end', () => {
        try {
          const json = JSON.parse(corpo) as { dados?: { versao?: unknown } };
          const versao = json.dados?.versao;
          resolve(res.statusCode === 200 && typeof versao === 'string' ? versao : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Espera a API responder; o tempo de um backup não conta. O limite é folgado porque a primeira
 * abertura depois de instalar pode levar meio minuto com o antivírus conferindo os arquivos.
 */
async function esperarApi(ms = 90_000): Promise<boolean> {
  let restante = ms;
  while (restante > 0 && !encerrando) {
    if ((await versaoNoAr()) !== null) return true;
    if (!api) return false;
    await new Promise((r) => setTimeout(r, 400));
    if (!vigia.ocupado()) restante -= 400;
  }
  return false;
}

function iniciarApi(): void {
  const { node, principal, cwd } = caminhos();
  const filho = spawn(node, [principal], {
    cwd,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, NODE_ENV: 'production', FDP_PORT: String(PORTA), FDP_CASCA: '1' },
  });
  api = filho;
  vigia = vigiar(filho);
  filho.on('error', () => (api = null));
  filho.on('exit', () => {
    api = null;
    if (encerrando || abrindo) return; // na abertura, quem avisa é `iniciar`
    dialog.showErrorBox(
      'Flor de Pitanga',
      'O programa parou de repente. Feche e abra de novo. Se continuar, envie ao suporte a pasta de logs: %LOCALAPPDATA%\\FlorDePitanga\\logs.',
    );
    app.quit();
  });
}

const PAGINA_ABRINDO = `data:text/html;charset=utf-8,${encodeURIComponent(
  '<!doctype html><html lang="pt-BR"><title>Flor de Pitanga</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#fffcf7;color:#6b4a3f;font:18px system-ui">Abrindo o Flor de Pitanga…</body></html>',
)}`;

function criarJanela(): BrowserWindow {
  const j = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1100,
    minHeight: 680,
    title: 'Flor de Pitanga',
    backgroundColor: '#fffcf7',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  j.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ENDERECO)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  // O Electron não mostra o aviso do navegador: sem isto, um formulário com alterações impediria
  // a janela de fechar sem dizer nada. Só dispara quando o front pede (`useAvisoDeSaida`).
  j.webContents.on('will-prevent-unload', (evento) => {
    const escolha = dialog.showMessageBoxSync(j, {
      type: 'question',
      title: 'Flor de Pitanga',
      message: 'Você tem alterações que ainda não foram salvas.',
      detail: 'Se fechar agora, o que você digitou será perdido.',
      buttons: ['Voltar e salvar', 'Fechar sem salvar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (escolha === 1) evento.preventDefault();
  });
  j.on('closed', () => (janela = null));
  return j;
}

/** Há uma API de outra versão no ar (ex.: a pasta antiga com a janela preta). Pede para fechá-la. */
async function esperarVersaoAntigaFechar(): Promise<boolean> {
  for (;;) {
    const versao = await versaoNoAr();
    if (versao === null || versao === app.getVersion()) return true;
    const escolha = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Flor de Pitanga',
      message: 'Outra versão do Flor de Pitanga já está aberta.',
      detail:
        `A versão aberta é a ${versao} e esta é a ${app.getVersion()}. ` +
        'Feche a versão antiga (a janela preta) e clique em "Tentar de novo". ' +
        'Se não encontrar a janela preta, reinicie o computador ou fale com o suporte.',
      buttons: ['Tentar de novo', 'Sair'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (escolha === 1) return false;
  }
}

async function iniciar(): Promise<void> {
  Menu.setApplicationMenu(null);
  if (!(await esperarVersaoAntigaFechar())) return app.quit();
  janela = criarJanela();
  void janela.loadURL(PAGINA_ABRINDO);
  // Se a mesma versão já está no ar (ex.: modo suporte), só abre a janela e não a encerra ao sair.
  if ((await versaoNoAr()) === null) iniciarApi();
  const subiu = await esperarApi();
  if (encerrando || !janela) return;
  if (!subiu) {
    dialog.showErrorBox(
      'Flor de Pitanga',
      `Não consegui abrir o programa. Reinicie o computador e tente de novo. Se continuar, fale com o suporte (a porta ${PORTA} pode estar em uso por outro programa).`,
    );
    return app.quit();
  }
  abrindo = false;
  await janela.loadURL(ENDERECO);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('br.com.flordepitanga.app');
  app.on('second-instance', () => {
    if (encerrando) {
      reabrir = true;
    } else if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  void app.whenReady().then(iniciar);

  app.on('window-all-closed', () => app.quit());
  // `will-quit`, e não `before-quit`: aqui a janela já fechou, e ninguém desiste no aviso de não salvo.
  app.on('will-quit', (evento) => {
    encerrando = true;
    if (!api) return;
    evento.preventDefault();
    void encerrarFilho(api, vigia).then(() => {
      if (reabrir) app.relaunch();
      app.exit(0);
    });
  });
}
