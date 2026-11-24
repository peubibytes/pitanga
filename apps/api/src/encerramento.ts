/**
 * Encerramento limpo e conversa com a casca desktop (Electron), que sobe a API como processo filho.
 *  - operações que não podem ser cortadas no meio (backup, restauração) avisam "ocupado"/"livre";
 *    elas são síncronas, então a casca só sabe que deve esperar se o aviso sair antes;
 *  - no Windows, `kill()` encerra o processo na hora e os sinais não chegam: o pedido vem por IPC.
 */
import type { Server } from 'node:http';
import type { Conexao } from './backup';

export interface AvisoParaCasca {
  tipo: 'ocupado' | 'livre';
}

let avisar: ((aviso: AvisoParaCasca) => void) | null = null;
let emAndamento = 0;

/** Liga (ou desliga, com `null`) os avisos. Fora da casca ninguém escuta e nada é enviado. */
export function ligarAvisos(fn: ((aviso: AvisoParaCasca) => void) | null): void {
  avisar = fn;
}

/** Executa algo que não pode ser interrompido, avisando a casca antes e depois. */
export function operacaoIndivisivel<T>(fn: () => T): T {
  if (emAndamento++ === 0) avisar?.({ tipo: 'ocupado' });
  try {
    return fn();
  } finally {
    if (--emAndamento === 0) avisar?.({ tipo: 'livre' });
  }
}

/** Tempo para as requisições em curso terminarem antes de cortar as conexões. */
const LIMITE_DAS_CONEXOES = 3_000;

export interface PartesDoEncerramento {
  /** O que já subiu até agora; o pedido pode chegar no meio da inicialização. */
  servidor: () => Server | null;
  conexao: () => Conexao | null;
  registrar: (mensagem: string) => void;
  /** Descarrega o log e termina o processo. */
  sair: (codigo: number) => void;
}

/**
 * Para de aceitar requisições, espera as que estão em curso, consolida o WAL, fecha o banco e sai.
 * Chamar de novo não faz nada. Um backup em andamento bloqueia o processo até terminar, então o
 * pedido só é atendido depois dele.
 */
export function criarEncerrador(p: PartesDoEncerramento): (motivo: string) => void {
  let encerrando = false;
  return (motivo) => {
    if (encerrando) return;
    encerrando = true;
    p.registrar(`Recebi ${motivo}; encerrando.`);
    const finalizar = () => {
      let codigo = 0;
      try {
        const db = p.conexao()?.db;
        if (db?.open) {
          db.pragma('wal_checkpoint(TRUNCATE)');
          db.close();
        }
        p.registrar('Banco fechado. Até logo.');
      } catch (erro) {
        codigo = 1;
        p.registrar(`Não consegui fechar o banco: ${String(erro)}`);
      } finally {
        p.sair(codigo);
      }
    };
    const servidor = p.servidor();
    if (!servidor?.listening) return finalizar();
    servidor.close(finalizar);
    servidor.closeIdleConnections();
    setTimeout(() => servidor.closeAllConnections(), LIMITE_DAS_CONEXOES).unref();
  };
}
