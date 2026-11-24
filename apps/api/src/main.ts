import type { Server } from 'node:http';
import net from 'node:net';
import { criarApp } from './app';
import {
  backupAutomaticoSeNecessario,
  copiaPreMigracao,
  criarConexao,
  type Conexao,
} from './backup';
import { criarConfig, verificarPastaDeDados } from './config';
import { migrar } from './db/migrate';
import { criarEncerrador, ligarAvisos } from './encerramento';
import { descarregarLog, iniciarLogger, logger } from './logger';
import { limparIdempotenciaAntiga } from './repositories/sistema.repo';

function portaLivre(porta: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const teste = net.createServer();
    teste.once('error', () => resolve(false));
    teste.once('listening', () => teste.close(() => resolve(true)));
    teste.listen(porta, host);
  });
}

let servidor: Server | null = null;
let conexao: Conexao | null = null;

const encerrar = criarEncerrador({
  servidor: () => servidor,
  conexao: () => conexao,
  registrar: (mensagem) => logger.info(mensagem),
  sair: (codigo) => {
    descarregarLog();
    process.exit(codigo);
  },
});

/** Ouvintes desde o início: o pedido pode chegar enquanto a API ainda sobe. */
function ouvirEncerramento(): void {
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  // Só sob a casca desktop: outros pais com IPC (tsx, testes) usam o canal para outra coisa.
  if (process.env.FDP_CASCA !== '1' || !process.send) return;
  ligarAvisos((aviso) => process.send?.(aviso));
  process.on('message', (mensagem: { tipo?: string } | null) => {
    if (mensagem?.tipo === 'encerrar') encerrar('o pedido de fechar a janela');
  });
  // A casca caiu: sem ela, a API ficaria rodando escondida e segurando a porta.
  process.on('disconnect', () => {
    ligarAvisos(null);
    encerrar('o fim da janela do aplicativo');
  });
}

async function main(): Promise<void> {
  ouvirEncerramento();
  const config = criarConfig();
  verificarPastaDeDados(config.dadosDir);
  await iniciarLogger(config);

  if (!(await portaLivre(config.porta, config.host))) {
    logger.fatal(
      `A porta ${config.porta} já está em uso. Feche a outra instância do Flor de Pitanga ou defina outra porta em FDP_PORT.`,
    );
    descarregarLog();
    process.exit(1);
  }

  conexao = criarConexao(config);
  const { db } = conexao;
  // Migrations pendentes: antes, uma cópia automática do banco (se ele já tinha dados).
  const aplicadas = migrar(db, {
    antesDeMigrar: () => copiaPreMigracao(db, config),
  });
  if (aplicadas.length) logger.info({ aplicadas }, 'Migrations aplicadas.');

  const integridade = (db.pragma('integrity_check') as { integrity_check: string }[])[0]
    ?.integrity_check;
  if (integridade !== 'ok')
    logger.error({ integridade }, 'ATENÇÃO: o banco falhou na verificação de integridade.');

  if (!config.semRotinas) {
    backupAutomaticoSeNecessario(db, config);
    const rotina = setInterval(
      () => {
        // A conexão pode ter sido trocada por uma restauração.
        if (!conexao?.db.open) return;
        limparIdempotenciaAntiga(conexao.db);
        backupAutomaticoSeNecessario(conexao.db, config);
      },
      6 * 3600 * 1000,
    );
    rotina.unref();
  }

  const app = criarApp({ conexao, config });
  servidor = app.listen(config.porta, config.host, () => {
    logger.info(
      `Flor de Pitanga ${config.versao} em http://${config.host}:${config.porta} — dados em ${config.dadosDir}`,
    );
  });
}

main().catch((erro) => {
  logger.fatal({ erro }, 'Não foi possível iniciar o Flor de Pitanga.');
  console.error(erro instanceof Error ? erro.message : erro);
  descarregarLog();
  process.exit(1);
});
