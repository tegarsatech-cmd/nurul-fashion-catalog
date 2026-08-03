# Panduan Menghubungkan & Menyinkronkan `maulidah` dan `katalogmaul` di Vercel

> **Tujuan:** Agar semua kode, versi terbaru, dan pembaruan dari `maulidah.vercel.app`
> otomatis diterapkan juga ke `katalogmaul.vercel.app` sehingga keduanya **persis sama**.
>
> **Cara paling andal:** Hubungkan **kedua proyek Vercel ke repo GitHub yang SAMA**
> (dan branch yang sama). Dengan begitu, **setiap kali Anda `git push` ke GitHub,
> Vercel akan otomatis membangun (build) dan men-deploy ke kedua proyek secara bersamaan**.

---

## ✨ Prinsip Inti

| Sumber | Peran |
|--------|-------|
| **GitHub** | Satu-satunya **sumber kebenaran** (singel source of truth) untuk kode |
| **Vercel – Proyek `maulidah`** | Terhubung ke repo GitHub (branch `main`) |
| **Vercel – Proyek `katalogmaul`** | Terhubung ke repo GitHub yang SAMA (branch `main`) |

Karena keduanya membaca dari repo yang sama, mereka **selalu identik**.
Tidak ada lagi "update manual" dua kali — cukup push sekali.

---

## 🧩 Status Proyek Anda (Hasil Analisis)

- **Repo GitHub sudah ada:** `https://github.com/tegarsatech-cmd/nurul-fashion-catalog.git`
- **Branch:** `main`
- **Stack:** Vite 5 (multi-page), build ke folder `dist/`
- **Root build:** `vercel.json` (framework `vite`, output `dist`)
- **Sumber aplikasi:** `UrbanStyle-Catalog/`
- **Folder legacy yang TIDAK ikut di-deploy:** `nurul_fashion_store/`, `image/`, `lib/`, `assets/`, dll. (sudah diatur di `.gitignore` & `.vercelignore`)

---

## 📋 Langkah 1 — Pastikan Kode Lokal Ter-push ke GitHub

Buka **terminal** di folder proyek (`c:/maulidah`), lalu jalankan:

```bash
# 1. Lihat status
git status

# 2. Tambahkan semua perubahan
git add .

# 3. Commit dengan pesan
git commit -m "Update terbaru"

# 4. Push ke GitHub (branch main)
git push origin main
```

> Jika muncul perintah login, masukkan token GitHub (Personal Access Token) Anda.
> Setelah ini, kode terkini sudah aman di GitHub.

---

## 📋 Langkah 2 — Hubungkan Proyek `maulidah` ke GitHub (jika belum)

1. Buka [vercel.com](https://vercel.com) → login.
2. Klik **Add New…** → **Project**.
3. Pilih **repo `nurul-fashion-catalog`** → **Import**.
4. Saat muncul konfigurasi:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `/` (root, karena build sudah di-root)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Klik **Deploy**.
6. Setelah deploy sukses, catat nama proyek ini. Beri nama proyek yang jelas, misalnya `maulidah`, dan pastikan domain `maulidah.vercel.app` aktif.

---

## 📋 Langkah 3 — Hubungkan Proyek `katalogmaul` ke Repo yang SAMA

> Ini adalah **langkah kunci** agar kedua proyek sinkron otomatis.

1. Buka [vercel.com](https://vercel.com) → **Add New…** → **Project**.
2. Pilih **repo yang SAMA** yaitu `nurul-fashion-catalog` → **Import**.
3. Gunakan konfigurasi yang **identik** dengan Langkah 2:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `/`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Klik **Deploy**.
5. Setelah jadi, beri nama proyek ini `katalogmaul` (atau nama yang sama), dan pastikan domain `katalogmaul.vercel.app` aktif.

> ⚠️ **PENTING:** Kedua proyek harus terhubung ke **repo & branch yang sama**.
> Jika salah satu dihubungkan ke repo/branch berbeda, keduanya tidak akan sinkron.

---

## ⚙️ Langkah 4 — (Opsional) Mengatur Branch untuk Auto-Deploy

Pada setiap proyek:
1. Buka proyek di Vercel → menu **Settings** → **Git**.
2. Pastikan **Production Branch** = `main`.
3. Aktifkan **Automatic Deployments** (biasanya sudah aktif secara default).
4. Sistem akan otomatis men-deploy saat terjadi push ke `main`.

---

## 🔄 Langkah 5 — Cara Pembaruan Sinkron (Workflow Harian)

Setiap kali Anda ingin memperbarui kode, cukup **satu alur**:

```bash
cd c:/maulidah
git add .
git commit -m "Deskripsi perubahan"
git push origin main
```

Vercel akan otomatis membangun & men-deploy **ke kedua proyek sekaligus**
(`maulidah` dan `katalogmaul`). Keduanya akan selalu identik.

---

## ✅ Langkah 6 — Verifikasi Hasil

1. Setelah push, buka **Dashboard Vercel** → lihat kedua proyek.
2. Pastikan keduanya berstatus **Ready** (deploy sukses).
3. Buka `https://maulidah.vercel.app` dan `https://katalogmaul.vercel.app`.
4. Bandingkan — keduanya harus menampilkan konten yang sama persis.

---

## 🚨 Tips & Catatan Penting

- **Satu sumber kode:** Jangan mengubah kode langsung di dua tempat. Selalu edit di folder lokal `c:/maulidah`, lalu push.
- **Jangan duplikasi folder:** Folder `nurul_fashion_store/` adalah proyek lama dan sudah diabaikan oleh git (tidak ikut di-deploy). Jangan mengubahnya sebagai sumber utama.
- **Build di root:** `vite.config.js` sudah mengarahkan sumber ke `UrbanStyle-Catalog/`, jadi kedua proyek cukup di-build dari root.
- **Jika ingin memakai hanya satu proyek:** Sebenarnya kedua domain bisa dijadikan **alias** di satu proyek Vercel (Settings → Domains). Tapi karena Anda ingin mempertahankan dua proyek terpisah, gunakan cara di atas (satu repo, dua proyek).
- **GitHub sebagai sumber kebenaran:** Selalu pastikan kode terbaru sudah di-push sebelum berasumsi deployment sudah update.

---

## 💬 Kesimpulan

Dengan menghubungkan **kedua proyek Vercel ke repo GitHub yang sama (`nurul-fashion-catalog`)**
pada branch `main`, maka setiap update/push akan otomatis diterapkan ke `maulidah` dan `katalogmaul`
secara bersamaan — menjamin keduanya selalu **persis sama** tanpa perlu deploy manual dua kali.
