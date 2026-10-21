import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 4000 },
  server: { host: '127.0.0.1', port: 5173 },
}));
