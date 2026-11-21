import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function PaginaCabecalho({
  titulo,
  subtitulo,
  acoes,
  voltar,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  voltar?: { para: string; rotulo: string };
}) {
  return (
    <header className="mb-6">
      {voltar && (
        <Link
          to={voltar.para}
          className="nao-imprimir mb-2 inline-flex items-center gap-1 text-sm text-tinta-500 hover:text-pitanga-700"
        >
          <ArrowLeft className="h-4 w-4" /> {voltar.rotulo}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{titulo}</h1>
          {subtitulo && <p className="mt-1 max-w-2xl text-sm text-tinta-500">{subtitulo}</p>}
        </div>
        {acoes && <div className="nao-imprimir flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </header>
  );
}
