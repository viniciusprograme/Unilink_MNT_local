// ==========================================================
// UNILINK Frontend Logger — captura erros no browser
// - Salva em localStorage (unilink_logs) — visível no VS Code via Application
// - Envia para API POST /logs/frontend (api/logs/app.log) quando possível
// - Expõe window.UnilinkLogger.export() para extração
// ==========================================================
(function () {
    const STORAGE_KEY = 'unilink_logs';
    const MAX_ENTRIES = 500;
    function getApiUrl() {
        const base = (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : (window.API_BASE_URL || '/api'));
        return base + '/logs/frontend';
    }

    function now() { return new Date().toISOString(); }

    function load() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (_) { return []; }
    }
    function save(entries) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))); } catch (_) {}
    }

    let isPersisting = false;
    function persist(level, message, meta) {
        if (isPersisting) return;
        isPersisting = true;
        try {
            const entry = { ts: now(), level, message, meta: meta || null, url: location.href, ua: navigator.userAgent };
            const entries = load();
            entries.push(entry);
            save(entries);
            // tenta enviar ao backend (best-effort, sem bloquear, sem recursão)
            try {
                if (navigator.onLine) {
                    // usa fetch nativo sem passar pelo logger
                    const url = getApiUrl();
                    // não loga falha de /logs/frontend para evitar cascata
                    if (url.includes('/logs/frontend')) {
                        fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ level, message, meta: entry })
                        }).catch(() => {});
                    }
                }
            } catch (_) {}
        } finally {
            isPersisting = false;
        }
    }

    function fmt(args) {
        return args.map(a => {
            if (a instanceof Error) return a.message + '\n' + (a.stack || '');
            if (typeof a === 'object') try { return JSON.stringify(a); } catch (_) { return String(a); }
            return String(a);
        }).join(' ');
    }

    const Logger = {
        info: (...args) => { const m = fmt(args); console.log('[INFO]', m); persist('info', m); },
        warn: (...args) => { const m = fmt(args); console.warn('[WARN]', m); persist('warn', m); },
        error: (...args) => { const m = fmt(args); console.error('[ERROR]', m); persist('error', m); },
        // extração
        getAll: load,
        clear: () => { localStorage.removeItem(STORAGE_KEY); console.log('UnilinkLogger: logs limpos'); },
        exportJSON: () => {
            const data = JSON.stringify(load(), null, 2);
            download(`unilink-frontend-${today()}.json`, data, 'application/json');
        },
        exportLog: () => {
            const lines = load().map(e => `[${e.ts}] [${e.level.toUpperCase()}] ${e.message} ${e.meta ? '| ' + JSON.stringify(e.meta) : ''}`).join('\n');
            download(`unilink-frontend-${today()}.log`, lines, 'text/plain');
        },
        // alias compatível com documentação
        export: function() { this.exportLog(); }
    };

    function today() { return new Date().toISOString().slice(0, 10); }
    function download(name, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Captura global
    window.addEventListener('error', (ev) => {
        // "Script error." sem filename/lineno é erro opaco de CDN (CORS) — sem ação possível, não polui o backend
        if ((ev.message === 'Script error.' || !ev.message) && !ev.filename && !ev.lineno) return;
        persist('error', `window.onerror: ${ev.message}`, { filename: ev.filename, lineno: ev.lineno, colno: ev.colno, error: ev.error && ev.error.stack });
    });
    window.addEventListener('unhandledrejection', (ev) => {
        const reason = ev.reason instanceof Error ? ev.reason.stack : String(ev.reason);
        persist('error', `unhandledrejection: ${reason}`, { type: 'unhandledrejection' });
    });

    // Intercepta console.error para persistir também (com guard para não recursar)
    const origError = console.error;
    console.error = function (...args) {
        if (!isPersisting) {
            try { persist('error', fmt(args)); } catch (_) {}
        }
        return origError.apply(console, args);
    };

    window.UnilinkLogger = Logger;
    console.log('UnilinkLogger pronto. Use UnilinkLogger.exportLog() / exportJSON() / clear() no console. Logs em localStorage e em api/logs/app.log via API.');
})();
