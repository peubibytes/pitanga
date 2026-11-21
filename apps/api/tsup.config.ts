import { cpSync } from 'node:fs';
import { defineConfig } from 'tsup';

// Empacota a API em um único arquivo, embutindo os pacotes do monorepo (shared e core).
// Módulos nativos e dependências de terceiros continuam externos (node_modules).
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  noExternal: [/^@pitanga\//],
  async onSuccess() {
    cpSync('src/db/migrations', 'dist/migrations', { recursive: true });
  },
});
