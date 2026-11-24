import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  formatarMoeda,
  formatarPercentual,
  type Configuracoes,
  type Saude,
  type Taxa,
} from '@pitanga/shared';
import { PaginaCabecalho } from '../../components/layout/PaginaCabecalho';
import {
  Abas,
  Alerta,
  Botao,
  Campo,
  CampoMoeda,
  CampoNumero,
  Cartao,
  Chip,
  Dado,
  Entrada,
  EstadoVazio,
  Modal,
  Selecao,
  Tabela,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDados, useMutacao } from '../../lib/query';
import { Categorias } from '../categorias/Categorias';

/* ---------------------------------- geral ---------------------------------- */

function Geral() {
  const { ehAdministradora } = useAuth();
  const config = useDados<Configuracoes>(['configuracoes'], '/configuracoes');
  const c = config.data;
  const f = useForm<{
    nome: string;
    valorHora: number | null;
    remunera: boolean;
    negativo: boolean;
  }>({
    values: {
      nome: c?.nome_empresa ?? '',
      valorHora: c?.valor_hora_padrao ? Number(c.valor_hora_padrao) : null,
      remunera: c?.remunera_mao_obra_propria === '1',
      negativo: c?.permite_estoque_negativo === '1',
    },
  });
  const salvar = useMutacao(
    (d: { nome: string; valorHora: number | null; remunera: boolean; negativo: boolean }) =>
      api.put<Configuracoes>('/configuracoes', {
        nome_empresa: d.nome,
        valor_hora_padrao: String(d.valorHora ?? 0),
        remunera_mao_obra_propria: d.remunera ? '1' : '0',
        permite_estoque_negativo: d.negativo ? '1' : '0',
      }),
    { sucesso: 'Configurações salvas.' },
  );
  return (
    <Cartao titulo="Parâmetros do ateliê">
      {!ehAdministradora && (
        <div className="mb-4">
          <Alerta tom="ambar">Só a administradora pode alterar estas opções.</Alerta>
        </div>
      )}
      <form className="max-w-2xl space-y-5" onSubmit={f.handleSubmit((d) => salvar.mutate(d))}>
        <Campo rotulo="Nome do ateliê">
          {({ id }) => <Entrada id={id} disabled={!ehAdministradora} {...f.register('nome')} />}
        </Campo>
        <Campo
          rotulo="Valor da sua hora de trabalho"
          dica="Sugerido nas fichas técnicas com mão de obra por hora."
        >
          {({ id }) => (
            <Controller
              control={f.control}
              name="valorHora"
              render={({ field }) => (
                <CampoMoeda
                  id={id}
                  disabled={!ehAdministradora}
                  valor={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          )}
        </Campo>
        <label className="flex items-start gap-3 rounded-campo border border-creme-200 p-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-pitanga-600"
            disabled={!ehAdministradora}
            {...f.register('remunera')}
          />
          <span>
            <strong className="block">Pago pela mão de obra do meu ateliê</strong>Ligue quando você
            (ou uma ajudante) recebe pelo trabalho de produzir. Cada produção gera uma saída de
            caixa e a mão de obra passa a compor o valor do estoque. Desligado, o seu trabalho entra
            no preço, mas não no estoque.
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-campo border border-creme-200 p-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-pitanga-600"
            disabled={!ehAdministradora}
            {...f.register('negativo')}
          />
          <span>
            <strong className="block">Permitir estoque negativo, com autorização</strong>Por padrão
            o sistema recusa produzir ou vender sem estoque. Com esta opção, você poderá autorizar
            caso a caso, informando o motivo.
          </span>
        </label>
        {ehAdministradora && (
          <Botao type="submit" variante="primario" carregando={salvar.isPending}>
            Salvar
          </Botao>
        )}
      </form>
    </Cartao>
  );
}

/* ---------------------------------- taxas ---------------------------------- */

function Taxas() {
  const { ehAdministradora } = useAuth();
  const lista = useDados<Taxa[]>(['taxas'], '/taxas');
  const [editando, setEditando] = useState<Taxa | 'nova' | null>(null);
  const t = editando && editando !== 'nova' ? editando : undefined;
  const f = useForm<{
    nome: string;
    tipo: 'percentual' | 'fixo';
    valor: number | null;
    aplicaEm: 'preco' | 'custo';
    padrao: boolean;
    ativo: boolean;
  }>({
    values: {
      nome: t?.nome ?? '',
      tipo: t?.tipo ?? 'percentual',
      valor: t?.valor ?? null,
      aplicaEm: t?.aplicaEm ?? 'preco',
      padrao: t?.padrao ?? false,
      ativo: t?.ativo ?? true,
    },
  });
  const tipo = f.watch('tipo');
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutacao(
    (corpo: object) =>
      t ? api.put<Taxa>(`/taxas/${t.id}`, corpo) : api.post<Taxa>('/taxas', corpo),
    {
      sucesso: 'Taxa salva.',
      aoConcluir: () => {
        setEditando(null);
        f.reset();
      },
    },
  );
  const enviar = f.handleSubmit((d) => {
    if (!d.nome.trim()) return setErro('Dê um nome à taxa.');
    if (d.valor === null) return setErro('Informe o valor.');
    setErro(null);
    salvar.mutate({ ...d, valor: d.valor });
  });
  return (
    <>
      <Cartao
        titulo="Taxas e comissões"
        acao={
          ehAdministradora && (
            <Botao
              tamanho="p"
              variante="primario"
              icone={<Plus className="h-4 w-4" />}
              onClick={() => setEditando('nova')}
            >
              Nova taxa
            </Botao>
          )
        }
        semPadding
      >
        <div className="p-2">
          <Tabela<Taxa>
            legenda="Taxas"
            linhas={lista.data}
            carregando={lista.isLoading}
            chave={(x) => x.id}
            aoClicar={ehAdministradora ? setEditando : undefined}
            vazio={
              <EstadoVazio
                titulo="Nenhuma taxa"
                descricao="Cadastre taxa de cartão, comissão de feira etc. para considerá-las na formação do preço."
              />
            }
            colunas={[
              { titulo: 'Nome', celula: (x) => <span className="font-medium">{x.nome}</span> },
              {
                titulo: 'Valor',
                alinhar: 'direita',
                celula: (x) => (
                  <span className="numero">
                    {x.tipo === 'percentual' ? formatarPercentual(x.valor) : formatarMoeda(x.valor)}
                  </span>
                ),
              },
              {
                titulo: 'Incide sobre',
                celula: (x) =>
                  x.tipo === 'fixo'
                    ? 'Por peça'
                    : x.aplicaEm === 'preco'
                      ? 'O preço de venda'
                      : 'O custo',
              },
              {
                titulo: '',
                alinhar: 'direita',
                celula: (x) => (
                  <span className="flex justify-end gap-1">
                    {x.padrao && <Chip tom="folha">Padrão</Chip>}
                    {!x.ativo && <Chip>Inativa</Chip>}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </Cartao>
      <Modal
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={t ? 'Editar taxa' : 'Nova taxa'}
        rodape={
          <>
            <Botao onClick={() => setEditando(null)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvar.isPending} onClick={enviar}>
              Salvar
            </Botao>
          </>
        }
      >
        <form className="space-y-4" onSubmit={enviar}>
          {erro && <Alerta tom="pitanga">{erro}</Alerta>}
          <Campo rotulo="Nome" obrigatorio>
            {({ id }) => <Entrada id={id} autoFocus {...f.register('nome')} />}
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              {({ id }) => (
                <Selecao id={id} {...f.register('tipo')}>
                  <option value="percentual">Percentual (%)</option>
                  <option value="fixo">Valor fixo por peça (R$)</option>
                </Selecao>
              )}
            </Campo>
            <Campo rotulo={tipo === 'percentual' ? 'Percentual' : 'Valor'} obrigatorio>
              {({ id }) => (
                <Controller
                  control={f.control}
                  name="valor"
                  render={({ field }) =>
                    tipo === 'percentual' ? (
                      <CampoNumero
                        id={id}
                        escala={100}
                        sufixo="%"
                        valor={field.value}
                        onChange={field.onChange}
                      />
                    ) : (
                      <CampoMoeda id={id} valor={field.value} onChange={field.onChange} />
                    )
                  }
                />
              )}
            </Campo>
          </div>
          {tipo === 'percentual' && (
            <Campo rotulo="Incide sobre">
              {({ id }) => (
                <Selecao id={id} {...f.register('aplicaEm')}>
                  <option value="preco">O preço de venda (ex.: taxa de cartão)</option>
                  <option value="custo">O custo da peça</option>
                </Selecao>
              )}
            </Campo>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-pitanga-600"
              {...f.register('padrao')}
            />{' '}
            Já vem marcada na precificação
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-pitanga-600"
              {...f.register('ativo')}
            />{' '}
            Taxa ativa
          </label>
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </>
  );
}

/* --------------------------------- sistema --------------------------------- */

function Sistema() {
  const saude = useDados<Saude>(['saude'], '/saude');
  const s = saude.data;
  return (
    <Cartao titulo="Sobre este computador">
      {s && (
        <dl className="grid gap-5 sm:grid-cols-2">
          <Dado rotulo="Situação">
            <Chip tom={s.status === 'ok' ? 'folha' : 'ambar'}>
              {s.status === 'ok' ? 'Tudo certo' : 'Atenção'}
            </Chip>
          </Dado>
          <Dado rotulo="Versão">{s.versao}</Dado>
          <Dado rotulo="Integridade do banco">{s.integridade}</Dado>
          <Dado rotulo="Atualizações do banco aplicadas">
            {s.schema.aplicadas} ({s.schema.ultima ?? '—'})
          </Dado>
          <Dado rotulo="Pasta de dados" className="sm:col-span-2">
            <span className="break-all font-mono text-xs">{s.dadosDir}</span>
          </Dado>
          <Dado rotulo="Node.js">{s.node}</Dado>
        </dl>
      )}
    </Cartao>
  );
}

export default function PaginaConfiguracoes() {
  const [aba, setAba] = useState<'geral' | 'categorias' | 'taxas' | 'sistema'>('geral');
  return (
    <>
      <PaginaCabecalho
        titulo="Configurações"
        subtitulo="Parâmetros do ateliê, categorias, taxas e informações do sistema."
      />
      <Abas
        ativa={aba}
        aoMudar={setAba}
        abas={[
          { id: 'geral', rotulo: 'Geral' },
          { id: 'categorias', rotulo: 'Categorias' },
          { id: 'taxas', rotulo: 'Taxas' },
          { id: 'sistema', rotulo: 'Sistema' },
        ]}
      />
      {aba === 'geral' && <Geral />}
      {aba === 'categorias' && <Categorias />}
      {aba === 'taxas' && <Taxas />}
      {aba === 'sistema' && <Sistema />}
    </>
  );
}
