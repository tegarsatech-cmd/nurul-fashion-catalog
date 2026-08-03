# TODO - Audit & Perbaikan UI/UX Nurul Fashion (UrbanStyle-Catalog)

Target: Perbaikan Frontend (HTML, CSS, JS) tanpa mengubah DB Supabase, CRUD, Auth, Storage, Realtime.

## Steps
- [x] 1. Fix Google Maps iframe (assets/js/app.js - refreshContact) - ekstrak src dari iframe/URL, render <iframe> bersih
- [x] 2. CSS: html/body/img anti-overflow global (width:100%; max-width:100%; overflow-x:hidden; img max-width:100%)
- [x] 3. CSS: Hero & Navbar full-width (tanpa terpotong kanan)
- [x] 4. CSS: Product grid mobile 1 kolom, image 220-280px, nama 2 baris, tombol tidak bertumpuk
- [x] 5. CSS: Card alamat word-break/overflow-wrap
- [x] 6. CSS: Tombol WhatsApp mobile full-width, min-height 44px
- [x] 7. CSS: Preview modal (desktop horizontal 700-800px, mobile vertikal 90-95%, close top-right, scroll)
- [x] 8. CSS: Navbar mobile (logo kiri, hamburger kanan, Dashboard Admin di drawer)
- [x] 9. CSS: Audit overflow (container, grid, modal, no horizontal scroll)
- [x] 10. Test: npm run build (BERHASIL, tidak ada error)
- [x] 11. Deploy: vercel --prod --yes ke proyek katalog-maul -> https://katalog-maul.vercel.app (sama dengan katalogmaul.vercel.app) - BERHASIL, Ready
- [x] 12. Sinkronisasi: katalog-maul.vercel.app kini memakai kode yang sama persis dengan maulidah.vercel.app (direktori c:/maulidah) - BERHASIL
