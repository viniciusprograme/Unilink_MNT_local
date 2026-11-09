// ==========================================================
// SERVIÇO: chamados
// ----------------------------------------------------------
// Todo acesso a dados passa pela API própria (/api). O banco
// (PostgreSQL local) nunca é acessado direto pelo navegador.
//
// Autenticado: abrir chamado e associá-lo ao solicitante, consultar
// os próprios chamados em aberto, assumir, concluir e mudar status.
// A consulta pública por protocolo continua disponível para acompanhamento.
// anexar fotos no atendimento/resolução e tudo de administração.
// ==========================================================

const TIPOS_MIME_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const EXTENSOES_PERMITIDAS = ['jpg', 'jpeg', 'png', 'webp'];
const TAMANHO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB (a API valida de novo no servidor)
const INTERVALO_ATUALIZACAO_MS = 10000;

const ChamadosService = {
    // ---------- atualização da lista (polling no lugar do Realtime) ----------
    _assinantes: new Set(),
    _timer: null,

    async _atualizarAssinantes() {
        if (this._assinantes.size === 0) return;
        const lista = await this.listarChamados();
        this._assinantes.forEach(fn => { try { fn(lista); } catch (e) { console.warn(e); } });
    },
    _iniciarTimer() {
        if (this._timer) return;
        this._timer = setInterval(() => {
            if (!document.hidden) this._atualizarAssinantes();
        }, INTERVALO_ATUALIZACAO_MS);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this._atualizarAssinantes(); });
        // ao logar/deslogar, recarrega na hora
        supabase.auth.onAuthStateChange(() => this._atualizarAssinantes());
    },

    /** Mantém a mesma assinatura de antes: recebe callback, devolve função de cancelar. */
    assinarChamados(onChange) {
        this._assinantes.add(onChange);
        this._iniciarTimer();
        this.listarChamados().then(onChange);
        return () => this._assinantes.delete(onChange);
    },

    /** Adapta uma linha do Postgres (snake_case) para o formato camelCase usado nas telas. */
    _mapearChamado(c) {
        return {
            idFirebase: c.id,
            id: new Date(c.data_abertura).getTime(),
            protocolo: c.protocolo,
            status: c.status || (c.concluido ? 'FECHADO' : c.em_atendimento ? 'EM_ATENDIMENTO' : 'ABERTO'),
            unidade: c.unidade,
            prioridade: c.prioridade,
            equipamento: c.equipamento,
            servico: c.servico,
            descricao: c.descricao,
            localizacao: c.localizacao,
            emAtendimento: c.em_atendimento || c.status === 'EM_ATENDIMENTO',
            concluido: c.concluido || ['RESOLVIDO', 'FECHADO'].includes(c.status),
            servicoFeito: c.servico_feito,
            pendencia: c.pendencia,
            observacoes: c.observacoes || '',
            itensConcluidos: c.itens_concluidos || [],
            conclusaoParcial: !!c.conclusao_parcial,
            dataAbertura: formatarDataBR(c.data_abertura),
            dataEncerramento: c.data_encerramento ? formatarDataBR(c.data_encerramento) : '-',
            atualizadoEm: c.atualizado_em ? formatarDataBR(c.atualizado_em) : null,
            atribuidoPara: c.atribuido_para || null,
            atribuidoParaNome: c.atribuido_para_nome || null,
            atribuidoEm: c.atribuido_em ? formatarDataBR(c.atribuido_em) : null,
            criadoPor: c.criado_por || null,
            encerradoPor: c.encerrado_por || null
        };
    },

    /** Lista completa: exige login. Sem sessão devolve [] (solicitante não vê a fila). */
    async listarChamados() {
        if (!_lerToken()) return [];
        try {
            const data = await ApiClient.get('/chamados');
            return (data.chamados || []).map(c => this._mapearChamado(c));
        } catch (error) {
            if (error.status === 401 || error.status === 403) return [];
            console.error('Erro ao listar chamados:', error);
            window.notifyError && window.notifyError('Falha ao carregar chamados. Verifique a conexão.');
            if (window.UnilinkLogger) window.UnilinkLogger.error('listarChamados', error);
            return [];
        }
    },

    /** Abre um chamado autenticado e associa a autoria ao usuário da sessão. */
    async criarChamado(novoChamado) {
        const r = await ApiClient.publico('POST', '/chamados', {
            unidade: novoChamado.unidade,
            prioridade: novoChamado.prioridade,
            equipamento: novoChamado.equipamento,
            servico: novoChamado.servico,
            descricao: novoChamado.descricao,
            localizacao: novoChamado.localizacao
        });
        if (!r.ok) {
            console.error('Erro ao criar chamado:', r.body);
            window.notifyError && window.notifyError(r.body.mensagem || 'Não foi possível abrir o chamado.');
            throw new Error(r.body.mensagem || 'Não foi possível abrir o chamado.');
        }
        const chamado = this._mapearChamado(r.body.chamado);
        this._atualizarAssinantes();
        return chamado;
    },

    /** Chamados abertos pelo usuário autenticado; a API filtra pelo dono e exclui encerrados. */
    async listarMeusChamadosAbertos() {
        if (!_lerToken()) return [];
        const data = await ApiClient.get('/meus-chamados/abertos');
        return (data.chamados || []).map(c => this._mapearChamado(c));
    },

    /** Acompanhamento público por protocolo. */
    async buscarPorProtocolo(protocolo) {
        const r = await ApiClient.publico('GET', `/chamados/protocolo/${encodeURIComponent(protocolo.trim().toUpperCase())}`);
        if (r.status === 404) {
            window.notifyWarning && window.notifyWarning('Protocolo não encontrado');
            return null;
        }
        if (!r.ok) {
            window.notifyError && window.notifyError('Erro ao buscar protocolo. Tente novamente.');
            throw new Error(r.body.mensagem || 'Erro ao buscar protocolo.');
        }
        return this._mapearChamado(r.body.chamado);
    },

    // ---------- status / atribuição / observação ----------
    async atualizarStatus(chamado, novoStatus, observacao) {
        await ApiClient.patch(`/chamados/${chamado.idFirebase}/status`, { status: novoStatus, observacao });
        this._atualizarAssinantes();
    },
    async atribuirChamado(chamado, atribuidoPara) {
        await ApiClient.patch(`/chamados/${chamado.idFirebase}/atribuir`, { atribuidoPara });
        this._atualizarAssinantes();
    },
    async adicionarObservacao(chamadoId, texto) {
        await ApiClient.post(`/chamados/${chamadoId}/observacao`, { texto });
    },
    async listarHistoricoStatus(chamadoId) {
        const r = await ApiClient.publico('GET', `/chamados/${chamadoId}/historico-status`);
        if (!r.ok) { console.error('Erro ao listar histórico de status:', r.body); return []; }
        return (r.body.historico || []).map(h => ({
            id: h.id, statusAnterior: h.status_anterior, statusNovo: h.status_novo,
            usuarioNome: h.usuario_nome, criadoEm: formatarDataBR(h.criado_em)
        }));
    },

    /** Alterna "em atendimento" (usado por App.js). */
    async toggleAtendimento(chamado) {
        const novoValor = !chamado.emAtendimento;
        await this.atualizarStatus(chamado, novoValor ? 'EM_ATENDIMENTO' : 'ABERTO');
    },

    /** Assumir: agora exige login (a API grava quem assumiu). */
    async assumirChamado(chamado) {
        const res = await ApiClient.patch(`/chamados/${chamado.idFirebase}/assumir`);
        this._atualizarAssinantes();
        return res;
    },

    /** Concluir (parcial ou total) com rastreabilidade. */
    async concluirChamado(chamado, { itensConcluidos, servicoFeito, pendencia, observacoes }) {
        const res = await ApiClient.patch(`/chamados/${chamado.idFirebase}/concluir`, {
            itensConcluidos: itensConcluidos || [],
            servicoFeito, pendencia, observacoes
        });
        this._atualizarAssinantes();
        return res;
    },

    /** Encerramento direto (usado por App.js). */
    async encerrarChamado(chamado, servicoFeito, pendencia) {
        await ApiClient.patch(`/chamados/${chamado.idFirebase}/encerrar`, {
            servicoFeito: (servicoFeito || '').trim() || 'NENHUM',
            pendencia: (pendencia || '').trim() || 'NENHUMA'
        });
        this._atualizarAssinantes();
    },

    // ---------- timeline ----------
    /** Só usuários logados registram eventos manuais; falha silenciosa para não travar o fluxo. */
    async registrarEvento(chamadoId, tipoEvento, descricao) {
        if (!_lerToken()) return;
        try { await ApiClient.post(`/chamados/${chamadoId}/eventos`, { tipoEvento, descricao }); }
        catch (e) { console.error('Erro ao registrar evento (não bloqueante):', e); }
    },

    async listarEventos(chamadoId) {
        const r = await ApiClient.publico('GET', `/chamados/${chamadoId}/eventos`);
        if (!r.ok) { console.error('Erro ao listar eventos:', r.body); return []; }
        return (r.body.eventos || []).map(e => ({
            id: e.id, tipoEvento: e.tipo_evento, descricao: e.descricao,
            usuarioNome: e.usuario_nome, criadoEm: formatarDataBR(e.criado_em)
        }));
    },

    // ---------- evidências ----------
    _validarArquivoEvidencia(file) {
        const extensao = (file.name.split('.').pop() || '').toLowerCase();
        if (!EXTENSOES_PERMITIDAS.includes(extensao)) {
            const msg = `Formato ".${extensao}" não permitido. Use JPG, PNG ou WEBP.`;
            window.notifyWarning && window.notifyWarning(msg);
            throw new Error(msg);
        }
        if (!TIPOS_MIME_PERMITIDOS.includes(file.type)) {
            const msg = 'Arquivo inválido: apenas JPG, PNG ou WEBP são aceitos.';
            window.notifyWarning && window.notifyWarning(msg);
            throw new Error(msg);
        }
        if (file.size > TAMANHO_MAX_BYTES) {
            const msg = `Arquivo "${file.name}" excede 8MB e foi ignorado.`;
            window.notifyWarning && window.notifyWarning(msg);
            throw new Error('Arquivo muito grande: o limite é 8MB por foto.');
        }
    },

    /** Envia a foto para a API (multipart). ABERTURA é permitido sem login, o resto exige sessão. */
    async uploadEvidencia(chamadoId, file, etapa = 'ABERTURA') {
        this._validarArquivoEvidencia(file);
        const form = new FormData();
        form.append('etapa', etapa);
        form.append('arquivo', file, file.name);
        const headers = {};
        const token = _lerToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        let resp;
        try {
            resp = await fetch(`${API_BASE_URL}/chamados/${chamadoId}/evidencias`, { method: 'POST', headers, body: form });
        } catch (e) {
            const msg = 'Não foi possível enviar a foto. Verifique a conexão.';
            window.notifyError && window.notifyError(msg);
            throw new Error(msg);
        }
        if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            const msg = body.mensagem || 'Não foi possível enviar a foto.';
            window.notifyError && window.notifyError(msg);
            throw new Error(msg);
        }
    },

    /** Lista evidências; a URL aponta para a API (que serve o arquivo do volume). */
    async listarEvidencias(chamadoId) {
        const r = await ApiClient.publico('GET', `/chamados/${chamadoId}/evidencias`);
        if (!r.ok) { console.error('Erro ao listar evidências:', r.body); return []; }
        return (r.body.evidencias || []).map(ev => ({
            id: ev.id,
            nomeArquivo: ev.nome_arquivo,
            etapa: ev.etapa,
            enviadoPorNome: ev.enviado_por_nome,
            criadoEm: formatarDataBR(ev.criado_em),
            url: `${API_BASE_URL}/evidencias/${ev.id}/arquivo`
        }));
    },

    // ---------- perfil / sessão ----------
    async obterMeuPerfil() {
        try {
            return await ApiClient.get('/meu-perfil');
        } catch (e) {
            if (e?.status === 401 || e?.status === 403) throw e;
            console.warn('Erro ao obter perfil do usuário:', e?.message || e);
            return null;
        }
    },

    async logout() {
        await supabase.auth.signOut();
    }
};

function formatarDataBR(isoString) {
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ==========================================================
// CLIENTE DA API PRÓPRIA
// ==========================================================
const ApiClient = {
    /** Chamada sem exigir login (envia o token se existir, sem falhar se não houver). */
    async publico(metodo, caminho, corpo) {
        const headers = {};
        if (corpo) headers['Content-Type'] = 'application/json';
        const token = _lerToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        let resp;
        try {
            resp = await fetch(`${API_BASE_URL}${caminho}`, { method: metodo, headers, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
        } catch (e) {
            console.warn(`Falha de rede ao chamar API ${caminho}:`, e?.message || e);
            return { ok: false, status: 0, body: { mensagem: 'Não foi possível conectar ao sistema. Verifique a conexão.' } };
        }
        const body = await resp.json().catch(() => ({}));
        return { ok: resp.ok, status: resp.status, body };
    },

    async _autenticado(metodo, caminho, corpo, tentouRefresh = false) {
        const token = _lerToken();
        if (!token) {
            const erro = new Error('Sessão expirada. Faça login novamente.');
            erro.status = 401;
            throw erro;
        }
        let resp;
        try {
            resp = await fetch(`${API_BASE_URL}${caminho}`, {
                method: metodo,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                ...(corpo ? { body: JSON.stringify(corpo) } : {})
            });
        } catch (e) {
            console.warn(`Falha de rede ao chamar API ${caminho}:`, e?.message || e);
            throw new Error('Não foi possível conectar ao sistema. Verifique se o serviço está no ar.');
        }
        if (!resp.ok) {
            const erroBody = await resp.json().catch(() => ({}));
            const msg = erroBody.mensagem || `Erro na API (${resp.status})`;
            if (resp.status === 401 && !tentouRefresh) {
                const { data } = await supabase.auth.refreshSession();
                if (data?.session) return this._autenticado(metodo, caminho, corpo, true);
                await supabase.auth.signOut();
            }
            const erro = new Error(msg);
            erro.status = resp.status;
            throw erro;
        }
        return resp.json();
    },

    patch(caminho, corpo) { return this._autenticado('PATCH', caminho, corpo); },
    put(caminho, corpo) { return this._autenticado('PUT', caminho, corpo); },
    post(caminho, corpo) { return this._autenticado('POST', caminho, corpo); },
    get(caminho) { return this._autenticado('GET', caminho, null); },
    del(caminho) { return this._autenticado('DELETE', caminho, null); }
};
