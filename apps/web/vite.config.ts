import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Em desenvolvimento, o Vite serve o front em :5173 e repassa /api para a API em 127.0.0.1:1971.
// Em produção a própria API serve o resultado de `vite build` (um processo, uma porta).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:1971', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
