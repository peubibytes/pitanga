import net from 'node:net';
import { criarApp } from './app';
import { backupAutomaticoSeNecessario, copiaPreMigracao, criarConexao } from './backup';
import { criarConfig, verificarPastaDeDados } from './config';
import { migrar } from './db/migrate';
import { iniciarLogger, logger } from './logger';
import { limparIdempotenciaAntiga } from './repositories/sistema.repo';

function portaLivre(porta: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const teste = net.createServer();
    teste.once('error', () => resolve(false));
    teste.once('listening', () => teste.close(() => resolve(true)));
    teste.listen(porta, host);
  });
}

async function main(): Promise<void> {
  const config = criarConfig();
  verificarPastaDeDados(config.dadosDir);
  await iniciarLogger(config);

  if (!(await portaLivre(config.porta, config.host))) {
    logger.fatal(
      `A porta ${config.porta} já está em uso. Feche a outra instância do Flor de Pitanga ou defina outra porta em FDP_PORT.`,
    );
    process.exit(1);
  }

  const conexao = criarConexao(config);
  // Migrations pendentes: antes, uma cópia automática do banco (se ele já tinha dados).
  const aplicadas = migrar(conexao.db, {
    antesDeMigrar: () => copiaPreMigracao(conexao.db, config),
  });
  if (aplicadas.length) logger.info({ aplicadas }, 'Migrations aplicadas.');

  const integridade = (conexao.db.pragma('integrity_check') as { integrity_check: string }[])[0]
    ?.integrity_check;
  if (integridade !== 'ok')
    logger.error({ integridade }, 'ATENÇÃO: o banco falhou na verificação de integridade.');

  if (!config.semRotinas) {
    backupAutomaticoSeNecessario(conexao.db, config);
    const rotina = setInterval(
      () => {
        limparIdempotenciaAntiga(conexao.db);
        backupAutomaticoSeNecessario(conexao.db, config);
      },
      6 * 3600 * 1000,
    );
    rotina.unref();
  }

  const app = criarApp({ conexao, config });
  const servidor = app.listen(config.porta, config.host, () => {
    logger.info(
      `Flor de Pitanga ${config.versao} em http://${config.host}:${config.porta} — dados em ${config.dadosDir}`,
    );
  });

  const encerrar = (sinal: string) => {
    logger.info(`Recebi ${sinal}; encerrando.`);
    servidor.close(() => {
      try {
        conexao.db.pragma('wal_checkpoint(TRUNCATE)');
        conexao.db.close();
      } finally {
        process.exit(0);
      }
    });
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

main().catch((erro) => {
  logger.fatal({ erro }, 'Não foi possível iniciar o Flor de Pitanga.');
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
