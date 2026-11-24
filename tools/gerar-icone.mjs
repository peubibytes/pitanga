#!/usr/bin/env node
/**
 * Gera apps/desktop/build/icone.ico (16 a 256 px) a partir de apps/web/public/favicon.svg.
 * Rode de novo só quando o desenho mudar; o .ico fica versionado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(raiz, 'apps/web/public/favicon.svg'));
const destino = path.join(raiz, 'apps/desktop/build/icone.ico');
const TAMANHOS = [16, 24, 32, 48, 64, 128, 256];

const imagens = await Promise.all(
  TAMANHOS.map(async (lado) => ({
    lado,
    // `density` alto: o SVG é redesenhado em cada tamanho, em vez de ampliado.
    png: await sharp(svg, { density: Math.max(72, (72 * lado) / 64) * 4 })
      .resize(lado, lado, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  })),
);

// Formato ICO: cabeçalho (6 bytes), uma entrada de 16 bytes por imagem e os PNGs em seguida.
const cabecalho = Buffer.alloc(6 + 16 * imagens.length);
cabecalho.writeUInt16LE(1, 2);
cabecalho.writeUInt16LE(imagens.length, 4);
let posicao = cabecalho.length;
imagens.forEach(({ lado, png }, i) => {
  const entrada = 6 + 16 * i;
  cabecalho.writeUInt8(lado === 256 ? 0 : lado, entrada); // 0 = 256
  cabecalho.writeUInt8(lado === 256 ? 0 : lado, entrada + 1);
  cabecalho.writeUInt16LE(1, entrada + 4);
  cabecalho.writeUInt16LE(32, entrada + 6);
  cabecalho.writeUInt32LE(png.length, entrada + 8);
  cabecalho.writeUInt32LE(posicao, entrada + 12);
  posicao += png.length;
});

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, Buffer.concat([cabecalho, ...imagens.map((i) => i.png)]));
console.log(`✔ ${path.relative(raiz, destino)} (${TAMANHOS.join(', ')} px)`);
