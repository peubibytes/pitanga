import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist-electron',
  outExtension: () => ({ js: '.cjs' }),
  external: ['electron'],
  clean: true,
});
