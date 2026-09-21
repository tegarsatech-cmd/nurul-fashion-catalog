// ============================================
// NURUL FASHION - ADMIN DASHBOARD
// Supabase CRUD Operations
// ============================================

import supabase, {
    signInWithEmailAndPassword,
    updatePassword,
    signOut,
    onAuthStateChanged,
    getMfaAssuranceLevel,
    listMfaFactors,
    enrollMfa,
    challengeAndVerifyMfa,
    unenrollMfa
} from '../../auth.js';
import { ref, uploadBytes, getDownloadURL } from '../../storage.js';


let currentUser = null;

// ===== Toast Notification System =====
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + message;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
}

// ===== KEAMANAN INPUT VALIDATION & SANITASI =====
function sanitizeInput(str) {
    if (typeof str !== 'string') return '';
    return str.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

function validateEmail(email) {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(String(email || '').trim());
}

function validateWhatsAppNumber(num) {
    const clean = String(num || '').replace(/\D/g, '');
    return clean.length >= 10 && clean.length <= 15;
}

function validateUrl(url, allowEmpty = true) {
    const val = String(url || '').trim();
    if (!val && allowEmpty) return true;
    try {
        const parsed = new URL(val);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

function validateImageFile(file, maxMb = 5) {
    if (!file) return { valid: true };
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
        return { valid: false, error: 'Format file tidak didukung! Gunakan gambar JPG, PNG, WEBP, atau GIF.' };
    }
    if (file.size > maxMb * 1024 * 1024) {
        return { valid: false, error: `Ukuran file terlalu besar! Maksimal ${maxMb}MB.` };
    }
    return { valid: true };
}

// ===== File Preview Handler =====
function setupFilePreview(inputId, previewId, imgId, nameId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const img = document.getElementById(imgId);
    const name = document.getElementById(nameId);
    if (!input || !preview) return;
    input.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const file = this.files[0];
            // Validasi tipe file
            if (!file.type.startsWith('image/')) {
                showToast('Hanya file gambar yang diizinkan!', 'error');
                this.value = '';
                preview.classList.remove('show');
                return;
            }
            // Validasi ukuran (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showToast('Ukuran file maksimal 5MB!', 'error');
                this.value = '';
                preview.classList.remove('show');
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                if (img) img.src = e.target.result;
                if (name) name.textContent = file.name;
                preview.classList.add('show');
            };
            reader.readAsDataURL(file);
        } else {
            preview.classList.remove('show');
        }
    });
}

// Setup file previews on DOM ready
setupFilePreview('produkGambar', 'produkFilePreview', 'produkPreviewImg', 'produkFileName');
setupFilePreview('galeriGambar', 'galeriFilePreview', 'galeriPreviewImg', 'galeriFileName');
setupFilePreview('bannerGambar', 'bannerFilePreview', 'bannerPreviewImg', 'bannerFileName');

function normalizeProductItems(product) {
    if (Array.isArray(product?.items) && product.items.length > 0) {
        return product.items.slice(0, 10).map(item => ({
            nama: String(item?.nama || '').trim(),
            harga: item?.harga === '' || item?.harga === null || item?.harga === undefined ? '' : Number(item.harga),
            ukuran: String(item?.ukuran || '').trim(),
            warna: String(item?.warna || item?.color || '').trim(),
            stok: item?.stok === 'Habis' ? 'Habis' : 'Tersedia'
        }));
    }
    return product?.nama ? [{ nama: product.nama, harga: product.harga ?? '', ukuran: product.ukuran || '', warna: product.warna || '', stok: product.stok || 'Tersedia' }] : [];
}

function renderProductItemInputs(items = []) {
    const container = document.getElementById('produkItems');
    if (!container) return;
    container.innerHTML = Array.from({ length: 10 }, (_, index) => {
        const item = items[index] || {};
        return '<div class="product-item-row">' +
            '<label for="produkItemNama' + index + '">Barang ' + (index + 1) + '</label>' +
            '<input type="text" id="produkItemNama' + index + '" data-item-name placeholder="Nama barang (wajib)">' +
            '<input type="number" id="produkItemHarga' + index + '" data-item-price min="0" step="1" placeholder="Harga (wajib)">' +
            '<input type="text" id="produkItemUkuran' + index + '" data-item-size placeholder="Ukuran (wajib)">' +
            '<input type="text" id="produkItemWarna' + index + '" data-item-color placeholder="Warna (wajib)">' +
            '<select id="produkItemStok' + index + '" data-item-stock aria-label="Stok Barang ' + (index + 1) + ' (wajib)"><option value="Tersedia">Tersedia</option><option value="Habis">Habis</option></select>' +
            '</div>';
    }).join('');
    items.slice(0, 10).forEach((item, index) => {
        const name = document.getElementById('produkItemNama' + index);
        const price = document.getElementById('produkItemHarga' + index);
        const size = document.getElementById('produkItemUkuran' + index);
        const color = document.getElementById('produkItemWarna' + index);
        const stock = document.getElementById('produkItemStok' + index);
        if (name) name.value = item.nama || '';
        if (price) price.value = item.harga === '' ? '' : item.harga;
        if (size) size.value = item.ukuran || '';
        if (color) color.value = item.warna || '';
        if (stock) stock.value = item.stok || 'Tersedia';
    });
}

function collectProductItems() {
    const rows = Array.from(document.querySelectorAll('#produkItems .product-item-row'));
    const invalidRow = rows.find(row => {
        const name = row.querySelector('[data-item-name]')?.value.trim() || '';
        const priceValue = row.querySelector('[data-item-price]')?.value.trim() || '';
        const size = row.querySelector('[data-item-size]')?.value.trim() || '';
        const color = row.querySelector('[data-item-color]')?.value.trim() || '';
        return (name || priceValue || size || color) && (!name || !priceValue || !size || !color);
    });
    if (invalidRow) {
        showToast('Setiap barang yang diisi wajib memiliki nama, harga, ukuran, dan warna.', 'warning');
        return null;
    }
    return rows.map(row => {
        const name = row.querySelector('[data-item-name]')?.value.trim() || '';
        const priceValue = row.querySelector('[data-item-price]')?.value.trim() || '';
        const size = row.querySelector('[data-item-size]')?.value.trim() || '';
        const color = row.querySelector('[data-item-color]')?.value.trim() || '';
        const stock = row.querySelector('[data-item-stock]')?.value || 'Tersedia';
        if (!name && !priceValue && !size && !color) return null;
        return { nama: name, harga: priceValue === '' ? '' : parseInt(priceValue, 10) || 0, ukuran: size, warna: color, stok: stock || 'Tersedia' };
    }).filter(Boolean);
}

renderProductItemInputs();

// ===== Auth State & Security Enforcement =====
onAuthStateChanged(async (user) => {
    if (user) {
        // Enforce 2FA verification if enrolled (AAL2 Check)
        try {
            const assurance = await getMfaAssuranceLevel();
            if (assurance && assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
                // User has not completed Step 2 2FA yet!
                window.location.href = 'login.html?step=2fa';
                return;
            }
        } catch (mfaCheckError) {
            console.warn('MFA assurance check warning:', mfaCheckError);
        }

        currentUser = user;
        const nameEl = document.getElementById('adminName');
        if (nameEl) nameEl.textContent = user.email || 'Admin';
        const accountEmail = document.getElementById('accountEmail');
        if (accountEmail) accountEmail.value = user.email || '';
        const requestedPage = window.location.hash.replace('#', '') || 'dashboard';
        showPage(requestedPage);
        loadDashboardData();
        initSessionInactivityManager();
        refreshMfaStatus();
    } else {
        // Redirect ke halaman login terpisah
        window.location.href = 'login.html';
    }
});

// ===== Logout =====
document.getElementById('logoutBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    try { 
        await signOut(); 
        window.location.href = 'login.html';
    } catch (error) { 
        console.error('Logout error:', error); 
        window.location.href = 'login.html';
    }
});

const accountPasswordForm = document.getElementById('accountPasswordForm');
if (accountPasswordForm) {
    accountPasswordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const currentPassword = document.getElementById('accountCurrentPassword').value;
        const newPassword = document.getElementById('accountNewPassword').value;
        const confirmPassword = document.getElementById('accountConfirmPassword').value;
        if (newPassword.length < 6) {
            showToast('Password baru minimal 6 karakter.', 'warning');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('Konfirmasi password baru tidak sama.', 'warning');
            return;
        }
        if (!currentUser?.email) {
            showToast('Sesi login tidak ditemukan. Silakan login kembali.', 'error');
            return;
        }
        const submitButton = accountPasswordForm.querySelector('button[type="submit"]');
        try {
            if (submitButton) submitButton.disabled = true;
            await signInWithEmailAndPassword(currentUser.email, currentPassword);
            await updatePassword(newPassword);
            accountPasswordForm.reset();
            const accountEmail = document.getElementById('accountEmail');
            if (accountEmail) accountEmail.value = currentUser.email;
            showToast('Password berhasil diubah', 'success');
        } catch (error) {
            const message = String(error?.message || '');
            if (message.includes('Invalid login credentials')) {
                showToast('Password lama salah.', 'error');
            } else {
                console.error('Gagal mengubah password:', error);
                showToast('Password gagal diubah. Silakan coba lagi.', 'error');
            }
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

// ===== Sidebar Navigation =====
document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        showPage(page);
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        // Tutup drawer sidebar di mobile setelah memilih menu
        if (isMobileView() && sidebar) {
            setSidebarOpen(false);
        }
    });
});

window.addEventListener('hashchange', () => {
    const page = window.location.hash.replace('#', '') || 'dashboard';
    showPage(page);
});

// ===== Subscription Manager (hindari onSnapshot menumpuk) =====
let produkUnsubscribe = null;
let kategoriUnsubscribe = null;
let galeriUnsubscribe = null;
let bannerUnsubscribe = null;

function unsubscribeAll() {
    if (produkUnsubscribe) { try { produkUnsubscribe(); } catch(e) { console.error('Unsubscribe produk error:', e); } produkUnsubscribe = null; }
    if (kategoriUnsubscribe) { try { kategoriUnsubscribe(); } catch(e) { console.error('Unsubscribe kategori error:', e); } kategoriUnsubscribe = null; }
    if (galeriUnsubscribe) { try { galeriUnsubscribe(); } catch(e) { console.error('Unsubscribe galeri error:', e); } galeriUnsubscribe = null; }
    if (bannerUnsubscribe) { try { bannerUnsubscribe(); } catch(e) { console.error('Unsubscribe banner error:', e); } bannerUnsubscribe = null; }
}

function createRealtimeSubscription(table, callback) {
    const channel = supabase.channel('realtime-' + table + '-' + Date.now());
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, async () => {
        try {
            // Debounce singkat agar banyak perubahan sekaligus tidak overload
            if (channel._pendingRefresh) clearTimeout(channel._pendingRefresh);
            channel._pendingRefresh = setTimeout(async () => {
                try {
                    await callback();
                } catch (error) {
                    console.error('Realtime callback error for', table, error);
                }
            }, 150);
        } catch (error) {
            console.error('Realtime callback error for', table, error);
        }
    });

    // Subscribe dengan status callback untuk deteksi koneksi & auto-reconnect
    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Realtime terhubung untuk tabel:', table);
        } else if (status === 'CHANNEL_ERROR') {
            console.error('Realtime error untuk tabel:', table);
        } else if (status === 'TIMED_OUT') {
            console.warn('Realtime timeout untuk tabel:', table, '- mencoba menyambung ulang...');
        } else if (status === 'CLOSED') {
            console.warn('Realtime channel tertutup untuk tabel:', table);
        }
    });

    return () => {
        if (channel && typeof channel.unsubscribe === 'function') {
            try {
                channel.unsubscribe();
            } catch (error) {
                console.error('Realtime unsubscribe error:', error);
            }
        }
    };
}

// ===== Helper: fetch dengan retry =====
async function fetchWithRetry(queryFn, label, maxRetries = 3, delayMs = 1200) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await queryFn();
            return result;
        } catch (error) {
            lastError = error;
            console.error('Gagal memuat ' + label + ' (percobaan ' + attempt + '/' + maxRetries + '):', error);
            if (attempt < maxRetries) {
                showToast('Koneksi bermasalah, mencoba lagi (' + attempt + '/' + maxRetries + ')...', 'warning');
                await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
            }
        }
    }
    throw lastError;
}

const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('mainContent');
const adminToggle = document.getElementById('adminToggle');
let sidebarOverlay = document.getElementById('sidebarOverlay');
if (!sidebarOverlay) {
    sidebarOverlay = document.createElement('div');
    sidebarOverlay.id = 'sidebarOverlay';
    sidebarOverlay.className = 'sidebar-overlay';
    document.body.appendChild(sidebarOverlay);
}
sidebarOverlay.addEventListener('click', () => setSidebarOpen(false));

function isMobileView() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function lockBodyScroll(lock) {
    if (lock) {
        document.body.classList.add('body-lock');
    } else {
        document.body.classList.remove('body-lock');
    }
}

// Akses localStorage yang aman (tidak crash di mode private/incognito)
function safeStorageGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

function safeStorageSet(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (error) {
        // Abaikan — mode private/incognito atau quota penuh
    }
}

function getInitialSidebarState() {
    // Di mobile, drawer sidebar HARUS selalu tertutup saat halaman dimuat
    // (jangan baca localStorage dari mode desktop yang bisa membuat
    //  overlay drawer terbuka otomatis pada layar kecil).
    if (isMobileView()) {
        return false;
    }
    const stored = safeStorageGet('adminSidebarOpen');
    return stored === null ? true : stored === 'true';
}

function isSidebarOpen() {
    if (!sidebar) return true;
    if (isMobileView()) {
        // Di mobile, sidebar adalah off-canvas drawer.
        // Terbuka HANYA jika punya class 'active'.
        return sidebar.classList.contains('active');
    }
    return !sidebar.classList.contains('collapsed');
}

function setSidebarOpen(open) {
    if (!sidebar || !mainContent) return;
    safeStorageSet('adminSidebarOpen', open ? 'true' : 'false');

    if (open) {
        sidebar.classList.remove('collapsed');
        sidebar.classList.add('active');
        mainContent.classList.remove('sidebar-collapsed');
        if (isMobileView()) {
            sidebarOverlay.classList.add('open');
            document.body.classList.add('no-scroll');
        } else {
            sidebarOverlay.classList.remove('open');
        }
    } else {
        sidebar.classList.remove('active');
        if (isMobileView()) {
            sidebar.classList.remove('collapsed');
        } else {
            sidebar.classList.add('collapsed');
            mainContent.classList.add('sidebar-collapsed');
        }
        sidebarOverlay.classList.remove('open');
        document.body.classList.remove('no-scroll');
    }
}

function initializeSidebar() {
    const open = getInitialSidebarState();
    setSidebarOpen(open);
}

if (adminToggle) {
    adminToggle.addEventListener('click', (e) => {
        e.preventDefault();
        setSidebarOpen(!isSidebarOpen());
    });
}

// Perbaiki event resize: debounce + hanya terapkan ulang saat breakpoint berubah,
// agar drawer tidak "flicker" ketika toolbar browser mobile terbuka/tertutup.
let lastSidebarViewport = isMobileView();
let sidebarResizeTimer = null;

window.addEventListener('resize', () => {
    clearTimeout(sidebarResizeTimer);
    sidebarResizeTimer = setTimeout(() => {
        const mobileNow = isMobileView();
        if (mobileNow === lastSidebarViewport) return;
        lastSidebarViewport = mobileNow;

        // Saat berpindah ke desktop, tutup drawer dan kembalikan margin
        if (!mobileNow) {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('open');
            document.body.classList.remove('no-scroll');
            const stored = safeStorageGet('adminSidebarOpen');
            const open = stored === null ? true : stored === 'true';
            if (open) {
                sidebar.classList.remove('collapsed');
                mainContent.classList.remove('sidebar-collapsed');
            } else {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('sidebar-collapsed');
            }
        } else {
            // Saat berpindah ke mobile, sidebar selalu sebagai drawer tertutup
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('sidebar-collapsed');
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('open');
            document.body.classList.remove('no-scroll');
        }
    }, 200);
});

initializeSidebar();

function showPage(page) {
    const normalizedPage = page && document.getElementById('page-' + page) ? page : 'dashboard';
    // Bersihkan subscription lama sebelum pindah halaman
    unsubscribeAll();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    const pageEl = document.getElementById('page-' + normalizedPage);
    if (pageEl) pageEl.classList.add('active');
    const activeLink = document.querySelector('.sidebar-link[data-page="' + normalizedPage + '"]');
    if (activeLink) activeLink.classList.add('active');
    window.history.replaceState(null, '', '#' + normalizedPage);

    if (normalizedPage === 'produk') loadProdukTable();
    if (normalizedPage === 'kategori') loadKategoriTable();
    if (normalizedPage === 'galeri') loadGaleriAdmin();
    if (normalizedPage === 'banner-home') loadBannerHomeAdmin();
    if (normalizedPage === 'kontak') loadKontakSummary();
    if (normalizedPage === 'pengaturan') loadKontakForm();
    if (normalizedPage === 'profile') loadProfilePage();
    if (normalizedPage === 'dashboard') loadDashboardData();
}

// ===== DASHBOARD =====
async function loadDashboardData() {
    try {
        const { data: products, error: productError } = await supabase.from('products').select('*');
        if (productError) throw productError;
        const { data: categories, error: categoryError } = await supabase.from('categories').select('*');
        if (categoryError) throw categoryError;
        const { count: galleryCount, error: galleryError } = await supabase.from('gallery').select('*', { count: 'exact', head: true });
        if (galleryError) throw galleryError;
        document.getElementById('totalProduk').textContent = (products || []).length;
        document.getElementById('produkTersedia').textContent = (products || []).filter(p => p.stok === 'Tersedia').length;
        document.getElementById('produkHabis').textContent = (products || []).filter(p => p.stok === 'Habis').length;
        document.getElementById('totalKategori').textContent = (categories || []).length;
        const totalGaleri = document.getElementById('totalGaleri');
        if (totalGaleri) totalGaleri.textContent = galleryCount || 0;
    } catch (error) {
        console.error('Dashboard load error:', error);
        showToast('Gagal memuat data dashboard', 'error');
    }
}

// ===== PRODUK CRUD =====
function populateProdukTable(products) {
    const tbody = document.getElementById('produkTableBody');
    if (!tbody) return;
    if (!products || products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;">Belum ada produk</td></tr>';
        return;
    }
    tbody.innerHTML = products.map(p => {
        const title = p.judul_postingan || p.nama || '-';
        const items = normalizeProductItems(p);
        const firstPrice = items.find(item => item.harga !== '')?.harga;
        return '<tr data-id="' + p.id + '"><td><img src="' + (p.gambar || 'https://via.placeholder.com/50') + '" style="width:50px;height:50px;object-fit:cover;border-radius:8px;"></td><td><strong>' + title + '</strong><small class="admin-item-count">' + items.filter(item => item.nama).length + ' barang</small></td><td>' + (p.kategori || '-') + '</td><td>' + (firstPrice === undefined ? '-' : 'Rp ' + formatPrice(firstPrice)) + '</td><td><span style="color:' + (p.stok === 'Tersedia' ? '#22c55e' : '#ef4444') + ';font-weight:600;">' + (p.stok || '-') + '</span></td><td><button class="btn-sm btn-edit" data-action="edit"><i class="fas fa-edit"></i></button> <button class="btn-sm btn-delete" data-action="delete"><i class="fas fa-trash"></i></button></td></tr>';
    }).join('');
}

async function refreshProdukTable() {
    const tbody = document.getElementById('produkTableBody');
    if (!tbody) return;
    try {
        const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        populateProdukTable(data || []);
    } catch (error) {
        console.error('Produk load error:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;">Gagal memuat produk</td></tr>';
        showToast('Gagal memuat produk', 'error');
    }
}

function loadProdukTable() {
    const tbody = document.getElementById('produkTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';
    }
    refreshProdukTable();
    produkUnsubscribe = createRealtimeSubscription('products', refreshProdukTable);
    if (tbody && !tbody.dataset.listenerAttached) {
        tbody.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            const tr = btn.closest('tr');
            if (!tr) return;
            const id = tr.dataset.id;
            if (!id) { console.error('Produk id undefined'); return; }
            if (action === 'edit') {
                try { window.editProduk(id); } catch (err) { console.error('editProduk error:', err); showToast('Gagal membuka editor produk: ' + err.message, 'error'); }
            } else if (action === 'delete') {
                try { window.hapusProduk(id); } catch (err) { console.error('hapusProduk error:', err); showToast('Gagal menghapus produk: ' + err.message, 'error'); }
            }
        });
        tbody.dataset.listenerAttached = '1';
    }
}

async function loadKategoriOptions(selectedValue = '') {
    try {
        const { data, error } = await supabase.from('categories').select('*').order('nama', { ascending: true });
        if (error) throw error;
        const sel = document.getElementById('produkKategori');
        if (!sel) return;
        sel.innerHTML = '<option value="">Pilih Kelompok Usia</option>';
        (data || []).forEach(cat => {
            const nama = cat.nama || '';
            sel.innerHTML += '<option value="' + nama + '"' + (nama === selectedValue ? ' selected' : '') + '>' + nama + '</option>';
        });
    } catch (error) {
        console.error('Error loading categories:', error);
        showToast('Gagal memuat kelompok usia', 'error');
    }
}

window.showAddProdukModal = async function() {
    document.getElementById('produkModalTitle').textContent = 'Tambah Produk';
    document.getElementById('produkEditId').value = '';
    document.getElementById('produkForm').reset();
    renderProductItemInputs();
    const produkFilePreview = document.getElementById('produkFilePreview');
    if (produkFilePreview) produkFilePreview.classList.remove('show');
    await loadKategoriOptions();
    document.getElementById('produkModal').classList.add('active');
};

window.editProduk = async function(id) {
    try {
        if (!id) { console.error('editProduk called with undefined id'); return; }
        const { data: product, error } = await supabase.from('products').select('*').eq('id', id).single();
        if (error) {
            if (error.details?.includes('Results contain 0 rows') || error.message?.includes('No rows')) {
                showToast('Data produk tidak ditemukan', 'error');
                return;
            }
            throw error;
        }
        document.getElementById('produkModalTitle').textContent = 'Edit Produk';
        document.getElementById('produkEditId').value = id;
        document.getElementById('produkJudul').value = product.judul_postingan || product.nama || '';
        document.getElementById('produkDeskripsi').value = product.deskripsi || product.keterangan_foto || '';
        document.getElementById('produkUkuran').value = product.ukuran || '';
        document.getElementById('produkWarna').value = product.warna || '';
        renderProductItemInputs(normalizeProductItems(product));
        await loadKategoriOptions(product.kategori || '');
        const produkFilePreview = document.getElementById('produkFilePreview');
        const produkPreviewImg = document.getElementById('produkPreviewImg');
        const produkFileName = document.getElementById('produkFileName');
        if (product.gambar) {
            if (produkPreviewImg) produkPreviewImg.src = product.gambar;
            if (produkFileName) produkFileName.textContent = '';
            if (produkFilePreview) produkFilePreview.classList.add('show');
        } else {
            if (produkPreviewImg) produkPreviewImg.src = '';
            if (produkFilePreview) produkFilePreview.classList.remove('show');
        }
        document.getElementById('produkModal').classList.add('active');
    } catch (error) {
        console.error('Edit produk error:', error);
        showToast('Gagal membuka editor produk: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
};

window.hapusProduk = async function(id) {
    if (!confirm('Hapus produk ini?')) return;
    try {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        showToast('Produk berhasil dihapus!', 'success');
    } catch (error) {
        console.error('Hapus produk error:', error);
        showToast('Gagal menghapus produk: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
};
document.getElementById('produkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('produkEditId').value;
    const imageInput = document.getElementById('produkGambar');
    const existingPreview = document.getElementById('produkFilePreview')?.classList.contains('show');
    if (!editId && (!imageInput || imageInput.files.length === 0) && !existingPreview) {
        showToast('Gambar Produk wajib diisi saat menambah produk.', 'warning');
        return;
    }
    if (imageInput && imageInput.files && imageInput.files.length > 0) {
        const fileCheck = validateImageFile(imageInput.files[0], 5);
        if (!fileCheck.valid) {
            showToast(fileCheck.error, 'warning');
            return;
        }
    }
    const btn = e.target.querySelector('button[type="submit"]');
    const items = collectProductItems();
    if (items === null) return;
    const title = sanitizeInput(document.getElementById('produkJudul').value);
    const data = {
        nama: title || items[0]?.nama || 'Koleksi Produk',
        judul_postingan: title || items[0]?.nama || 'Koleksi Produk',
        keterangan_foto: sanitizeInput(document.getElementById('produkDeskripsi').value),
        items,
        kategori: sanitizeInput(document.getElementById('produkKategori').value),
        harga: items[0]?.harga === '' || items[0]?.harga === undefined ? 0 : Number(items[0].harga) || 0,
        stok: items[0]?.stok || 'Tersedia',
        ukuran: sanitizeInput(document.getElementById('produkUkuran').value),
        warna: sanitizeInput(document.getElementById('produkWarna').value)
    };
    if (!editId) {
        data.created_at = new Date().toISOString();
    }
    try {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
            btn.disabled = true;
        }
        const file = document.getElementById('produkGambar');
        if (file && file.files.length > 0) {
            const storageRef = ref('products/' + Date.now() + '_' + file.files[0].name);
            await uploadBytes(storageRef, file.files[0]);
            data.gambar = await getDownloadURL(storageRef);
        }
        if (editId) {
            const { error } = await supabase.from('products').update(data).eq('id', editId);
            if (error) throw error;
            showToast('Produk berhasil diperbarui!', 'success');
        } else {
            const { error } = await supabase.from('products').insert([data]);
            if (error) throw error;
            showToast('Produk berhasil ditambahkan!', 'success');
        }
        closeModal('produkModal');
        refreshProdukTable();
    } catch (error) {
        console.error('Produk simpan error:', error);
        showToast('Gagal menyimpan produk: ' + (error.message || 'Terjadi kesalahan'), 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-save"></i> Simpan Produk';
            btn.disabled = false;
        }
    }
});

const btnAddProduk = document.getElementById('btnAddProduk');
if (btnAddProduk) btnAddProduk.addEventListener('click', window.showAddProdukModal);

// ===== KATEGORI CRUD =====
function populateKategoriTable(categories) {
    const tbody = document.getElementById('kategoriTableBody');
    if (!tbody) return;
    if (!categories || categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;">Belum ada kategori</td></tr>';
        return;
    }
    tbody.innerHTML = categories.map(c => {
        return '<tr data-id="' + c.id + '"><td><i class="' + (c.icon || 'fas fa-tag') + '" style="font-size:24px;color:var(--secondary);"></i></td><td><strong>' + (c.nama || '-') + '</strong></td><td><button class="btn-sm btn-edit" data-action="edit"><i class="fas fa-edit"></i></button> <button class="btn-sm btn-delete" data-action="delete"><i class="fas fa-trash"></i></button></td></tr>';
    }).join('');
}

async function refreshKategoriTable() {
    const tbody = document.getElementById('kategoriTableBody');
    if (!tbody) return;
    try {
        const { data, error } = await supabase.from('categories').select('*').order('nama', { ascending: true });
        if (error) throw error;
        populateKategoriTable(data || []);
    } catch (error) {
        console.error('Kategori load error:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;">Gagal memuat kelompok usia</td></tr>';
        showToast('Gagal memuat kelompok usia', 'error');
    }
}

function loadKategoriTable() {
    const tbody = document.getElementById('kategoriTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';
    }
    refreshKategoriTable();
    kategoriUnsubscribe = createRealtimeSubscription('categories', refreshKategoriTable);
    if (tbody && !tbody.dataset.listenerAttached) {
        tbody.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            const tr = btn.closest('tr');
            if (!tr) return;
            const id = tr.dataset.id;
            if (!id) { console.error('Kategori id undefined'); return; }
            if (action === 'edit') {
                try { window.editKategori(id); } catch (err) { console.error('editKategori error:', err); showToast('Gagal membuka editor kategori: ' + err.message, 'error'); }
            } else if (action === 'delete') {
                try { window.hapusKategori(id); } catch (err) { console.error('hapusKategori error:', err); showToast('Gagal menghapus kategori: ' + err.message, 'error'); }
            }
        });
        tbody.dataset.listenerAttached = '1';
    }
}

window.showAddKategoriModal = function() {
    document.getElementById('kategoriModalTitle').textContent = 'Tambah Kelompok Usia';
    document.getElementById('kategoriEditId').value = '';
    document.getElementById('kategoriForm').reset();
    document.getElementById('kategoriModal').classList.add('active');
};

window.editKategori = async function(id) {
    try {
        if (!id) { console.error('editKategori called with undefined id'); return; }
        const { data: kategori, error } = await supabase.from('categories').select('*').eq('id', id).single();
        if (error) {
            if (error.details?.includes('Results contain 0 rows') || error.message?.includes('No rows')) return;
            throw error;
        }
        document.getElementById('kategoriModalTitle').textContent = 'Edit Kelompok Usia';
        document.getElementById('kategoriEditId').value = id;
        document.getElementById('kategoriNama').value = kategori.nama || '';
        document.getElementById('kategoriIcon').value = kategori.icon || '';
        document.getElementById('kategoriModal').classList.add('active');
    } catch (error) {
        console.error('Edit kategori error:', error);
        showToast('Gagal membuka editor kategori: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
};

window.hapusKategori = async function(id) {
    if (!confirm('Hapus kategori ini?')) return;
    try {
        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) throw error;
        showToast('Kategori berhasil dihapus!', 'success');
    } catch (error) {
        console.error('Hapus kategori error:', error);
        showToast('Gagal menghapus kategori: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
};

document.getElementById('kategoriForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('kategoriEditId').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const namaKategori = sanitizeInput(document.getElementById('kategoriNama').value);
    if (!namaKategori) {
        showToast('Nama kelompok usia wajib diisi.', 'warning');
        return;
    }
    const iconKategori = sanitizeInput(document.getElementById('kategoriIcon').value) || 'fas fa-tag';
    const data = { nama: namaKategori, icon: iconKategori };
    try {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
            btn.disabled = true;
        }
        if (editId) {
            const { error } = await supabase.from('categories').update(data).eq('id', editId);
            if (error) throw error;
            showToast('Kategori berhasil diperbarui!', 'success');
        } else {
            const { error } = await supabase.from('categories').insert([data]);
            if (error) throw error;
            showToast('Kategori berhasil ditambahkan!', 'success');
        }
        closeModal('kategoriModal');
    } catch (error) {
        console.error('Kategori simpan error:', error);
        showToast('Gagal menyimpan kategori: ' + (error.message || 'Terjadi kesalahan'), 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-save"></i> Simpan Kelompok Usia';
            btn.disabled = false;
        }
    }
});

const btnAddKategori = document.getElementById('btnAddKategori');
if (btnAddKategori) btnAddKategori.addEventListener('click', window.showAddKategoriModal);

// ===== GALERI CRUD =====
function populateGaleriGrid(items) {
    const grid = document.getElementById('galeriAdminGrid');
    if (!grid) return;
    if (!items || items.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;">Belum ada foto galeri</p>';
        return;
    }
    grid.innerHTML = items.map(g => {
        return '<div class="galeri-admin-item" data-id="' + g.id + '"><img src="' + (g.gambar || 'https://via.placeholder.com/200') + '" alt="' + (g.judul || 'Foto') + '"><div class="galeri-admin-info"><h4>' + (g.judul || 'Foto') + '</h4></div><div class="galeri-actions"><button class="btn-sm btn-edit" data-action="edit"><i class="fas fa-edit"></i></button><button class="btn-sm btn-delete" data-action="delete"><i class="fas fa-trash"></i></button></div></div>';
    }).join('');
}

async function refreshGaleriAdmin() {
    const grid = document.getElementById('galeriAdminGrid');
    if (!grid) return;
    try {
        const { data, error } = await supabase.from('gallery').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        // Hanya tampilkan foto galeri reguler (bukan banner home)
        const regularItems = (data || []).filter(g => !(g.judul || '').trim().startsWith('[BANNER]'));
        populateGaleriGrid(regularItems);
    } catch (error) {
        console.error('Galeri load error:', error);
        if (grid) grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat galeri</p>';
        showToast('Gagal memuat galeri', 'error');
    }
}

function loadGaleriAdmin() {
    const grid = document.getElementById('galeriAdminGrid');
    if (grid) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:32px;"></i><p>Memuat...</p></div>';
    }
    refreshGaleriAdmin();
    galeriUnsubscribe = createRealtimeSubscription('gallery', refreshGaleriAdmin);
    if (grid && !grid.dataset.listenerAttached) {
        grid.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            const item = btn.closest('.galeri-admin-item');
            if (!item) return;
            const id = item.dataset.id;
            if (!id) { console.error('Galeri id undefined'); return; }
            if (action === 'edit') {
                try { window.editGaleri(id); } catch (err) { console.error('editGaleri error:', err); showToast('Gagal membuka editor galeri: ' + err.message, 'error'); }
            } else if (action === 'delete') {
                try { window.hapusGaleri(id); } catch (err) { console.error('hapusGaleri error:', err); showToast('Gagal menghapus galeri: ' + err.message, 'error'); }
            }
        });
        grid.dataset.listenerAttached = '1';
    }
}

window.showAddGaleriModal = function() {
    document.getElementById('galeriModalTitle').textContent = 'Tambah Foto Galeri';
    document.getElementById('galeriEditId').value = '';
    document.getElementById('galeriForm').reset();
    const galeriFilePreview = document.getElementById('galeriFilePreview');
    if (galeriFilePreview) galeriFilePreview.classList.remove('show');
    document.getElementById('galeriModal').classList.add('active');
};

window.editGaleri = async function(id) {
    try {
        if (!id) { console.error('editGaleri called with undefined id'); return; }
        const { data: photo, error } = await supabase.from('gallery').select('*').eq('id', id).single();
        if (error) {
            if (error.details?.includes('Results contain 0 rows') || error.message?.includes('No rows')) {
                showToast('Data galeri tidak ditemukan', 'error');
                return;
            }
            throw error;
        }
        document.getElementById('galeriModalTitle').textContent = 'Edit Foto Galeri';
        document.getElementById('galeriEditId').value = id;
        document.getElementById('galeriJudul').value = photo.judul || '';
        const galeriFilePreview = document.getElementById('galeriFilePreview');
        const galeriPreviewImg = document.getElementById('galeriPreviewImg');
        const galeriFileName = document.getElementById('galeriFileName');
        if (photo.gambar) {
            if (galeriPreviewImg) galeriPreviewImg.src = photo.gambar;
            if (galeriFileName) galeriFileName.textContent = '';
            if (galeriFilePreview) galeriFilePreview.classList.add('show');
        } else {
            if (galeriPreviewImg) galeriPreviewImg.src = '';
            if (galeriFilePreview) galeriFilePreview.classList.remove('show');
        }
        document.getElementById('galeriModal').classList.add('active');
    } catch (error) {
        console.error('Edit galeri error:', error);
        showToast('Gagal membuka editor galeri: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
};

window.hapusGaleri = async function(id) {
    if (!confirm('Hapus foto ini?')) return;
    try {
        const { error } = await supabase.from('gallery').delete().eq('id', id);
        if (error) throw error;
        showToast('Foto galeri berhasil dihapus!', 'success');
    } catch (error) {
        console.error('Hapus galeri error:', error);
        showToast('Gagal menghapus galeri: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
};

document.getElementById('galeriForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('galeriEditId').value;
    const imageInput = document.getElementById('galeriGambar');
    const existingPreview = document.getElementById('galeriFilePreview')?.classList.contains('show');
    if (!editId && (!imageInput || imageInput.files.length === 0) && !existingPreview) {
        showToast('Upload Foto wajib diisi saat menambah foto galeri.', 'warning');
        return;
    }
    if (imageInput && imageInput.files && imageInput.files.length > 0) {
        const fileCheck = validateImageFile(imageInput.files[0], 5);
        if (!fileCheck.valid) {
            showToast(fileCheck.error, 'warning');
            return;
        }
    }
    const btn = e.target.querySelector('button[type="submit"]');
    const data = { judul: sanitizeInput(document.getElementById('galeriJudul').value) };
    if (!data.judul) {
        showToast('Judul foto wajib diisi.', 'warning');
        return;
    }
    if (!editId) {
        data.created_at = new Date().toISOString();
    }
    try {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
            btn.disabled = true;
        }
        const file = document.getElementById('galeriGambar');
        if (file && file.files.length > 0) {
            const storageRef = ref('gallery/' + Date.now() + '_' + file.files[0].name);
            await uploadBytes(storageRef, file.files[0]);
            data.gambar = await getDownloadURL(storageRef);
        }
        if (editId) {
            if (!data.gambar) {
                const { data: existing, error } = await supabase.from('gallery').select('gambar').eq('id', editId).single();
                if (!error && existing?.gambar) {
                    data.gambar = existing.gambar;
                }
            }
            const { error } = await supabase.from('gallery').update(data).eq('id', editId);
            if (error) throw error;
            showToast('Foto galeri berhasil diperbarui!', 'success');
        } else {
            const { error } = await supabase.from('gallery').insert([data]);
            if (error) throw error;
            showToast('Foto galeri berhasil ditambahkan!', 'success');
        }
        closeModal('galeriModal');
    } catch (error) {
        console.error('Galeri simpan error:', error);
        showToast('Gagal menyimpan galeri: ' + (error.message || 'Terjadi kesalahan'), 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-save"></i> Simpan Foto';
            btn.disabled = false;
        }
    }
});

const btnAddGaleri = document.getElementById('btnAddGaleri');
if (btnAddGaleri) btnAddGaleri.addEventListener('click', window.showAddGaleriModal);

// ===== BANNER & BACKGROUND HOME CRUD =====
function populateBannerGrid(items) {
    const grid = document.getElementById('bannerAdminGrid');
    if (!grid) return;
    if (!items || items.length === 0) {
        // Tombol tambah cukup 1 buah saja di header halaman
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;background:#f9fafb;border-radius:12px;border:1px dashed #ddd;"><i class="fas fa-image" style="font-size:36px;color:#ccc;margin-bottom:12px;display:block;"></i><p style="color:#666;font-size:14px;margin:0;">Belum ada foto banner background home. Gunakan tombol "Tambah Banner" di atas untuk menambahkan foto baru.</p></div>';
        return;
    }
    grid.innerHTML = items.map(b => {
        const cleanTitle = (b.judul || '').replace(/^\[BANNER\]\s*/i, '') || 'Banner Home';
        return '<div class="galeri-admin-item" data-id="' + b.id + '">' +
            '<img src="' + (b.gambar || 'https://via.placeholder.com/200') + '" alt="' + cleanTitle + '" style="height:160px;object-fit:cover;">' +
            '<div class="galeri-admin-info"><h4>' + cleanTitle + '</h4><span style="font-size:11px;color:#16a34a;font-weight:600;"><i class="fas fa-check-circle"></i> Tampil di Hero</span></div>' +
            '<div class="galeri-actions" style="display:flex;gap:6px;">' +
                '<button class="btn-sm btn-edit" data-action="edit" title="Edit banner" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;"><i class="fas fa-edit"></i> Edit</button>' +
                '<button class="btn-sm btn-delete" data-action="delete" title="Hapus banner" style="border:none;border-radius:6px;padding:6px 10px;cursor:pointer;"><i class="fas fa-trash"></i> Hapus</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

async function refreshBannerAdmin() {
    const grid = document.getElementById('bannerAdminGrid');
    if (!grid) return;
    try {
        const { data, error } = await supabase.from('gallery').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        const bannerItems = (data || []).filter(b => (b.judul || '').trim().startsWith('[BANNER]'));
        populateBannerGrid(bannerItems);
    } catch (error) {
        console.error('Banner load error:', error);
        if (grid) grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat banner home</p>';
        showToast('Gagal memuat banner home', 'error');
    }
}

function loadBannerHomeAdmin() {
    const grid = document.getElementById('bannerAdminGrid');
    if (grid) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:32px;"></i><p>Memuat banner...</p></div>';
    }
    refreshBannerAdmin();
    bannerUnsubscribe = createRealtimeSubscription('gallery', refreshBannerAdmin);
    if (grid && !grid.dataset.listenerAttached) {
        grid.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            const item = btn.closest('.galeri-admin-item');
            if (!item) return;
            const id = item.dataset.id;
            if (action === 'delete') {
                window.hapusBanner(id);
            } else if (action === 'edit') {
                window.editBanner(id);
            }
        });
        grid.dataset.listenerAttached = '1';
    }
}

window.showAddBannerModal = function() {
    document.getElementById('bannerModalTitle').textContent = 'Tambah Banner Background Home';
    document.getElementById('bannerEditId').value = '';
    document.getElementById('bannerForm').reset();
    const preview = document.getElementById('bannerFilePreview');
    if (preview) preview.classList.remove('show');
    document.getElementById('bannerModal').classList.add('active');
};

window.editBanner = async function(id) {
    try {
        const { data, error } = await supabase.from('gallery').select('*').eq('id', id).single();
        if (error) throw error;
        if (!data) return;

        document.getElementById('bannerModalTitle').textContent = 'Edit Banner Background Home';
        document.getElementById('bannerEditId').value = data.id;
        document.getElementById('bannerJudul').value = (data.judul || '').replace(/^\[BANNER\]\s*/i, '');

        const preview = document.getElementById('bannerFilePreview');
        const previewImg = document.getElementById('bannerPreviewImg');
        const fileName = document.getElementById('bannerFileName');
        if (data.gambar && preview && previewImg) {
            previewImg.src = data.gambar;
            if (fileName) fileName.textContent = 'Foto saat ini (kosongkan jika tidak diganti)';
            preview.classList.add('show');
        } else if (preview) {
            preview.classList.remove('show');
        }

        document.getElementById('bannerModal').classList.add('active');
    } catch (err) {
        console.error('Gagal memuat data banner untuk diedit:', err);
        showToast('Gagal memuat data banner.', 'error');
    }
};

window.hapusBanner = async function(id) {
    if (!confirm('Hapus foto banner ini dari latar belakang halaman Home?')) return;
    try {
        const { error } = await supabase.from('gallery').delete().eq('id', id);
        if (error) throw error;
        showToast('Foto banner berhasil dihapus!', 'success');
        refreshBannerAdmin();
    } catch (error) {
        console.error('Hapus banner error:', error);
        showToast('Gagal menghapus banner: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
};

document.getElementById('bannerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('bannerEditId').value;
    const fileInput = document.getElementById('bannerGambar');
    const hasNewFile = fileInput && fileInput.files && fileInput.files.length > 0;

    // Jika tambah baru, file wajib ada
    if (!editId && !hasNewFile) {
        showToast('Pilih file foto banner terlebih dahulu.', 'warning');
        return;
    }

    // Validasi file jika ada
    if (hasNewFile) {
        const fileCheck = validateImageFile(fileInput.files[0], 5);
        if (!fileCheck.valid) {
            showToast(fileCheck.error, 'warning');
            return;
        }
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const rawJudul = sanitizeInput(document.getElementById('bannerJudul').value);
    if (!rawJudul) {
        showToast('Judul / label banner wajib diisi.', 'warning');
        return;
    }
    const judul = '[BANNER] ' + rawJudul;
    const payload = { judul: judul };

    try {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
            btn.disabled = true;
        }

        if (hasNewFile) {
            const file = fileInput.files[0];
            const storageRef = ref('gallery/banner_' + Date.now() + '_' + file.name);
            await uploadBytes(storageRef, file);
            payload.gambar = await getDownloadURL(storageRef);
        }

        if (editId) {
            // Update banner yang ada
            const { error } = await supabase.from('gallery').update(payload).eq('id', editId);
            if (error) throw error;
            showToast('Foto banner home berhasil diperbarui!', 'success');
        } else {
            // Tambah banner baru
            payload.created_at = new Date().toISOString();
            const { error } = await supabase.from('gallery').insert([payload]);
            if (error) throw error;
            showToast('Foto banner home berhasil ditambahkan!', 'success');
        }

        closeModal('bannerModal');
        refreshBannerAdmin();
    } catch (error) {
        console.error('Banner simpan error:', error);
        showToast('Gagal menyimpan banner: ' + (error.message || 'Terjadi kesalahan'), 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-save"></i> Simpan Banner';
            btn.disabled = false;
        }
    }
});

const btnAddBanner = document.getElementById('btnAddBanner');
if (btnAddBanner) btnAddBanner.addEventListener('click', window.showAddBannerModal);

document.getElementById('btnEditKontak')?.addEventListener('click', function() {
    showPage('pengaturan');
});

document.getElementById('btnLogoutProfile')?.addEventListener('click', async function() {
    try {
        await signOut();
        window.location.href = 'login.html';
    } catch (error) {
        showToast('Logout gagal: ' + error.message, 'error');
    }
});

// ===== KONTAK =====
async function loadKontakForm() {
    try {
        const { data: settings, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
        if (error) throw error;
        const s = settings || {};
        document.getElementById('adminStoreName').value = s.nama_toko || '';
        document.getElementById('adminWaNumber').value = s.wa_number || '';
        document.getElementById('adminEmail').value = s.email || '';
        document.getElementById('adminJam').value = s.jam_operasional || '';
        document.getElementById('adminAlamat').value = s.alamat || '';
        document.getElementById('adminInstagram').value = s.instagram || '';
        document.getElementById('adminFacebook').value = s.facebook || '';
        document.getElementById('adminTiktok').value = s.tiktok || '';
        document.getElementById('adminMapsUrl').value = s.maps_url || '';
    } catch (error) {
        console.error('Kontak load error:', error);
        showToast('Gagal memuat pengaturan kontak: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
}

async function loadKontakSummary() {
    try {
        const { data: settings, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
        if (error) throw error;
        const s = settings || {};
        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val || '-';
        };
        setText('contactStoreName', s.nama_toko);
        setText('contactWaNumber', s.wa_number);
        setText('contactEmail', s.email);
        setText('contactJam', s.jam_operasional);
        setText('contactAlamat', s.alamat);
    } catch (error) {
        console.error('Kontak summary error:', error);
        showToast('Gagal memuat kontak: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
}

function loadProfilePage() {
    if (!currentUser) return;
    const emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = currentUser.email || 'Admin';
}

document.getElementById('btnSaveKontak').addEventListener('click', async function() {
    const kontakForm = document.getElementById('kontakForm');
    if (kontakForm && !kontakForm.checkValidity()) {
        kontakForm.reportValidity();
        showToast('Lengkapi semua field pengaturan yang wajib diisi.', 'warning');
        return;
    }
    const rawWaNumber = document.getElementById('adminWaNumber').value;
    const waDigits = String(rawWaNumber || '').replace(/\D/g, '');
    const canonicalWaNumber = waDigits
        ? (waDigits.startsWith('0') ? '62' + waDigits.substring(1) : (waDigits.startsWith('62') ? waDigits : '62' + waDigits))
        : '';

    // Keamanan Input Validation
    if (!validateWhatsAppNumber(canonicalWaNumber)) {
        showToast('Nomor WhatsApp tidak valid (harus 10-15 digit angka).', 'warning');
        return;
    }
    const emailVal = document.getElementById('adminEmail').value.trim();
    if (!validateEmail(emailVal)) {
        showToast('Format email tidak valid (contoh: toko@nurulfashion.com).', 'warning');
        return;
    }
    const igVal = document.getElementById('adminInstagram').value.trim();
    const fbVal = document.getElementById('adminFacebook').value.trim();
    const ttVal = document.getElementById('adminTiktok').value.trim();
    const mapsVal = document.getElementById('adminMapsUrl').value.trim();
    if (!validateUrl(igVal) || !validateUrl(fbVal) || !validateUrl(ttVal) || !validateUrl(mapsVal)) {
        showToast('Link media sosial / Google Maps harus berupa URL valid (diawali https:// atau http://).', 'warning');
        return;
    }

    const data = {
        nama_toko: sanitizeInput(document.getElementById('adminStoreName').value),
        wa_number: canonicalWaNumber,
        email: emailVal,
        jam_operasional: sanitizeInput(document.getElementById('adminJam').value),
        alamat: sanitizeInput(document.getElementById('adminAlamat').value),
        instagram: igVal,
        facebook: fbVal,
        tiktok: ttVal,
        maps_url: mapsVal
    };
    try {
        const { data: existing, error: fetchError } = await supabase.from('settings').select('*').limit(1).maybeSingle();
        if (fetchError) throw fetchError;
        if (!existing) {
            const { error: insertError } = await supabase.from('settings').insert([data]);
            if (insertError) throw insertError;
        } else {
            const { error: updateError } = await supabase.from('settings').update(data).eq('id', existing.id);
            if (updateError) throw updateError;
        }
        try {
            localStorage.setItem('nurul-fashion-wa-number', data.wa_number || '');
        } catch (storageError) {
            console.warn('Gagal menyimpan sinkronisasi nomor WhatsApp lokal:', storageError);
        }
        if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel('nurul-fashion-settings');
            channel.postMessage({ wa_number: data.wa_number || '' });
            channel.close();
        }
        showToast('Pengaturan kontak berhasil disimpan!', 'success');
    } catch (error) {
        console.error('Pengaturan kontak save error:', error);
        showToast('Gagal menyimpan: ' + (error.message || 'Terjadi kesalahan'), 'error');
    }
});

// ===== MODAL =====
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
window.closeModal = closeModal;

// Close modal buttons
document.getElementById('closeProdukModal').addEventListener('click', function() { closeModal('produkModal'); });
document.getElementById('closeKategoriModal').addEventListener('click', function() { closeModal('kategoriModal'); });
document.getElementById('closeGaleriModal').addEventListener('click', function() { closeModal('galeriModal'); });
document.getElementById('closeBannerModal')?.addEventListener('click', function() { closeModal('bannerModal'); });
document.getElementById('closeMfaModal')?.addEventListener('click', function() { closeModal('mfaSetupModal'); });

// Close on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => modal.classList.remove('active'));
    }
});

function formatPrice(price) { return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

// ====================================================
// SECURE SESSION INACTIVITY MANAGER (AUTO-LOGOUT 15 MENIT)
// ====================================================
let lastActivityTime = Date.now();
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 menit
const WARNING_BEFORE_TIMEOUT_MS = 2 * 60 * 1000; // Peringatan 2 menit sebelum logout
let sessionCheckInterval = null;

function recordUserActivity() {
    lastActivityTime = Date.now();
}

function initSessionInactivityManager() {
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    lastActivityTime = Date.now();

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(evt => {
        window.addEventListener(evt, () => {
            const warningModal = document.getElementById('sessionWarningModal');
            if (!warningModal || !warningModal.classList.contains('active')) {
                recordUserActivity();
            }
        }, { passive: true });
    });

    sessionCheckInterval = setInterval(checkSessionInactivity, 1000);
}

async function terminateSessionDueInactivity() {
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    try {
        await signOut();
    } catch (e) {
        console.warn('Signout warning during timeout:', e);
    }
    window.location.href = 'login.html?reason=session_timeout';
}

function checkSessionInactivity() {
    const elapsed = Date.now() - lastActivityTime;
    const warningModal = document.getElementById('sessionWarningModal');
    const countdownDisplay = document.getElementById('sessionCountdownDisplay');

    if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        terminateSessionDueInactivity();
        return;
    }

    const timeUntilTimeout = INACTIVITY_TIMEOUT_MS - elapsed;
    if (timeUntilTimeout <= WARNING_BEFORE_TIMEOUT_MS) {
        if (warningModal && !warningModal.classList.contains('active')) {
            warningModal.classList.add('active');
        }
        if (countdownDisplay) {
            const remainingSeconds = Math.max(0, Math.ceil(timeUntilTimeout / 1000));
            const m = Math.floor(remainingSeconds / 60);
            const s = remainingSeconds % 60;
            countdownDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
    } else {
        if (warningModal && warningModal.classList.contains('active')) {
            warningModal.classList.remove('active');
        }
    }
}

document.getElementById('btnExtendSession')?.addEventListener('click', () => {
    lastActivityTime = Date.now();
    const warningModal = document.getElementById('sessionWarningModal');
    if (warningModal) warningModal.classList.remove('active');
    showToast('Sesi Anda berhasil diperpanjang.', 'success');
});

document.getElementById('btnLogoutSessionNow')?.addEventListener('click', async () => {
    await terminateSessionDueInactivity();
});

// ====================================================
// 2FA (TWO-FACTOR AUTHENTICATION) MANAGEMENT
// ====================================================
let activeMfaFactor = null;
let pendingEnrolledFactorId = null;

async function refreshMfaStatus() {
    const badge = document.getElementById('mfaStatusBadge');
    const inactiveActions = document.getElementById('mfaInactiveActions');
    const activeActions = document.getElementById('mfaActiveActions');
    if (!badge) return;

    try {
        const factors = await listMfaFactors();
        const verifiedFactor = factors?.totp?.find(f => f.status === 'verified');

        if (verifiedFactor) {
            activeMfaFactor = verifiedFactor;
            badge.textContent = 'Aktif (AAL2)';
            badge.style.background = '#dcfce7';
            badge.style.color = '#15803d';
            if (inactiveActions) inactiveActions.style.display = 'none';
            if (activeActions) activeActions.style.display = 'block';
        } else {
            activeMfaFactor = null;
            badge.textContent = 'Belum Aktif';
            badge.style.background = '#fee2e2';
            badge.style.color = '#b91c1c';
            if (inactiveActions) inactiveActions.style.display = 'block';
            if (activeActions) activeActions.style.display = 'none';
        }
    } catch (err) {
        console.warn('Gagal memuat status 2FA:', err);
        badge.textContent = 'Tidak Diketahui';
    }
}

document.getElementById('btnOpenMfaModal')?.addEventListener('click', async () => {
    const modal = document.getElementById('mfaSetupModal');
    const qrContainer = document.getElementById('mfaQrContainer');
    const secretInput = document.getElementById('mfaSecretKeyText');
    const verifyCodeInput = document.getElementById('mfaVerifyCode');
    const submitBtn = document.getElementById('btnSubmitMfaVerify');

    if (modal) modal.classList.add('active');
    if (verifyCodeInput) verifyCodeInput.value = '';
    if (qrContainer) qrContainer.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 28px; color: #FF1493;"></i>';
    if (secretInput) secretInput.value = 'Membuat kunci rahasia...';
    if (submitBtn) submitBtn.disabled = true;

    try {
        // 1. Bersihkan faktor unverified yang menggantung sebelumnya
        try {
            const factors = await listMfaFactors();
            const verified = (factors?.all || factors?.totp || []).find(f => f.status === 'verified');
            if (verified) {
                showToast('Verifikasi 2 Langkah (2FA) sudah aktif pada akun ini.', 'info');
                closeModal('mfaSetupModal');
                await refreshMfaStatus();
                return;
            }
            const unverified = (factors?.all || factors?.totp || []).filter(f => f.status === 'unverified');
            for (const uf of unverified) {
                if (uf?.id) await unenrollMfa(uf.id).catch(() => {});
            }
        } catch (checkErr) {
            console.warn('Pemeriksaan faktor MFA:', checkErr);
        }

        // 2. Daftarkan TOTP baru
        const enrollData = await enrollMfa('Nurul Fashion');
        pendingEnrolledFactorId = enrollData.id;

        // 3. Render QR Code ukuran besar (260px) responsif untuk semua perangkat
        if (enrollData?.totp?.qr_code) {
            const qrData = enrollData.totp.qr_code;
            let svgHtml = null;

            if (qrData.includes('<svg')) {
                // Ekstrak tag SVG murni dari string XML langsung maupun data URI
                const svgStart = qrData.indexOf('<svg');
                svgHtml = qrData.substring(svgStart);
            } else if (qrData.startsWith('data:image/svg+xml;base64,')) {
                try {
                    svgHtml = atob(qrData.split(',')[1]);
                } catch (decodeErr) {
                    console.warn('Decode base64 SVG fallback:', decodeErr);
                }
            }

            if (svgHtml) {
                qrContainer.innerHTML = `
                    <div class="qr-code-wrapper" style="background: #ffffff; padding: 14px; border-radius: 12px; border: 1.5px solid #e5e7eb; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.06); width: 100%; max-width: 280px; box-sizing: border-box; overflow: hidden; margin: 0 auto;">
                        ${svgHtml}
                    </div>`;
                const svg = qrContainer.querySelector('svg');
                if (svg) {
                    const origWidth = svg.getAttribute('width') || '200';
                    const origHeight = svg.getAttribute('height') || '200';
                    if (!svg.getAttribute('viewBox')) {
                        svg.setAttribute('viewBox', `0 0 ${origWidth} ${origHeight}`);
                    }
                    svg.setAttribute('width', '260');
                    svg.setAttribute('height', '260');
                    svg.style.width = '100%';
                    svg.style.maxWidth = '260px';
                    svg.style.height = 'auto';
                    svg.style.aspectRatio = '1 / 1';
                    svg.style.display = 'block';
                    svg.style.margin = '0 auto';
                    svg.style.shapeRendering = 'crispEdges';
                }
            } else {
                qrContainer.innerHTML = `
                    <div class="qr-code-wrapper" style="background: #ffffff; padding: 14px; border-radius: 12px; border: 1.5px solid #e5e7eb; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.06); width: 100%; max-width: 280px; box-sizing: border-box; margin: 0 auto;">
                        <img src="${qrData}" alt="QR Code 2FA" style="width: 100%; max-width: 260px; height: auto; aspect-ratio: 1 / 1; object-fit: contain; display: block; margin: 0 auto; image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
                    </div>`;
            }
        } else {
            qrContainer.innerHTML = '<p style="color: #666; font-size: 13px;">Gunakan kunci manual di bawah untuk aplikasi Authenticator.</p>';
        }

        if (secretInput) {
            secretInput.value = enrollData?.totp?.secret || '-';
        }
        if (submitBtn) submitBtn.disabled = false;
        if (verifyCodeInput) verifyCodeInput.focus();

    } catch (err) {
        console.error('Enroll MFA error:', err);
        showToast('Gagal memulai pendaftaran 2FA: ' + (err.message || 'Coba lagi'), 'error');
        if (modal) modal.classList.remove('active');
    }
});

document.getElementById('btnCopySecretKey')?.addEventListener('click', async () => {
    const secretInput = document.getElementById('mfaSecretKeyText');
    if (secretInput && secretInput.value && !secretInput.value.includes('Membuat')) {
        try {
            await navigator.clipboard.writeText(secretInput.value);
            showToast('Kunci rahasia disalin ke clipboard!', 'success');
        } catch (e) {
            secretInput.select();
            document.execCommand('copy');
            showToast('Kunci rahasia disalin!', 'success');
        }
    }
});

document.getElementById('mfaVerifyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('mfaVerifyCode')?.value.trim();
    const submitBtn = document.getElementById('btnSubmitMfaVerify');

    if (!code || code.length !== 6) {
        showToast('Masukkan 6 digit angka kode verifikasi.', 'warning');
        return;
    }
    if (!pendingEnrolledFactorId) {
        showToast('Sesi setup 2FA kedaluwarsa. Silakan buka kembali modal.', 'error');
        return;
    }

    try {
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memverifikasi...';
            submitBtn.disabled = true;
        }

        await challengeAndVerifyMfa(pendingEnrolledFactorId, code);

        showToast('Verifikasi 2 Langkah (2FA) berhasil diaktifkan!', 'success');
        closeModal('mfaSetupModal');
        await refreshMfaStatus();

    } catch (err) {
        console.error('Verifikasi 2FA error:', err);
        showToast('Kode verifikasi salah atau sudah kedaluwarsa.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-check"></i> Verifikasi &amp; Aktifkan';
            submitBtn.disabled = false;
        }
    }
});

document.getElementById('btnDisableMfa')?.addEventListener('click', async () => {
    if (!activeMfaFactor) return;
    const agree = confirm('Apakah Anda yakin ingin menonaktifkan Verifikasi 2 Langkah? Akun Anda akan menjadi kurang terlindungi.');
    if (!agree) return;

    try {
        await unenrollMfa(activeMfaFactor.id);
        showToast('Verifikasi 2 Langkah berhasil dinonaktifkan.', 'info');
        await refreshMfaStatus();
    } catch (err) {
        console.error('Unenroll MFA error:', err);
        showToast('Gagal menonaktifkan 2FA: ' + (err.message || 'Terjadi kesalahan'), 'error');
    }
});

