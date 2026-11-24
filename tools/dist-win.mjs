#!/usr/bin/env node
/**
 * Gera o entregável para Windows (ADRs 0005 e 0007).
 *   npm run dist:win                     → instalador  release/instalador/Flor-de-Pitanga-Instalador-<versão>.exe
 *   npm run dist:win -- --sem-instalador → só a pasta  release/Flor de Pitanga/  (+ .zip), sem Electron
 *
 * A pasta contém o Node embutido (runtime/), a API compilada, o front estático e as dependências de
 * produção instaladas para ESTE Node (o módulo nativo better-sqlite3 casa com o runtime embutido).
 * O instalador leva essa mesma pasta dentro da casca Electron: a usuária só vê o ícone e a janela.
 * Em suporte/ ficam os scripts com console, para diagnóstico.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saida = path.join(raiz, 'release', 'Flor de Pitanga');
const saidaInstalador = path.join(raiz, 'release', 'instalador');
const app = path.join(saida, 'app');
const comInstalador = !process.argv.includes('--sem-instalador');
const nomeDoNode = process.platform === 'win32' ? 'node.exe' : 'node';
const executar = (cmd, cwd = raiz) => execSync(cmd, { cwd, stdio: 'inherit' });
const copiar = (de, para) => fs.cpSync(de, para, { recursive: true });
const lerJson = (arquivo) => JSON.parse(fs.readFileSync(path.join(raiz, arquivo), 'utf8'));

const pkgRaiz = lerJson('package.json');
const pkgApi = lerJson('apps/api/package.json');
const pkgDesktop = lerJson('apps/desktop/package.json');

// A casca compara a própria versão com a da API: diferentes, ela acharia que há outra versão aberta.
if (pkgDesktop.version !== pkgRaiz.version) {
  console.error(
    `✘ Versões diferentes: package.json ${pkgRaiz.version} × apps/desktop ${pkgDesktop.version}.`,
  );
  process.exit(1);
}

/**
 * Teste de fumaça: sobe a API do pacote como a casca faz, confere saúde, banco e front, e pede para
 * encerrar por IPC. Falha também se sobrar WAL ou se a saída não for limpa.
 */
async function testeDeFumaca(titulo, node, principal) {
  console.log(`  ${titulo}`);
  const dados = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? '/tmp'), 'fdp-dist-'));
  const porta = 4399;
  const filho = spawn(node, [principal], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      FDP_CASCA: '1',
      FDP_PORT: String(porta),
      FDP_DATA_DIR: dados,
    },
  });
  const fim = new Promise((r) => filho.once('exit', (codigo) => r(codigo)));
  let subiu = false;
  for (let i = 0; i < 60 && !subiu && filho.exitCode === null; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/saude`);
      const { dados: saude } = await r.json();
      const pagina = await fetch(`http://127.0.0.1:${porta}/`);
      subiu =
        r.ok &&
        saude.status === 'ok' &&
        saude.versao === pkgRaiz.version &&
        pagina.ok &&
        (await pagina.text()).includes('Flor de Pitanga');
    } catch {
      /* ainda subindo */
    }
  }
  if (filho.connected) filho.send({ tipo: 'encerrar' });
  const codigo = await Promise.race([
    fim,
    new Promise((r) => setTimeout(() => r('tempo'), 10_000)),
  ]);
  if (codigo === 'tempo') filho.kill();
  const sobrouWal = fs.existsSync(path.join(dados, 'flor-de-pitanga.db-wal'));
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(dados, { recursive: true, force: true, maxRetries: 5 });
  if (!subiu) {
    console.error('✘ O pacote não respondeu ao teste de fumaça.');
    process.exit(1);
  }
  if (codigo !== 0 || sobrouWal) {
    console.error(
      `✘ O pacote não encerrou direito (código ${codigo}, WAL restante: ${sobrouWal}).`,
    );
    process.exit(1);
  }
  console.log('  ✔ API, banco, migrations e front respondendo; encerramento limpo.');
}

console.log('\n▶ 1/6 Compilando (shared, core, api e web)…');
executar('npm run build');

console.log('\n▶ 2/6 Montando a pasta…');
fs.rmSync(saida, { recursive: true, force: true });
fs.mkdirSync(path.join(saida, 'runtime'), { recursive: true });
copiar(path.join(raiz, 'apps/api/dist'), path.join(app, 'apps/api/dist'));
copiar(path.join(raiz, 'apps/web/dist'), path.join(app, 'apps/web/dist'));
fs.copyFileSync(process.execPath, path.join(saida, 'runtime', nomeDoNode));

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
// Modo suporte: fora da raiz do pacote, para ninguém abrir por engano a janela com console.
fs.mkdirSync(path.join(saida, 'suporte'));
for (const arquivo of ['iniciar.bat', 'parar.bat', 'instalar-servico.ps1']) {
  fs.copyFileSync(path.join(raiz, 'tools/windows', arquivo), path.join(saida, 'suporte', arquivo));
}

const leiaMe = [
  'FLOR DE PITANGA',
  '',
  ...(comInstalador
    ? [
        '1. Dê dois cliques no arquivo "Flor-de-Pitanga-Instalador". Não precisa de senha de administrador.',
        '2. Se o Windows mostrar "O Windows protegeu o computador", clique em "Mais informações" e',
        '   depois em "Executar assim mesmo". O aviso aparece porque o programa não é assinado digitalmente.',
        '3. Pronto: use o ícone "Flor de Pitanga" na Área de Trabalho ou no menu Iniciar.',
        '4. Para sair, é só fechar a janela.',
      ]
    : [
        '1. Esta é a pasta portátil, para uso do suporte. Abra "suporte\\iniciar.bat": o navegador abre',
        '   sozinho em http://127.0.0.1:1971.',
        '2. Para encerrar, feche a janela com texto ou use "suporte\\parar.bat".',
        '3. O Windows pode avisar sobre "aplicativo não reconhecido" (SmartScreen): clique em',
        '   "Mais informações" e depois em "Executar assim mesmo".',
      ]),
  '',
  'Seus dados ficam em %LOCALAPPDATA%\\FlorDePitanga (banco, fotos, backups e logs) e não são apagados',
  'ao instalar, atualizar ou desinstalar. Nunca coloque essa pasta no OneDrive/Dropbox: a sincronização',
  'pode corromper o banco.',
  'Backups: tela "Backup" do aplicativo. Copie o .zip para um pendrive de vez em quando.',
  '',
  `Versão ${pkgRaiz.version}`,
  '',
].join('\r\n');
fs.writeFileSync(path.join(saida, 'LEIA-ME.txt'), leiaMe);

console.log('\n▶ 3/6 Instalando dependências de produção (módulos nativos para este Node)…');
executar('npm install --omit=dev --no-audit --no-fund --no-package-lock', app);

console.log('\n▶ 4/6 Teste de fumaça da pasta…');
await testeDeFumaca(
  'iniciando o pacote…',
  path.join(saida, 'runtime', nomeDoNode),
  path.join(app, 'apps/api/dist/main.js'),
);

if (comInstalador) {
  console.log('\n▶ 5/6 Gerando o instalador (Electron)…');
  fs.rmSync(saidaInstalador, { recursive: true, force: true });
  // O electron-builder descarta node_modules ao copiar app/; por isso ele tem entrada própria em
  // `extraResources`. O teste de fumaça abaixo pega se faltar.
  executar('npm run dist -w @pitanga/desktop');
  fs.writeFileSync(path.join(saidaInstalador, 'LEIA-ME.txt'), leiaMe);

  console.log('\n▶ 6/6 Teste de fumaça do que vai dentro do instalador…');
  const recursos = path.join(saidaInstalador, 'win-unpacked', 'resources');
  await testeDeFumaca(
    'iniciando a API instalada…',
    path.join(recursos, 'runtime', nomeDoNode),
    path.join(recursos, 'app/apps/api/dist/main.js'),
  );
  console.log(
    `\n✔ Pronto: ${path.join(saidaInstalador, `Flor-de-Pitanga-Instalador-${pkgRaiz.version}.exe`)}`,
  );
} else {
  console.log('\n▶ 5/6 Instalador pulado (--sem-instalador).');
  console.log('\n▶ 6/6 Compactando…');
  try {
    const zip = path.join(raiz, 'release', `Flor-de-Pitanga-${pkgRaiz.version}-portatil.zip`);
    fs.rmSync(zip, { force: true });
    const opcoes = { cwd: path.join(raiz, 'release'), stdio: 'inherit' };
    if (process.platform === 'win32') {
      execSync(
        `powershell -NoProfile -Command "Compress-Archive -Path 'Flor de Pitanga' -DestinationPath '${zip}' -Force"`,
        opcoes,
      );
    } else {
      execSync(`zip -qr "${zip}" "Flor de Pitanga"`, opcoes);
    }
    console.log(`✔ ${zip}`);
  } catch {
    console.log('(não consegui compactar automaticamente; copie a pasta inteira)');
  }
  console.log(`\n✔ Pronto: ${saida}`);
}
