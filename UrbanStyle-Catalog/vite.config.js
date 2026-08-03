// ============================================
// UrbanStyle-Catalog/vite.config.js
// INNER CONFIG — DELEGATE KE ROOT CONFIG
// --------------------------------------------
// Ini sengaja dibuat TIPIS agar TIDAK ada dua
// sumber kebenaran (single source of truth).
// Root config (`/vite.config.js`) yang dipakai
// oleh Vercel & `npm run dev/build` dari root.
//
// Jika kamu menjalankan `npm run dev` dari dalam
// folder ini, Vite tetap memakai konfigurasi yang
// SAMA dengan root, sehingga tidak ada dist/ atau
// cache yang berbeda/kedaluwarsa.
// ============================================
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Root project sebenarnya ada di PARENT folder (`../`)
// Vite root = parent (c:/maulidah) agar konsisten.
export default defineConfig(async ({ command }) => {
  // Ambil konfigurasi root (c:/maulidah/vite.config.js)
  const { default: rootConfig } = await import(path.resolve(__dirname, '../vite.config.js'));

  // Jika rootConfig adalah function/object, bungkus ulang dengan root yang benar.
  // Root config sudah mengarahkan root ke UrbanStyle-Catalog,
  // jadi 2 file ini konsisten dan tidak dobel.
  return rootConfig;
});

