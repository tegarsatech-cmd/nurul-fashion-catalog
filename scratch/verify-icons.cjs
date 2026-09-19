const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\maulidah\\scratch\\chrome-test-profile';

if (!fs.existsSync('C:\\maulidah\\scratch')) {
    fs.mkdirSync('C:\\maulidah\\scratch', { recursive: true });
}

const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    'http://localhost:5173/'
]);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function run() {
    let list = null;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            list = await getJson('http://127.0.0.1:9222/json/list');
            if (list && list.length > 0) break;
        } catch (e) {}
    }

    if (!list || list.length === 0) {
        console.error('Could not connect to Chrome CDP');
        chrome.kill();
        return;
    }

    const page = list.find(t => t.type === 'page') || list[0];
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg.result);
            pending.delete(msg.id);
        }
    };

    function send(method, params = {}) {
        const msgId = id++;
        return new Promise(resolve => {
            pending.set(msgId, resolve);
            ws.send(JSON.stringify({ id: msgId, method, params }));
        });
    }

    await new Promise(r => ws.onopen = r);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: 'http://localhost:5173/' });
    await sleep(2000);

    // Wait until cards are rendered
    for (let i = 0; i < 20; i++) {
        const hasCards = await send('Runtime.evaluate', {
            expression: `document.querySelectorAll('.product-card .product-name').length > 0`,
            returnByValue: true
        });
        if (hasCards?.result?.value) break;
        await sleep(500);
    }

    const evalResult = await send('Runtime.evaluate', {
        expression: `(function() {
            function getComp(sel) {
                const el = document.querySelector(sel);
                if (!el) return 'NOT_FOUND';
                const st = window.getComputedStyle(el);
                return {
                    color: st.color,
                    background: st.backgroundColor,
                    borderColor: st.borderColor
                };
            }

            // Periksa semua icon
            const results = {
                heroShield: getComp('.hero-badge i'),
                iconBaju: getComp('.card-icon-feature .icon-baju i'),
                iconCentang: getComp('.card-icon-feature .icon-centang i'),
                iconPengiriman: getComp('.card-icon-feature .icon-pengiriman i'),
                iconStore: getComp('.info-icon.icon-store i'),
                iconEmail: getComp('.info-icon.icon-email i'),
                iconClock: getComp('.info-icon.icon-clock i'),
                iconAddress: getComp('.info-icon.icon-address i')
            };

            // Periksa dot warna pada produk
            const cards = Array.from(document.querySelectorAll('.product-card')).map(card => {
                const name = card.querySelector('.product-name')?.textContent || '';
                const dots = Array.from(card.querySelectorAll('.color-dot')).map(d => d.dataset.colorName);
                return { name, dotCount: dots.length, dots };
            });

            return { results, cards };
        })()`,
        returnByValue: true
    });

    console.log('--- EVALUATION RESULT ---');
    console.log('Icons:', JSON.stringify(evalResult.result.value.results, null, 2));
    console.log('Product cards loaded:', evalResult.result.value.cards.length);
    console.log('First 6 products color dots:');
    evalResult.result.value.cards.slice(0, 6).forEach(c => {
        console.log(`  - ${c.name}: ${c.dotCount} dots [${c.dots.join(', ')}]`);
    });


    // Screenshot reassurance section
    await send('Runtime.evaluate', { expression: `document.getElementById('whyBuy').scrollIntoView();` });
    await sleep(800);
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    if (shot2?.data) {
        fs.writeFileSync('C:\\Users\\adhil\\.gemini\\antigravity-ide\\brain\\e0e2655b-85c1-4aab-bdc2-94b581efd2d4\\.tempmediaStorage\\reassurance_icons.png', Buffer.from(shot2.data, 'base64'));
        console.log('Saved reassurance_icons.png');
    }

    // Screenshot contact section
    await send('Runtime.evaluate', { expression: `
        document.getElementById('kontak').scrollIntoView();
        if (window.AOS) window.AOS.refreshHard();
        document.querySelectorAll('[data-aos]').forEach(el => {
            el.classList.add('aos-animate');
            el.style.opacity = '1';
            el.style.transform = 'none';
        });
    ` });
    await sleep(600);
    const shot3 = await send('Page.captureScreenshot', { format: 'png' });
    if (shot3?.data) {
        fs.writeFileSync('C:\\Users\\adhil\\.gemini\\antigravity-ide\\brain\\e0e2655b-85c1-4aab-bdc2-94b581efd2d4\\.tempmediaStorage\\contact_icons.png', Buffer.from(shot3.data, 'base64'));
        console.log('Saved contact_icons.png');
    }

    ws.close();
    chrome.kill();
}

run().catch(err => {
    console.error(err);
    chrome.kill();
});
