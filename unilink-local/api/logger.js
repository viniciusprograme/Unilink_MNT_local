// ==========================================================
// UNILINK Logger — arquivo central de logs (backend)
// - Escreve em api/logs/app.log (todos) e api/logs/error.log (só erros)
// - Saída dupla: console + arquivo (visível no VS Code)
// - Rotação simples: se > 5MB, renomeia para .1
// ==========================================================
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const APP_LOG = path.join(LOG_DIR, 'app.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function ensureDir() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}
ensureDir();

function rotateIfNeeded(file) {
    try {
        if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
            const rotated = file + '.1';
            if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
            fs.renameSync(file, rotated);
        }
    } catch (_) {}
}

function timestamp() {
    return new Date().toISOString();
}

function format(level, msg, meta) {
    const base = `[${timestamp()}] [${level.toUpperCase()}] ${msg}`;
    if (meta !== undefined) {
        try {
            const extra = typeof meta === 'string' ? meta : JSON.stringify(meta);
            return `${base} | ${extra}\n`;
        } catch (_) {
            return `${base} | [unserializable meta]\n`;
        }
    }
    return `${base}\n`;
}

function write(file, line) {
    rotateIfNeeded(file);
    try { fs.appendFileSync(file, line); } catch (_) {}
}

function log(level, msg, meta) {
    const line = format(level, msg, meta);
    write(APP_LOG, line);
    if (level === 'error') write(ERROR_LOG, line);
    // console duplo para VS Code Output
    if (level === 'error') console.error(line.trim());
    else if (level === 'warn') console.warn(line.trim());
    else console.log(line.trim());
}

module.exports = {
    LOG_DIR,
    APP_LOG,
    ERROR_LOG,
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    http: (msg, meta) => log('http', msg, meta),
    // middleware de request
    requestLogger: (req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const ms = Date.now() - start;
            const msg = `${req.method} ${req.originalUrl} ${res.statusCode} - ${ms}ms - ${req.ip}`;
            if (res.statusCode >= 500) log('error', msg);
            else if (res.statusCode >= 400) log('warn', msg);
            else log('http', msg);
        });
        next();
    }
};
