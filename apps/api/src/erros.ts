/** Erros de domínio — traduzidos pelo middleware para HTTP e mensagens em português. */

export class ErroDeDominio extends Error {
  constructor(
    public readonly codigo: string,
    mensagem: string,
    public readonly status: number,
    public readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = new.target.name;
  }
}

export class ErroDeValidacao extends ErroDeDominio {
  constructor(mensagem: string, detalhes?: unknown) {
    super('VALIDACAO', mensagem, 400, detalhes);
  }
}

export class RegistroNaoEncontrado extends ErroDeDominio {
  constructor(entidade: string) {
    super('NAO_ENCONTRADO', `${entidade} não encontrado(a).`, 404);
  }
}

export interface ItemEmFalta {
  /** Id do material (ou do produto, em vendas). */
  id: number;
  nome: string;
  unidade: string;
  necessario: number;
  disponivel: number;
  falta: number;
}

export class EstoqueInsuficiente extends ErroDeDominio {
  constructor(mensagem: string, faltas: ItemEmFalta[]) {
    super('ESTOQUE_INSUFICIENTE', mensagem, 409, faltas);
  }
}

export class OperacaoNaoPermitida extends ErroDeDominio {
  constructor(mensagem: string, codigo = 'OPERACAO_NAO_PERMITIDA') {
    super(codigo, mensagem, 409);
  }
}

export class NaoAutenticado extends ErroDeDominio {
  constructor(mensagem = 'Entre com seu usuário e senha para continuar.') {
    super('NAO_AUTENTICADO', mensagem, 401);
  }
}

export class SemPermissao extends ErroDeDominio {
  constructor(mensagem = 'Seu perfil não permite esta operação.') {
    super('SEM_PERMISSAO', mensagem, 403);
  }
}
