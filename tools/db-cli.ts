/**
 * CLI do banco: migrate | seed | reset | check
 *   npm run db:migrate · db:seed · db:reset · db:check
 */
import fs from 'node:fs';
import { criarConfig, verificarPastaDeDados } from '../apps/api/src/config';
import { abrirBanco } from '../apps/api/src/db/connection';
import { migrar } from '../apps/api/src/db/migrate';
import { semearDemo, SENHA_DEMO } from '../apps/api/src/db/seeds/demo';
import { verificarInvariantes } from '../apps/api/src/services/invariantes.service';

const comando = process.argv[2];
const config = criarConfig();
verificarPastaDeDados(config.dadosDir);

function abrir() {
  const db = abrirBanco(config.dbArquivo);
  const aplicadas = migrar(db);
  if (aplicadas.length) console.log(`Migrations aplicadas: ${aplicadas.join(', ')}`);
  return db;
}

function imprimirChecagem(db: ReturnType<typeof abrir>): boolean {
  const resultados = verificarInvariantes(db);
  const integridade = (db.pragma('integrity_check') as { integrity_check: string }[])[0]
    ?.integrity_check;
  for (const r of resultados) {
    console.log(`${r.ok ? '✔' : '✘'} ${String(r.numero).padStart(2)}. ${r.descricao}`);
    r.divergencias.slice(0, 10).forEach((d) => console.log(`      - ${d}`));
  }
  console.log(`${integridade === 'ok' ? '✔' : '✘'} integrity_check: ${integridade}`);
  return integridade === 'ok' && resultados.every((r) => r.ok);
}

async function main() {
  switch (comando) {
    case 'migrate': {
      const db = abrir();
      console.log('Banco em dia.');
      db.close();
      break;
    }
    case 'seed': {
      const db = abrir();
      const existentes = (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number })
        .n;
      if (existentes > 0) {
        console.error(
          'O banco já tem dados. Use "npm run db:reset" para recriar com dados fictícios.',
        );
        process.exit(1);
      }
      const t0 = Date.now();
      const r = await semearDemo(db);
      console.log(`Dados fictícios criados em ${Date.now() - t0} ms:`, r);
      console.log(`Usuários de demonstração: admin e operadora (senha "${SENHA_DEMO}").`);
      db.close();
      break;
    }
    case 'reset': {
      if (config.producao) {
        console.error('db:reset é só para desenvolvimento (NODE_ENV=production).');
        process.exit(1);
      }
      const t0 = Date.now();
      for (const sufixo of ['', '-wal', '-shm'])
        fs.rmSync(`${config.dbArquivo}${sufixo}`, { force: true });
      const db = abrir();
      const r = await semearDemo(db);
      console.log(`Banco recriado com dados fictícios em ${Date.now() - t0} ms:`, r);
      console.log(`Usuários: admin e operadora (senha "${SENHA_DEMO}").`);
      db.close();
      break;
    }
    case 'check': {
      const db = abrir();
      const ok = imprimirChecagem(db);
      db.close();
      process.exit(ok ? 0 : 1);
      break;
    }
    default:
      console.error('Uso: tsx tools/db-cli.ts <migrate|seed|reset|check>');
      process.exit(2);
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
