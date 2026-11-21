import { z } from 'zod';

/** Inteiro >= 0 (centavos, mili-unidades etc.). */
export const inteiroNaoNegativo = z.number().int('Valor inválido').min(0, 'Não pode ser negativo');
export const inteiroPositivo = z.number().int('Valor inválido').min(1, 'Deve ser maior que zero');
export const idSchema = z.number().int().positive();
export const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');
export const textoOpcional = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => (v ? v : null));
export const nomeSchema = z.string().trim().min(1, 'Informe o nome').max(200);

export const paginacaoQuery = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});

export const periodoQuery = z.object({
  de: dataSchema.optional(),
  ate: dataSchema.optional(),
});
