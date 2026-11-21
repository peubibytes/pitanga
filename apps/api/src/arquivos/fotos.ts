import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ErroDeValidacao } from '../erros';

// No Windows o cache do libvips mantém os arquivos abertos, o que impede apagá-los (restauração, troca de foto).
sharp.cache(false);

export const TAMANHO_MAXIMO_FOTO = 12 * 1024 * 1024;
const NOME_VALIDO = /^[a-f0-9-]{36}\.webp$/;

export const nomeDeFotoValido = (nome: string): boolean => NOME_VALIDO.test(nome);
export const caminhoDaFoto = (fotosDir: string, nome: string): string => path.join(fotosDir, nome);

/**
 * Redimensiona para no máximo 1024 px e converte para WebP (mantém o banco e os backups leves).
 * O banco guarda só o nome do arquivo.
 */
export async function salvarFoto(fotosDir: string, imagem: Buffer): Promise<string> {
  if (imagem.length === 0) throw new ErroDeValidacao('Nenhuma imagem foi enviada.');
  if (imagem.length > TAMANHO_MAXIMO_FOTO) {
    throw new ErroDeValidacao('A imagem é grande demais (máximo de 12 MB).');
  }
  await fs.mkdir(fotosDir, { recursive: true });
  const nome = `${crypto.randomUUID()}.webp`;
  try {
    await sharp(imagem)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(caminhoDaFoto(fotosDir, nome));
  } catch {
    throw new ErroDeValidacao('Não foi possível ler a imagem. Use um arquivo JPG, PNG ou WebP.');
  }
  return nome;
}

export async function removerFoto(fotosDir: string, nome: string | null): Promise<void> {
  if (!nome || !nomeDeFotoValido(nome)) return;
  await fs.rm(caminhoDaFoto(fotosDir, nome), { force: true });
}
