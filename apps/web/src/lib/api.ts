/** Cliente HTTP único: monta a URL e traduz o envelope de erro da API. */
import type { ErroApi, Paginacao } from '@pitanga/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensagem: string,
    public readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = 'ApiError';
  }
}

type Parametros = Record<string, string | number | boolean | null | undefined>;

function montarUrl(caminho: string, params?: Parametros): string {
  const url = `/api${caminho}`;
  if (!params) return url;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const texto = q.toString();
  return texto ? `${url}?${texto}` : url;
}

async function requisitar<T>(
  metodo: string,
  caminho: string,
  opcoes: {
    params?: Parametros;
    corpo?: unknown;
    chave?: string;
    bruto?: BodyInit;
    tipo?: string;
  } = {},
): Promise<{ dados: T; paginacao?: Paginacao }> {
  const cabecalhos: Record<string, string> = {};
  let corpo: BodyInit | undefined;
  if (opcoes.bruto !== undefined) {
    corpo = opcoes.bruto;
    if (opcoes.tipo) cabecalhos['Content-Type'] = opcoes.tipo;
  } else if (opcoes.corpo !== undefined) {
    corpo = JSON.stringify(opcoes.corpo);
    cabecalhos['Content-Type'] = 'application/json';
  }
  if (opcoes.chave) cabecalhos['Idempotency-Key'] = opcoes.chave;

  let resposta: Response;
  try {
    resposta = await fetch(montarUrl(caminho, opcoes.params), {
      method: metodo,
      headers: cabecalhos,
      body: corpo,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      0,
      'SEM_CONEXAO',
      'Não consegui falar com o Flor de Pitanga. Verifique se o aplicativo está aberto.',
    );
  }

  const texto = await resposta.text();
  let json: { dados?: T; paginacao?: Paginacao; erro?: ErroApi } = {};
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    /* resposta não-JSON */
  }
  if (!resposta.ok) {
    const erro = json.erro;
    throw new ApiError(
      resposta.status,
      erro?.codigo ?? 'ERRO',
      erro?.mensagem ?? `Erro ${resposta.status} ao falar com o servidor.`,
      erro?.detalhes,
    );
  }
  return { dados: json.dados as T, paginacao: json.paginacao };
}

export const api = {
  get: async <T>(caminho: string, params?: Parametros): Promise<T> =>
    (await requisitar<T>('GET', caminho, { params })).dados,
  lista: async <T>(
    caminho: string,
    params?: Parametros,
  ): Promise<{ itens: T[]; paginacao: Paginacao }> => {
    const r = await requisitar<T[]>('GET', caminho, { params });
    return {
      itens: r.dados,
      paginacao: r.paginacao ?? { pagina: 1, porPagina: r.dados.length, total: r.dados.length },
    };
  },
  post: async <T>(caminho: string, corpo?: unknown, chave?: string): Promise<T> =>
    (await requisitar<T>('POST', caminho, { corpo: corpo ?? {}, chave })).dados,
  put: async <T>(caminho: string, corpo?: unknown): Promise<T> =>
    (await requisitar<T>('PUT', caminho, { corpo: corpo ?? {} })).dados,
  delete: async <T>(caminho: string): Promise<T> => (await requisitar<T>('DELETE', caminho)).dados,
  enviarArquivo: async <T>(
    caminho: string,
    arquivo: Blob,
    tipo: string,
    params?: Parametros,
  ): Promise<T> => (await requisitar<T>('POST', caminho, { bruto: arquivo, tipo, params })).dados,
};

export const urlDaFoto = (arquivo: string | null | undefined): string | null =>
  arquivo ? `/api/fotos/${arquivo}` : null;
export const urlDoRelatorio = (nome: string, params: Parametros): string =>
  montarUrl(`/relatorios/${nome}`, { ...params, formato: 'csv' });

/** Mensagem pronta para a usuária, a partir de qualquer erro. */
export const mensagemDoErro = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Algo inesperado aconteceu.';
