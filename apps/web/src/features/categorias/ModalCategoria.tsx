import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { categoriaSchema, type Categoria, type TipoCategoria } from '@pitanga/shared';
import { createPortal } from 'react-dom';
import { Botao, Campo, Entrada, Modal } from '../../components/ui';
import { api } from '../../lib/api';
import { useAvisoDeSaida } from '../../lib/avisoDeSaida';
import { useMutacao } from '../../lib/query';

/** Cria ou renomeia uma categoria. Pode abrir por cima de outro formulário, sem enviá-lo. */
export function ModalCategoria({
  aberto,
  aoFechar,
  tipo,
  categoria,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  tipo: TipoCategoria;
  categoria?: Categoria;
  aoSalvar?: (c: Categoria) => void;
}) {
  const f = useForm<{ nome: string }>({
    resolver: zodResolver(categoriaSchema.pick({ nome: true })),
    values: { nome: categoria?.nome ?? '' },
  });
  useAvisoDeSaida(aberto && f.formState.isDirty);
  const salvar = useMutacao(
    ({ nome }: { nome: string }) =>
      categoria
        ? api.put<Categoria>(`/categorias/${categoria.id}`, { nome })
        : api.post<Categoria>('/categorias', { nome, tipo }),
    {
      sucesso: categoria ? 'Categoria renomeada.' : 'Categoria criada.',
      naJanela: aberto,
      aoConcluir: (c) => {
        fechar();
        aoSalvar?.(c);
      },
    },
  );
  const fechar = () => {
    f.reset();
    aoFechar();
  };
  const enviar = f.handleSubmit((d) => salvar.mutate(d));
  // Fora da árvore do DOM do formulário de origem; e, como no React os eventos sobem pela árvore de
  // componentes, o envio é contido aqui para não salvar também o formulário de baixo.
  return createPortal(
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo={categoria ? 'Renomear categoria' : 'Nova categoria'}
      tamanho="p"
      erro={salvar.error}
      rodape={
        <>
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvar.isPending} onClick={enviar}>
            {categoria ? 'Renomear' : 'Criar categoria'}
          </Botao>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.stopPropagation();
          void enviar(e);
        }}
      >
        <Campo
          rotulo="Nome da categoria"
          dica={tipo === 'produto' ? 'Ex.: Caixas para pintar' : 'Ex.: Gesso e tintas'}
          erro={f.formState.errors.nome?.message}
          obrigatorio
        >
          {({ id }) => <Entrada id={id} autoFocus autoComplete="off" {...f.register('nome')} />}
        </Campo>
        <button type="submit" className="hidden" />
      </form>
    </Modal>,
    document.body,
  );
}
