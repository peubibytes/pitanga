import { useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, Download, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { formatarBytes, formatarDataHora, type BackupRegistro } from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import { Alerta, Botao, Cartao, Chip, Confirmar, EstadoVazio, Tabela } from '../../components/ui';
import { api } from '../../lib/api';
import { useDados, useMutacao } from '../../lib/query';
import { useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';

interface Verificacao {
  ok: boolean;
  arquivo: string;
  problemas: string[];
}
interface Invariante {
  numero: number;
  descricao: string;
  ok: boolean;
  divergencias: string[];
}

const origem: Record<BackupRegistro['origem'], string> = {
  manual: 'Manual',
  automatico: 'Automático',
  pre_migracao: 'Antes de atualizar',
  pre_restauracao: 'Antes de restaurar',
};

export default function PaginaBackup() {
  const { ehAdministradora } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const lista = useDados<BackupRegistro[]>(['backups'], '/backup');
  const [restaurando, setRestaurando] = useState<BackupRegistro | null>(null);
  const [excluindo, setExcluindo] = useState<BackupRegistro | null>(null);
  const [verificacao, setVerificacao] = useState<Verificacao | null>(null);
  const [consistencia, setConsistencia] = useState<Invariante[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const criar = useMutacao(() => api.post<BackupRegistro>('/backup'), {
    sucesso: (b) => `Backup criado: ${b.arquivo}`,
  });
  const verificar = useMutacao(
    (arquivo: string) => api.post<Verificacao>('/backup/verificar', { arquivo }),
    {
      aoConcluir: (v) => {
        setVerificacao(v);
        if (v.ok)
          toast.sucesso('Backup íntegro: o sha256 confere e o banco passou na verificação.');
      },
    },
  );
  const restaurar = useMutacao(
    (arquivo: string) =>
      api.post<{ integridade: string; mensagem: string }>('/backup/restaurar', {
        arquivo,
        confirmacao: 'RESTAURAR',
      }),
    {
      aoConcluir: () => {
        setRestaurando(null);
        toast.sucesso('Backup restaurado. Vamos recarregar o aplicativo.');
        qc.clear();
        setTimeout(() => window.location.assign('/'), 1200);
      },
    },
  );
  const excluir = useMutacao((arquivo: string) => api.delete(`/backup/${arquivo}`), {
    sucesso: 'Backup removido.',
    aoConcluir: () => setExcluindo(null),
  });
  const importar = useMutacao(
    (arquivo: File) =>
      api.enviarArquivo<Verificacao>('/backup/importar', arquivo, 'application/zip', {
        nome: arquivo.name,
      }),
    {
      aoConcluir: (v) => {
        setVerificacao(v);
        toast.info(
          v.ok
            ? 'Backup importado e verificado. Ele já aparece na lista.'
            : 'O arquivo foi importado, mas não passou na verificação.',
        );
      },
    },
  );
  const checar = useMutacao(() => api.get<Invariante[]>('/consistencia'), {
    aoConcluir: setConsistencia,
  });

  return (
    <>
      <PaginaCabecalho
        titulo="Backup"
        subtitulo="Cópias de segurança do banco e das fotos. Fazemos uma automática por dia; guarde cópias fora do computador também."
        acoes={
          <>
            {ehAdministradora && (
              <>
                <input
                  ref={input}
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={(e) => {
                    const a = e.target.files?.[0];
                    if (a) importar.mutate(a);
                    e.target.value = '';
                  }}
                />
                <Botao
                  icone={<Upload className="h-4 w-4" />}
                  carregando={importar.isPending}
                  onClick={() => input.current?.click()}
                >
                  Importar backup
                </Botao>
              </>
            )}
            <Botao
              variante="primario"
              icone={<DatabaseBackup className="h-4 w-4" />}
              carregando={criar.isPending}
              onClick={() => criar.mutate(undefined)}
            >
              Fazer backup agora
            </Botao>
          </>
        }
      />
      <div className="space-y-6">
        <Alerta tom="neutro" titulo="Dica de segurança">
          Copie de tempos em tempos o arquivo <strong>.zip</strong> para um pendrive ou para uma
          nuvem. Fechado, o .zip sincroniza sem risco — diferente do banco aberto, que nunca deve
          ficar numa pasta sincronizada.
        </Alerta>
        {verificacao && (
          <Alerta
            tom={verificacao.ok ? 'folha' : 'pitanga'}
            titulo={
              verificacao.ok
                ? `${verificacao.arquivo}: íntegro`
                : `${verificacao.arquivo}: problemas encontrados`
            }
          >
            {verificacao.problemas.length ? (
              <ul className="list-disc pl-5">
                {verificacao.problemas.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              'O sha256 do banco confere com o manifesto e a verificação de integridade passou.'
            )}
          </Alerta>
        )}
        <Cartao titulo="Backups guardados" semPadding>
          <div className="p-2">
            <Tabela<BackupRegistro>
              legenda="Backups"
              linhas={lista.data}
              carregando={lista.isLoading}
              chave={(b) => b.id}
              vazio={
                <EstadoVazio
                  titulo="Nenhum backup ainda"
                  descricao="Clique em “Fazer backup agora” para criar o primeiro."
                />
              }
              colunas={[
                { titulo: 'Quando', celula: (b) => formatarDataHora(b.data) },
                {
                  titulo: 'Arquivo',
                  celula: (b) => <span className="font-mono text-xs">{b.arquivo}</span>,
                  ocultarEmPequeno: true,
                },
                {
                  titulo: 'Origem',
                  celula: (b) => (
                    <Chip tom={b.origem === 'automatico' ? 'neutro' : 'folha'}>
                      {origem[b.origem]}
                    </Chip>
                  ),
                },
                {
                  titulo: 'Tamanho',
                  alinhar: 'direita',
                  celula: (b) => <span className="numero">{formatarBytes(b.tamanhoBytes)}</span>,
                },
                {
                  titulo: '',
                  alinhar: 'direita',
                  celula: (b) =>
                    !b.existe ? (
                      <span className="flex items-center justify-end gap-2">
                        <Chip tom="pitanga">Arquivo ausente</Chip>
                        {ehAdministradora && (
                          <Botao
                            tamanho="p"
                            variante="fantasma"
                            icone={<Trash2 className="h-4 w-4" />}
                            onClick={() => setExcluindo(b)}
                          >
                            Remover
                          </Botao>
                        )}
                      </span>
                    ) : (
                      <span className="flex justify-end gap-1">
                        <Botao
                          tamanho="p"
                          icone={<ShieldCheck className="h-4 w-4" />}
                          carregando={verificar.isPending && verificar.variables === b.arquivo}
                          onClick={() => verificar.mutate(b.arquivo)}
                        >
                          Verificar
                        </Botao>
                        <a href={`/api/backup/baixar/${b.arquivo}`} download>
                          <Botao
                            tamanho="p"
                            variante="fantasma"
                            icone={<Download className="h-4 w-4" />}
                          >
                            Baixar
                          </Botao>
                        </a>
                        {ehAdministradora && (
                          <>
                            <Botao tamanho="p" variante="perigo" onClick={() => setRestaurando(b)}>
                              Restaurar
                            </Botao>
                            <Botao
                              tamanho="p"
                              variante="fantasma"
                              icone={<Trash2 className="h-4 w-4" />}
                              onClick={() => setExcluindo(b)}
                            >
                              Remover
                            </Botao>
                          </>
                        )}
                      </span>
                    ),
                },
              ]}
            />
          </div>
        </Cartao>
        <Cartao
          titulo="Conferência dos dados"
          acao={
            <Botao
              tamanho="p"
              carregando={checar.isPending}
              onClick={() => checar.mutate(undefined)}
            >
              Verificar agora
            </Botao>
          }
        >
          {consistencia ? (
            <ul className="space-y-2 text-sm">
              {consistencia.map((i) => (
                <li key={i.numero} className="flex items-start gap-2">
                  <Chip tom={i.ok ? 'folha' : 'pitanga'}>{i.ok ? 'OK' : 'Atenção'}</Chip>
                  <div>
                    <span>{i.descricao}</span>
                    {i.divergencias.slice(0, 5).map((d) => (
                      <p key={d} className="text-pitanga-700">
                        {d}
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-tinta-500">
              Confere se estoques, vendas e financeiro estão coerentes entre si (dez verificações).
              Use depois de restaurar um backup ou se algum número parecer estranho.
            </p>
          )}
        </Cartao>
      </div>
      <Confirmar
        aberto={!!excluindo}
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={() => excluindo && excluir.mutate(excluindo.arquivo)}
        carregando={excluir.isPending}
        perigo
        titulo="Remover este backup?"
        rotuloConfirmar="Remover backup"
        mensagem={
          <p>
            O arquivo <strong>{excluindo?.arquivo}</strong> será apagado do computador. Essa ação
            não pode ser desfeita; se precisar dele, baixe uma cópia antes.
          </p>
        }
      />
      <Confirmar
        aberto={!!restaurando}
        aoFechar={() => setRestaurando(null)}
        aoConfirmar={() => restaurando && restaurar.mutate(restaurando.arquivo)}
        carregando={restaurar.isPending}
        perigo
        palavraDeConfirmacao="RESTAURAR"
        titulo="Restaurar este backup?"
        rotuloConfirmar="Restaurar backup"
        mensagem={
          <div className="space-y-2">
            <p>
              Tudo o que foi feito{' '}
              <strong>depois de {restaurando ? formatarDataHora(restaurando.data) : ''}</strong>{' '}
              será perdido: vendas, compras, produções e cadastros.
            </p>
            <p>
              Antes de substituir, guardamos uma cópia do estado atual (“Antes de restaurar”), por
              segurança. Depois você precisará entrar de novo.
            </p>
          </div>
        }
      />
    </>
  );
}
