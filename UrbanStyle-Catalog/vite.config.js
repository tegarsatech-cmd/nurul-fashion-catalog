import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Root project = UrbanStyle-Catalog (Vite akan dibuka dari folder ini)
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        login: resolve(__dirname, 'login.html'),
        seed: resolve(__dirname, 'seed.html')
      }
    }
  },
  server: {
    port: 5173,
    open: false
  },
  preview: {
    port: 4173
  }
});

