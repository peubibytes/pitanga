import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { converterQuantidade, type FatorDeTroca } from '@pitanga/core';
import {
  UNIDADES,
  UNIDADES_BASE,
  formatarMicro,
  formatarMoeda,
  formatarPercentual,
  formatarQuantidade,
  mulDiv,
  type LadoDaTroca,
  type Material,
  type PreviaTrocaUnidade,
  type ReceitaNaTroca,
  type TrocaUnidadeEntrada,
  type UnidadeBase,
} from '@pitanga/shared';
import {
  Alerta,
  AreaDeTexto,
  Botao,
  Campo,
  CampoNumero,
  Modal,
  Selecao,
  Tabela,
} from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useMutacao } from '../../lib/query';

const nomeDa = (u: string): string => UNIDADES.find((x) => x.codigo === u)?.nome ?? u;
const PLURAL: Record<string, string> = { ml: 'mililitros', g: 'gramas', m: 'metros' };

/** A pergunta vem no sentido natural ("Quantos ml há em 1 unidade?"), qualquer que seja a direção. */
function perguntaDoFator(atual: string, nova: UnidadeBase) {
  if (nova === 'un') {
    return {
      texto: `Quantos ${PLURAL[atual]} (${atual}) há em 1 unidade?`,
      sufixo: atual,
      fator: (q: number): FatorDeTroca => ({ nova: 1000, atual: q }),
    };
  }
  return {
    texto:
      atual === 'un'
        ? `Quantos ${PLURAL[nova]} (${nova}) há em 1 unidade?`
        : `1 ${atual} equivale a quantos ${PLURAL[nova]} (${nova})?`,
    sufixo: nova,
    fator: (q: number): FatorDeTroca => ({ nova: q, atual: 1000 }),
  };
}

/** Receita que não cabe certinho na unidade nova: aceitar a mais próxima ou digitar outra. */
function DecisaoDaReceita({
  receita,
  previa,
  fator,
  valor,
  aoMudar,
}: {
  receita: ReceitaNaTroca;
  previa: PreviaTrocaUnidade;
  fator: FatorDeTroca;
  valor: number | null;
  aoMudar: (v: number | null) => void;
}) {
  const { antes, depois } = previa;
  const aceitou = valor !== null && valor === receita.quantidadeNova;
  const volta: FatorDeTroca = { nova: fator.atual, atual: fator.nova };
  const emAtual = (q: number) => formatarQuantidade(converterQuantidade(q, volta), antes.unidade);
  return (
    <li className="space-y-3 rounded-campo border border-ambar-100 bg-ambar-50 p-4 text-sm">
      <p>
        <strong>{receita.produtoNome}</strong> usa{' '}
        <strong className="numero">
          {formatarQuantidade(receita.quantidadeAtual, antes.unidade)}
        </strong>
        .{' '}
        {receita.quantidadeNova > 0 ? (
          <>
            O valor mais próximo é{' '}
            <strong className="numero">
              {formatarQuantidade(receita.quantidadeNova, depois.unidade)}
            </strong>{' '}
            ({emAtual(receita.quantidadeNova)}, {receita.desvio > 0 ? '+' : ''}
            {formatarPercentual(receita.desvio)}).
          </>
        ) : (
          <>
            É pouco demais para contar em &quot;{depois.unidade}&quot;: o menor valor possível é{' '}
            {formatarQuantidade(1, depois.unidade)} ({emAtual(1)}).
          </>
        )}
      </p>
      <div className="flex flex-wrap items-end gap-4">
        {receita.quantidadeNova > 0 && (
          <label className="flex items-center gap-2 pb-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-pitanga-600"
              checked={aceitou}
              onChange={(e) => aoMudar(e.target.checked ? receita.quantidadeNova : null)}
            />
            Usar {formatarQuantidade(receita.quantidadeNova, depois.unidade)}
          </label>
        )}
        <Campo
          rotulo={receita.quantidadeNova > 0 ? 'ou outra quantidade' : 'Nova quantidade'}
          className="w-44"
        >
          {({ id }) => (
            <CampoNumero
              id={id}
              aria-label={`Quantidade em ${receita.produtoNome}`}
              escala={1000}
              sufixo={depois.unidade}
              valor={valor}
              onChange={aoMudar}
            />
          )}
        </Campo>
      </div>
      {valor !== null && valor > 0 && (
        <p className="text-xs text-tinta-600">
          Equivale a {emAtual(valor)}. O custo deste material na receita vai de{' '}
          {formatarMoeda(mulDiv(receita.custoAtual, 1, 10_000))} para{' '}
          {formatarMoeda(mulDiv(mulDiv(valor, depois.custoMedio, 1000), 1, 10_000))}.
        </p>
      )}
    </li>
  );
}

const LINHAS: [string, (l: LadoDaTroca) => string][] = [
  ['Estoque', (l) => formatarQuantidade(l.estoque, l.unidade)],
  ['Custo médio', (l) => `${formatarMicro(l.custoMedio)}/${l.unidade}`],
  ['Valor em estoque', (l) => formatarMoeda(l.valorEmEstoque)],
  [
    'Estoque mínimo',
    (l) => (l.estoqueMinimo === null ? '—' : formatarQuantidade(l.estoqueMinimo, l.unidade)),
  ],
];

/** Assistente: escolher a unidade e o fator, conferir a prévia e só então confirmar. */
export function ModalTrocaUnidade({
  material,
  aoFechar,
  aoTrocar,
}: {
  material: Material;
  aoFechar: () => void;
  aoTrocar: () => void;
}) {
  const [nova, setNova] = useState<UnidadeBase | ''>('');
  const [quanto, setQuanto] = useState<number | null>(null);
  const [previa, setPrevia] = useState<PreviaTrocaUnidade | null>(null);
  const [decisoes, setDecisoes] = useState<Record<number, number | null>>({});
  const [motivo, setMotivo] = useState('');
  const qc = useQueryClient();
  useAvisoDeSaida(nova !== '');

  const pergunta = nova ? perguntaDoFator(material.unidade, nova) : null;
  const fator = pergunta && quanto && quanto > 0 ? pergunta.fator(quanto) : null;
  const conversao = fator && {
    novaUnidade: nova as UnidadeBase,
    quantidadeNova: fator.nova,
    quantidadeAtual: fator.atual,
  };
  const url = `/materiais/${material.id}/trocar-unidade`;

  // Consulta, não gravação: não invalida nada.
  const verPrevia = useMutation({
    mutationFn: () => api.post<PreviaTrocaUnidade>(`${url}/previa`, conversao),
    onSuccess: (p) => {
      setPrevia(p);
      setDecisoes({});
      confirmar.reset();
    },
  });
  const confirmar = useMutacao((corpo: TrocaUnidadeEntrada) => api.post<Material>(url, corpo), {
    sucesso: (m) => `Pronto: ${m.nome} agora é controlado em ${nomeDa(m.unidade).toLowerCase()}.`,
    naJanela: true,
    aoConcluir: () => {
      // Receitas e estoque guardados de outras telas estão na unidade antiga: não podem reaparecer.
      qc.removeQueries({ type: 'inactive' });
      aoTrocar();
    },
  });

  const pendentes = previa?.receitas.filter((r) => r.exigeDecisao) ?? [];
  const aproximadas = previa?.receitas.filter((r) => !r.exigeDecisao && r.desvio !== 0) ?? [];
  const faltaDecidir = pendentes.filter((r) => !decisoes[r.fichaId]);
  const desatualizada =
    confirmar.error instanceof ApiError && confirmar.error.codigo === 'PREVIA_DESATUALIZADA';
  const menor = fator
    ? formatarQuantidade(
        converterQuantidade(1, { nova: fator.atual, atual: fator.nova }),
        material.unidade,
      )
    : '';
  const perdePrecisao = !!fator && fator.atual > fator.nova;

  const enviar = () => {
    if (!previa || !conversao) return;
    confirmar.mutate({
      ...conversao,
      assinatura: previa.assinatura,
      motivo: motivo || null,
      receitas: pendentes.map((r) => ({ fichaId: r.fichaId, quantidade: decisoes[r.fichaId]! })),
    });
  };

  return createPortal(
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Trocar unidade — ${material.nome}`}
      tamanho="g"
      erro={previa ? (verPrevia.error ?? confirmar.error) : verPrevia.error}
      rodape={
        previa ? (
          <>
            <Botao onClick={() => setPrevia(null)}>Voltar</Botao>
            {desatualizada ? (
              <Botao
                variante="primario"
                carregando={verPrevia.isPending}
                onClick={() => verPrevia.mutate()}
              >
                Conferir de novo
              </Botao>
            ) : (
              <Botao
                variante="primario"
                carregando={confirmar.isPending}
                disabled={faltaDecidir.length > 0}
                onClick={enviar}
              >
                Confirmar troca
              </Botao>
            )}
          </>
        ) : (
          <>
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao
              variante="primario"
              carregando={verPrevia.isPending}
              disabled={!conversao}
              onClick={() => verPrevia.mutate()}
            >
              Ver como fica
            </Botao>
          </>
        )
      }
    >
      {!previa ? (
        <div className="space-y-4">
          <p className="text-sm text-tinta-600">
            Hoje este material é contado em{' '}
            <strong>{nomeDa(material.unidade).toLowerCase()}</strong> ({material.unidade}). Antes de
            mudar qualquer coisa, mostramos como vão ficar o estoque, o custo e as receitas.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nova unidade" obrigatorio>
              {({ id }) => (
                <Selecao
                  id={id}
                  value={nova}
                  onChange={(e) => setNova(e.target.value as UnidadeBase | '')}
                >
                  <option value="">Escolha a unidade</option>
                  {UNIDADES_BASE.filter((u) => u !== material.unidade).map((u) => (
                    <option key={u} value={u}>
                      {nomeDa(u)} ({u})
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            {pergunta && (
              <Campo rotulo={pergunta.texto} obrigatorio>
                {({ id }) => (
                  <CampoNumero
                    id={id}
                    escala={1000}
                    sufixo={pergunta.sufixo}
                    valor={quanto}
                    onChange={setQuanto}
                  />
                )}
              </Campo>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <Tabela
            legenda="Como fica"
            linhas={LINHAS.map(([rotulo, valor]) => ({
              rotulo,
              antes: valor(previa.antes),
              depois: valor(previa.depois),
            }))}
            chave={(l) => l.rotulo}
            colunas={[
              { titulo: '', celula: (l) => <span className="font-medium">{l.rotulo}</span> },
              {
                titulo: 'Hoje',
                alinhar: 'direita',
                celula: (l) => <span className="numero">{l.antes}</span>,
              },
              {
                titulo: 'Depois',
                alinhar: 'direita',
                celula: (l) => <span className="numero font-semibold">{l.depois}</span>,
              },
            ]}
          />
          {pendentes.length > 0 && (
            <section className="space-y-3" aria-label="Receitas para conferir">
              <h3 className="text-base">
                {pendentes.length === 1
                  ? 'Uma receita precisa da sua decisão'
                  : `${pendentes.length} receitas precisam da sua decisão`}
              </h3>
              <ul className="space-y-3">
                {pendentes.map((r) => (
                  <DecisaoDaReceita
                    key={r.fichaId}
                    receita={r}
                    previa={previa}
                    fator={fator!}
                    valor={decisoes[r.fichaId] ?? null}
                    aoMudar={(v) => setDecisoes((d) => ({ ...d, [r.fichaId]: v }))}
                  />
                ))}
              </ul>
            </section>
          )}
          {aproximadas.length > 0 && (
            <div className="text-sm text-tinta-600">
              <p className="font-medium text-tinta-700">
                Receitas com arredondamento pequeno (até 1%):
              </p>
              <ul className="list-inside list-disc">
                {aproximadas.map((r) => (
                  <li key={r.fichaId} className="numero">
                    {r.produtoNome}: {formatarQuantidade(r.quantidadeAtual, previa.antes.unidade)} →{' '}
                    {formatarQuantidade(r.quantidadeNova, previa.depois.unidade)} (
                    {formatarPercentual(r.desvio)})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Alerta tom="neutro">
            Também convertemos o histórico: {previa.contagem.movimentos} lançamento(s) de estoque,{' '}
            {previa.contagem.compras} item(ns) de compra, {previa.contagem.producoes} uso(s) em
            produção e {previa.receitas.length + previa.contagem.receitasAntigas} receita(s). Os
            valores em reais já lançados não mudam. Um backup é feito antes.
          </Alerta>
          {perdePrecisao && (
            <Alerta tom="ambar">
              Depois da troca, a menor quantidade possível numa receita será{' '}
              {formatarQuantidade(1, previa.depois.unidade)} ({menor}). Se um dia voltar para{' '}
              {previa.antes.unidade}, o que foi arredondado não volta ao valor de antes.
            </Alerta>
          )}
          <Campo rotulo="Motivo (opcional)">
            {({ id }) => (
              <AreaDeTexto id={id} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            )}
          </Campo>
        </div>
      )}
    </Modal>,
    document.body,
  );
}
