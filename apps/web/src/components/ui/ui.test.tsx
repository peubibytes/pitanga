import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { intervaloPredefinido } from '../SeletorPeriodo';
import { CampoMoeda, CampoNumero } from './campo';
import { Confirmar } from './modal';
import { Tabela } from './tabela';
import { EstadoVazio } from './estados';

function MoedaTeste() {
  const [v, setV] = useState<number | null>(null);
  return (
    <>
      <CampoMoeda aria-label="valor" valor={v} onChange={setV} />
      <output data-testid="interno">{String(v)}</output>
    </>
  );
}

function NumeroTeste({ escala }: { escala: number }) {
  const [v, setV] = useState<number | null>(null);
  return (
    <>
      <CampoNumero aria-label="numero" escala={escala} valor={v} onChange={setV} />
      <output data-testid="interno">{String(v)}</output>
    </>
  );
}

describe('CampoMoeda', () => {
  it('máscara de caixa registradora: 1 5 9 0 → 15,90 e guarda 1590 centavos', async () => {
    const user = userEvent.setup();
    render(<MoedaTeste />);
    await user.type(screen.getByLabelText('valor'), '1590');
    expect(screen.getByLabelText('valor')).toHaveValue('15,90');
    expect(screen.getByTestId('interno')).toHaveTextContent('1590');
  });

  it('formata milhares e aceita apagar tudo', async () => {
    const user = userEvent.setup();
    render(<MoedaTeste />);
    await user.type(screen.getByLabelText('valor'), '123456');
    expect(screen.getByLabelText('valor')).toHaveValue('1.234,56');
    await user.clear(screen.getByLabelText('valor'));
    expect(screen.getByTestId('interno')).toHaveTextContent('null');
  });

  it('ignora letras', async () => {
    const user = userEvent.setup();
    render(<MoedaTeste />);
    await user.type(screen.getByLabelText('valor'), 'ab12c');
    expect(screen.getByTestId('interno')).toHaveTextContent('12');
  });
});

describe('CampoNumero', () => {
  it('quantidade com vírgula vira mili-unidades', async () => {
    const user = userEvent.setup();
    render(<NumeroTeste escala={1000} />);
    await user.type(screen.getByLabelText('numero'), '1,5');
    expect(screen.getByTestId('interno')).toHaveTextContent('1500');
  });

  it('percentual 12,5 vira 1250 centésimos', async () => {
    const user = userEvent.setup();
    render(<NumeroTeste escala={100} />);
    await user.type(screen.getByLabelText('numero'), '12,5');
    expect(screen.getByTestId('interno')).toHaveTextContent('1250');
  });

  it('inteiros (escala 1) aceitam só o número', async () => {
    const user = userEvent.setup();
    render(<NumeroTeste escala={1} />);
    await user.type(screen.getByLabelText('numero'), '24');
    expect(screen.getByTestId('interno')).toHaveTextContent('24');
  });
});

describe('Tabela e estados', () => {
  it('mostra o estado vazio quando não há linhas', () => {
    render(
      <Tabela
        linhas={[]}
        chave={() => 1}
        colunas={[{ titulo: 'Nome', celula: () => 'x' }]}
        vazio={<EstadoVazio titulo="Nenhum cliente ainda" descricao="Cadastre o primeiro." />}
      />,
    );
    expect(screen.getByText('Nenhum cliente ainda')).toBeInTheDocument();
  });

  it('mostra esqueleto de carregamento enquanto não há dados', () => {
    render(
      <Tabela
        linhas={undefined}
        carregando
        chave={() => 1}
        colunas={[{ titulo: 'Nome', celula: () => 'x' }]}
      />,
    );
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
  });

  it('renderiza linhas e cabeçalhos acessíveis', () => {
    render(
      <Tabela
        legenda="Clientes"
        linhas={[{ id: 1, nome: 'Marina' }]}
        chave={(l) => l.id}
        colunas={[{ titulo: 'Nome', celula: (l) => l.nome }]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Nome' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Marina' })).toBeInTheDocument();
  });
});

describe('Confirmar', () => {
  it('operação destrutiva só habilita depois de digitar a palavra', async () => {
    const user = userEvent.setup();
    let confirmado = 0;
    render(
      <Confirmar
        aberto
        aoFechar={() => undefined}
        aoConfirmar={() => confirmado++}
        titulo="Restaurar?"
        mensagem="Vai perder dados"
        palavraDeConfirmacao="RESTAURAR"
        rotuloConfirmar="Restaurar"
      />,
    );
    const botao = screen.getByRole('button', { name: 'Restaurar' });
    expect(botao).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'RESTAURAR');
    expect(botao).toBeEnabled();
    await user.click(botao);
    expect(confirmado).toBe(1);
  });
});

describe('períodos predefinidos', () => {
  it('dia, semana, mês e ano', () => {
    expect(intervaloPredefinido('hoje', '2026-11-21')).toEqual({
      de: '2026-11-21',
      ate: '2026-11-21',
    });
    expect(intervaloPredefinido('semana', '2026-11-21')).toEqual({
      de: '2026-11-15',
      ate: '2026-11-21',
    });
    expect(intervaloPredefinido('mes', '2026-02-10')).toEqual({
      de: '2026-02-01',
      ate: '2026-02-28',
    });
    expect(intervaloPredefinido('ano', '2026-11-21')).toEqual({
      de: '2026-01-01',
      ate: '2026-12-31',
    });
  });
});
