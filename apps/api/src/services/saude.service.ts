import type { Saude } from '@pitanga/shared';
import type { Config } from '../config';
import type { Db } from '../db/connection';
import { estadoDasMigracoes, listarMigracoes } from '../db/migrate';
import { lerConfiguracao } from '../repositories/sistema.repo';

/** `GET /saude`: versão, migrations aplicadas, integridade e último backup. */
export function verificarSaude(db: Db, config: Config): Saude {
  const schema = estadoDasMigracoes(db);
  let integridade: string;
  try {
    integridade =
      (db.pragma('quick_check') as { quick_check: string }[])[0]?.quick_check ?? 'sem resposta';
  } catch (e) {
    integridade = e instanceof Error ? e.message : 'erro';
  }
  const esperadas = listarMigracoes().length;
  return {
    status: integridade === 'ok' && schema.aplicadas === esperadas ? 'ok' : 'atencao',
    versao: config.versao,
    schema,
    integridade,
    ultimoBackupEm: (db.open && lerConfiguracao(db, 'ultimo_backup_em')) || null,
    dadosDir: config.dadosDir,
    node: process.version,
  };
}
