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
let storeWaNumber = loadSavedWhatsAppNumber();

function loadSavedWhatsAppNumber() {
    try {
        const val = localStorage.getItem('nurul-fashion-wa-number') || '';
        const digits = String(val).replace(/\D/g, '');
        if (!digits) return '';
        return digits.startsWith('0') ? '62' + digits.substring(1) : (digits.startsWith('62') ? digits : '62' + digits);
    } catch (e) {
        return '';
    }
}

let categoriesUnsubscribe = null;
let productsUnsubscribe = null;
let galleryUnsubscribe = null;
let settingsUnsubscribe = null;
let settingsBroadcast = null;
let previewProductItems = [];
let selectedPreviewItemIndex = 0;
let previewQuantity = 1;
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
        description: product.deskripsi || product.keterangan_foto || '',
        image: product.gambar || ''
    };
}

function addToCart(product, itemIndex, quantity = 1) {
    if (isItemOutOfStock(product, itemIndex)) {
        notifyOutOfStock();
        return;
    }
    const selected = getSelectedCartItem(product, itemIndex);
    const existing = cartItems.find(item => item.key === selected.key);
    const amount = Math.max(1, Number(quantity) || 1);
    if (existing) existing.quantity += amount;
    else cartItems.push({ ...selected, quantity: amount });
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
    /* if (normalizedNumber === storeWaNumber) return; */
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

// ===== AOS Init & Preloader =====
if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 800, once: true, offset: 60 });
}

function refreshAOS() {
    if (typeof AOS !== 'undefined') {
        setTimeout(() => { AOS.refresh(); }, 150);
    }
}

function dismissPreloader() {
    const preloader = document.getElementById('pagePreloader');
    if (preloader && !preloader.classList.contains('fade-out')) {
        setTimeout(() => {
            preloader.classList.add('fade-out');
            setTimeout(() => { if (preloader.parentNode) preloader.remove(); }, 600);
        }, 250);
    }
}
window.addEventListener('load', dismissPreloader);
setTimeout(dismissPreloader, 1200);

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
    const navClose = document.getElementById('navClose');
    if (navClose) navClose.addEventListener('click', () => setNavMenuOpen(false));

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
        const pillTabsContainer = document.getElementById('categoryPillTabs');
        if (pillTabsContainer) {
            const currentCat = categoryFilter ? categoryFilter.value : 'all';
            pillTabsContainer.innerHTML = '<button type="button" class="btn-pill-tab' + (currentCat === 'all' ? ' active' : '') + '" data-category="all">Semua</button>' +
                allCategories.map(cat => '<button type="button" class="btn-pill-tab' + (currentCat === cat.nama ? ' active' : '') + '" data-category="' + cat.nama.replace(/"/g, '&quot;') + '">' + cat.nama + '</button>').join('');
            pillTabsContainer.querySelectorAll('.btn-pill-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    pillTabsContainer.querySelectorAll('.btn-pill-tab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    if (categoryFilter) {
                        categoryFilter.value = btn.dataset.category;
                    }
                    renderAllProducts(allProductsData);
                });
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
        featuredProducts.innerHTML = getProductSkeleton(4);
    }
    if (showLoading && allProducts) {
        allProducts.innerHTML = getProductSkeleton(4);
    }

    try {
        const { data } = await fetchWithRetry(
            () => supabase.from('products').select('*').order('created_at', { ascending: false }),
            'produk'
        );
        allProductsData = (data || []).map(product => ({ id: product.id, ...product }));
    } catch (error) {
        console.error('Error loading products from Supabase:', error);
        showToast('Gagal memuat produk', 'error');
        if (featuredProducts) featuredProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat produk</div>';
        if (allProducts) allProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat produk</div>';
        return;
    }

    try {
        if (featuredProducts) renderFeaturedProducts(getFeaturedProducts(allProductsData));
        if (allProducts) renderAllProducts(allProductsData);
    } catch (renderError) {
        console.error('Error rendering product cards:', renderError);
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
    featuredProducts.innerHTML = products.slice(0, 4).map((product, index) => createProductCard(product, index + 1)).join('');
    refreshAOS();
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
        filtered = filtered.filter(p => {
            const title = (p.judul_postingan || p.nama || '').toLowerCase();
            const desc = (p.deskripsi || p.keterangan_foto || '').toLowerCase();
            const cat = (p.kategori || '').toLowerCase();
            const items = normalizeProductItems(p);
            const itemMatch = items.some(item =>
                (item.nama || '').toLowerCase().includes(searchValue) ||
                (item.ukuran || '').toLowerCase().includes(searchValue) ||
                (item.warna || '').toLowerCase().includes(searchValue)
            );
            return title.includes(searchValue) || desc.includes(searchValue) || cat.includes(searchValue) || itemMatch;
        });
    }

    const sortValue = sortFilter ? sortFilter.value : 'default';
    if (sortValue === 'termurah') {
        filtered.sort((a, b) => (Number(a.harga) || 0) - (Number(a.harga) || 0));
    } else if (sortValue === 'termahal') {
        filtered.sort((a, b) => (Number(b.harga) || 0) - (Number(a.harga) || 0));
    } else if (sortValue === 'az') {
        filtered.sort((a, b) => (a.judul_postingan || a.nama || '').localeCompare(b.judul_postingan || b.nama || ''));
    } else if (sortValue === 'za') {
        filtered.sort((a, b) => (b.judul_postingan || b.nama || '').localeCompare(a.judul_postingan || a.nama || ''));
    }

    if (filtered.length === 0) {
        allProducts.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Tidak ada produk yang cocok</div>';
        return;
    }
    allProducts.innerHTML = filtered.map(product => createProductCard(product)).join('');
    refreshAOS();
}

// ===== Create Product Card =====
function createProductCard(product, tier = null) {
    try {
        const imageUrl = product.gambar || 'https://via.placeholder.com/400x500?text=No+Image';
        const items = normalizeProductItems(product);
        const title = product.judul_postingan || product.nama || 'Produk';
        const firstItem = items.find(item => item.nama) || {};
        const colors = extractProductColors(product);
        const tierBadge = tier ? '<span class="product-tier tier-' + tier + '">No. ' + tier + '</span>' : '';
        return '<div class="product-card" data-product-card-id="' + product.id + '" role="button" tabindex="0" aria-label="Lihat detail ' + title.replace(/"/g, '&quot;') + '">' +
            '<div class="product-image product-image-zoomable" data-zoom-src="' + imageUrl.replace(/"/g, '&quot;') + '" data-zoom-title="' + title.replace(/"/g, '&quot;') + '" role="button" tabindex="0" title="Tap gambar untuk memperbesar" aria-label="Tap gambar untuk melihat foto ' + title.replace(/"/g, '&quot;') + ' layar penuh">' +
            '<img src="' + imageUrl + '" alt="" class="product-image-bg" aria-hidden="true" loading="lazy">' +
            '<img src="' + imageUrl + '" alt="' + title + '" class="product-image-main" loading="lazy">' +
            tierBadge +
            '</div>' +
            '<div class="product-details">' +
            '<div class="product-category">Cocok untuk: ' + (product.kategori || '-') + '</div>' +
            '<h3 class="product-name">' + title + '</h3>' +
            (firstItem.harga === '' || firstItem.harga === undefined ? '' : '<div class="product-price" data-product-price>Rp ' + formatPrice(firstItem.harga || 0) + (items.filter(item => item.harga !== '').length > 1 ? ' <small>dan lainnya</small>' : '') + '</div>') +
            (colors.length > 0 ? '<span class="product-color-status">Tersedia macam warna</span><div class="product-colors" data-product-colors aria-label="Warna produk">' + colors.map(c => '<button type="button" class="color-dot" data-color-name="' + c.replace(/"/g, '&quot;') + '" style="background:' + getColorVisual(c) + '" title="WARNA: ' + c + '" aria-label="WARNA: ' + c + '"></button>').join('') + '</div>' : '') +
            '</div>' +
            '</div>';
    } catch (cardError) {
        console.error('Error creating card for product:', product, cardError);
        return '';
    }
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

function extractProductColors(product) {
    if (!product || !product.warna) return [];

    // Hanya deteksi warna yang diinputkan langsung oleh admin pada kolom warna produk (tidak menambahkan warna secara otomatis)
    const rawList = String(product.warna)
        .split(/[,;/|\n]+/)
        .map(w => w.trim())
        .filter(Boolean);

    const seen = new Set();
    const colors = [];

    rawList.forEach(color => {
        const key = color.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            const formatted = color.startsWith('#')
                ? color
                : color.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
            colors.push(formatted);
        }
    });

    return colors;
}

function getFeaturedProducts(products) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentMonthPrefix = currentYear + '-' + currentMonth;

    return [...products]
        .map(product => {
            const periodStr = product.wa_clicks_period_start ? String(product.wa_clicks_period_start).slice(0, 7) : '';
            const isCurrentMonth = periodStr === currentMonthPrefix;
            const monthlyClicks = isCurrentMonth ? (Number(product.wa_clicks_monthly) || 0) : 0;
            const totalClicks = Number(product.wa_clicks) || 0;
            return {
                ...product,
                _monthlyClicks: monthlyClicks,
                _totalClicks: totalClicks
            };
        })
        .sort((a, b) => {
            // 1. Urutkan berdasarkan klik WhatsApp bulan berjalan (terbanyak di atas)
            if (b._monthlyClicks !== a._monthlyClicks) {
                return b._monthlyClicks - a._monthlyClicks;
            }
            // 2. Jika sama, urutkan berdasarkan total klik WhatsApp keseluruhan
            if (b._totalClicks !== a._totalClicks) {
                return b._totalClicks - a._totalClicks;
            }
            // 3. Jika masih sama, urutkan dari yang terbaru
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        })
        .slice(0, 4); // Hanya 4 produk terpopuler
}

    function getWhatsAppMessage(product, itemIndex, quantity = 1) {
        const items = normalizeProductItems(product);
        const item = items[itemIndex] || items[0] || {};
        const title = product.judul_postingan || product.nama || 'produk';
        const amount = Math.max(1, Number(quantity) || 1);
        const unitPrice = item.harga === '' || item.harga === undefined ? null : (Number(item.harga) || 0);
        const totalPrice = unitPrice !== null ? unitPrice * amount : null;
        const priceText = totalPrice !== null
            ? (amount > 1
                ? 'Rp' + formatPrice(totalPrice) + ' (Rp' + formatPrice(unitPrice) + ' x ' + amount + ')'
                : 'Rp' + formatPrice(unitPrice))
            : '-';
        const photo = product.gambar || '';
        return 'Halo, saya ingin membeli produk dari katalog.\n\n' +
            '📸 Postingan: ' + title +
            '\n👕 Produk: ' + (item.nama || title) +
            '\n🔢 Jumlah: ' + amount +
            '\n💰 Total Harga: ' + priceText +
            '\n📝 Deskripsi: ' + (product.deskripsi || product.keterangan_foto || '-') +
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
            const card = colorButton.closest('.product-card');
            const colors = colorButton.closest('[data-product-colors]')?.querySelectorAll('.color-dot');
            colors?.forEach(dot => dot.classList.remove('active'));
            colorButton.classList.add('active');

            // Sinkronkan pilihan varian dengan warna yang diklik
            const clickedColor = (colorButton.dataset.colorName || '').toLowerCase().trim();
            const product = allProductsData.find(p => String(p.id) === String(card?.dataset.productCardId));
            const select = card?.querySelector('.product-item-select');
            if (product && card) {
                const items = normalizeProductItems(product);
                const matchIndex = items.findIndex(item => {
                    const itemCol = (item.warna || '').toLowerCase();
                    return itemCol.includes(clickedColor) || clickedColor.includes(itemCol);
                });
                if (select && matchIndex !== -1 && select.value !== String(matchIndex)) {
                    select.value = String(matchIndex);
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const selectedItem = items[matchIndex] || items[0] || {};
                void selectedItem;
            }

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
    const key = String(color || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    const colorMap = {
        // Merah, Marun, Bata
        'merah': '#ef4444', 'red': '#ef4444', 'merah marun': '#800000', 'marun': '#800000', 'maroon': '#800000',
        'merah bata': '#b55239', 'bata': '#b55239', 'terracotta': '#c65d42', 'terakota': '#c65d42', 'crimson': '#dc143c',
        'merah cabe': '#dc2626', 'cabe': '#dc2626',

        // Pink, Salem, Fanta
        'merah muda': '#f472b6', 'pink': '#ec4899', 'dusty pink': '#d8a0a6', 'baby pink': '#f8c8dc', 'rose': '#e11d48',
        'fanta': '#ec008c', 'merah fanta': '#ec008c', 'pink fanta': '#ec008c',
        'salem': '#f3a683', 'peach': '#ffcba4', 'coral': '#ff7f50', 'salmon': '#fa8072', 'magenta': '#d946ef',
        'fuchsia': '#c026d3', 'fuksin': '#c026d3', 'fuschia': '#c026d3',

        // Ungu, Lilac, Lavender
        'ungu': '#7e22ce', 'purple': '#7e22ce', 'ungu muda': '#c8a2c8', 'lilac': '#c8a2c8', 'lavender': '#b57edc',
        'dusty purple': '#93708c', 'violet': '#8b5cf6', 'mauve': '#e0b0ff', 'plum': '#8e4585', 'taro': '#a484a4',

        // Biru, Navy, Denim
        'biru': '#2563eb', 'blue': '#2563eb', 'biru muda': '#60a5fa', 'light blue': '#60a5fa',
        'navy': '#000080', 'nevy': '#000080', 'dark navy': '#001f3f', 'navy blue': '#000080',
        'baby blue': '#89cff0', 'sky blue': '#38bdf8', 'biru langit': '#38bdf8',
        'powder blue': '#b0e0e6', 'ice blue': '#d9f3ff', 'biru laut': '#0284c7', 'biru tua': '#1e3a8a', 'dark blue': '#1e3a8a',
        'denim': '#3f5f8f', 'jeans': '#3f5f8f', 'royal blue': '#4169e1', 'dusty blue': '#7b9bb2', 'biru bca': '#00529c',
        'wardah': '#73b9b4', 'biru wardah': '#73b9b4',

        // Tosca, Mint, Turquoise
        'tosca': '#2dd4bf', 'toska': '#2dd4bf', 'turquoise': '#14b8a6', 'teal': '#0f766e', 'mint': '#98ff98',

        // Hijau & Varian
        'hijau': '#22c55e', 'green': '#22c55e', 'hijau army': '#4b5320', 'army': '#4b5320', 'olive': '#808000',
        'sage': '#9caf88', 'sage green': '#9caf88', 'hijau sage': '#9caf88',
        'emerald': '#059669', 'lime': '#84cc16', 'hijau botol': '#006a4e', 'lumut': '#355e3b', 'hijau lumut': '#355e3b',
        'hijau tua': '#166534', 'dark green': '#166534', 'hijau muda': '#86efac', 'matcha': '#94a378',

        // Kuning & Orange
        'kuning': '#facc15', 'yellow': '#facc15', 'mustard': '#d4a017', 'kunyit': '#d4a017', 'kubus': '#c59b27',
        'kuning lemon': '#fff44f', 'lemon': '#fff44f',
        'orange': '#f97316', 'oren': '#f97316', 'oranye': '#f97316', 'jingga': '#f97316',

        // Coklat & Earth Tones
        'coklat': '#92400e', 'cokelat': '#92400e', 'brown': '#92400e', 'mocca': '#967969', 'moka': '#967969',
        'coklat susu': '#a67b5b', 'coksu': '#a67b5b', 'milo': '#a28669', 'coklat tua': '#4a2c2a', 'dark brown': '#4a2c2a',
        'khaki': '#c3b091', 'kaki': '#c3b091', 'caramel': '#c68e53', 'karamel': '#c68e53', 'tan': '#d2b48c',
        'beige': '#f5f5dc', 'cream': '#fffdd0', 'krem': '#fffdd0', 'ivory': '#fffff0', 'nude': '#e3bc9a', 'taupe': '#8b8589',
        'gold': '#ffd700', 'emas': '#ffd700',

        // Hitam, Putih, Abu
        'putih': '#ffffff', 'white': '#ffffff', 'broken white': '#f8f7f2', 'bw': '#f8f7f2', 'putih tulang': '#f8f7f2', 'tulang': '#f8f7f2',
        'hitam': '#000000', 'black': '#000000',
        'abu-abu': '#808080', 'abu': '#808080', 'abu abu': '#808080', 'grey': '#808080', 'gray': '#808080',
        'abu-abu muda': '#d3d3d3', 'abu muda': '#d3d3d3', 'light grey': '#d3d3d3',
        'abu-abu tua': '#555555', 'abu tua': '#555555', 'dark grey': '#555555', 'silver': '#c0c0c0', 'charcoal': '#36454f'
    };

    if (colorMap[key]) return colorMap[key];

    // Jika warna mengandung kata kunci yang dikenal (contoh: "dusty pink tua" -> dusty pink)
    for (const [name, hex] of Object.entries(colorMap)) {
        if (key.includes(name)) return hex;
    }

    const cssColor = String(color || '').trim();
    if (/^#([\da-f]{3}|[\da-f]{6})$/i.test(cssColor) || /^rgba?\(/i.test(cssColor) || /^hsla?\(/i.test(cssColor)) return cssColor;
    const hue = Array.from(key).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
    return 'hsl(' + hue + ' 48% 60%)';
}

function getColorVisual(color) {
    const name = String(color || '').trim();
    const key = name.toLowerCase();

    // Cek pattern / rainbow / kombinasi
    if (/rainbow|pelangi|motif|mix|multi|kombinasi|campur|corak|bunga|pattern|abstrak/i.test(key)) {
        return 'linear-gradient(135deg, #ef4444 0%, #facc15 25%, #22c55e 50%, #38bdf8 75%, #a855f7 100%)';
    }

    // Cek kombinasi dua warna (misal: "hitam putih", "merah hitam", "biru kuning")
    const parts = key.split(/[\s/&-]+/);
    if (parts.length === 2) {
        const hex1 = getColorHex(parts[0]);
        const hex2 = getColorHex(parts[1]);
        if (hex1 && hex2 && hex1 !== hex2 && !hex1.startsWith('hsl(') && !hex2.startsWith('hsl(')) {
            return `linear-gradient(135deg, ${hex1} 50%, ${hex2} 50%)`;
        }
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
if (categoryFilter) {
    categoryFilter.addEventListener('change', () => {
        const val = categoryFilter.value;
        document.querySelectorAll('#categoryPillTabs .btn-pill-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === val);
        });
        renderAllProducts(allProductsData);
    });
}
if (sortFilter) sortFilter.addEventListener('change', () => renderAllProducts(allProductsData));
if (searchInput) searchInput.addEventListener('input', debounce(() => renderAllProducts(allProductsData), 300));

function setupProductCardClicks(container) {
    if (!container) return;
    setupProductWhatsAppInteractions(container);
    container.addEventListener('click', (event) => {
        const zoomArea = event.target.closest('.product-image-zoomable');
        if (zoomArea) {
            event.preventDefault();
            event.stopPropagation();
            const card = zoomArea.closest('.product-card[data-product-card-id]');
            const product = allProductsData.find(item => String(item.id) === String(card?.dataset.productCardId));
            if (product) openPreviewModal(product, 'product');
            return;
        }
        const card = event.target.closest('.product-card[data-product-card-id]');
        if (!card || event.target.closest('button, a, select, input')) return;
        const product = allProductsData.find(item => String(item.id) === String(card.dataset.productCardId));
        if (product) openPreviewModal(product, 'product');
    });
    container.addEventListener('keydown', (event) => {
        const card = event.target.closest('.product-card[data-product-card-id]');
        if (card && (event.key === 'Enter' || event.key === ' ') && event.target === card) {
            event.preventDefault();
            const product = allProductsData.find(item => String(item.id) === String(card.dataset.productCardId));
            if (product) openPreviewModal(product, 'product');
            return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('product-image-zoomable')) {
            event.preventDefault();
            const card = event.target.closest('.product-card[data-product-card-id]');
            const product = allProductsData.find(item => String(item.id) === String(card?.dataset.productCardId));
            if (product) openPreviewModal(product, 'product');
        }
    });
}

if (featuredProducts) {
    setupProductCardClicks(featuredProducts);
}

if (allProducts) {
    setupProductCardClicks(allProducts);
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

// ===== HERO BACKGROUND SLIDER (Dynamic Photos) =====
let heroSliderInterval = null;
let currentHeroSlideIndex = 0;
const defaultHeroImages = [
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1600&auto=format&fit=crop&q=80'
];

function renderHeroBanners(banners = []) {
    const sliderContainer = document.getElementById('heroBgSlider');
    const dotsContainer = document.getElementById('heroSliderDots');
    if (!sliderContainer) return;

    let images = [];
    if (banners && banners.length > 0) {
        images = banners.map(b => b.gambar).filter(Boolean);
    }

    // Jika belum ada foto banner dari admin, gunakan default fashion images
    if (images.length === 0) {
        images = defaultHeroImages;
    }

    if (heroSliderInterval) {
        clearInterval(heroSliderInterval);
        heroSliderInterval = null;
    }

    sliderContainer.innerHTML = images.map((src, idx) =>
        '<div class="hero-bg-slide ' + (idx === 0 ? 'active' : '') + '" data-slide-index="' + idx + '" style="background-image: url(\'' + src + '\')"></div>'
    ).join('');

    if (dotsContainer) {
        if (images.length > 1) {
            dotsContainer.innerHTML = images.map((_, idx) =>
                '<button type="button" class="hero-slider-dot ' + (idx === 0 ? 'active' : '') + '" data-slide-to="' + idx + '" aria-label="Slide ' + (idx + 1) + '"></button>'
            ).join('');

            dotsContainer.querySelectorAll('.hero-slider-dot').forEach(dot => {
                dot.addEventListener('click', (e) => {
                    const idx = Number(e.target.dataset.slideTo);
                    goToHeroSlide(idx);
                });
            });
        } else {
            dotsContainer.innerHTML = '';
        }
    }

    currentHeroSlideIndex = 0;
    if (images.length > 1) {
        heroSliderInterval = setInterval(() => {
            const slides = sliderContainer.querySelectorAll('.hero-bg-slide');
            if (slides.length <= 1) return;
            const nextIndex = (currentHeroSlideIndex + 1) % slides.length;
            goToHeroSlide(nextIndex);
        }, 5500);
    }
}

function goToHeroSlide(index) {
    const sliderContainer = document.getElementById('heroBgSlider');
    const dotsContainer = document.getElementById('heroSliderDots');
    if (!sliderContainer) return;
    const slides = sliderContainer.querySelectorAll('.hero-bg-slide');
    const dots = dotsContainer?.querySelectorAll('.hero-slider-dot');
    if (!slides || slides.length === 0) return;

    slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === index);
    });

    if (dots) {
        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === index);
        });
    }

    currentHeroSlideIndex = index;
}

// ===== Load Gallery & Banner =====
async function refreshGallery() {
    if (!galleryGrid) return;
    galleryGrid.innerHTML = getGallerySkeleton(4);

    try {
        const { data, error } = await fetchWithRetry(
            () => supabase.from('gallery').select('*').order('created_at', { ascending: false }),
            'galeri'
        );
        if (error) throw error;

        const allItems = (data || []).map(item => ({ id: item.id, ...item }));

        // Pisahkan item banner background home ([BANNER]) dan item galeri biasa
        const bannerPhotos = allItems.filter(item => (item.judul || '').trim().startsWith('[BANNER]'));
        galleryData = allItems.filter(item => !(item.judul || '').trim().startsWith('[BANNER]'));

        // Render Hero Slider dari banner photos
        renderHeroBanners(bannerPhotos);

        if (galleryData.length === 0) {
            galleryGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Belum ada foto galeri</div>';
            return;
        }
        galleryGrid.innerHTML = galleryData.map((item, index) =>
            '<div class="gallery-item" data-aos="zoom-in" data-index="' + index + '">' +
            '<img src="' + (item.gambar || 'https://via.placeholder.com/400?text=Gallery') + '" alt="' + (item.judul || 'Foto') + '" loading="lazy">' +
            '<div class="gallery-overlay"><h3>' + (item.judul || 'Foto Galeri') + '</h3></div>' +
            '</div>'
        ).join('');
        refreshAOS();
    } catch (error) {
        console.error('Error loading gallery:', error);
        showToast('Gagal memuat galeri', 'error');
        renderHeroBanners([]);
        galleryGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;">Gagal memuat galeri</div>';
    }
}

async function loadGallery() {
    renderHeroBanners([]);
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
    container.innerHTML = pricedItems.length <= 1 ? '' : '<h4>Pilihan Varian</h4>' + pricedItems.map((entry, buttonIndex) =>
        '<button type="button" class="preview-item' + (buttonIndex === 0 ? ' selected' : '') + '" data-item-index="' + entry.index + '">' +
        '<span>' + (entry.item.nama || 'Model ' + (entry.index + 1)) + '</span>' +
        (entry.item.harga === '' ? '' : '<strong>Rp ' + formatPrice(entry.item.harga || 0) + '</strong>') +
        '</button>'
    ).join('');
}

function updatePreviewWhatsapp(item, type) {
    const whatsapp = document.getElementById('previewWhatsapp');
    if (!whatsapp) return;
    const selected = type === 'product' ? (previewProductItems[selectedPreviewItemIndex] || {}) : null;
    whatsapp.href = createWhatsAppUrl(type === 'gallery'
        ? 'Halo, saya tertarik dengan foto galeri: ' + (item.judul || '')
        : getWhatsAppMessage(item, selectedPreviewItemIndex, previewQuantity));
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
    const minusBtn = document.getElementById('previewQuantityMinus');
    if (minusBtn) minusBtn.disabled = previewQuantity <= 1;

    const unitPrice = selected.harga === '' || selected.harga === undefined ? null : (Number(selected.harga) || 0);
    if (price) {
        if (unitPrice === null) {
            price.innerHTML = '';
        } else {
            const totalPrice = unitPrice * previewQuantity;
            if (previewQuantity > 1) {
                price.innerHTML = 'Rp ' + formatPrice(totalPrice) + ' <small class="preview-unit-price">(Rp ' + formatPrice(unitPrice) + ' / pcs)</small>';
            } else {
                price.textContent = 'Rp ' + formatPrice(totalPrice);
            }
        }
    }
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
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    if (type === 'gallery' && typeof index === 'number') currentGalleryIndex = index; else currentGalleryIndex = null;
    currentPreviewProduct = type === 'product' ? item : null;
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
    modal.classList.toggle('gallery-preview', type === 'gallery');
    if (price) price.textContent = type === 'gallery' ? '' : '';
    if (category) category.textContent = type === 'gallery' ? '' : (item.kategori || '-');
    if (size) size.textContent = type === 'gallery' ? '' : (item.ukuran || '-');
    if (color) color.textContent = type === 'gallery' ? '' : (item.warna || '-');
    if (stock) stock.textContent = type === 'gallery' ? '' : (item.stok || '-');
    previewQuantity = 1;
    const quantityDisplay = document.getElementById('previewQuantity');
    if (quantityDisplay) quantityDisplay.textContent = '1';
    const minusBtn = document.getElementById('previewQuantityMinus');
    if (minusBtn) minusBtn.disabled = true;
    if (description) description.textContent = type === 'gallery'
        ? (item.deskripsi || item.judul || 'Klik tombol WhatsApp untuk menghubungi kami.')
        : (item.deskripsi || item.keterangan_foto || 'Klik tombol WhatsApp untuk menghubungi kami.');
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
    const previewCartButton = document.getElementById('previewCart');
    if (previewCartButton) previewCartButton.style.display = type === 'gallery' ? 'none' : 'inline-flex';

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
        const nextIndex = Number(button.dataset.itemIndex);
        if (nextIndex === selectedPreviewItemIndex && button.classList.contains('selected')) return;
        selectedPreviewItemIndex = nextIndex;
        previewItems.querySelectorAll('.preview-item.selected').forEach(item => item.classList.remove('selected'));
        button.classList.add('selected');
        if (currentPreviewProduct) {
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
    modal.classList.remove('active', 'gallery-preview');
    document.body.classList.remove('no-scroll');
}

// ===== FULLSCREEN HIGH-DEFINITION IMAGE ZOOM VIEWER (LIGHTBOX) =====
let zoomScale = 1;
let zoomPanX = 0;
let zoomPanY = 0;
let isZoomDragging = false;
let zoomStartX = 0;
let zoomStartY = 0;
let zoomInitialDistance = 0;
let zoomInitialScale = 1;
let zoomIsPinching = false;
let currentGalleryIndex = null;
let previewLightboxHandler = null;

function openProductImageZoom(src, title = 'Foto Produk') {
    if (!src) return;
    const modal = document.getElementById('productZoomModal');
    const img = document.getElementById('zoomImageElement');
    const titleEl = document.getElementById('zoomProductTitle');
    if (!modal || !img) return;

    img.src = src;
    img.alt = title;
    if (titleEl) {
        titleEl.innerHTML = '<i class="fas fa-search-plus"></i> <span>' + (title || 'Foto Produk') + '</span>';
    }

    // Reset zoom state
    zoomScale = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    applyZoomTransform();

    modal.classList.add('active');
    document.body.classList.add('no-scroll');
}

function closeProductImageZoom() {
    const modal = document.getElementById('productZoomModal');
    if (!modal) return;
    if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch (e) {}
    }
    modal.classList.remove('active');
    document.body.classList.remove('no-scroll');
    zoomScale = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    applyZoomTransform();
}

function applyZoomTransform() {
    const img = document.getElementById('zoomImageElement');
    const indicator = document.getElementById('zoomLevelIndicator');
    const viewport = document.getElementById('zoomViewport');
    if (!img) return;

    img.style.transform = 'translate3d(' + zoomPanX + 'px, ' + zoomPanY + 'px, 0) scale(' + zoomScale + ')';
    if (indicator) {
        indicator.textContent = Math.round(zoomScale * 100) + '%';
    }
    if (viewport) {
        viewport.classList.toggle('is-dragging', isZoomDragging);
        viewport.style.cursor = zoomScale > 1 ? (isZoomDragging ? 'grabbing' : 'grab') : 'zoom-in';
    }
}

function zoomIn() {
    zoomScale = Math.min(zoomScale + 0.5, 4.5);
    applyZoomTransform();
}

function zoomOut() {
    zoomScale = Math.max(zoomScale - 0.5, 1);
    if (zoomScale === 1) {
        zoomPanX = 0;
        zoomPanY = 0;
    }
    applyZoomTransform();
}

function zoomReset() {
    zoomScale = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    applyZoomTransform();
}

function toggleZoomFullscreen() {
    const modal = document.getElementById('productZoomModal');
    if (!modal) return;
    if (!document.fullscreenElement) {
        if (modal.requestFullscreen) modal.requestFullscreen();
        else if (modal.webkitRequestFullscreen) modal.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

function setupZoomViewer() {
    const modal = document.getElementById('productZoomModal');
    const viewport = document.getElementById('zoomViewport');
    const btnIn = document.getElementById('btnZoomIn');
    const btnOut = document.getElementById('btnZoomOut');
    const btnReset = document.getElementById('btnZoomReset');
    const btnFull = document.getElementById('btnZoomFullscreen');
    const btnClose = document.getElementById('btnCloseZoom');

    if (!modal || !viewport) return;

    if (btnIn) btnIn.addEventListener('click', (e) => { e.stopPropagation(); zoomIn(); });
    if (btnOut) btnOut.addEventListener('click', (e) => { e.stopPropagation(); zoomOut(); });
    if (btnReset) btnReset.addEventListener('click', (e) => { e.stopPropagation(); zoomReset(); });
    if (btnFull) btnFull.addEventListener('click', (e) => { e.stopPropagation(); toggleZoomFullscreen(); });
    if (btnClose) btnClose.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeProductImageZoom(); });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeProductImageZoom();
    });

    // Double Click to toggle zoom
    viewport.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (zoomScale > 1) {
            zoomReset();
        } else {
            zoomScale = 2.5;
            applyZoomTransform();
        }
    });

    // Mouse Wheel Zoom
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomScale = Math.min(zoomScale + 0.25, 4.5);
        } else {
            zoomScale = Math.max(zoomScale - 0.25, 1);
            if (zoomScale === 1) { zoomPanX = 0; zoomPanY = 0; }
        }
        applyZoomTransform();
    }, { passive: false });

    // Mouse Drag Pan
    viewport.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (zoomScale <= 1) return;
        isZoomDragging = true;
        zoomStartX = e.clientX - zoomPanX;
        zoomStartY = e.clientY - zoomPanY;
        applyZoomTransform();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isZoomDragging) return;
        e.preventDefault();
        zoomPanX = e.clientX - zoomStartX;
        zoomPanY = e.clientY - zoomStartY;
        applyZoomTransform();
    });

    window.addEventListener('mouseup', () => {
        if (isZoomDragging) {
            isZoomDragging = false;
            applyZoomTransform();
        }
    });

    // Touch Handling (Pinch-to-zoom + 1-finger pan)
    let touchStartX = 0;
    let touchStartY = 0;
    let lastTapTime = 0;

    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            zoomIsPinching = true;
            zoomInitialDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            zoomInitialScale = zoomScale;
        } else if (e.touches.length === 1) {
            zoomIsPinching = false;
            const now = Date.now();
            if (now - lastTapTime < 300) {
                e.preventDefault();
                if (zoomScale > 1) zoomReset();
                else { zoomScale = 2.5; applyZoomTransform(); }
                lastTapTime = 0;
                return;
            }
            lastTapTime = now;

            if (zoomScale > 1) {
                isZoomDragging = true;
                touchStartX = e.touches[0].clientX - zoomPanX;
                touchStartY = e.touches[0].clientY - zoomPanY;
            }
        }
    }, { passive: false });

    viewport.addEventListener('touchmove', (e) => {
        if (zoomIsPinching && e.touches.length === 2) {
            e.preventDefault();
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (zoomInitialDistance > 0) {
                zoomScale = Math.max(1, Math.min(4.5, zoomInitialScale * (currentDist / zoomInitialDistance)));
                if (zoomScale === 1) { zoomPanX = 0; zoomPanY = 0; }
                applyZoomTransform();
            }
        } else if (isZoomDragging && e.touches.length === 1 && zoomScale > 1) {
            e.preventDefault();
            zoomPanX = e.touches[0].clientX - touchStartX;
            zoomPanY = e.touches[0].clientY - touchStartY;
            applyZoomTransform();
        }
    }, { passive: false });

    viewport.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) zoomIsPinching = false;
        if (e.touches.length === 0) isZoomDragging = false;
        applyZoomTransform();
    });

    // Click on backdrop when zoom is 1x closes modal
    viewport.addEventListener('click', (e) => {
        if (e.target === viewport && zoomScale === 1) {
            closeProductImageZoom();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('active')) return;
        if (e.key === 'Escape') closeProductImageZoom();
        else if (e.key === '+' || e.key === '=') zoomIn();
        else if (e.key === '-' || e.key === '_') zoomOut();
        else if (e.key === '0') zoomReset();
    });
}

function setupPreviewLightbox(type) {
    const img = document.getElementById('previewImage');
    const titleEl = document.getElementById('previewTitle');
    if (!img) return;
    removePreviewLightbox();
    img.style.cursor = 'zoom-in';
    const clickHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const title = titleEl ? titleEl.textContent : 'Preview Foto';
        openProductImageZoom(img.src, title);
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
        if (currentPreviewProduct) addToCart(currentPreviewProduct, Number(previewCart.dataset.itemIndex) || 0, previewQuantity);
    });
}

const previewQuantityMinus = document.getElementById('previewQuantityMinus');
const previewQuantityPlus = document.getElementById('previewQuantityPlus');
function changePreviewQuantity(change) {
    if (!currentPreviewProduct) return;
    previewQuantity = Math.max(1, Math.min(99, previewQuantity + change));
    const quantityDisplay = document.getElementById('previewQuantity');
    if (quantityDisplay) quantityDisplay.textContent = String(previewQuantity);
    const minusBtn = document.getElementById('previewQuantityMinus');
    if (minusBtn) minusBtn.disabled = previewQuantity <= 1;
    updatePreviewSelectionDetails();
    updatePreviewWhatsapp(currentPreviewProduct, 'product');
}
if (previewQuantityMinus) previewQuantityMinus.addEventListener('click', () => changePreviewQuantity(-1));
if (previewQuantityPlus) previewQuantityPlus.addEventListener('click', () => changePreviewQuantity(1));

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
    setupPreviewLightbox('gallery');
}


const previewClose = document.getElementById('closePreviewModal');
if (previewClose) {
    previewClose.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePreviewModal();
    });
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
    setupZoomViewer();
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
