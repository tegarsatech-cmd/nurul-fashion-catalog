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
let storeWaNumber = '';

let categoriesUnsubscribe = null;
let productsUnsubscribe = null;
let galleryUnsubscribe = null;
let settingsUnsubscribe = null;
let settingsBroadcast = null;
let previewProductItems = [];
let selectedPreviewItemIndex = 0;
let currentPreviewProduct = null;

function normalizeWhatsAppNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('0') ? '62' + digits.substring(1) : (digits.startsWith('62') ? digits : '62' + digits);
}

function isItemOutOfStock(product, itemIndex) {
    const item = normalizeProductItems(product)[itemIndex] || {};
    return item.stok === 'Habis';
}

function notifyOutOfStock() {
    showToast('Barang yang dipilih sedang habis dan tidak dapat dilanjutkan ke WhatsApp.', 'warning');
}

function applyWhatsAppNumber(value) {
    const normalizedNumber = normalizeWhatsAppNumber(value);
    if (normalizedNumber === storeWaNumber) return;
    storeWaNumber = normalizedNumber;
    const waBtn = document.getElementById('waButton');
    if (waBtn) waBtn.href = createWhatsAppUrl();
    refreshRenderedProductLinks();
}

function setupWhatsAppSync() {
    const applyMessage = (event) => {
        const number = event?.data?.wa_number || event?.detail?.wa_number;
        if (number !== undefined) applyWhatsAppNumber(number);
    };
    if ('BroadcastChannel' in window) {
        settingsBroadcast = new BroadcastChannel('nurul-fashion-settings');
        settingsBroadcast.addEventListener('message', applyMessage);
    }
    window.addEventListener('storage', (event) => {
        if (event.key !== 'nurul-fashion-wa-number' || event.newValue === null) return;
        applyWhatsAppNumber(event.newValue);
    });
}

function createWhatsAppUrl(message = '') {
    if (!storeWaNumber) return '#';
    const query = message ? '?text=' + encodeURIComponent(message) : '';
    return 'https://wa.me/' + storeWaNumber + query;
}

function refreshRenderedProductLinks() {
    if (allProductsData.length === 0) return;
    if (featuredProducts) renderFeaturedProducts(getFeaturedProducts(allProductsData));
    if (allProducts) renderAllProducts(allProductsData);
}

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
            if (result && result.error) throw result.error;
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
    if (settingsBroadcast) settingsBroadcast.close();
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
    // Kunci scroll body saat menu mobile terbuka
    function setNavMenuOpen(open) {
        navToggle.classList.toggle('active', open);
        navMenu.classList.toggle('active', open);
        if (open) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
    }

    navToggle.addEventListener('click', () => {
        const willOpen = !navMenu.classList.contains('active');
        setNavMenuOpen(willOpen);
    });

    // Tutup menu saat link mana pun diklik (termasuk .btn-admin)
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            setNavMenuOpen(false);
        });
    });

    // Tutup menu saat klik di luar navbar
    document.addEventListener('click', (event) => {
        const isInside = navbar && navbar.contains(event.target);
        if (!isInside && navMenu.classList.contains('active')) {
            setNavMenuOpen(false);
        }
    });

    // Tutup menu saat layar melebar ke desktop (di atas 992px)
    const mobileQuery = window.matchMedia('(max-width: 992px)');
    const handleNavResize = () => {
        if (!mobileQuery.matches) {
            setNavMenuOpen(false);
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
async function refreshProducts(showLoading = true) {
    if (showLoading && featuredProducts) {
        featuredProducts.innerHTML = getProductSkeleton(3);
    }
    if (showLoading && allProducts) {
        allProducts.innerHTML = getProductSkeleton(4);
    }

    try {
        const { data, error } = await fetchWithRetry(
            () => supabase.from('products').select('*').order('created_at', { ascending: false }),
            'produk'
        );
        allProductsData = (data || []).map(product => ({ id: product.id, ...product }));
        if (featuredProducts) renderFeaturedProducts(getFeaturedProducts(allProductsData));
        if (allProducts) renderAllProducts(allProductsData);
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Gagal memuat produk', 'error');
        if (featuredProducts) featuredProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat produk</div>';
        if (allProducts) allProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat produk</div>';
    }
}

async function loadProducts() {
    await refreshProducts(true);
    if (!productsUnsubscribe) {
        productsUnsubscribe = createRealtimeSubscription('products', () => refreshProducts(false));
    }
}

// ===== Render Featured Products =====
function renderFeaturedProducts(products) {
    if (products.length === 0) {
        featuredProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Belum ada produk</div>';
        return;
    }
    featuredProducts.innerHTML = products.slice(0, 3).map((product, index) => createProductCard(product, index + 1)).join('');
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
function createProductCard(product, tier = null) {
    const imageUrl = product.gambar || 'https://via.placeholder.com/400x500?text=No+Image';
    const items = normalizeProductItems(product);
    const title = product.judul_postingan || product.nama || 'Produk';
    const firstItem = items.find(item => item.nama) || {};
    const sizes = product.ukuran ? product.ukuran.split(',').map(s => s.trim()) : [];
    const colors = product.warna ? product.warna.split(',').map(c => c.trim()) : [];
    const stockClass = product.stok === 'Tersedia' ? 'tersedia' : 'habis';
    const itemOptions = items.filter(item => item.nama || item.harga !== '');
    const itemSelect = itemOptions.length > 1
        ? '<label class="product-item-select-label" for="product-item-' + product.id + '">Pilih barang:</label><select class="product-item-select" id="product-item-' + product.id + '" data-product-id="' + product.id + '">' +
          itemOptions.map((item, index) => '<option value="' + index + '"' + (item.stok === 'Habis' ? ' data-stock="Habis"' : '') + '>' + (item.nama || 'Barang ' + (index + 1)) + (item.harga === '' ? '' : ' - Rp ' + formatPrice(item.harga)) + (item.stok === 'Habis' ? ' (Habis)' : '') + '</option>').join('') + '</select>'
        : '';
    const tierBadge = tier ? '<span class="product-tier tier-' + tier + '">No. ' + tier + '</span>' : '';
    return '<div class="product-card" data-aos="fade-up" data-product-card-id="' + product.id + '">' +
        '<div class="product-image">' +
        '<img src="' + imageUrl + '" alt="' + title + '" loading="lazy">' +
        '<span class="product-badge">' + (product.kategori || 'Produk') + '</span>' + tierBadge +
        (sizes.length > 0 ? '<div class="product-sizes">' + sizes.map(s => '<span>' + s + '</span>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="product-details">' +
        '<div class="product-category">' + (product.kategori || 'Kategori') + '</div>' +
        '<h3 class="product-name">' + title + '</h3>' +
        (firstItem.harga === '' || firstItem.harga === undefined ? '' : '<div class="product-price">Rp ' + formatPrice(firstItem.harga || 0) + (items.filter(item => item.harga !== '').length > 1 ? ' <small>dan lainnya</small>' : '') + '</div>') +
        '<div class="product-stock ' + stockClass + '"><i class="fas ' + (product.stok === 'Tersedia' ? 'fa-check-circle' : 'fa-times-circle') + '"></i> ' + (product.stok || 'Tersedia') + '</div>' +
        (colors.length > 0 ? '<div class="product-colors">' + colors.map(c => '<span class="color-dot" style="background:' + getColorHex(c) + '" title="' + c + '"></span>').join('') + '</div>' : '') +
        '<div class="product-actions">' +
        '<button type="button" class="btn btn-preview" data-product-id="' + product.id + '"><i class="fas fa-eye"></i> Preview</button>' +
        '<div class="product-whatsapp-group">' + itemSelect +
        '<small class="product-selected-meta">' + (firstItem.ukuran ? 'Ukuran: ' + firstItem.ukuran + ' · ' : '') + 'Stok: ' + (firstItem.stok || 'Tersedia') + '</small>' +
        '<a href="' + createWhatsAppUrl(getWhatsAppMessage(product, 0)) + '" target="_blank" class="btn-whatsapp' + (firstItem.stok === 'Habis' ? ' disabled' : '') + '" data-product-id="' + product.id + '" data-item-index="0"><i class="fab fa-whatsapp"></i> Beli via WhatsApp</a></div>' +
        '</div>' +
        '</div>';
}

function normalizeProductItems(product) {
    if (Array.isArray(product?.items) && product.items.length > 0) {
        return product.items.slice(0, 10).map(item => ({
            nama: String(item?.nama || '').trim(),
            harga: item?.harga === '' || item?.harga === null || item?.harga === undefined ? '' : Number(item.harga),
            ukuran: String(item?.ukuran || '').trim(),
            stok: item?.stok === 'Habis' ? 'Habis' : 'Tersedia'
        })).filter(item => item.nama || item.harga !== '');
    }
    return product?.nama ? [{ nama: product.nama, harga: product.harga ?? '', ukuran: product.ukuran || '', stok: product.stok || 'Tersedia' }] : [];
}

function getFeaturedProducts(products) {
        return [...products]
            .sort((a, b) => (Number(b.wa_clicks_monthly) || 0) - (Number(a.wa_clicks_monthly) || 0))
            .slice(0, 3);
    }

    function getWhatsAppMessage(product, itemIndex) {
        const items = normalizeProductItems(product);
        const item = items[itemIndex] || items[0] || {};
        const title = product.judul_postingan || product.nama || 'produk';
        const price = item.harga === '' || item.harga === undefined ? '' : ' seharga Rp ' + formatPrice(item.harga || 0);
        return 'Halo, saya tertarik dengan ' + title + (item.nama ? ' - ' + item.nama : '') + price;
    }

    function trackWhatsAppClick(productId) {
        if (!productId) return;
        supabase.rpc('increment_product_whatsapp_clicks', { product_id: productId })
            .then(({ error }) => {
                if (error) console.error('Gagal mencatat klik WhatsApp:', error);
            })
            .catch(error => console.error('Gagal mencatat klik WhatsApp:', error));
    }

    function setupProductWhatsAppInteractions(container) {
        if (!container || container.dataset.whatsappListenerAttached) return;
        container.addEventListener('change', event => {
            const select = event.target.closest('.product-item-select');
            if (!select) return;
            const product = allProductsData.find(item => item.id === select.dataset.productId);
            const link = select.closest('.product-whatsapp-group')?.querySelector('.btn-whatsapp');
            if (!product || !link) return;
            const index = Number(select.value) || 0;
            link.dataset.itemIndex = String(index);
            link.href = createWhatsAppUrl(getWhatsAppMessage(product, index));
            link.classList.toggle('disabled', isItemOutOfStock(product, index));
            const meta = select.closest('.product-whatsapp-group')?.querySelector('.product-selected-meta');
            const item = normalizeProductItems(product)[index] || {};
            if (meta) meta.textContent = (item.ukuran ? 'Ukuran: ' + item.ukuran + ' · ' : '') + 'Stok: ' + (item.stok || 'Tersedia');
        });
        container.addEventListener('click', event => {
            const link = event.target.closest('.btn-whatsapp[data-product-id]');
            if (!link) return;
            const product = allProductsData.find(item => item.id === link.dataset.productId);
            if (!product) return;
            if (isItemOutOfStock(product, Number(link.dataset.itemIndex) || 0)) {
                event.preventDefault();
                notifyOutOfStock();
                return;
            }
            link.href = createWhatsAppUrl(getWhatsAppMessage(product, Number(link.dataset.itemIndex) || 0));
            trackWhatsAppClick(product.id);
        });
        container.dataset.whatsappListenerAttached = '1';
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
    setupProductWhatsAppInteractions(featuredProducts);
    featuredProducts.addEventListener('click', (event) => {
        const previewButton = event.target.closest('.btn-preview');
        if (!previewButton) return;
        const productId = previewButton.dataset.productId;
        const product = allProductsData.find(p => p.id === productId);
        if (product) openPreviewModal(product, 'product');
    });
}

if (allProducts) {
    setupProductWhatsAppInteractions(allProducts);
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
            applyWhatsAppNumber(settingsData.wa_number);
        }
        refreshRenderedProductLinks();

const mapContainer = document.getElementById('mapContainer');
        if (mapContainer && settingsData.maps_url) {
            const rawUrl = String(settingsData.maps_url || '').trim();
            // Ekstrak URL src dari iframe / URL Google Maps embed agar aman,
            // dan render sebagai <iframe> HTML yang bersih (tidak bocor sebagai teks).
            let embedSrc = rawUrl;
            if (/<iframe/i.test(rawUrl)) {
                const srcMatch = rawUrl.match(/src\s*=\s*["']([^"']+)["']/i);
                if (srcMatch && srcMatch[1]) embedSrc = srcMatch[1];
            }
            // Normalisasi URL embed Google Maps
            embedSrc = embedSrc.trim();
            if (embedSrc && !/^https?:\/\//i.test(embedSrc)) {
                embedSrc = 'https://' + embedSrc;
            }
            mapContainer.innerHTML =
                '<iframe src="' + embedSrc.replace(/"/g, '"') + '" width="100%" height="100%" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Google Maps - Nurul Fashion"></iframe>';
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

function renderPreviewItems(product) {
    const container = document.getElementById('previewItems');
    previewProductItems = normalizeProductItems(product);
    selectedPreviewItemIndex = 0;
    if (!container) return;
    const pricedItems = previewProductItems.filter(item => item.nama || item.harga !== '');
    container.innerHTML = pricedItems.length === 0 ? '' : '<h4>Pilih barang</h4>' + pricedItems.map((item, index) =>
        '<button type="button" class="preview-item' + (index === 0 ? ' selected' : '') + '" data-item-index="' + index + '">' +
        '<span>' + (item.nama || 'Barang ' + (index + 1)) + '</span>' +
        '<small>' + (item.ukuran ? 'Ukuran: ' + item.ukuran + ' · ' : '') + 'Stok: ' + (item.stok || 'Tersedia') + '</small>' +
        (item.harga === '' ? '' : '<strong>Rp ' + formatPrice(item.harga || 0) + '</strong>') +
        '</button>'
    ).join('');
}

function updatePreviewWhatsapp(item, type) {
    const whatsapp = document.getElementById('previewWhatsapp');
    if (!whatsapp) return;
    const title = item.judul_postingan || item.nama || '';
    const selected = type === 'product' ? (previewProductItems[selectedPreviewItemIndex] || {}) : null;
    const itemText = selected?.nama ? ' - ' + selected.nama : '';
    const priceText = selected?.harga === '' || selected?.harga === undefined ? '' : ' seharga Rp ' + formatPrice(selected.harga || 0);
    whatsapp.href = createWhatsAppUrl(type === 'gallery'
        ? 'Halo, saya tertarik dengan foto galeri: ' + (item.judul || '')
        : 'Halo, saya tertarik dengan ' + title + itemText + priceText);
    const isOutOfStock = type === 'product' && selected?.stok === 'Habis';
    whatsapp.classList.toggle('disabled', isOutOfStock);
    whatsapp.dataset.outOfStock = isOutOfStock ? '1' : '0';
}

function openPreviewModal(item, type = 'product', index = null) {
    // index used for gallery navigation
    if (type === 'gallery' && typeof index === 'number') currentGalleryIndex = index; else currentGalleryIndex = null;
    currentPreviewProduct = type === 'product' ? item : null;
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
    if (title) title.textContent = type === 'gallery' ? (item.judul || 'Preview Galeri') : (item.judul_postingan || item.nama || 'Preview Produk');
    if (image) image.src = item.gambar || item.image || 'https://via.placeholder.com/800x800?text=No+Image';
    if (name) name.textContent = type === 'gallery' ? (item.judul || '-') : (item.judul_postingan || item.nama || '-');
    if (price) price.textContent = type === 'gallery' ? '' : '';
    if (category) category.textContent = type === 'gallery' ? '-' : (item.kategori || '-');
    if (size) size.textContent = type === 'gallery' ? '-' : (item.ukuran || '-');
    if (color) color.textContent = type === 'gallery' ? '-' : (item.warna || '-');
    if (stock) stock.textContent = type === 'gallery' ? '-' : (item.stok || '-');
    if (description) description.textContent = type === 'gallery'
        ? (item.deskripsi || item.judul || 'Klik tombol WhatsApp untuk menghubungi kami.')
        : (item.keterangan_foto || 'Klik tombol WhatsApp untuk menghubungi kami.');
    renderPreviewItems(item);
    if (type === 'product') {
        const selected = previewProductItems[0] || {};
        if (size) size.textContent = selected.ukuran || '-';
        if (stock) stock.textContent = selected.stok || item.stok || '-';
    }

    // Setup WhatsApp link
    if (whatsapp) {
        updatePreviewWhatsapp(item, type);
        whatsapp.dataset.productId = type === 'product' ? (item.id || '') : '';
        whatsapp.style.display = 'inline-flex';
    }

    // Simpler preview: clicking image opens a lightbox; no copy/share or zoom controls-button
    const previewDetails = document.querySelector('.preview-details');
    if (previewDetails) {
        // ensure layout spacing
    }

    // Setup simple lightbox on image click
    setupPreviewLightbox(type);

    // Kunci scroll body agar halaman tidak ikut tergulir di belakang modal
    document.body.classList.add('no-scroll');
    modal.classList.add('active');
}

const previewItems = document.getElementById('previewItems');
if (previewItems) {
    previewItems.addEventListener('click', (event) => {
        const button = event.target.closest('.preview-item');
        if (!button) return;
        selectedPreviewItemIndex = Number(button.dataset.itemIndex);
        previewItems.querySelectorAll('.preview-item').forEach(item => item.classList.remove('selected'));
        button.classList.add('selected');
        if (currentPreviewProduct) {
            const selected = previewProductItems[selectedPreviewItemIndex] || {};
            const size = document.getElementById('previewSize');
            const stock = document.getElementById('previewStock');
            if (size) size.textContent = selected.ukuran || '-';
            if (stock) stock.textContent = selected.stok || 'Tersedia';
            updatePreviewWhatsapp(currentPreviewProduct, 'product');
        }
    });
}

const previewWhatsapp = document.getElementById('previewWhatsapp');
if (previewWhatsapp) {
    previewWhatsapp.addEventListener('click', event => {
        if (previewWhatsapp.dataset.outOfStock === '1') {
            event.preventDefault();
            notifyOutOfStock();
            return;
        }
        if (previewWhatsapp.dataset.productId) trackWhatsAppClick(previewWhatsapp.dataset.productId);
    });
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    removePreviewLightbox();
    closeImageLightbox();
    modal.classList.remove('active');
    document.body.classList.remove('no-scroll');
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
        whatsapp.href = createWhatsAppUrl('Halo, saya tertarik dengan foto galeri: ' + (item.judul || ''));
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
function initApp() {
    setupWhatsAppSync();
    loadCategories();
    loadProducts();
    loadGallery();
    loadContact();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
