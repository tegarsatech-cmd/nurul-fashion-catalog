// ============================================
// NURUL FASHION - ADMIN DASHBOARD
// Supabase CRUD Operations
// ============================================

import supabase, { signOut, onAuthStateChanged } from '../../auth.js';
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

// ===== Auth State =====
onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        const nameEl = document.getElementById('adminName');
        if (nameEl) nameEl.textContent = user.email || 'Admin';
        const requestedPage = window.location.hash.replace('#', '') || 'dashboard';
        showPage(requestedPage);
        loadDashboardData();
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

function unsubscribeAll() {
    if (produkUnsubscribe) { try { produkUnsubscribe(); } catch(e) { console.error('Unsubscribe produk error:', e); } produkUnsubscribe = null; }
    if (kategoriUnsubscribe) { try { kategoriUnsubscribe(); } catch(e) { console.error('Unsubscribe kategori error:', e); } kategoriUnsubscribe = null; }
    if (galeriUnsubscribe) { try { galeriUnsubscribe(); } catch(e) { console.error('Unsubscribe galeri error:', e); } galeriUnsubscribe = null; }
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
const sidebarOverlay = document.createElement('div');
sidebarOverlay.id = 'sidebarOverlay';
sidebarOverlay.className = 'sidebar-overlay';
sidebarOverlay.addEventListener('click', () => setSidebarOpen(false));
document.body.appendChild(sidebarOverlay);

function isMobileView() {
    return window.matchMedia('(max-width: 768px)').matches;
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
    const stored = safeStorageGet('adminSidebarOpen');
    if (stored === null) {
        return !isMobileView();
    }
    return stored === 'true';
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

window.addEventListener('resize', () => {
    const stored = safeStorageGet('adminSidebarOpen');
    const open = stored === null ? isSidebarOpen() : stored === 'true';
    setSidebarOpen(open);
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
        document.getElementById('totalProduk').textContent = (products || []).length;
        document.getElementById('produkTersedia').textContent = (products || []).filter(p => p.stok === 'Tersedia').length;
        document.getElementById('produkHabis').textContent = (products || []).filter(p => p.stok === 'Habis').length;
        document.getElementById('totalKategori').textContent = (categories || []).length;
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
        return '<tr data-id="' + p.id + '"><td><img src="' + (p.gambar || 'https://via.placeholder.com/50') + '" style="width:50px;height:50px;object-fit:cover;border-radius:8px;"></td><td><strong>' + (p.nama || '-') + '</strong></td><td>' + (p.kategori || '-') + '</td><td>Rp ' + formatPrice(p.harga || 0) + '</td><td><span style="color:' + (p.stok === 'Tersedia' ? '#22c55e' : '#ef4444') + ';font-weight:600;">' + (p.stok || '-') + '</span></td><td><button class="btn-sm btn-edit" data-action="edit"><i class="fas fa-edit"></i></button> <button class="btn-sm btn-delete" data-action="delete"><i class="fas fa-trash"></i></button></td></tr>';
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
        sel.innerHTML = '<option value="">Pilih Kategori</option>';
        (data || []).forEach(cat => {
            const nama = cat.nama || '';
            sel.innerHTML += '<option value="' + nama + '"' + (nama === selectedValue ? ' selected' : '') + '>' + nama + '</option>';
        });
    } catch (error) {
        console.error('Error loading categories:', error);
        showToast('Gagal memuat kategori', 'error');
    }
}

window.showAddProdukModal = async function() {
    document.getElementById('produkModalTitle').textContent = 'Tambah Produk';
    document.getElementById('produkEditId').value = '';
    document.getElementById('produkForm').reset();
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
        document.getElementById('produkNama').value = product.nama || '';
        document.getElementById('produkHarga').value = product.harga || '';
        document.getElementById('produkStok').value = product.stok || 'Tersedia';
        document.getElementById('produkUkuran').value = product.ukuran || '';
        document.getElementById('produkWarna').value = product.warna || '';
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
    const btn = e.target.querySelector('button[type="submit"]');
    const data = {
        nama: document.getElementById('produkNama').value,
        kategori: document.getElementById('produkKategori').value,
        harga: parseInt(document.getElementById('produkHarga').value, 10) || 0,
        stok: document.getElementById('produkStok').value,
        ukuran: document.getElementById('produkUkuran').value,
        warna: document.getElementById('produkWarna').value
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
            if (!data.gambar) {
                const { data: existing, error } = await supabase.from('products').select('gambar').eq('id', editId).single();
                if (!error && existing?.gambar) {
                    data.gambar = existing.gambar;
                }
            }
            const { error } = await supabase.from('products').update(data).eq('id', editId);
            if (error) throw error;
            showToast('Produk berhasil diperbarui!', 'success');
        } else {
            const { error } = await supabase.from('products').insert([data]);
            if (error) throw error;
            showToast('Produk berhasil ditambahkan!', 'success');
        }
        closeModal('produkModal');
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
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;">Gagal memuat kategori</td></tr>';
        showToast('Gagal memuat kategori', 'error');
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
    document.getElementById('kategoriModalTitle').textContent = 'Tambah Kategori';
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
        document.getElementById('kategoriModalTitle').textContent = 'Edit Kategori';
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
    const data = { nama: document.getElementById('kategoriNama').value, icon: document.getElementById('kategoriIcon').value || 'fas fa-tag' };
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
            btn.innerHTML = '<i class="fas fa-save"></i> Simpan Kategori';
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
        populateGaleriGrid(data || []);
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
    const btn = e.target.querySelector('button[type="submit"]');
    const data = { judul: document.getElementById('galeriJudul').value };
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
    const data = {
        nama_toko: document.getElementById('adminStoreName').value,
        wa_number: document.getElementById('adminWaNumber').value,
        email: document.getElementById('adminEmail').value,
        jam_operasional: document.getElementById('adminJam').value,
        alamat: document.getElementById('adminAlamat').value,
        instagram: document.getElementById('adminInstagram').value,
        facebook: document.getElementById('adminFacebook').value,
        tiktok: document.getElementById('adminTiktok').value,
        maps_url: document.getElementById('adminMapsUrl').value
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
