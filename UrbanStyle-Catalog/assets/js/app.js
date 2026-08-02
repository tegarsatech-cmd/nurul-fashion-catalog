// ============================================
// NURUL FASHION - MAIN APP
// Supabase Integration
// ============================================

import supabase from '../../auth.js';

// ===== DOM Elements =====
const featuredProducts = document.getElementById('featuredProducts');
const allProducts = document.getElementById('allProducts');
const galleryGrid = document.getElementById('galleryGrid');
const categoryFilter = document.getElementById('categoryFilter');
const sortFilter = document.getElementById('sortFilter');
const searchInput = document.getElementById('searchInput');

let allProductsData = [];
let galleryData = [];
let allCategories = [];
let storeWaNumber = '6283121514320'; // Default WA Nurul Fashion

let categoriesUnsubscribe = null;
let productsUnsubscribe = null;
let galleryUnsubscribe = null;
let settingsUnsubscribe = null;

function createRealtimeSubscription(table, callback) {
    const channel = supabase.channel('realtime-' + table + '-' + Date.now());
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, async (payload) => {
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

function unsubscribeRealtimeChannels() {
    if (categoriesUnsubscribe) { categoriesUnsubscribe(); categoriesUnsubscribe = null; }
    if (productsUnsubscribe) { productsUnsubscribe(); productsUnsubscribe = null; }
    if (galleryUnsubscribe) { galleryUnsubscribe(); galleryUnsubscribe = null; }
    if (settingsUnsubscribe) { settingsUnsubscribe(); settingsUnsubscribe = null; }
}

window.addEventListener('beforeunload', () => {
    unsubscribeRealtimeChannels();
});

// ===== AOS Init =====
if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 800, once: true, offset: 100 });
}

// ===== Toast =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + message;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
}

// ===== Navbar =====
const navbar = document.getElementById('navbar');
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');

if (navbar) {
    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
}

if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Tutup menu saat link mana pun diklik (termasuk .btn-admin)
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

    // Tutup menu saat klik di luar navbar
    document.addEventListener('click', (event) => {
        const isInside = navbar && navbar.contains(event.target);
        if (!isInside && navMenu.classList.contains('active')) {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
        }
    });

    // Tutup menu saat layar melebar ke desktop (di atas 992px)
    const mobileQuery = window.matchMedia('(max-width: 992px)');
    const handleNavResize = () => {
        if (!mobileQuery.matches && navMenu.classList.contains('active')) {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
        }
    };
    if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', handleNavResize);
    } else if (typeof mobileQuery.addListener === 'function') {
        mobileQuery.addListener(handleNavResize);
    }
}

// ===== Load Categories =====
async function refreshCategories() {
    try {
        const { data, error } = await fetchWithRetry(
            () => supabase.from('categories').select('*').order('nama', { ascending: true }),
            'kategori'
        );
        if (error) throw error;
        allCategories = (data || []).map(cat => ({ id: cat.id, ...cat }));
        if (categoryFilter) {
            categoryFilter.innerHTML = '<option value="all">Semua Kategori</option>';
            allCategories.forEach(cat => {
                categoryFilter.innerHTML += `<option value="${cat.nama}">${cat.nama}</option>`;
            });
        }
    } catch (error) {
        console.error('Kategori load error:', error);
        showToast('Gagal memuat kategori', 'error');
    }
}

async function loadCategories() {
    await refreshCategories();
    if (!categoriesUnsubscribe) {
        categoriesUnsubscribe = createRealtimeSubscription('categories', refreshCategories);
    }
}

// ===== Load Products =====
async function refreshProducts() {
    if (featuredProducts) {
        featuredProducts.innerHTML = getProductSkeleton(4);
    }
    if (allProducts) {
        allProducts.innerHTML = getProductSkeleton(4);
    }

    try {
        const { data, error } = await fetchWithRetry(
            () => supabase.from('products').select('*').order('created_at', { ascending: false }),
            'produk'
        );
        if (error) throw error;
        allProductsData = (data || []).map(product => ({ id: product.id, ...product }));
        if (featuredProducts) renderFeaturedProducts(allProductsData.slice(0, 4));
        if (allProducts) renderAllProducts(allProductsData);
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Gagal memuat produk', 'error');
        if (featuredProducts) featuredProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat produk</div>';
        if (allProducts) allProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat produk</div>';
    }
}

async function loadProducts() {
    await refreshProducts();
    if (!productsUnsubscribe) {
        productsUnsubscribe = createRealtimeSubscription('products', refreshProducts);
    }
}

// ===== Render Featured Products =====
function renderFeaturedProducts(products) {
    if (products.length === 0) {
        featuredProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Belum ada produk</div>';
        return;
    }
    featuredProducts.innerHTML = products.map(product => createProductCard(product)).join('');
}

// ===== Render All Products =====
function renderAllProducts(products) {
    if (products.length === 0) {
        allProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Belum ada produk</div>';
        return;
    }

    let filtered = [...products];
    const catValue = categoryFilter ? categoryFilter.value : 'all';
    if (catValue !== 'all') filtered = filtered.filter(p => p.kategori === catValue);

    const searchValue = searchInput ? searchInput.value.toLowerCase() : '';
    if (searchValue) {
        filtered = filtered.filter(p =>
            (p.nama || '').toLowerCase().includes(searchValue) ||
            (p.kategori || '').toLowerCase().includes(searchValue)
        );
    }

    const sortValue = sortFilter ? sortFilter.value : 'default';
    if (sortValue === 'termurah') filtered.sort((a, b) => (a.harga || 0) - (b.harga || 0));
    else if (sortValue === 'termahal') filtered.sort((a, b) => (b.harga || 0) - (a.harga || 0));
    else if (sortValue === 'az') filtered.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
    else if (sortValue === 'za') filtered.sort((a, b) => (b.nama || '').localeCompare(a.nama || ''));

    if (filtered.length === 0) {
        allProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Produk tidak ditemukan</div>';
        return;
    }
    allProducts.innerHTML = filtered.map(product => createProductCard(product)).join('');
}

// ===== Create Product Card =====
function createProductCard(product) {
    const imageUrl = product.gambar || 'https://via.placeholder.com/400x500?text=No+Image';
    const sizes = product.ukuran ? product.ukuran.split(',').map(s => s.trim()) : [];
    const colors = product.warna ? product.warna.split(',').map(c => c.trim()) : [];
    const stockClass = product.stok === 'Tersedia' ? 'tersedia' : 'habis';
    const waMessage = encodeURIComponent('Halo, saya tertarik dengan produk ' + product.nama);

    return '<div class="product-card" data-aos="fade-up">' +
        '<div class="product-image">' +
        '<img src="' + imageUrl + '" alt="' + product.nama + '" loading="lazy">' +
        '<span class="product-badge">' + (product.kategori || 'Produk') + '</span>' +
        (sizes.length > 0 ? '<div class="product-sizes">' + sizes.map(s => '<span>' + s + '</span>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="product-details">' +
        '<div class="product-category">' + (product.kategori || 'Kategori') + '</div>' +
        '<h3 class="product-name">' + (product.nama || 'Produk') + '</h3>' +
        '<div class="product-price">Rp ' + formatPrice(product.harga || 0) + '</div>' +
        '<div class="product-stock ' + stockClass + '"><i class="fas ' + (product.stok === 'Tersedia' ? 'fa-check-circle' : 'fa-times-circle') + '"></i> ' + (product.stok || 'Tersedia') + '</div>' +
        (colors.length > 0 ? '<div class="product-colors">' + colors.map(c => '<span class="color-dot" style="background:' + getColorHex(c) + '" title="' + c + '"></span>').join('') + '</div>' : '') +
        '<div class="product-actions">' +
        '<button type="button" class="btn btn-preview" data-product-id="' + product.id + '"><i class="fas fa-eye"></i> Preview</button>' +
        '<a href="https://wa.me/' + storeWaNumber + '?text=' + waMessage + '" target="_blank" class="btn-whatsapp"><i class="fab fa-whatsapp"></i> Beli via WhatsApp</a>' +
        '</div>' +
        '</div>';
}

// ===== Format Price =====
function formatPrice(price) {
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getProductSkeleton(count) {
    return Array.from({ length: count }).map(() =>
        '<div class="product-card skeleton-card">' +
        '<div class="product-image skeleton-box"></div>' +
        '<div class="product-details">' +
        '<div class="skeleton-line skeleton-title"></div>' +
        '<div class="skeleton-line"></div>' +
        '<div class="skeleton-line short"></div>' +
        '<div class="product-actions">' +
        '<div class="skeleton-button"></div>' +
        '<div class="skeleton-button"></div>' +
        '</div>' +
        '</div>' +
        '</div>'
    ).join('');
}

function getGallerySkeleton(count) {
    return Array.from({ length: count }).map(() =>
        '<div class="gallery-item skeleton-card"></div>'
    ).join('');
}

// ===== Get Color Hex =====
function getColorHex(color) {
    const colorMap = {
        'hitam': '#000000', 'putih': '#FFFFFF', 'abu-abu': '#808080',
        'merah': '#FF0000', 'biru': '#0000FF', 'hijau': '#00FF00',
        'kuning': '#FFFF00', 'coklat': '#8B4513', 'navy': '#000080',
        'maroon': '#800000', 'cream': '#FFFDD0', 'abu': '#808080',
        'gold': '#D4AF37', 'army': '#4B5320'
    };
    return colorMap[(color || '').toLowerCase()] || '#cccccc';
}

// ===== Utility =====
function debounce(fn, delay = 250) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// ===== Filter & Search Events =====
if (categoryFilter) categoryFilter.addEventListener('change', () => renderAllProducts(allProductsData));
if (sortFilter) sortFilter.addEventListener('change', () => renderAllProducts(allProductsData));
if (searchInput) searchInput.addEventListener('input', debounce(() => renderAllProducts(allProductsData), 300));

if (featuredProducts) {
    featuredProducts.addEventListener('click', (event) => {
        const previewButton = event.target.closest('.btn-preview');
        if (!previewButton) return;
        const productId = previewButton.dataset.productId;
        const product = allProductsData.find(p => p.id === productId);
        if (product) openPreviewModal(product, 'product');
    });
}

if (allProducts) {
    allProducts.addEventListener('click', (event) => {
        const previewButton = event.target.closest('.btn-preview');
        if (!previewButton) return;
        const productId = previewButton.dataset.productId;
        const product = allProductsData.find(p => p.id === productId);
        if (product) openPreviewModal(product, 'product');
    });
}

if (galleryGrid) {
    galleryGrid.addEventListener('click', (event) => {
        const galleryItem = event.target.closest('.gallery-item');
        if (!galleryItem) return;
        const index = parseInt(galleryItem.dataset.index);
        const selected = galleryData[index];
        if (selected) openPreviewModal(selected, 'gallery', index);
    });
}

// ===== Load Gallery =====
async function refreshGallery() {
    if (!galleryGrid) return;
    galleryGrid.innerHTML = getGallerySkeleton(4);

    try {
        const { data, error } = await fetchWithRetry(
            () => supabase.from('gallery').select('*').order('created_at', { ascending: false }),
            'galeri'
        );
        if (error) throw error;
        galleryData = (data || []).map(item => ({ id: item.id, ...item }));
        if (galleryData.length === 0) {
            galleryGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Belum ada foto galeri</div>';
            return;
        }
        galleryGrid.innerHTML = galleryData.map((item, index) =>
            '<div class="gallery-item" data-aos="fade-up" data-index="' + index + '">' +
            '<img src="' + (item.gambar || 'https://via.placeholder.com/400?text=Gallery') + '" alt="' + (item.judul || 'Foto') + '" loading="lazy">' +
            '<div class="gallery-overlay"><h3>' + (item.judul || 'Foto Galeri') + '</h3></div>' +
            '</div>'
        ).join('');
    } catch (error) {
        console.error('Error loading gallery:', error);
        showToast('Gagal memuat galeri', 'error');
        galleryGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat galeri</div>';
    }
}

async function loadGallery() {
    await refreshGallery();
    if (!galleryUnsubscribe) {
        galleryUnsubscribe = createRealtimeSubscription('gallery', refreshGallery);
    }
}

// ===== Load Contact Info =====
async function refreshContact() {
    try {
        const { data, error } = await fetchWithRetry(
            () => supabase.from('settings').select('*').limit(1).maybeSingle(),
            'pengaturan'
        );
        if (error) throw error;
        const settingsData = data || {};
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '-'; };
        const setHref = (id, val) => { const el = document.getElementById(id); if (el) el.href = val || '#'; };

        setText('storeName', settingsData.nama_toko);
        setText('waNumber', settingsData.wa_number);
        setText('emailInfo', settingsData.email);
        setText('operationalHours', settingsData.jam_operasional);
        setText('storeAddress', settingsData.alamat);

        setHref('socialInstagram', settingsData.instagram);
        setHref('socialFacebook', settingsData.facebook);
        setHref('socialTiktok', settingsData.tiktok);
        setHref('footerInstagram', settingsData.instagram);
        setHref('footerFacebook', settingsData.facebook);
        setHref('footerTiktok', settingsData.tiktok);

        const waBtn = document.getElementById('waButton');
        if (waBtn) {
            const cleanNumber = String(settingsData.wa_number || '').replace(/[^0-9]/g, '');
            let normalizedNumber = cleanNumber;
            if (normalizedNumber.startsWith('0')) {
                normalizedNumber = '62' + normalizedNumber.substring(1);
            } else if (normalizedNumber.startsWith('62') === false && normalizedNumber.length > 0) {
                normalizedNumber = '62' + normalizedNumber;
            }
            waBtn.href = 'https://wa.me/' + normalizedNumber;
            storeWaNumber = normalizedNumber || storeWaNumber;
        }

        const mapContainer = document.getElementById('mapContainer');
        if (mapContainer && settingsData.maps_url) {
            mapContainer.innerHTML = '<iframe src="' + settingsData.maps_url + '" width="100%" height="100%" style="border:0;" allowfullscreen="" loading="lazy"></iframe>';
        }
    } catch (error) {
        console.error('Error loading contact info:', error);
        showToast('Gagal memuat kontak', 'error');
    }
}

async function loadContact() {
    await refreshContact();
    if (!settingsUnsubscribe) {
        settingsUnsubscribe = createRealtimeSubscription('settings', refreshContact);
    }
}

function openPreviewModal(item, type = 'product', index = null) {
    // index used for gallery navigation
    if (type === 'gallery' && typeof index === 'number') currentGalleryIndex = index; else currentGalleryIndex = null;
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    const title = document.getElementById('previewTitle');
    const image = document.getElementById('previewImage');
    const name = document.getElementById('previewName');
    const price = document.getElementById('previewPrice');
    const category = document.getElementById('previewCategory');
    const size = document.getElementById('previewSize');
    const color = document.getElementById('previewColor');
    const stock = document.getElementById('previewStock');
    const description = document.getElementById('previewDescription');
    const whatsapp = document.getElementById('previewWhatsapp');

    // Fill content
    if (title) title.textContent = type === 'gallery' ? (item.judul || 'Preview Galeri') : (item.nama || 'Preview Produk');
    if (image) image.src = item.gambar || item.image || 'https://via.placeholder.com/800x800?text=No+Image';
    if (name) name.textContent = type === 'gallery' ? (item.judul || '-') : (item.nama || '-');
    if (price) price.textContent = type === 'gallery' ? '' : 'Rp ' + formatPrice(item.harga || 0);
    if (category) category.textContent = type === 'gallery' ? '-' : (item.kategori || '-');
    if (size) size.textContent = type === 'gallery' ? '-' : (item.ukuran || '-');
    if (color) color.textContent = type === 'gallery' ? '-' : (item.warna || '-');
    if (stock) stock.textContent = type === 'gallery' ? '-' : (item.stok || '-');
    if (description) description.textContent = item.deskripsi || item.judul || 'Klik tombol WhatsApp untuk menghubungi kami.';

    // Setup WhatsApp link
    if (whatsapp) {
        const message = type === 'gallery'
            ? encodeURIComponent('Halo, saya tertarik dengan foto galeri: ' + (item.judul || ''))
            : encodeURIComponent('Halo, saya tertarik dengan produk: ' + (item.nama || ''));
        whatsapp.href = 'https://wa.me/' + storeWaNumber + '?text=' + message;
        whatsapp.style.display = 'inline-flex';
    }

    // Simpler preview: clicking image opens a lightbox; no copy/share or zoom controls-button
    const previewDetails = document.querySelector('.preview-details');
    if (previewDetails) {
        // ensure layout spacing
    }

    // Setup simple lightbox on image click
    setupPreviewLightbox(type);

    modal.classList.add('active');
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    removePreviewLightbox();
    closeImageLightbox();
    modal.classList.remove('active');
}

// ===== Lightbox (simple) & Gallery Controls =====
let currentGalleryIndex = null;
let previewLightboxHandler = null;

function setupPreviewLightbox(type) {
    const img = document.getElementById('previewImage');
    if (!img) return;
    img.style.cursor = 'zoom-in';
    // attach click to open lightbox
    const clickHandler = () => {
        openImageLightbox(img.src);
    };
    img.addEventListener('click', clickHandler);
    previewLightboxHandler = clickHandler;
}

function removePreviewLightbox() {
    const img = document.getElementById('previewImage');
    if (!img) return;
    img.style.cursor = '';
    if (previewLightboxHandler) {
        try { img.removeEventListener('click', previewLightboxHandler); } catch (e) {}
        previewLightboxHandler = null;
    }
}

function openImageLightbox(src) {
    if (!src) return;
    if (document.getElementById('imageLightbox')) return;

    const overlay = document.createElement('div');
    overlay.id = 'imageLightbox';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.cursor = 'zoom-out';

    const img = document.createElement('img');
    img.src = src;
    img.style.maxWidth = '95%';
    img.style.maxHeight = '95%';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '12px';
    img.style.boxShadow = '0 20px 60px rgba(0,0,0,0.6)';

    overlay.appendChild(img);
    document.body.appendChild(overlay);

    const close = () => closeImageLightbox();
    overlay.addEventListener('click', close);
    window.addEventListener('keydown', handleLightboxEsc);
}

function closeImageLightbox() {
    const overlay = document.getElementById('imageLightbox');
    if (overlay) overlay.remove();
    window.removeEventListener('keydown', handleLightboxEsc);
}

function handleLightboxEsc(event) {
    if (event.key === 'Escape') {
        closeImageLightbox();
    }
}

function navigateGallery(direction) {
    if (currentGalleryIndex === null) return;
    let newIndex = currentGalleryIndex + direction;
    if (newIndex < 0) newIndex = galleryData.length - 1;
    if (newIndex >= galleryData.length) newIndex = 0;
    currentGalleryIndex = newIndex;
    const item = galleryData[currentGalleryIndex];
    if (!item) return;
    const image = document.getElementById('previewImage');
    const title = document.getElementById('previewTitle');
    const name = document.getElementById('previewName');
    const description = document.getElementById('previewDescription');
    const whatsapp = document.getElementById('previewWhatsapp');
    if (image) image.src = item.gambar || item.image || 'https://via.placeholder.com/800x800?text=No+Image';
    if (title) title.textContent = item.judul || 'Preview Galeri';
    if (name) name.textContent = item.judul || '-';
    if (description) description.textContent = item.deskripsi || item.judul || '';
    if (whatsapp) {
        const message = encodeURIComponent('Halo, saya tertarik dengan foto galeri: ' + (item.judul || ''));
        whatsapp.href = 'https://wa.me/' + storeWaNumber + '?text=' + message;
    }
}


const previewClose = document.getElementById('closePreviewModal');
if (previewClose) {
    previewClose.addEventListener('click', closePreviewModal);
}

const previewModal = document.getElementById('previewModal');
if (previewModal) {
    previewModal.addEventListener('click', (event) => {
        if (event.target === previewModal) closePreviewModal();
    });
}

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closePreviewModal();
    }
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
    loadProducts();
    loadGallery();
    loadContact();
});
