/**
 * Backup, restauração e redefinição de senha pela linha de comando.
 *   npm run backup
 *   npm run restore -- <arquivo.zip> --sim     (feche o aplicativo antes)
 *   npm run senha -- <usuario> <nova-senha>    (esquecimento da senha local)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  backupAutomaticoSeNecessario,
  criarBackup,
  criarConexao,
  restaurarBackup,
  verificarBackup,
} from '../apps/api/src/backup';
import { criarConfig, verificarPastaDeDados } from '../apps/api/src/config';
import { migrar } from '../apps/api/src/db/migrate';
import { redefinirSenha } from '../apps/api/src/services/auth.service';

const [, , comando, ...args] = process.argv;
const config = criarConfig();
verificarPastaDeDados(config.dadosDir);

async function main(): Promise<void> {
  const conexao = criarConexao(config);
  migrar(conexao.db);
  try {
    switch (comando) {
      case 'backup': {
        const b = criarBackup(conexao.db, config, 'manual');
        console.log(`Backup criado: ${path.join(config.backupsDir, b.arquivo)}`);
        break;
      }
      case 'auto': {
        const b = backupAutomaticoSeNecessario(conexao.db, config);
        console.log(
          b ? `Backup automático criado: ${b.arquivo}` : 'Já existe um backup com menos de 24 h.',
        );
        break;
      }
      case 'restore': {
        const origem = args.find((a) => !a.startsWith('--'));
        if (!origem) throw new Error('Informe o arquivo: npm run restore -- <arquivo.zip> --sim');
        if (!args.includes('--sim')) {
          throw new Error(
            'A restauração substitui TODOS os dados atuais. Repita o comando com --sim para confirmar (feche o aplicativo antes).',
          );
        }
        let nome = path.basename(origem);
        const dentro = path.join(config.backupsDir, nome);
        if (!fs.existsSync(dentro)) {
          fs.mkdirSync(config.backupsDir, { recursive: true });
          fs.copyFileSync(path.resolve(origem), dentro);
        }
        const v = verificarBackup(config, nome);
        console.log(v.ok ? 'Backup íntegro.' : `Backup com problemas: ${v.problemas.join(' ')}`);
        if (!v.ok) process.exit(1);
        nome = path.basename(dentro);
        const r = restaurarBackup(conexao, config, nome);
        console.log(`Restauração concluída. integrity_check: ${r.integridade}.`);
        break;
      }
      case 'senha': {
        const [login, nova] = args;
        if (!login || !nova || nova.length < 6)
          throw new Error('Uso: npm run senha -- <usuario> <nova-senha com 6+ caracteres>');
        await redefinirSenha(conexao.db, login, nova);
        console.log(`Senha de "${login}" redefinida. As sessões abertas foram encerradas.`);
        break;
      }
      default:
        throw new Error('Uso: tsx tools/backup-cli.ts <backup|auto|restore|senha>');
    }
  } finally {
    conexao.db.close();
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
