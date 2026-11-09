// TELA: Administração — gerenciar (esquerda) + usuários/movimentos (direita).
// Só administrador (a API retorna 403 aos demais). Senhas sempre definidas
// pelo admin; o 1º acesso do usuário exige criar a própria senha.
function TelaAdmin({ onAbrirGerenciar }) {
    const [usuarios, setUsuarios] = React.useState([]);
    const [carregando, setCarregando] = React.useState(true);
    const [semAcesso, setSemAcesso] = React.useState(false);
    const [agindoId, setAgindoId] = React.useState(null);
    const [confirmExcluir, setConfirmExcluir] = React.useState(null);

    // criar usuário
    const [novoUsuario, setNovoUsuario] = React.useState('');
    const [novaSenha, setNovaSenha] = React.useState('');
    const [novoPapel, setNovoPapel] = React.useState('atendente');
    const [criando, setCriando] = React.useState(false);
    const [erroCriacao, setErroCriacao] = React.useState('');
    const [credencial, setCredencial] = React.useState(null);

    // redefinir senha
    const [resetId, setResetId] = React.useState('');
    const [resetSenha, setResetSenha] = React.useState('');
    const [resetando, setResetando] = React.useState(false);

    // direita: usuarios | movimentos
    const [aba, setAba] = React.useState('usuarios'); // usuarios | movimentos
    const [busca, setBusca] = React.useState('');
    const [filtroPapel, setFiltroPapel] = React.useState('TODOS');
    const [filtroData, setFiltroData] = React.useState('TODOS'); // TODOS | HOJE | 7d | 30d
    const [movimentos, setMovimentos] = React.useState([]);
    const [carregandoMov, setCarregandoMov] = React.useState(false);

    const erroAdmin = (e) => {
        const msg = (e && e.message) || 'Falha na operação.';
        if (/restrito|administrador|\(403\)/i.test(msg)) { setSemAcesso(true); return 'Acesso restrito ao administrador.'; }
        return msg;
    };

    const carregarUsuarios = async () => {
        setCarregando(true); setSemAcesso(false);
        try {
            const res = await ApiClient.get('/admin/usuarios');
            setUsuarios(res.usuarios || []);
        } catch (e) {
            window.notifyError && window.notifyError(erroAdmin(e));
        } finally { setCarregando(false); }
    };
    React.useEffect(() => { carregarUsuarios(); }, []);

    const carregarMovimentos = async () => {
        setCarregandoMov(true);
        try {
            const res = await ApiClient.get('/admin/movimentos?limite=200');
            setMovimentos(res.movimentos || []);
        } catch (e) {
            window.notifyError && window.notifyError(erroAdmin(e));
        } finally { setCarregandoMov(false); }
    };
    React.useEffect(() => { if (aba === 'movimentos') carregarMovimentos(); }, [aba]);

    const gerarSenhaTemporaria = (tam = 12) => {
        const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
        const numeros = '23456789';
        const chars = letras + numeros;
        const buf = new Uint32Array(tam);
        window.crypto.getRandomValues(buf);
        const senha = Array.from(buf, (n) => chars[n % chars.length]);
        senha[0] = letras[buf[0] % letras.length];
        senha[1] = numeros[buf[1] % numeros.length];
        return senha.join('');
    };

    const copiar = async (texto) => {
        try {
            await navigator.clipboard.writeText(texto);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = texto;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        window.notifySuccess && window.notifySuccess('Senha copiada.');
    };

    const usuarioValido = /^[a-z0-9._-]{3,40}$/.test(novoUsuario.trim());
    const senhaValida = novaSenha.length >= 8;

    const handleCriar = async (e) => {
        e.preventDefault();
        if (criando) return;

        const u = novoUsuario.trim();
        const usuarioNormalizado = u.toLowerCase();

        if (!/^[a-z0-9._-]{3,40}$/.test(u)) {
            const msg = 'Usuário inválido: use 3–40 letras minúsculas, números, ponto, _ ou -.';
            setErroCriacao(msg);
            window.notifyWarning && window.notifyWarning(msg);
            return;
        }
        if (novaSenha.length < 8) {
            const msg = 'Senha inicial deve ter pelo menos 8 caracteres.';
            setErroCriacao(msg);
            window.notifyWarning && window.notifyWarning(msg);
            return;
        }

        setCriando(true);
        setErroCriacao('');
        const senhaCriada = novaSenha;
        try {
            await ApiClient.post('/admin/usuarios', { usuario: usuarioNormalizado, papel: novoPapel, senha: senhaCriada });
            window.notifySuccess && window.notifySuccess(`Usuário "${usuarioNormalizado}" criado. Troca exigida no 1º acesso.`);
            setCredencial({ usuario: usuarioNormalizado, senha: senhaCriada });
            setNovoUsuario(''); setNovaSenha(''); setErroCriacao('');
            await carregarUsuarios();
        } catch (err) {
            const msg = erroAdmin(err);
            setErroCriacao(msg);
            window.notifyError && window.notifyError(msg);
        } finally { setCriando(false); }
    };

    const handleReset = async (e) => {
        e.preventDefault();
        if (!resetId) { window.notifyWarning && window.notifyWarning('Escolha o usuário.'); return; }
        if (resetSenha.length < 8) { window.notifyWarning && window.notifyWarning('A nova senha deve ter pelo menos 8 caracteres.'); return; }
        const alvo = usuarios.find((x) => x.id === resetId);
        setResetando(true);
        try {
            await ApiClient.post(`/admin/usuarios/${resetId}/reset-senha`, { novaSenha: resetSenha });
            window.notifySuccess && window.notifySuccess(`Senha de "${alvo ? alvo.usuario : ''}" redefinida. Troca exigida no próximo acesso.`);
            setResetSenha('');
            carregarUsuarios();
        } catch (err) { window.notifyError && window.notifyError(erroAdmin(err)); }
        finally { setResetando(false); }
    };

    const handleExcluir = async (id) => {
        setAgindoId(id);
        try {
            await ApiClient.del(`/admin/usuarios/${id}`);
            window.notifySuccess && window.notifySuccess('Usuário excluído.');
            setConfirmExcluir(null);
            if (resetId === id) setResetId('');
            carregarUsuarios();
        } catch (err) { window.notifyError && window.notifyError(erroAdmin(err)); }
        finally { setAgindoId(null); }
    };

    const abrirDetalheUsuario = () => { if (onAbrirGerenciar) onAbrirGerenciar(); };

    const verMovimentosDe = (u) => {
        setBusca(u.usuario); setFiltroData('TODOS'); setAba('movimentos');
    };

    const chipPapel = (papel) => {
        const cor = papel === 'administrador'
            ? 'bg-[#0E3263]/10 text-[#0E3263] dark:bg-sky-400/10 dark:text-sky-300'
            : papel === 'supervisor'
                ? 'bg-[#B9770E]/10 text-[#B9770E]'
                : 'bg-slate-500/10 text-slate-500 dark:text-slate-400';
        return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${cor}`}>{papel}</span>;
    };

    const qBusca = busca.trim().toLowerCase();
    const usuariosFiltrados = usuarios.filter((u) => {
        if (filtroPapel !== 'TODOS' && u.papel !== filtroPapel) return false;
        if (qBusca && !(u.usuario || '').toLowerCase().includes(qBusca)) return false;
        return true;
    });

    const inicioPeriodo = (() => {
        if (filtroData === 'HOJE') { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
        if (filtroData === '7d') return new Date(Date.now() - 7 * 864e5);
        if (filtroData === '30d') return new Date(Date.now() - 30 * 864e5);
        return null;
    })();
    const movimentosFiltrados = movimentos.filter((m) => {
        if (inicioPeriodo && new Date(m.criado_em) < inicioPeriodo) return false;
        if (qBusca) {
            const quem = `${m.usuario_nome || ''} ${m.feito_por_nome || ''} ${m.alvo_usuario_nome || ''}`.toLowerCase();
            if (!quem.includes(qBusca)) return false;
        }
        return true;
    });

    const textoMovimento = (m) => {
        if (m.origem === 'admin') return `${m.acao} → ${m.alvo_usuario_nome || '-'}${m.detalhe ? ` (${m.detalhe})` : ''}`;
        if (m.origem === 'status') return `status ${m.status_anterior || '—'} → ${m.status_novo}`;
        return `${m.tipo_evento}: ${m.descricao || ''}`;
    };
    const quemMovimento = (m) => m.usuario_nome || m.feito_por_nome || '—';
    const filtrosAtivos = (filtroPapel !== 'TODOS' ? 1 : 0) + (filtroData !== 'TODOS' ? 1 : 0) + (qBusca ? 1 : 0);
    const limparFiltros = () => { setFiltroPapel('TODOS'); setFiltroData('TODOS'); setBusca(''); };

    if (semAcesso) {
        return (
            <div className="w-full">
                <PageHeader title="Administração" />
                <div className="u-surface"><EmptyState numero="!" title="Acesso restrito ao administrador." /></div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <PageHeader title="Administração" meta={`${usuarios.length} usuários`} />

            <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="grid gap-4">
                    <section className="u-surface p-4">
                        <SectionTitle>Novo usuário</SectionTitle>
                        <form onSubmit={handleCriar} className="mt-2 space-y-2.5">
                            <div>
                                <label className="u-label">Usuário</label>
                                <input
                                    type="text"
                                    placeholder="ex.: joao"
                                    aria-label="Novo usuário"
                                    aria-invalid={!!(novoUsuario.trim() && !usuarioValido)}
                                    className={`u-input ${novoUsuario.trim() && !usuarioValido ? '!border-red-500' : ''}`}
                                    value={novoUsuario}
                                    onChange={(e) => {
                                        setNovoUsuario(e.target.value);
                                        if (erroCriacao) setErroCriacao('');
                                    }}
                                />
                                <p className={`mt-1 text-xs ${novoUsuario.trim().length > 0 ? (usuarioValido ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : 'text-slate-500 dark:text-slate-400'}`}>
                                    {novoUsuario.trim().length === 0
                                        ? '3 a 40 caracteres: a-z, 0-9, ponto, _ ou -'
                                        : usuarioValido
                                            ? '✓ Nome de usuário atende às regras.'
                                            : '3 a 40 caracteres: a-z, 0-9, ponto, _ ou -'}
                                </p>
                            </div>
                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <label className="u-label mb-0">Senha inicial</label>
                                    <button type="button" onClick={() => setNovaSenha(gerarSenhaTemporaria())} className="text-xs font-medium text-[#0E3263] underline underline-offset-2 hover:text-[#0A2447] dark:text-sky-300 dark:hover:text-sky-200">
                                        Gerar senha
                                    </button>
                                </div>
                                <CampoSenha
                                    minLength="8"
                                    autoComplete="new-password"
                                    aria-label="Senha inicial"
                                    aria-invalid={!!(novaSenha && !senhaValida)}
                                    value={novaSenha}
                                    onChange={(e) => {
                                        setNovaSenha(e.target.value);
                                        if (erroCriacao) setErroCriacao('');
                                    }}
                                />
                                <p className={`mt-1 text-xs ${novaSenha.length > 0 ? (senhaValida ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : 'text-slate-500 dark:text-slate-400'}`}>
                                    {novaSenha.length === 0
                                        ? 'Mínimo de 8 caracteres.'
                                        : senhaValida
                                            ? '✓ Tamanho mínimo atingido.'
                                            : `${novaSenha.length}/8 caracteres`}
                                </p>
                            </div>
                            <div>
                                <label className="u-label">Cargo</label>
                                <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} aria-label="Cargo" className="u-input">
                                    <option value="solicitante">Solicitante</option>
                                    <option value="atendente">Atendente</option>
                                    <option value="supervisor">Supervisor</option>
                                    <option value="administrador">Administrador</option>
                                </select>
                            </div>
                            {erroCriacao && (
                                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                                    {erroCriacao}
                                </div>
                            )}
                            {credencial && (
                                <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                                    <p className="font-medium">Senha temporária de "{credencial.usuario}"</p>
                                    <p className="mt-1 text-xs">Anote ou copie agora: ela não será exibida novamente. O usuário será obrigado a trocá-la no 1º acesso.</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <code className="rounded bg-white px-2 py-1 font-mono text-sm dark:bg-slate-900">{credencial.senha}</code>
                                        <button type="button" onClick={() => copiar(credencial.senha)} className="btn-ghost !min-h-[28px] !px-2 !py-0.5 !text-xs">Copiar</button>
                                        <button type="button" onClick={() => setCredencial(null)} className="btn-ghost !min-h-[28px] !px-2 !py-0.5 !text-xs">Dispensar</button>
                                    </div>
                                </div>
                            )}
                            <button type="submit" disabled={criando || !usuarioValido || !senhaValida} className="btn-primary w-full !justify-center disabled:cursor-not-allowed disabled:opacity-60">{criando ? 'Criando…' : 'Criar usuário'}</button>
                        </form>
                    </section>

                    <section className="u-surface p-4">
                        <SectionTitle>Redefinir senha</SectionTitle>
                        <form onSubmit={handleReset} className="mt-2 space-y-2.5">
                            <div>
                                <label className="u-label">Usuário</label>
                                <select value={resetId} onChange={(e) => setResetId(e.target.value)} aria-label="Usuário" className="u-input">
                                    <option value="">Escolha…</option>
                                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.usuario} ({u.papel})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="u-label">Nova senha</label>
                                <CampoSenha minLength="8" autoComplete="new-password" aria-label="Nova senha" value={resetSenha} onChange={(e) => setResetSenha(e.target.value)} />
                            </div>
                            <button type="submit" disabled={resetando} className="btn-ghost w-full !justify-center disabled:opacity-60">{resetando ? 'Aplicando…' : 'Aplicar nova senha'}</button>
                        </form>
                    </section>
                </div>

                <div className="min-w-0">
                    <div className="u-surface mb-2 flex flex-col gap-2 p-2 sm:flex-row">
                        <div className="grid shrink-0 grid-cols-2 gap-1 rounded-md bg-slate-200/60 p-1 dark:bg-slate-800" role="tablist" aria-label="Administração">
                            {[['usuarios', 'Usuários'], ['movimentos', 'Movimentos']].map(([v, l]) => (
                                <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)} className={`rounded px-2.5 py-1.5 text-xs transition ${aba === v ? 'bg-white font-medium text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
                                    {l}
                                </button>
                            ))}
                        </div>
                        <input type="text" placeholder="Pesquisar por atendente…" aria-label="Pesquisar" className="u-input flex-1" value={busca} onChange={(e) => setBusca(e.target.value)} />
                    </div>
                    <div className="u-surface mb-4 flex flex-col gap-2 p-2 sm:flex-row sm:flex-wrap">
                        <select value={filtroPapel} onChange={(e) => setFiltroPapel(e.target.value)} aria-label="Cargo" className="u-input sm:max-w-[170px]">
                            <option value="TODOS">Cargo: todos</option>
                            <option value="solicitante">Solicitante</option>
                            <option value="atendente">Atendente</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="administrador">Administrador</option>
                        </select>
                        <select value={filtroData} onChange={(e) => setFiltroData(e.target.value)} aria-label="Data do movimento" className="u-input sm:max-w-[190px]">
                            <option value="TODOS">Data: tudo</option>
                            <option value="HOJE">Hoje</option>
                            <option value="7d">Últimos 7 dias</option>
                            <option value="30d">Últimos 30 dias</option>
                        </select>
                        {filtrosAtivos > 0 && (
                            <button onClick={limparFiltros} className="shrink-0 px-2 text-xs text-[#0E3263] underline underline-offset-2 hover:text-[#0A2447] dark:text-sky-300 dark:hover:text-sky-200">Limpar</button>
                        )}
                    </div>

                    {aba === 'usuarios' ? (
                        carregando ? (
                            <div className="u-surface"><EmptyState numero="…" title="Carregando usuários." /></div>
                        ) : usuariosFiltrados.length === 0 ? (
                            <div className="u-surface"><EmptyState numero="0" title="Nenhum usuário." action={filtrosAtivos > 0 ? <button onClick={limparFiltros} className="btn-ghost">Limpar filtros</button> : null} /></div>
                        ) : (
                            <ul className="u-surface divide-y u-divider max-h-[55vh] overflow-y-auto px-4">
                                {usuariosFiltrados.map((u) => (
                                    <li key={u.id} className="flex items-center gap-2 py-2">
                                        <button onClick={abrirDetalheUsuario} className="min-w-0 flex-1 truncate text-left text-[13px] leading-5" title={`Ver detalhes de ${u.usuario}`}>
                                            <span className="font-medium text-slate-900 hover:underline dark:text-slate-100">{u.usuario}</span>
                                            {u.precisaTrocarSenha && <span className="ml-2 rounded bg-[#B9770E]/10 px-1.5 py-0.5 text-[11px] text-[#B9770E]">troca pendente</span>}
                                            {u.bloqueado && <span className="ml-2 rounded bg-[#B3261E]/10 px-1.5 py-0.5 text-[11px] text-[#B3261E]">bloqueado</span>}
                                        </button>
                                        {chipPapel(u.papel)}
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            {confirmExcluir === u.id ? (
                                                <React.Fragment>
                                                    <button onClick={() => handleExcluir(u.id)} disabled={agindoId === u.id} className="btn-danger !min-h-[32px] !px-2.5 !py-1 !text-xs disabled:opacity-60">Confirmar</button>
                                                    <button onClick={() => setConfirmExcluir(null)} className="btn-ghost !min-h-[32px] !px-2.5 !py-1 !text-xs">Não</button>
                                                </React.Fragment>
                                            ) : (
                                                <button onClick={() => setConfirmExcluir(u.id)} className="btn-ghost !min-h-[32px] !px-2.5 !py-1 !text-xs">Excluir</button>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )
                    ) : (
                        carregandoMov ? (
                            <div className="u-surface"><EmptyState numero="…" title="Carregando movimentos." /></div>
                        ) : movimentosFiltrados.length === 0 ? (
                            <div className="u-surface"><EmptyState numero="0" title="Sem movimentos." action={filtrosAtivos > 0 ? <button onClick={limparFiltros} className="btn-ghost">Limpar filtros</button> : null} /></div>
                        ) : (
                            <ul className="u-surface divide-y u-divider max-h-[55vh] overflow-y-auto px-4">
                                {movimentosFiltrados.map((m) => (
                                    <li key={`${m.origem}-${m.id}`} className="flex items-center gap-2 py-2">
                                        <span className="w-24 shrink-0 font-mono text-[11px] tabular-nums text-slate-400">{formatarApenasData(formatarDataBR(m.criado_em))}</span>
                                        <p className="min-w-0 flex-1 truncate text-[13px] text-slate-700 dark:text-slate-200" title={textoMovimento(m)}>{textoMovimento(m)}</p>
                                        <span className="max-w-[140px] shrink-0 truncate text-right text-[11px] text-slate-400">{quemMovimento(m)}</span>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}