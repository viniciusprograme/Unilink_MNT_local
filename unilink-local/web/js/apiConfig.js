// ==========================================================
// CONFIGURAÇÃO DA API (substitui o antigo supabaseConfig.js)
// ----------------------------------------------------------
// O front fala SOMENTE com a API própria, no mesmo domínio:
// o nginx encaminha /api/* para o container "api".
// Não existe mais chave de banco no navegador.
//
// O objeto "supabase" abaixo é só um adaptador de compatibilidade:
// ele expõe os mesmos métodos que App.js, ModalLogin e
// TelaRedefinirSenha já usam (supabase.auth.*), mas por baixo
// chama /api/auth/*. Assim essas telas não precisam ser reescritas.
// ==========================================================

const API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL) || '/api';
if (typeof window !== 'undefined') window.API_BASE_URL = API_BASE_URL;

const _TOKEN_KEY = 'unilink_token';
const _authListeners = new Set();

function _lerToken() {
    try { return localStorage.getItem(_TOKEN_KEY); } catch (_) { return null; }
}
function _gravarToken(t) {
    try { if (t) localStorage.setItem(_TOKEN_KEY, t); else localStorage.removeItem(_TOKEN_KEY); } catch (_) {}
}
function _decodificarToken(t) {
    try {
        const partes = String(t || '').split('.');
        if (partes.length < 2) return null;
        const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
        return JSON.parse(atob(b64 + pad));
    } catch (_) { return null; }
}
function _sessaoAtual() {
    const t = _lerToken();
    if (!t) return null;
    const p = _decodificarToken(t);
    if (!p || (p.exp && p.exp * 1000 < Date.now())) { _gravarToken(null); return null; }
    return { access_token: t, user: { id: p.sub, email: p.email } };
}
function _emitirAuth(evento, sessao) {
    _authListeners.forEach(fn => { try { fn(evento, sessao); } catch (e) { console.warn('listener auth:', e); } });
}

if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === _TOKEN_KEY) {
            const s = _sessaoAtual();
            _emitirAuth(s ? 'SIGNED_IN' : 'SIGNED_OUT', s);
        }
    });
}

async function _postJson(caminho, corpo, token, metodo = 'POST') {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let resp;
    try {
        resp = await fetch(`${API_BASE_URL}${caminho}`, {
            method: metodo,
            headers,
            body: metodo === 'GET' ? undefined : JSON.stringify(corpo || {})
        });
    } catch (e) {
        return { ok: false, status: 0, body: { mensagem: 'Não foi possível conectar à API. Verifique se o sistema está no ar.' } };
    }
    const text = await resp.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { mensagem: text || 'Resposta inválida da API.' }; }
    return { ok: resp.ok, status: resp.status, body: json };
}

const supabase = {
    auth: {
        async getSession() {
            return { data: { session: _sessaoAtual() }, error: null };
        },
        onAuthStateChange(callback) {
            _authListeners.add(callback);
            return { data: { subscription: { unsubscribe: () => _authListeners.delete(callback) } } };
        },
        async signInWithPassword({ email, password }) {
            const r = await _postJson('/auth/login', { usuario: email, senha: password });
            if (!r.ok) {
                const msg = r.status === 401 ? 'Invalid login credentials' : (r.body.mensagem || 'Erro ao autenticar.');
                return { data: { session: null, user: null }, error: { message: msg, status: r.status } };
            }
            _gravarToken(r.body.access_token);
            const sessao = _sessaoAtual();
            _emitirAuth('SIGNED_IN', sessao);
            return { data: { session: sessao, user: sessao?.user || null }, error: null };
        },
        async signOut() {
            _gravarToken(null);
            _emitirAuth('SIGNED_OUT', null);
            return { error: null };
        },
        async updateUser({ password }) {
            const t = _lerToken();
            if (!t) return { data: null, error: { message: 'Sessão expirada. Faça login novamente.' } };
            const r = await _postJson('/auth/trocar-senha', { novaSenha: password }, t);
            if (!r.ok) return { data: null, error: { message: r.body.mensagem || 'Não foi possível alterar a senha.' } };
            return { data: { user: _sessaoAtual()?.user || null }, error: null };
        },
        async refreshSession() {
            const t = _lerToken();
            if (!t) return { data: { session: null }, error: { message: 'sem sessão' } };
            const r = await _postJson('/auth/refresh', {}, t);
            if (!r.ok) return { data: { session: null }, error: { message: r.body.mensagem || 'sessão inválida' } };
            _gravarToken(r.body.access_token);
            return { data: { session: _sessaoAtual() }, error: null };
        }
    }
};

if (typeof window !== 'undefined') {
    window.supabase = supabase;
    window.API_BASE_URL = API_BASE_URL;
}
