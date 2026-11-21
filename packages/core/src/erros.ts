/** Erro de regra de cálculo (entrada que não permite chegar a um resultado válido). */
export class ErroDeCalculo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeCalculo';
  }
}
