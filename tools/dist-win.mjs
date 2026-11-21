#!/usr/bin/env node
/**
 * Gera o pacote para Windows (plano, seção 12).
 *   npm run dist:win                → pasta portátil  release/Flor de Pitanga/  (+ .zip)
 *   npm run dist:win -- --instalador → também o instalador .exe (Electron + electron-builder)
 *
 * A pasta portátil contém o Node embutido (runtime/), a API compilada, o front estático e as
 * dependências de produção instaladas para ESTE Node (o módulo nativo better-sqlite3 casa com o
 * runtime embutido). A usuária só dá dois cliques em iniciar.bat.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saida = path.join(raiz, 'release', 'Flor de Pitanga');
const app = path.join(saida, 'app');
const executar = (cmd, cwd = raiz) => execSync(cmd, { cwd, stdio: 'inherit' });
const copiar = (de, para) => fs.cpSync(de, para, { recursive: true });

const pkgRaiz = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const pkgApi = JSON.parse(fs.readFileSync(path.join(raiz, 'apps/api/package.json'), 'utf8'));

console.log('\n▶ 1/6 Compilando (shared, core, api e web)…');
executar('npm run build');

console.log('\n▶ 2/6 Montando a pasta…');
fs.rmSync(saida, { recursive: true, force: true });
fs.mkdirSync(path.join(saida, 'runtime'), { recursive: true });
copiar(path.join(raiz, 'apps/api/dist'), path.join(app, 'apps/api/dist'));
copiar(path.join(raiz, 'apps/web/dist'), path.join(app, 'apps/web/dist'));
fs.copyFileSync(
  process.execPath,
  path.join(saida, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'),
);

const dependencias = Object.fromEntries(
  Object.entries(pkgApi.dependencies).filter(([nome]) => !nome.startsWith('@pitanga/')),
);
fs.writeFileSync(
  path.join(app, 'package.json'),
  JSON.stringify(
    {
      name: 'flor-de-pitanga-app',
      version: pkgRaiz.version,
      private: true,
      type: 'module',
      dependencies: dependencias,
    },
    null,
    2,
  ),
);
for (const arquivo of ['iniciar.bat', 'parar.bat', 'instalar-servico.ps1']) {
  fs.copyFileSync(path.join(raiz, 'tools/windows', arquivo), path.join(saida, arquivo));
}
fs.writeFileSync(
  path.join(saida, 'LEIA-ME.txt'),
  [
    'FLOR DE PITANGA',
    '',
    '1. Dê dois cliques em "iniciar.bat". O navegador abre sozinho em http://127.0.0.1:1971.',
    '2. Não feche a janela preta enquanto estiver usando. Para encerrar, feche-a ou use "parar.bat".',
    '3. Seus dados ficam em %LOCALAPPDATA%\\FlorDePitanga (banco, fotos, backups e logs).',
    '   Nunca coloque essa pasta no OneDrive/Dropbox: a sincronização pode corromper o banco.',
    '4. Backups: tela "Backup" do aplicativo. Copie o .zip para um pendrive de vez em quando.',
    '5. O Windows pode avisar sobre "aplicativo não reconhecido" (SmartScreen) porque o programa',
    '   não é assinado digitalmente: clique em "Mais informações" e depois em "Executar assim mesmo".',
    '',
    `Versão ${pkgRaiz.version}`,
    '',
  ].join('\r\n'),
);

console.log('\n▶ 3/6 Instalando dependências de produção (módulos nativos para este Node)…');
executar('npm install --omit=dev --no-audit --no-fund --no-package-lock', app);

console.log('\n▶ 4/6 Teste de fumaça: iniciando o pacote…');
const dadosTeste = fs.mkdtempSync(
  path.join(fs.realpathSync(process.env.TEMP ?? '/tmp'), 'fdp-dist-'),
);
const porta = 4399;
const filho = spawn(
  path.join(saida, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'),
  [path.join(app, 'apps/api/dist/main.js')],
  {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      FDP_PORT: String(porta),
      FDP_DATA_DIR: dadosTeste,
    },
    stdio: 'ignore',
  },
);
let ok = false;
for (let i = 0; i < 40 && !ok; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const r = await fetch(`http://127.0.0.1:${porta}/api/saude`);
    const corpo = await r.json();
    const pagina = await fetch(`http://127.0.0.1:${porta}/`);
    ok =
      r.ok &&
      corpo.dados.status === 'ok' &&
      pagina.ok &&
      (await pagina.text()).includes('Flor de Pitanga');
  } catch {
    /* ainda subindo */
  }
}
filho.kill();
await new Promise((r) => setTimeout(r, 800));
fs.rmSync(dadosTeste, { recursive: true, force: true });
if (!ok) {
  console.error('✘ O pacote não respondeu ao teste de fumaça.');
  process.exit(1);
}
console.log('✔ API, banco, migrations e front respondendo.');

console.log('\n▶ 5/6 Compactando…');
try {
  const zip = path.join(raiz, 'release', `Flor-de-Pitanga-${pkgRaiz.version}-portatil.zip`);
  fs.rmSync(zip, { force: true });
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path 'Flor de Pitanga' -DestinationPath '${zip}' -Force"`,
      { cwd: path.join(raiz, 'release'), stdio: 'inherit' },
    );
  } else {
    execSync(`zip -qr "${zip}" "Flor de Pitanga"`, {
      cwd: path.join(raiz, 'release'),
      stdio: 'inherit',
    });
  }
  console.log(`✔ ${zip}`);
} catch {
  console.log('(não consegui compactar automaticamente; copie a pasta inteira)');
}

if (process.argv.includes('--instalador')) {
  console.log('\n▶ 6/6 Gerando o instalador (Electron)…');
  executar('npm run dist -w @pitanga/desktop');
} else {
  console.log('\n▶ 6/6 Instalador pulado (use --instalador para gerá-lo).');
}
console.log(`\n✔ Pronto: ${saida}`);
