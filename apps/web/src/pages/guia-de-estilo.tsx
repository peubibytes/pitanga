import { useState } from 'react';
import { PaginaCabecalho } from '../components/layout/PaginaCabecalho';
import {
  Abas,
  Alerta,
  Botao,
  Campo,
  CampoData,
  CampoMoeda,
  CampoNumero,
  Cartao,
  Chip,
  Confirmar,
  Entrada,
  EstadoVazio,
  Esqueleto,
  Indicador,
  Modal,
  Selecao,
  Tabela,
  useToast,
  type VarianteBotao,
} from '../components/ui';

const cores = [
  ['pitanga-50', 'bg-pitanga-50'],
  ['pitanga-100', 'bg-pitanga-100'],
  ['pitanga-200', 'bg-pitanga-200'],
  ['pitanga-400', 'bg-pitanga-400'],
  ['pitanga-500', 'bg-pitanga-500'],
  ['pitanga-600', 'bg-pitanga-600'],
  ['pitanga-700', 'bg-pitanga-700'],
  ['pitanga-800', 'bg-pitanga-800'],
  ['folha-100', 'bg-folha-100'],
  ['folha-500', 'bg-folha-500'],
  ['folha-600', 'bg-folha-600'],
  ['folha-700', 'bg-folha-700'],
  ['ambar-100', 'bg-ambar-100'],
  ['ambar-600', 'bg-ambar-600'],
  ['creme-50', 'bg-creme-50'],
  ['creme-100', 'bg-creme-100'],
  ['creme-200', 'bg-creme-200'],
  ['creme-300', 'bg-creme-300'],
  ['tinta-400', 'bg-tinta-400'],
  ['tinta-600', 'bg-tinta-600'],
  ['tinta-900', 'bg-tinta-900'],
] as const;

/** Vitrine dos componentes e estados. Fora do menu: serve de referência visual e de teste manual rápido. */
export default function GuiaDeEstilo() {
  const [modal, setModal] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aba, setAba] = useState<'a' | 'b'>('a');
  const [moeda, setMoeda] = useState<number | null>(123456);
  const [qtd, setQtd] = useState<number | null>(1500);
  const [pct, setPct] = useState<number | null>(1250);
  const [data, setData] = useState('2026-11-21');
  const toast = useToast();
  const variantes: VarianteBotao[] = ['primario', 'secundario', 'fantasma', 'perigo', 'sucesso'];

  return (
    <div className="space-y-8">
      <PaginaCabecalho
        titulo="Guia de estilo"
        subtitulo="Componentes, cores e estados do Flor de Pitanga."
      />

      <Cartao titulo="Cores">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-9">
          {cores.map(([nome, classe]) => (
            <div key={nome}>
              <div className={`h-12 rounded-campo border border-creme-300 ${classe}`} />
              <p className="mt-1 text-[11px] text-tinta-600">{nome}</p>
            </div>
          ))}
        </div>
      </Cartao>

      <Cartao titulo="Tipografia">
        <h1 className="text-4xl">Título 1 — Fraunces</h1>
        <h2 className="mt-2 text-2xl">Título 2</h2>
        <h3 className="mt-2 text-lg">Título 3</h3>
        <p className="mt-3 text-sm">
          Texto de apoio em Inter, tamanho 15px. Números alinhados:{' '}
          <span className="numero">R$ 1.234,56 · 0,166667 · 12,5%</span>
        </p>
      </Cartao>

      <Cartao titulo="Botões">
        <div className="flex flex-wrap gap-3">
          {variantes.map((v) => (
            <Botao key={v} variante={v}>
              {v}
            </Botao>
          ))}
          <Botao variante="primario" carregando>
            Salvando
          </Botao>
          <Botao variante="primario" disabled>
            Desabilitado
          </Botao>
          <Botao tamanho="p">Pequeno</Botao>
        </div>
      </Cartao>

      <Cartao titulo="Campos">
        <div className="grid gap-4 md:grid-cols-3">
          <Campo rotulo="Texto" dica="Texto de ajuda" obrigatorio>
            {({ id }) => <Entrada id={id} placeholder="Digite aqui" />}
          </Campo>
          <Campo rotulo="Com erro" erro="Informe o nome">
            {({ id }) => <Entrada id={id} erro />}
          </Campo>
          <Campo rotulo="Seleção">
            {({ id }) => (
              <Selecao id={id}>
                <option>Opção 1</option>
                <option>Opção 2</option>
              </Selecao>
            )}
          </Campo>
          <Campo
            rotulo="Valor em reais (máscara)"
            dica={`Valor interno: ${moeda ?? 'vazio'} centavos`}
          >
            {({ id }) => <CampoMoeda id={id} valor={moeda} onChange={setMoeda} />}
          </Campo>
          <Campo rotulo="Quantidade" dica={`Valor interno: ${qtd ?? 'vazio'} mili-unidades`}>
            {({ id }) => (
              <CampoNumero id={id} escala={1000} sufixo="kg" valor={qtd} onChange={setQtd} />
            )}
          </Campo>
          <Campo rotulo="Percentual" dica={`Valor interno: ${pct ?? 'vazio'} centésimos`}>
            {({ id }) => (
              <CampoNumero id={id} escala={100} sufixo="%" valor={pct} onChange={setPct} />
            )}
          </Campo>
          <Campo rotulo="Data">
            {({ id }) => <CampoData id={id} valor={data} onChange={setData} />}
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Chips e alertas">
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip>Neutro</Chip>
          <Chip tom="folha">Disponível</Chip>
          <Chip tom="pitanga">Faltam 120 ml</Chip>
          <Chip tom="ambar">Pendente</Chip>
        </div>
        <div className="space-y-3">
          <Alerta tom="folha" titulo="Tudo certo">
            Backup concluído hoje.
          </Alerta>
          <Alerta tom="ambar" titulo="Atenção">
            Falta a ficha técnica do produto.
          </Alerta>
          <Alerta tom="pitanga" titulo="Prejuízo!">
            Este preço está abaixo do custo.
          </Alerta>
        </div>
      </Cartao>

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="Faturamento" valor="R$ 369,00" detalhe="Vendas do período" tom="folha" />
        <Indicador
          rotulo="Saldo de caixa"
          valor="− R$ 131,00"
          tom="pitanga"
          detalhe="Dinheiro parado em estoque"
        />
        <Indicador rotulo="A receber" valor="R$ 73,80" tom="ambar" />
      </div>

      <Cartao titulo="Tabela, abas e estados">
        <Abas
          ativa={aba}
          aoMudar={setAba}
          abas={[
            { id: 'a', rotulo: 'Com dados' },
            { id: 'b', rotulo: 'Vazia' },
          ]}
        />
        {aba === 'a' ? (
          <Tabela
            linhas={[
              { id: 1, nome: 'Difusor 200 ml', preco: 3690 },
              { id: 2, nome: 'Vela de soja 150 g', preco: 2890 },
            ]}
            chave={(l) => l.id}
            colunas={[
              { titulo: 'Produto', celula: (l) => l.nome },
              {
                titulo: 'Preço',
                alinhar: 'direita',
                celula: (l) => (
                  <span className="numero">R$ {(l.preco / 100).toFixed(2).replace('.', ',')}</span>
                ),
              },
            ]}
          />
        ) : (
          <EstadoVazio
            titulo="Nada por aqui ainda"
            descricao="Quando houver dados, eles aparecem nesta tabela."
            acao={<Botao variante="primario">Criar o primeiro</Botao>}
          />
        )}
        <div className="mt-6">
          <p className="mb-2 text-sm font-medium">Carregando</p>
          <Esqueleto linhas={3} />
        </div>
      </Cartao>

      <Cartao titulo="Diálogos e avisos">
        <div className="flex flex-wrap gap-3">
          <Botao onClick={() => setModal(true)}>Abrir modal</Botao>
          <Botao variante="perigo" onClick={() => setConfirmar(true)}>
            Confirmação destrutiva
          </Botao>
          <Botao onClick={() => toast.sucesso('Venda registrada.')}>Aviso de sucesso</Botao>
          <Botao onClick={() => toast.erro('Faltam 120 ml de essência de lavanda.')}>
            Aviso de erro
          </Botao>
        </div>
      </Cartao>

      <Modal
        aberto={modal}
        aoFechar={() => setModal(false)}
        titulo="Exemplo de janela"
        rodape={
          <>
            <Botao onClick={() => setModal(false)}>Cancelar</Botao>
            <Botao variante="primario" onClick={() => setModal(false)}>
              Salvar
            </Botao>
          </>
        }
      >
        <p className="text-sm text-tinta-600">
          O foco fica preso na janela, ESC fecha e leitores de tela anunciam o título.
        </p>
      </Modal>
      <Confirmar
        aberto={confirmar}
        aoFechar={() => setConfirmar(false)}
        aoConfirmar={() => setConfirmar(false)}
        perigo
        palavraDeConfirmacao="RESTAURAR"
        titulo="Restaurar backup?"
        rotuloConfirmar="Restaurar"
        mensagem={<p>Operações destrutivas exigem digitar a palavra de confirmação.</p>}
      />
    </div>
  );
}
