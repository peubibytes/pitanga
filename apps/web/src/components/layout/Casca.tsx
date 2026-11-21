import {
  Boxes,
  ClipboardList,
  DatabaseBackup,
  FileText,
  Hammer,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { clsx } from 'clsx';

export function Logo({ pequeno }: { pequeno?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className={pequeno ? 'h-8 w-8' : 'h-9 w-9'} aria-hidden>
        <circle cx="32" cy="38" r="20" fill="#c8372d" />
        <path d="M32 18c0-7 4-11 11-11 0 7-4 11-11 11z" fill="#4d9660" />
        <circle cx="25" cy="32" r="4" fill="#e8776e" opacity=".7" />
      </svg>
      {!pequeno && (
        <span className="font-titulo text-xl leading-none text-white">Flor de Pitanga</span>
      )}
    </div>
  );
}

const grupos: { titulo: string; itens: { para: string; rotulo: string; icone: ReactNode }[] }[] = [
  {
    titulo: 'Dia a dia',
    itens: [
      { para: '/painel', rotulo: 'Painel', icone: <LayoutDashboard /> },
      { para: '/vendas', rotulo: 'Vendas', icone: <ShoppingBag /> },
      { para: '/clientes', rotulo: 'Clientes', icone: <Users /> },
    ],
  },
  {
    titulo: 'Ateliê',
    itens: [
      { para: '/produtos', rotulo: 'Produtos', icone: <Sparkles /> },
      { para: '/fichas', rotulo: 'Fichas e preços', icone: <ClipboardList /> },
      { para: '/producao', rotulo: 'Produção', icone: <Hammer /> },
    ],
  },
  {
    titulo: 'Suprimentos',
    itens: [
      { para: '/materiais', rotulo: 'Materiais', icone: <Boxes /> },
      { para: '/compras', rotulo: 'Compras', icone: <ShoppingCart /> },
      { para: '/fornecedores', rotulo: 'Fornecedores', icone: <Truck /> },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { para: '/financeiro', rotulo: 'Financeiro', icone: <Wallet /> },
      { para: '/relatorios', rotulo: 'Relatórios', icone: <FileText /> },
      { para: '/backup', rotulo: 'Backup', icone: <DatabaseBackup /> },
      { para: '/configuracoes', rotulo: 'Configurações', icone: <Settings /> },
    ],
  },
];

function lerRecolhido(): boolean {
  try {
    return localStorage.getItem('menu-recolhido') === '1';
  } catch {
    return false;
  }
}

/** Casca da aplicação: menu lateral recolhível, barra com a usuária e a área de conteúdo. */
export function Casca() {
  const [recolhido, setRecolhido] = useState(lerRecolhido);
  useEffect(() => {
    try {
      localStorage.setItem('menu-recolhido', recolhido ? '1' : '0');
    } catch {
      /* armazenamento indisponível: o menu simplesmente não lembra */
    }
  }, [recolhido]);

  return (
    <div className="flex h-full">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded bg-white px-3 py-2 focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
      >
        Pular para o conteúdo
      </a>
      <aside
        className={clsx(
          'nao-imprimir flex shrink-0 flex-col overflow-hidden bg-pitanga-800 text-pitanga-100 transition-[width]',
          recolhido ? 'w-[68px]' : 'w-60',
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Logo pequeno={recolhido} />
        </div>
        <nav aria-label="Principal" className="flex-1 px-2 pb-2">
          {grupos.map((g, idx) => (
            <div key={g.titulo} className={idx === 0 ? 'mt-1' : 'mt-2'}>
              {!recolhido && (
                <p className="px-3 pb-1 text-[11px] [@media(max-height:640px)]:hidden font-semibold uppercase tracking-widest text-pitanga-400">
                  {g.titulo}
                </p>
              )}
              {g.itens.map((i) => (
                <NavLink
                  key={i.para}
                  to={i.para}
                  title={recolhido ? i.rotulo : undefined}
                  className={({ isActive }) =>
                    clsx(
                      'my-px flex items-center gap-3 rounded-campo px-3 py-1.5 [@media(max-height:640px)]:py-1 text-sm font-medium transition-colors [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0',
                      recolhido && 'justify-center px-0',
                      isActive
                        ? 'bg-white text-pitanga-700 shadow-sm'
                        : 'text-pitanga-100 hover:bg-pitanga-700',
                    )
                  }
                >
                  {i.icone}
                  {!recolhido && i.rotulo}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button
          onClick={() => setRecolhido((r) => !r)}
          className="m-1 flex items-center justify-center gap-2 rounded-campo p-2 text-sm text-pitanga-200 hover:bg-pitanga-700"
          aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
        >
          {recolhido ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <>
              <PanelLeftClose className="h-3.5 w-3.5" /> Recolher
            </>
          )}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main id="conteudo" className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
          <div className="mx-auto max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
