import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Source aplikasi ada di folder UrbanStyle-Catalog
  root: resolve(__dirname, 'UrbanStyle-Catalog'),
  base: './',
  build: {
    // Output di-root/dist agar Vercel tinggal serve dist/
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'UrbanStyle-Catalog/index.html'),
        admin: resolve(__dirname, 'UrbanStyle-Catalog/admin.html'),
        login: resolve(__dirname, 'UrbanStyle-Catalog/login.html'),
        seed: resolve(__dirname, 'UrbanStyle-Catalog/seed.html')
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

