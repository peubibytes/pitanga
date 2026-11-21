/**
 * Flor de Pitanga — casca desktop (Electron).
 * Sobe a API local como processo filho (com o Node embutido, o mesmo do pacote portátil — assim o
 * módulo nativo better-sqlite3 não precisa ser recompilado para o Electron) e abre uma janela única,
 * sem barra de endereço. O navegador nunca toca no banco: tudo passa pela API em 127.0.0.1.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { BrowserWindow, Menu, app, dialog, shell } from 'electron';

const PORTA = Number(process.env.FDP_PORT ?? 1971);
const ENDERECO = `http://127.0.0.1:${PORTA}`;

let api: ChildProcess | null = null;
let janela: BrowserWindow | null = null;
let encerrando = false;

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

function apiNoAr(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${ENDERECO}/api/saude`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function esperarApi(ms = 25_000): Promise<boolean> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (await apiNoAr()) return true;
    if (api && api.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function iniciarApi(): void {
  const { node, principal, cwd } = caminhos();
  api = spawn(node, [principal], {
    cwd,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production', FDP_PORT: String(PORTA) },
  });
  api.on('exit', (codigo) => {
    api = null;
    if (!encerrando && codigo !== 0) {
      dialog.showErrorBox(
        'Flor de Pitanga',
        'O servidor local parou inesperadamente. Feche e abra o aplicativo de novo; se persistir, veja a pasta de logs em %LOCALAPPDATA%\\FlorDePitanga\\logs.',
      );
      app.quit();
    }
  });
}

async function abrirJanela(): Promise<void> {
  janela = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1100,
    minHeight: 680,
    title: 'Flor de Pitanga',
    backgroundColor: '#fffcf7',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ENDERECO)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.on('closed', () => (janela = null));
  await janela.loadURL(ENDERECO);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // Se outra instância (ex.: iniciar.bat) já serve a API, só abre a janela.
    if (!(await apiNoAr())) iniciarApi();
    if (!(await esperarApi())) {
      dialog.showErrorBox(
        'Flor de Pitanga',
        'Não consegui iniciar o servidor local. Verifique se a porta 1971 está livre e tente novamente.',
      );
      app.quit();
      return;
    }
    await abrirJanela();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    encerrando = true;
    api?.kill();
  });
}
