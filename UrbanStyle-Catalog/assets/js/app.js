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
const cartStorageKey = 'nurul-fashion-cart';
const cartPositionStorageKey = 'nurul-fashion-cart-position';
let cartItems = loadCartItems();

function loadCartItems() {
    try {
        const saved = JSON.parse(localStorage.getItem(cartStorageKey) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        console.error('Gagal membaca keranjang:', error);
        return [];
    }
}

function saveCartItems() {
    try {
        localStorage.setItem(cartStorageKey, JSON.stringify(cartItems));
    } catch (error) {
        console.error('Gagal menyimpan keranjang:', error);
    }
    renderCart();
}

function getSelectedCartItem(product, itemIndex) {
    const item = normalizeProductItems(product)[itemIndex] || normalizeProductItems(product)[0] || {};
    return {
        key: String(product.id) + ':' + String(itemIndex),
        productId: product.id,
        itemIndex,
        title: product.judul_postingan || product.nama || 'Produk',
        name: item.nama || product.nama || 'Produk',
        price: Number(item.harga) || 0,
        size: item.ukuran || product.ukuran || '',
        color: item.warna || product.warna || '',
        description: product.keterangan_foto || '',
        image: product.gambar || ''
    };
}

function addToCart(product, itemIndex) {
    if (isItemOutOfStock(product, itemIndex)) {
        notifyOutOfStock();
        return;
    }
    const selected = getSelectedCartItem(product, itemIndex);
    const existing = cartItems.find(item => item.key === selected.key);
    if (existing) existing.quantity += 1;
    else cartItems.push({ ...selected, quantity: 1 });
    saveCartItems();
    showToast(selected.name + ' ditambahkan ke keranjang.', 'success');
}

function updateCartQuantity(key, change) {
    const item = cartItems.find(entry => entry.key === key);
    if (!item) return;
    item.quantity += change;
    if (item.quantity <= 0) cartItems = cartItems.filter(entry => entry.key !== key);
    saveCartItems();
}

function cartTotalValue() {
    return cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
}

function getCartCheckoutMessage() {
    const lines = cartItems.map((item, index) =>
        (index + 1) + '. 📸 Postingan: ' + item.title +
        '\n   👕 Produk: ' + item.name +
        '\n   💰 Harga: Rp' + formatPrice(item.price) + ' x' + item.quantity + ' = Rp' + formatPrice(item.price * item.quantity) +
        '\n   📝 Keterangan: *Ukuran:* ' + (item.size || '-') + ' *Warna:* ' + (item.color || '-') + ' ' + (item.description || '-') +
        (item.image ? '\n   🖼️ Foto: ' + item.image : '')
    );
    return 'Halo, saya ingin membeli produk dari katalog.\n\n' + lines.join('\n\n') + '\n\nTotal: Rp' + formatPrice(cartTotalValue());
}

function renderCart() {
    const container = document.getElementById('cartItems');
    const badge = document.getElementById('cartBadge');
    const total = document.getElementById('cartTotal');
    const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    if (badge) badge.textContent = String(count);
    if (total) total.textContent = 'Rp ' + formatPrice(cartTotalValue());
    if (!container) return;
    container.innerHTML = cartItems.length === 0
        ? '<p class="cart-empty">Keranjang masih kosong.</p>'
        : cartItems.map(item => '<div class="cart-item" data-cart-key="' + item.key + '">' +
            '<div><strong>' + item.name + '</strong><small>' + item.title + ' · Rp ' + formatPrice(item.price) + '</small></div>' +
            '<div class="cart-item-controls"><button type="button" data-cart-action="decrease" aria-label="Kurangi">−</button><span>' + item.quantity + '</span><button type="button" data-cart-action="increase" aria-label="Tambah">+</button></div>' +
            '<strong>Rp ' + formatPrice(item.price * item.quantity) + '</strong></div>').join('');
}

function setupCart() {
    const modal = document.getElementById('cartModal');
    const button = document.getElementById('cartButton');
    const close = document.getElementById('closeCartModal');
    const checkout = document.getElementById('cartCheckout');
    const clear = document.getElementById('cartClear');
    const items = document.getElementById('cartItems');
    if (!modal || !button || !items) return;
    setupDraggableCartButton(button);
    const toggle = (open) => {
        modal.classList.toggle('active', open);
        modal.setAttribute('aria-hidden', String(!open));
        document.body.classList.toggle('no-scroll', open);
    };
    button.addEventListener('click', () => toggle(true));
    close?.addEventListener('click', () => toggle(false));
    clear?.addEventListener('click', () => {
        if (cartItems.length === 0) return;
        cartItems = [];
        saveCartItems();
        showToast('Keranjang berhasil dikosongkan.', 'success');
    });
    modal.addEventListener('click', event => { if (event.target === modal) toggle(false); });
    items.addEventListener('click', event => {
        const control = event.target.closest('[data-cart-action]');
        if (!control) return;
        updateCartQuantity(control.closest('[data-cart-key]').dataset.cartKey, control.dataset.cartAction === 'increase' ? 1 : -1);
    });
    checkout?.addEventListener('click', event => {
        if (cartItems.length === 0) {
            event.preventDefault();
            showToast('Keranjang masih kosong.', 'warning');
            return;
        }
        window.open(createWhatsAppUrl(getCartCheckoutMessage()), '_blank', 'noopener,noreferrer');
        cartItems.forEach(item => trackWhatsAppClick(item.productId));
    });
    renderCart();
}

function setupDraggableCartButton(button) {
    const savedPosition = loadCartButtonPosition();
    if (savedPosition) applyCartButtonPosition(button, savedPosition);

    let dragging = false;
    let moved = false;
    let offsetX = 0;
    let offsetY = 0;
    let startX = 0;
    let startY = 0;

    button.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        dragging = true;
        moved = false;
        const rect = button.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        startX = event.clientX;
        startY = event.clientY;
        button.setPointerCapture?.(event.pointerId);
    });

    button.addEventListener('pointermove', event => {
        if (!dragging) return;
        if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) < 8) return;
        moved = true;
        button.classList.add('is-dragging');
        const width = button.offsetWidth;
        const height = button.offsetHeight;
        const left = Math.min(Math.max(0, event.clientX - offsetX), window.innerWidth - width);
        const top = Math.min(Math.max(0, event.clientY - offsetY), window.innerHeight - height);
        applyCartButtonPosition(button, { left, top });
    });

    button.addEventListener('pointerup', event => {
        if (!dragging) return;
        dragging = false;
        button.releasePointerCapture?.(event.pointerId);
        button.classList.remove('is-dragging');
        if (moved) {
            saveCartButtonPosition(button);
            button.dataset.draggedUntil = String(Date.now() + 300);
        }
    });

    button.addEventListener('click', event => {
        if (Number(button.dataset.draggedUntil) > Date.now()) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);

    window.addEventListener('resize', () => {
        if (button.style.left) {
            applyCartButtonPosition(button, {
                left: parseFloat(button.style.left) || 0,
                top: parseFloat(button.style.top) || 0
            });
            saveCartButtonPosition(button);
        }
    });
}

function loadCartButtonPosition() {
    try {
        const position = JSON.parse(localStorage.getItem(cartPositionStorageKey) || 'null');
        return position && Number.isFinite(position.left) && Number.isFinite(position.top) ? position : null;
    } catch (error) {
        console.error('Gagal membaca posisi keranjang:', error);
        return null;
    }
}

function applyCartButtonPosition(button, position) {
    const left = Math.min(Math.max(0, position.left), Math.max(0, window.innerWidth - button.offsetWidth));
    const top = Math.min(Math.max(0, position.top), Math.max(0, window.innerHeight - button.offsetHeight));
    button.style.left = left + 'px';
    button.style.top = top + 'px';
    button.style.right = 'auto';
    button.style.transform = 'none';
}

function saveCartButtonPosition(button) {
    try {
        localStorage.setItem(cartPositionStorageKey, JSON.stringify({
            left: button.offsetLeft,
            top: button.offsetTop
        }));
    } catch (error) {
        console.error('Gagal menyimpan posisi keranjang:', error);
    }
}

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
            categoryFilter.innerHTML = '<option value="all">Semua Kelompok Usia</option>';
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
    const sizes = items.length > 0 ? [] : (product.ukuran ? product.ukuran.split(',').map(s => s.trim()) : []);
    const colors = (product.warna || '').split(',').map(c => c.trim()).filter(Boolean);
    const firstStock = firstItem.stok || product.stok || 'Tersedia';
    const stockClass = firstStock === 'Tersedia' ? 'tersedia' : 'habis';
    const itemOptions = items.filter(item => item.nama || item.harga !== '');
    const itemSelect = itemOptions.length > 0
        ? '<div class="product-item-picker"><label class="product-item-select-label" for="product-item-' + product.id + '"><i class="fas fa-hand-pointer"></i> Pilih barang yang diminati</label><select class="product-item-select" id="product-item-' + product.id + '" data-product-id="' + product.id + '" aria-label="Pilih barang untuk produk ' + title + '">' +
          itemOptions.map((item, index) => '<option value="' + index + '"' + (item.stok === 'Habis' ? ' data-stock="Habis"' : '') + '>' + (item.nama || 'Barang ' + (index + 1)) + (item.harga === '' ? '' : ' - Rp ' + formatPrice(item.harga)) + (item.stok === 'Habis' ? ' (Habis)' : '') + '</option>').join('') + '</select>'
        + '<small class="product-picker-hint">Pilih salah satu barang untuk melihat detailnya</small></div>'
        : '<small class="product-picker-hint single">Detail barang</small>';
    const tierBadge = tier ? '<span class="product-tier tier-' + tier + '">No. ' + tier + '</span>' : '';
    return '<div class="product-card" data-aos="fade-up" data-product-card-id="' + product.id + '">' +
        '<div class="product-image">' +
        '<img src="' + imageUrl + '" alt="' + title + '" loading="lazy">' +
        '<span class="product-image-hint" aria-label="Buka detail produk"><i class="fas fa-expand-alt" aria-hidden="true"></i></span>' +
        tierBadge +
        (sizes.length > 0 ? '<div class="product-sizes">' + sizes.map(s => '<span>' + s + '</span>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="product-details">' +
        '<div class="product-category">Cocok untuk: ' + (product.kategori || '-') + '</div>' +
        '<h3 class="product-name">' + title + '</h3>' +
        (firstItem.harga === '' || firstItem.harga === undefined ? '' : '<div class="product-price" data-product-price>Rp ' + formatPrice(firstItem.harga || 0) + (items.filter(item => item.harga !== '').length > 1 ? ' <small>dan lainnya</small>' : '') + '</div>') +
        '<div class="product-stock ' + stockClass + '" data-product-stock><i class="fas ' + (firstStock === 'Tersedia' ? 'fa-check-circle' : 'fa-times-circle') + '"></i> ' + firstStock + '</div>' +
        (colors.length > 0 ? '<div class="product-colors" data-product-colors aria-label="Warna produk">' + colors.map(c => '<button type="button" class="color-dot" data-color-name="' + c.replace(/"/g, '&quot;') + '" style="background:' + getColorVisual(c) + '" title="WARNA: ' + c + '" aria-label="WARNA: ' + c + '"></button>').join('') + '</div>' : '') +
        '<div class="product-actions">' +
        '<div class="product-whatsapp-group">' + itemSelect +
        '<div class="product-selected-meta" aria-live="polite"><span><strong>Ukuran</strong><em>' + (firstItem.ukuran || '-') + '</em></span><span><strong>Warna</strong><em>' + (firstItem.warna || '-') + '</em></span><span><strong>Stok</strong><em>' + (firstItem.stok || 'Tersedia') + '</em></span></div>' +
        '<div class="product-card-buttons"><button type="button" class="btn-cart" data-cart-product-id="' + product.id + '" data-cart-item-index="0" aria-label="Tambah ke keranjang">🛒</button><a href="' + createWhatsAppUrl(getWhatsAppMessage(product, 0)) + '" target="_blank" class="btn-whatsapp' + (firstItem.stok === 'Habis' ? ' disabled' : '') + '" data-product-id="' + product.id + '" data-item-index="0"><i class="fab fa-whatsapp"></i> Beli via WhatsApp</a></div></div>' +
        '</div>' +
        '</div>';
}

function normalizeProductItems(product) {
    if (Array.isArray(product?.items) && product.items.length > 0) {
        return product.items.slice(0, 10).map(item => ({
            nama: String(item?.nama || '').trim(),
            harga: item?.harga === '' || item?.harga === null || item?.harga === undefined ? '' : Number(item.harga),
            ukuran: String(item?.ukuran || '').trim(),
            warna: String(item?.warna || item?.color || '').trim(),
            stok: item?.stok === 'Habis' ? 'Habis' : 'Tersedia'
        })).filter(item => item.nama || item.harga !== '');
    }
    return product?.nama ? [{ nama: product.nama, harga: product.harga ?? '', ukuran: product.ukuran || '', warna: product.warna || '', stok: product.stok || 'Tersedia' }] : [];
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
        const price = item.harga === '' || item.harga === undefined ? '-' : 'Rp' + formatPrice(item.harga || 0);
        const photo = product.gambar || '';
        return 'Halo, saya ingin membeli produk dari katalog.\n\n📸 Postingan: ' + title +
            '\n👕 Produk: ' + (item.nama || title) +
            '\n💰 Harga: ' + price +
            '\n📝 Keterangan: ' + (product.keterangan_foto || '-') +
            '\n*Ukuran:* ' + (item.ukuran || product.ukuran || '-') +
            ' *Warna:* ' + (item.warna || product.warna || '-') +
            (photo ? '\n🖼️ Foto: ' + photo : '');
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
            const cartButton = select.closest('.product-whatsapp-group')?.querySelector('.btn-cart');
            if (!product || !link) return;
            const index = Number(select.value) || 0;
            link.dataset.itemIndex = String(index);
            if (cartButton) cartButton.dataset.cartItemIndex = String(index);
            link.href = createWhatsAppUrl(getWhatsAppMessage(product, index));
            link.classList.toggle('disabled', isItemOutOfStock(product, index));
            const meta = select.closest('.product-whatsapp-group')?.querySelector('.product-selected-meta');
            const stockDisplay = select.closest('.product-card')?.querySelector('[data-product-stock]');
            const priceDisplay = select.closest('.product-card')?.querySelector('[data-product-price]');
            const item = normalizeProductItems(product)[index] || {};
            if (meta) meta.innerHTML = '<span><strong>Ukuran</strong><em>' + (item.ukuran || '-') + '</em></span><span><strong>Warna</strong><em>' + (item.warna || '-') + '</em></span><span><strong>Stok</strong><em>' + (item.stok || 'Tersedia') + '</em></span>';
            if (stockDisplay) {
                const stock = item.stok || 'Tersedia';
                stockDisplay.className = 'product-stock ' + (stock === 'Tersedia' ? 'tersedia' : 'habis');
                stockDisplay.innerHTML = '<i class="fas ' + (stock === 'Tersedia' ? 'fa-check-circle' : 'fa-times-circle') + '"></i> ' + stock;
            }
            if (priceDisplay) {
                priceDisplay.innerHTML = item.harga === '' || item.harga === undefined ? '' : 'Rp ' + formatPrice(item.harga || 0);
            }
        });
        container.addEventListener('click', event => {
            const colorButton = event.target.closest('.color-dot[data-color-name]');
            if (!colorButton) return;
            const colors = colorButton.closest('[data-product-colors]')?.querySelectorAll('.color-dot');
            colors?.forEach(dot => dot.classList.remove('active'));
            colorButton.classList.add('active');
            showToast('WARNA: ' + colorButton.dataset.colorName, 'info');
        });
        container.addEventListener('click', event => {
            const cartButton = event.target.closest('.btn-cart[data-cart-product-id]');
            if (cartButton) {
                const product = allProductsData.find(item => item.id === cartButton.dataset.cartProductId);
                if (product) addToCart(product, Number(cartButton.dataset.cartItemIndex) || 0);
                return;
            }
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
    const key = String(color || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const colorMap = {
        'merah': '#ef4444', 'merah marun': '#800000', 'maroon': '#800000', 'merah bata': '#b55239',
        'merah muda': '#f472b6', 'pink': '#ec4899', 'dusty pink': '#d8a0a6', 'baby pink': '#f8c8dc',
        'salem': '#f3a683', 'peach': '#ffcba4', 'magenta': '#d946ef', 'fuchsia': '#c026d3',
        'ungu': '#7e22ce', 'lilac': '#c8a2c8', 'lavender': '#b57edc', 'dusty purple': '#93708c', 'violet': '#8b5cf6',
        'biru': '#2563eb', 'navy': '#000080', 'baby blue': '#89cff0', 'sky blue': '#38bdf8',
        'denim': '#3f5f8f', 'royal blue': '#4169e1', 'dusty blue': '#7b9bb2', 'tosca': '#2dd4bf', 'turquoise': '#14b8a6',
        'mint': '#98ff98', 'hijau': '#22c55e', 'hijau army': '#4b5320', 'army': '#4b5320', 'olive': '#808000',
        'sage': '#9caf88', 'emerald': '#059669', 'lime': '#84cc16', 'hijau botol': '#006a4e',
        'kuning': '#facc15', 'mustard': '#d4a017', 'kuning lemon': '#fff44f', 'orange': '#f97316',
        'terracotta': '#c65d42', 'coklat': '#92400e', 'mocca': '#967969', 'khaki': '#c3b091',
        'caramel': '#c68e53', 'tan': '#d2b48c', 'beige': '#f5f5dc', 'cream': '#fffdd0',
        'broken white': '#f8f7f2', 'putih': '#ffffff', 'abu-abu': '#808080', 'abu': '#808080',
        'silver': '#c0c0c0', 'charcoal': '#36454f', 'hitam': '#000000'
    };
    return colorMap[key] || '#cccccc';
}

function getColorVisual(color) {
    const name = String(color || '').trim();
    const key = name.toLowerCase();
    if (/rainbow|motif|mix color|multi/i.test(key)) {
        return 'linear-gradient(135deg, #ef4444 0%, #facc15 25%, #22c55e 50%, #38bdf8 75%, #a855f7 100%)';
    }
    return getColorHex(name);
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
        const productImage = event.target.closest('.product-image');
        if (!productImage) return;
        const productCard = productImage.closest('[data-product-card-id]');
        const productId = productCard?.dataset.productCardId;
        const product = allProductsData.find(p => p.id === productId);
        if (product) openPreviewModal(product, 'product');
    });
}

if (allProducts) {
    setupProductWhatsAppInteractions(allProducts);
    allProducts.addEventListener('click', (event) => {
        const productImage = event.target.closest('.product-image');
        if (!productImage) return;
        const productCard = productImage.closest('[data-product-card-id]');
        const productId = productCard?.dataset.productCardId;
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
    const pricedItems = previewProductItems.map((item, index) => ({ item, index }))
        .filter(entry => entry.item.nama || entry.item.harga !== '');
    container.innerHTML = pricedItems.length === 0 ? '' : '<h4>Pilih barang</h4>' + pricedItems.map((entry, buttonIndex) =>
        '<button type="button" class="preview-item' + (buttonIndex === 0 ? ' selected' : '') + '" data-item-index="' + entry.index + '">' +
        '<span>' + (entry.item.nama || 'Barang ' + (entry.index + 1)) + '</span>' +
        '<small>' + (entry.item.ukuran ? 'Ukuran: ' + entry.item.ukuran + ' · ' : '') + (entry.item.warna ? 'Warna: ' + entry.item.warna + ' · ' : '') + 'Stok: ' + (entry.item.stok || 'Tersedia') + '</small>' +
        (entry.item.harga === '' ? '' : '<strong>Rp ' + formatPrice(entry.item.harga || 0) + '</strong>') +
        '</button>'
    ).join('');
}

function updatePreviewWhatsapp(item, type) {
    const whatsapp = document.getElementById('previewWhatsapp');
    if (!whatsapp) return;
    const title = item.judul_postingan || item.nama || '';
    const selected = type === 'product' ? (previewProductItems[selectedPreviewItemIndex] || {}) : null;
    whatsapp.href = createWhatsAppUrl(type === 'gallery'
        ? 'Halo, saya tertarik dengan foto galeri: ' + (item.judul || '')
        : getWhatsAppMessage(item, selectedPreviewItemIndex));
    const isOutOfStock = type === 'product' && selected?.stok === 'Habis';
    whatsapp.classList.toggle('disabled', isOutOfStock);
    whatsapp.dataset.outOfStock = isOutOfStock ? '1' : '0';
}

function updatePreviewSelectionDetails() {
    if (!currentPreviewProduct) return;
    const selected = previewProductItems[selectedPreviewItemIndex] || {};
    const price = document.getElementById('previewPrice');
    const size = document.getElementById('previewSize');
    const stock = document.getElementById('previewStock');
    const color = document.getElementById('previewColor');
    if (price) price.textContent = selected.harga === '' || selected.harga === undefined ? '' : 'Rp ' + formatPrice(selected.harga || 0);
    if (size) size.textContent = selected.ukuran || '-';
    if (stock) stock.textContent = selected.stok || 'Tersedia';
    if (color) color.textContent = selected.warna || currentPreviewProduct.warna || '-';
    const cartButton = document.getElementById('previewCart');
    if (cartButton) {
        cartButton.dataset.itemIndex = String(selectedPreviewItemIndex);
        cartButton.disabled = selected.stok === 'Habis';
        cartButton.setAttribute('aria-label', selected.stok === 'Habis' ? 'Barang habis' : 'Tambah ' + (selected.nama || 'produk') + ' ke keranjang');
    }
}

function openPreviewModal(item, type = 'product', index = null) {
    // index used for gallery navigation
    if (type === 'gallery' && typeof index === 'number') currentGalleryIndex = index; else currentGalleryIndex = null;
    currentPreviewProduct = type === 'product' ? item : null;
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    const title = document.getElementById('previewTitle');
    const image = document.getElementById('previewImage');
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
        updatePreviewSelectionDetails();
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
            updatePreviewSelectionDetails();
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

const previewCart = document.getElementById('previewCart');
if (previewCart) {
    previewCart.addEventListener('click', () => {
        if (currentPreviewProduct) addToCart(currentPreviewProduct, Number(previewCart.dataset.itemIndex) || 0);
    });
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
    const description = document.getElementById('previewDescription');
    const whatsapp = document.getElementById('previewWhatsapp');
    if (image) image.src = item.gambar || item.image || 'https://via.placeholder.com/800x800?text=No+Image';
    if (title) title.textContent = item.judul || 'Preview Galeri';
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
    setupCart();
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
