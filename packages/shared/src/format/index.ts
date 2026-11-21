/** Formatação e leitura de entrada em pt-BR. Nenhuma tela formata por conta própria. */
import { MICRO_POR_CENTAVO } from '../money';
import { MILI } from '../quantity';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export const formatarMoeda = (centavos: number): string => moeda.format(centavos / 100);

/** Valor unitário em micro-reais, ex.: 166667 → "R$ 0,166667". */
export function formatarMicro(micro: number): string {
  const reais = micro / (MICRO_POR_CENTAVO * 100);
  const casas = Math.abs(micro) % 10_000 === 0 ? 2 : 6;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(reais);
}

export function formatarQuantidade(mili: number, unidade?: string): string {
  const texto = numero.format(mili / MILI);
  return unidade ? `${texto} ${unidade}` : texto;
}

/** Percentual em centésimos de ponto percentual: 1250 → "12,5%". */
export function formatarPercentual(centesimos: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(centesimos / 100)}%`;
}

/** 2026-11-21 → 21/11/2026 */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : formatarData(iso);
}

export function formatarTelefone(valor: string | null | undefined): string {
  if (!valor) return '—';
  const d = valor.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/* --------------------------------- datas --------------------------------- */

export function dataISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Data de hoje (fuso local) em ISO AAAA-MM-DD. */
export function hojeISO(): string {
  return dataISO(new Date());
}

export function primeiroDiaDoMes(iso: string = hojeISO()): string {
  return `${iso.slice(0, 7)}-01`;
}

export function ultimoDiaDoMes(iso: string = hojeISO()): string {
  const [a, m] = iso.split('-').map(Number) as [number, number];
  return dataISO(new Date(a, m, 0));
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  return dataISO(new Date(a, m - 1, d + dias));
}

/* ----------------------------- leitura de entrada ----------------------------- */

/** Converte "1.234,56" em número 1234.56. Devolve null se não houver número. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/[^\d,.-]/g, '');
  if (!limpo) return null;
  let normal = limpo;
  if (limpo.includes(',')) normal = limpo.replace(/\./g, '').replace(',', '.');
  else if ((limpo.match(/\./g) ?? []).length > 1) normal = limpo.replace(/\./g, '');
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** "1.234,56" → 123456 centavos. */
export function lerMoeda(texto: string): number | null {
  const n = lerNumero(texto);
  return n === null ? null : Math.round(n * 100);
}

/** "0,0375" → 37500 micro-reais. */
export function lerMicro(texto: string): number | null {
  const n = lerNumero(texto);
  return n === null ? null : Math.round(n * 1_000_000);
}

/** "1,5" → 1500 mili-unidades. */
export function lerQuantidade(texto: string): number | null {
  const n = lerNumero(texto);
  return n === null ? null : Math.round(n * MILI);
}

/** "12,5" → 1250 centésimos de ponto percentual. */
export function lerPercentual(texto: string): number | null {
  const n = lerNumero(texto);
  return n === null ? null : Math.round(n * 100);
}

/** "21/11/2026" → "2026-11-21". Aceita também o formato ISO. */
export function lerData(texto: string): string | null {
  const t = texto.trim();
  let a: number, m: number, d: number;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (br) [d, m, a] = [Number(br[1]), Number(br[2]), Number(br[3])];
  else if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;
  const data = new Date(a, m - 1, d);
  if (data.getFullYear() !== a || data.getMonth() !== m - 1 || data.getDate() !== d) return null;
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Valor inteiro (centavos, mili, centésimos) → texto editável, ex.: 123456 (escala 100) → "1234,56". */
export function paraCampo(valor: number | null | undefined, escala: number): string {
  if (valor === null || valor === undefined) return '';
  return new Intl.NumberFormat('pt-BR', {
    useGrouping: false,
    minimumFractionDigits: escala === 100 ? 2 : 0,
    maximumFractionDigits: Math.round(Math.log10(escala)),
  }).format(valor / escala);
}
