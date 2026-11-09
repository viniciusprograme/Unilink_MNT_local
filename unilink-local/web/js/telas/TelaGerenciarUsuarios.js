// TELA: Gerenciamento de Usuários — centro da gestão de contas.
// Criar usuário, alterar cargo, suspender/reativar, desbloquear,
// redefinir senha (com senha temporária + copiar), excluir e auditoria.
// A API continua sendo a autoridade das regras (validação aqui é só usabilidade).
function TelaGerenciarUsuarios({ onVoltar, onCriarUsuario, modo = 'lista' }) {
    const [usuarios, setUsuarios] = React.useState([]);
    const [carregando, setCarregando] = React.useState(true);
    const [busca, setBusca] = React.useState('');
    const [filtroPapel, setFiltroPapel] = React.useState('TODOS');
    const [filtroStatus, setFiltroStatus] = React.useState('TODOS');
    const [ordenarPor, setOrdenarPor] = React.useState('criadoEm_desc');
    const [pagina, setPagina] = React.useState(1);
    const [detalheId, setDetalheId] = React.useState(null);
    const [gruposDisponiveis, setGruposDisponiveis] = React.useState([]);
    const [gruposDetalhe, setGruposDetalhe] = React.useState([]);
    const [salvandoGrupos, setSalvandoGrupos] = React.useState(false);
    const [filtroGrupo, setFiltroGrupo] = React.useState('TODOS');
    const [auditoria, setAuditoria] = React.useState([]);
    const [carregandoAud, setCarregandoAud] = React.useState(false);
    const [aba, setAba] = React.useState('usuarios'); // usuarios | auditoria
    const ITEMS = 15;

    // criação
    const [mostrarCriar, setMostrarCriar] = React.useState(false);
    const modoCriar = modo === 'criar';
    const [novoUsuario, setNovoUsuario] = React.useState('');
    const [novaSenha, setNovaSenha] = React.useState('');
    const [novoPapel, setNovoPapel] = React.useState('atendente');
    const [acessosPermitidos, setAcessosPermitidos] = React.useState(['solicitante', 'manutencao']);
    const [usuarioAtivo, setUsuarioAtivo] = React.useState(true);
    const [criando, setCriando] = React.useState(false);
    const [erroCriacao, setErroCriacao] = React.useState('');
    const [etapaCriacao, setEtapaCriacao] = React.useState('form');
    const [credencial, setCredencial] = React.useState(null); // {usuario, senha} recém-criado

    // detalhe
    const [papelEditando, setPapelEditando] = React.useState('');
    const [resetSenha, setResetSenha] = React.useState('');
    const [agindo, setAgindo] = React.useState(false);
    const [confirmarExclusao, setConfirmarExclusao] = React.useState(false);

    const PAPEIS = [
        ['solicitante', 'Solicitante'],
        ['atendente', 'Atendente'],
        ['supervisor', 'Supervisor'],
        ['administrador', 'Administrador']
    ];
    const SELECT_COMPACTO = 'u-input !h-8 !py-0 !pl-2 !pr-1 !text-xs !leading-none sm:min-w-[130px] sm:max-w-[150px]';

    const detalhe = detalheId ? usuarios.find((u) => u.id === detalheId) || null : null;
    const gruposUsuario = Array.isArray(detalhe?.grupos) ? detalhe.grupos : [];

    // ---------- util ----------
    const gerarSenhaTemporaria = (tam = 12) => {
        const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
        const numeros = '23456789';
        const todos = letras + numeros;
        const buf = new Uint32Array(tam);
        window.crypto.getRandomValues(buf);
        const chars = Array.from(buf, (n) => todos[n % todos.length]);
        // garante ao menos 1 letra e 1 número
        chars[0] = letras[buf[0] % letras.length];
        chars[1] = numeros[buf[1] % numeros.length];
        return chars.sort(() => 0.5 - Math.random()).join('');
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

    const msgErro = (e, padrao) => (e && e.message) || padrao;

    // ---------- dados ----------
    const carregar = async () => {
        setCarregando(true);
        try {
            const res = await ApiClient.get('/admin/usuarios');
            setUsuarios(res.usuarios || []);
        } catch (e) {
            window.notifyError && window.notifyError(msgErro(e, 'Erro ao carregar usuários.'));
        } finally { setCarregando(false); }
    };
    React.useEffect(() => { carregar(); }, []);

    const carregarAuditoria = async () => {
        setCarregandoAud(true);
        try {
            const res = await ApiClient.get('/admin/audit-logs?page=1&limit=100');
            setAuditoria(res.logs || []);
        } catch (e) {
            window.notifyError && window.notifyError(msgErro(e, 'Erro ao carregar auditoria.'));
        } finally { setCarregandoAud(false); }
    };
    React.useEffect(() => { if (aba === 'auditoria') carregarAuditoria(); }, [aba]);

    React.useEffect(() => { if (detalhe) setPapelEditando(detalhe.papel); }, [detalheId, detalhe && detalhe.papel]);

    React.useEffect(() => {
        const carregarGruposDisponiveis = async () => {
            try {
                const res = await ApiClient.get('/admin/grupos');
                setGruposDisponiveis(res.grupos || []);
            } catch (e) {
                setGruposDisponiveis([]);
            }
        };
        carregarGruposDisponiveis();
    }, []);

    React.useEffect(() => {
        if (!detalhe || !detalheId || detalhe.papel !== 'atendente') {
            setGruposDetalhe([]);
            return;
        }
        const carregarGruposDetalhe = async () => {
            try {
                const res = await ApiClient.get(`/admin/usuarios/${detalheId}/grupos`);
                setGruposDetalhe(res.grupos || []);
            } catch (e) {
                setGruposDetalhe([]);
            }
        };
        carregarGruposDetalhe();
    }, [detalheId, detalhe && detalhe.papel]);

    // ---------- criação ----------
    React.useEffect(() => {
        if (novoPapel === 'solicitante') {
            setAcessosPermitidos(['solicitante']);
        } else if (novoPapel === 'administrador') {
            setAcessosPermitidos(['solicitante', 'manutencao']);
        } else if (acessosPermitidos.length === 0) {
            setAcessosPermitidos(['solicitante', 'manutencao']);
        }
    }, [novoPapel]);

    const alternarAcesso = (ambiente) => {
        setAcessosPermitidos((prev) => {
            const existe = prev.includes(ambiente);
            const base = existe ? prev.filter((item) => item !== ambiente) : [...prev, ambiente];
            if (novoPapel === 'solicitante' && ambiente === 'manutencao' && !existe) return ['solicitante'];
            if (novoPapel === 'solicitante' && ambiente === 'solicitante' && existe) return ['solicitante'];
            return base;
        });
    };

    const usuarioNormalizado = novoUsuario.trim().toLowerCase();
    const usuarioValido = /^[a-z0-9._-]{3,40}$/.test(usuarioNormalizado);
    const senhaValida = novaSenha.length >= 8;
    const resumoAcessos = acessosPermitidos.map((ambiente) => ambiente === 'solicitante' ? 'Solicitante' : 'Manutenção').join(', ') || 'Nenhum ambiente';
    const resumoCriacao = {
        usuario: usuarioNormalizado || '—',
        papel: PAPEIS.find(([v]) => v === novoPapel)?.[1] || novoPapel,
        acessos: resumoAcessos,
        status: usuarioAtivo ? 'Ativa' : 'Inativa',
        senha: novaSenha ? '••••••••' : 'não informada'
    };

    const irParaResumoCriacao = (e) => {
        e.preventDefault();
        setErroCriacao('');
        if (!usuarioValido) {
            setErroCriacao('Nome de usuário inválido. Veja as regras abaixo do campo.');
            return;
        }
        if (!senhaValida) {
            setErroCriacao('A senha inicial precisa ter pelo menos 8 caracteres.');
            return;
        }
        setEtapaCriacao('confirmacao');
    };

    const handleCriar = async (e) => {
        e.preventDefault();
        setErroCriacao('');
        if (!usuarioValido) { setErroCriacao('Nome de usuário inválido. Veja as regras abaixo do campo.'); return; }
        if (!senhaValida) { setErroCriacao('A senha inicial precisa ter pelo menos 8 caracteres.'); return; }
        setCriando(true);
        try {
            await ApiClient.post('/admin/usuarios', { usuario: usuarioNormalizado, papel: novoPapel, senha: novaSenha });
            window.notifySuccess && window.notifySuccess(`Usuário "${usuarioNormalizado}" criado. Troca de senha exigida no 1º acesso.`);
            setCredencial({ usuario: usuarioNormalizado, senha: novaSenha });
            setNovoUsuario(''); setNovaSenha(''); setNovoPapel('atendente'); setAcessosPermitidos(['solicitante', 'manutencao']); setUsuarioAtivo(true); setErroCriacao(''); setEtapaCriacao('form');
            await carregar();
        } catch (err) {
            const m = msgErro(err, 'Erro ao criar usuário.');
            setErroCriacao(m);
            window.notifyError && window.notifyError(m);
        } finally { setCriando(false); }
    };

    // ---------- ações ----------
    const executar = async (fn, okMsg, erroPadrao) => {
        setAgindo(true);
        try {
            await fn();
            if (okMsg) window.notifySuccess && window.notifySuccess(okMsg);
            await carregar();
            return true;
        } catch (e) {
            window.notifyError && window.notifyError(msgErro(e, erroPadrao));
            return false;
        } finally { setAgindo(false); }
    };

    // id de quem está logado (o próprio admin não altera o próprio cargo; a API também bloqueia)
    const meuId = (typeof _sessaoAtual === 'function' ? _sessaoAtual()?.user?.id : null) || null;
    const ehEu = (u) => !!meuId && u.id === meuId;
    const rotuloPapel = (v) => PAPEIS.find(([k]) => k === v)?.[1] || v;

    const acaoPapel = async (u, novoP) => {
        if (!novoP || novoP === u.papel) return false;
        if (ehEu(u)) { window.notifyWarning && window.notifyWarning('Você não pode alterar o próprio cargo.'); return false; }
        const rebaixaAdmin = u.papel === 'administrador' && novoP !== 'administrador';
        const msg = `Alterar o cargo de "${u.usuario}" de ${rotuloPapel(u.papel)} para ${rotuloPapel(novoP)}?` +
            (rebaixaAdmin ? '\n\nAtenção: este usuário perderá o acesso administrativo.' : '');
        if (!window.confirm(msg)) return false;
        return executar(
            () => ApiClient.patch(`/admin/usuarios/${u.id}/role`, { papel: novoP }),
            `Cargo de "${u.usuario}" alterado para ${rotuloPapel(novoP)}.`, 'Erro ao alterar cargo.');
    };

    const acaoStatus = (u, ativo) => executar(
        () => ApiClient.patch(`/admin/usuarios/${u.id}/status`, { ativo }),
        `Usuário "${u.usuario}" ${ativo ? 'reativado' : 'suspenso'}.`, 'Erro ao alterar situação.');

    const acaoDesbloquear = (u) => executar(
        () => ApiClient.post('/admin/usuarios/unlock', { usuarioId: u.id }),
        `Usuário "${u.usuario}" desbloqueado.`, 'Erro ao desbloquear.');

    const acaoReset = async (u) => {
        if (resetSenha.length < 8) { window.notifyWarning && window.notifyWarning('A nova senha deve ter pelo menos 8 caracteres.'); return; }
        const ok = await executar(
            () => ApiClient.post(`/admin/usuarios/${u.id}/reset-senha`, { novaSenha: resetSenha }),
            `Senha de "${u.usuario}" redefinida. Troca exigida no próximo acesso.`, 'Erro ao redefinir senha.');
        if (ok) { setCredencial({ usuario: u.usuario, senha: resetSenha }); setResetSenha(''); }
    };

    const acaoExcluir = async (u) => {
        const ok = await executar(
            () => ApiClient.del(`/admin/usuarios/${u.id}`),
            'Usuário excluído.', 'Erro ao excluir usuário.');
        if (ok) { setConfirmarExclusao(false); setDetalheId(null); }
    };

    const alternarGrupoDetalhe = (codigo) => {
        setGruposDetalhe((prev) => {
            const existe = prev.includes(codigo);
            return existe ? prev.filter((item) => item !== codigo) : [...prev, codigo].sort();
        });
    };

    const salvarGruposDetalhe = async () => {
        if (!detalhe) return;
        setSalvandoGrupos(true);
        try {
            await ApiClient.put(`/admin/usuarios/${detalhe.id}/grupos`, { grupos: gruposDetalhe });
            window.notifySuccess && window.notifySuccess('Grupos de serviço atualizados.');
            await carregar();
            setGruposDetalhe(gruposDetalhe.slice().sort());
        } catch (e) {
            window.notifyError && window.notifyError(msgErro(e, 'Erro ao atualizar grupos de serviço.'));
        } finally {
            setSalvandoGrupos(false);
        }
    };

    // ---------- apresentação ----------
    const chipPapel = (p) => {
        const cor = p === 'administrador' ? 'bg-[#0E3263]/10 text-[#0E3263] dark:bg-sky-400/10 dark:text-sky-300'
            : p === 'supervisor' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
            : p === 'solicitante' ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
        return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${cor}`}>{p}</span>;
    };
    const chipStatus = (u) => {
        if (u.bloqueado) return <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Bloqueado</span>;
        if (!u.ativo) return <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Inativo</span>;
        return <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Ativo</span>;
    };
    const fmtData = (iso, hora) => {
        if (!iso) return '-';
        const d = new Date(iso);
        return hora ? d.toLocaleString('pt-BR') : d.toLocaleDateString('pt-BR');
    };

    const bannerCredencial = credencial && (
        <div role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">Senha temporária de "{credencial.usuario}"</p>
            <p className="mt-1 text-xs">Anote ou copie agora: ela não será exibida novamente. O usuário será obrigado a trocá-la no 1º acesso.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded bg-white px-2 py-1 font-mono text-sm dark:bg-slate-900">{credencial.senha}</code>
                <button type="button" onClick={() => copiar(credencial.senha)} className="btn-ghost !min-h-[28px] !px-2 !py-0.5 !text-xs">Copiar</button>
                <button type="button" onClick={() => setCredencial(null)} className="btn-ghost !min-h-[28px] !px-2 !py-0.5 !text-xs">Dispensar</button>
            </div>
        </div>
    );

    // ---------- filtros ----------
    const q = busca.trim().toLowerCase();
    const gruposLista = [...new Set(usuarios.flatMap((u) => Array.isArray(u.grupos) ? u.grupos : []))].sort();
    const filtrados = usuarios.filter((u) => {
        if (filtroPapel !== 'TODOS' && u.papel !== filtroPapel) return false;
        if (filtroStatus === 'ATIVO' && (!u.ativo || u.bloqueado)) return false;
        if (filtroStatus === 'INATIVO' && u.ativo) return false;
        if (filtroStatus === 'BLOQUEADO' && !u.bloqueado) return false;
        if (filtroGrupo !== 'TODOS') {
            const gruposDoUsuario = Array.isArray(u.grupos) ? u.grupos : [];
            if (!gruposDoUsuario.includes(filtroGrupo)) return false;
        }
        if (q && !((u.usuario || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))) return false;
        return true;
    }).sort((a, b) => {
        if (ordenarPor === 'nome_asc') return (a.usuario || '').localeCompare(b.usuario || '');
        if (ordenarPor === 'nome_desc') return (b.usuario || '').localeCompare(a.usuario || '');
        if (ordenarPor === 'criadoEm_asc') return new Date(a.criadoEm) - new Date(b.criadoEm);
        return new Date(b.criadoEm) - new Date(a.criadoEm);
    });
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITEMS));
    const paginaAtual = Math.min(pagina, totalPaginas);
    const visiveis = filtrados.slice((paginaAtual - 1) * ITEMS, paginaAtual * ITEMS);

    const total = usuarios.length;
    const ativos = usuarios.filter((u) => u.ativo && !u.bloqueado).length;
    const suspensos = usuarios.filter((u) => !u.ativo).length;
    const bloqueados = usuarios.filter((u) => u.bloqueado).length;
    const admins = usuarios.filter((u) => u.papel === 'administrador' && u.ativo).length;
    const atendentesSemGrupo = usuarios.filter((u) => u.papel === 'atendente' && (!Array.isArray(u.grupos) || u.grupos.length === 0)).length;
    const inconsistencias = usuarios.filter((u) => !u.email || !u.papel).length;

    // ---------- DETALHE ----------
    if (detalheId) {
        if (!detalhe) {
            return (
                <div className="w-full">
                    <PageHeader title="Detalhes do usuário" actions={<button onClick={() => setDetalheId(null)} className="btn-ghost">Voltar</button>} />
                    <div className="u-surface"><EmptyState numero="…" title="Carregando usuário." /></div>
                </div>
            );
        }
        return (
            <div className="w-full">
                <PageHeader title="Detalhes do usuário" meta={detalhe.usuario} actions={<button onClick={() => { setDetalheId(null); setConfirmarExclusao(false); setResetSenha(''); }} className="btn-ghost">Voltar</button>} />
                {bannerCredencial}
                <div className="grid items-start gap-4 lg:grid-cols-2">
                    <section className="u-surface space-y-3 p-4">
                        <SectionTitle>Informações</SectionTitle>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div><p className="text-xs text-slate-500">Usuário</p><p className="font-medium">{detalhe.usuario}</p></div>
                            <div><p className="text-xs text-slate-500">E-mail</p><p className="break-all font-medium">{detalhe.email || '-'}</p></div>
                            <div><p className="text-xs text-slate-500">Cargo</p><div className="mt-0.5">{chipPapel(detalhe.papel)}</div></div>
                            <div><p className="text-xs text-slate-500">Situação</p><div className="mt-0.5">{chipStatus(detalhe)}</div></div>
                            <div><p className="text-xs text-slate-500">Criado em</p><p className="font-medium">{fmtData(detalhe.criadoEm, true)}</p></div>
                            <div><p className="text-xs text-slate-500">Último acesso</p><p className="font-medium">{detalhe.ultimoAcessoEm ? fmtData(detalhe.ultimoAcessoEm, true) : 'Nunca'}</p></div>
                            {detalhe.precisaTrocarSenha && <div className="col-span-2"><span className="rounded bg-[#B9770E]/10 px-1.5 py-0.5 text-[11px] text-[#B9770E]">troca de senha pendente</span></div>}
                        </div>
                        <div className="flex flex-wrap gap-2 border-t pt-3 u-divider">
                            {detalhe.bloqueado && <button disabled={agindo} onClick={() => acaoDesbloquear(detalhe)} className="btn-success disabled:opacity-60">Desbloquear</button>}
                            <button disabled={agindo} onClick={() => acaoStatus(detalhe, !detalhe.ativo)} className={`${detalhe.ativo ? 'btn-danger' : 'btn-success'} disabled:opacity-60`}>{detalhe.ativo ? 'Suspender' : 'Reativar'}</button>
                            {confirmarExclusao ? (
                                <>
                                    <button disabled={agindo} onClick={() => acaoExcluir(detalhe)} className="btn-danger disabled:opacity-60">Confirmar exclusão</button>
                                    <button onClick={() => setConfirmarExclusao(false)} className="btn-ghost">Cancelar</button>
                                </>
                            ) : (
                                <button onClick={() => setConfirmarExclusao(true)} className="btn-ghost">Excluir</button>
                            )}
                        </div>
                        {confirmarExclusao && <p className="text-xs text-slate-500">Se houver chamados vinculados a este usuário, a API vai recusar a exclusão. Nesse caso, prefira suspender.</p>}
                    </section>

                    <div className="grid gap-4">
                        <section className="u-surface space-y-2.5 p-4">
                            <SectionTitle>Cargo</SectionTitle>
                            <div className="flex gap-2">
                                <select aria-label="Cargo" value={papelEditando} disabled={ehEu(detalhe)} title={ehEu(detalhe) ? 'Você não pode alterar o próprio cargo' : undefined} onChange={(e) => setPapelEditando(e.target.value)} className="u-input">
                                    {PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                                <button disabled={agindo || ehEu(detalhe) || papelEditando === detalhe.papel} onClick={() => acaoPapel(detalhe, papelEditando)} className="btn-primary disabled:opacity-50">Salvar</button>
                            </div>
                        </section>

                        <section className="u-surface space-y-2.5 p-4">
                            <SectionTitle>Redefinir senha</SectionTitle>
                            <CampoSenha minLength="8" autoComplete="new-password" aria-label="Nova senha" value={resetSenha} onChange={(e) => setResetSenha(e.target.value)} />
                            <p className={`text-xs ${resetSenha.length >= 8 ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                {resetSenha.length >= 8 ? '✓ Senha atende ao tamanho mínimo' : `${resetSenha.length}/8 caracteres mínimos`}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => setResetSenha(gerarSenhaTemporaria())} className="btn-ghost">Gerar senha</button>
                                <button type="button" disabled={!resetSenha} onClick={() => copiar(resetSenha)} className="btn-ghost disabled:opacity-50">Copiar</button>
                                <button type="button" disabled={agindo || resetSenha.length < 8} onClick={() => acaoReset(detalhe)} className="btn-primary disabled:opacity-50">Aplicar</button>
                            </div>
                        </section>

                        {detalhe.papel === 'atendente' ? (
                            <section className="u-surface space-y-3 p-4">
                                <SectionTitle>Grupos de serviço</SectionTitle>
                                <div className="flex flex-wrap gap-2">
                                    {gruposDisponiveis.length === 0 ? (
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Nenhum grupo ativo cadastrado.</span>
                                    ) : gruposDisponiveis.map((grupo) => (
                                        <label key={grupo.codigo} className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900/40">
                                            <input type="checkbox" checked={gruposDetalhe.includes(grupo.codigo)} onChange={() => alternarGrupoDetalhe(grupo.codigo)} className="h-4 w-4 rounded border-slate-300 text-[#0E3263] focus:ring-[#0E3263]" />
                                            <span>{grupo.codigo}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="flex justify-end">
                                    <button type="button" disabled={salvandoGrupos || agindo} onClick={salvarGruposDetalhe} className="btn-primary disabled:opacity-60">Salvar</button>
                                </div>
                            </section>
                        ) : (
                            <section className="u-surface p-4">
                                <SectionTitle>Grupos de serviço</SectionTitle>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Este cargo enxerga todos os serviços.</p>
                            </section>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---------- LISTA ----------
    if (modoCriar) {
        return (
            <div className="w-full">
                <PageHeader
                    title="Novo usuário"
                    meta="Criação de conta e definição de papel"
                    actions={<button onClick={onVoltar || (() => setMostrarCriar(false))} className="btn-ghost">Voltar</button>}
                />

                <section className="u-surface p-4">
                    <form onSubmit={etapaCriacao === 'confirmacao' ? handleCriar : irParaResumoCriacao} className="grid gap-3 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="u-label">Nome de usuário</label>
                            <input type="text" placeholder="ex.: joao.silva" aria-label="Novo usuário" autoComplete="off" maxLength={40}
                                className={`u-input ${novoUsuario && !usuarioValido ? '!border-red-500' : ''}`}
                                value={novoUsuario} onChange={(e) => { setNovoUsuario(e.target.value); setErroCriacao(''); }} />
                            <p className={`mt-1 text-xs ${novoUsuario.trim().length > 0 ? (usuarioValido ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : 'text-slate-500 dark:text-slate-400'}`}>
                                {novoUsuario.trim().length === 0
                                    ? '3 a 40 caracteres: a-z, 0-9, ponto, _ ou -'
                                    : usuarioValido
                                        ? '✓ Nome de usuário válido.'
                                        : '3 a 40 caracteres: a-z, 0-9, ponto, _ ou -'}
                            </p>
                        </div>

                        <div>
                            <label className="u-label">Senha inicial</label>
                            <CampoSenha minLength="8" autoComplete="new-password" aria-label="Senha inicial" value={novaSenha} onChange={(e) => { setNovaSenha(e.target.value); setErroCriacao(''); }} />
                            <div className="mt-1 flex items-center justify-between gap-2">
                                <p className={`text-xs ${senhaValida ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    {senhaValida ? '✓ Tamanho mínimo atingido' : `${novaSenha.length}/8 caracteres mínimos`}
                                </p>
                                <span className="flex gap-2 text-xs">
                                    <button type="button" onClick={() => setNovaSenha(gerarSenhaTemporaria())} className="text-[#0E3263] underline underline-offset-2 dark:text-sky-300">Gerar</button>
                                    <button type="button" disabled={!novaSenha} onClick={() => copiar(novaSenha)} className="text-[#0E3263] underline underline-offset-2 disabled:opacity-40 dark:text-sky-300">Copiar</button>
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="u-label">Permissão / papel</label>
                            <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} aria-label="Cargo" className="u-input">
                                {PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        </div>

                        <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Permissões de acesso</p>
                                <div className="space-y-2 text-sm">
                                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                        <input type="checkbox" checked={acessosPermitidos.includes('solicitante')} onChange={() => alternarAcesso('solicitante')} className="h-4 w-4 rounded border-slate-300 text-[#0E3263] focus:ring-[#0E3263]" />
                                        Solicitante
                                    </label>
                                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                        <input type="checkbox" checked={acessosPermitidos.includes('manutencao')} onChange={() => alternarAcesso('manutencao')} className="h-4 w-4 rounded border-slate-300 text-[#0E3263] focus:ring-[#0E3263]" />
                                        Manutenção
                                    </label>
                                </div>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Status da conta</p>
                                <label className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
                                    <span>{usuarioAtivo ? 'Ativa' : 'Inativa'}</span>
                                    <button type="button" onClick={() => setUsuarioAtivo((v) => !v)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${usuarioAtivo ? 'bg-[#0E3263]' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                        <span className={`inline-block h-4 w-4 rounded-full bg-white transition ${usuarioAtivo ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </label>
                            </div>
                        </div>

                        {etapaCriacao === 'confirmacao' && (
                            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Resumo da criação</p>
                                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                                    <div><dt className="text-slate-500 dark:text-slate-400">Usuário</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{resumoCriacao.usuario}</dd></div>
                                    <div><dt className="text-slate-500 dark:text-slate-400">Papel</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{resumoCriacao.papel}</dd></div>
                                    <div><dt className="text-slate-500 dark:text-slate-400">Acessos</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{resumoCriacao.acessos}</dd></div>
                                    <div><dt className="text-slate-500 dark:text-slate-400">Status</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{resumoCriacao.status}</dd></div>
                                    <div className="sm:col-span-2"><dt className="text-slate-500 dark:text-slate-400">Senha</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{resumoCriacao.senha}</dd></div>
                                </dl>
                            </div>
                        )}

                        {erroCriacao && (
                            <div role="alert" className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{erroCriacao}</div>
                        )}

                        {credencial && (
                            <div role="status" className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                                <p className="font-medium">Senha temporária de "{credencial.usuario}"</p>
                                <p className="mt-1 text-xs">Anote ou copie agora: ela não será exibida novamente.</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <code className="rounded bg-white px-2 py-1 font-mono text-sm dark:bg-slate-900">{credencial.senha}</code>
                                    <button type="button" onClick={() => copiar(credencial.senha)} className="btn-ghost !min-h-[28px] !px-2 !py-0.5 !text-xs">Copiar</button>
                                    <button type="button" onClick={() => setCredencial(null)} className="btn-ghost !min-h-[28px] !px-2 !py-0.5 !text-xs">Dispensar</button>
                                </div>
                            </div>
                        )}

                        <div className="md:col-span-2 flex justify-end gap-2">
                            <button type="button" onClick={etapaCriacao === 'confirmacao' ? () => setEtapaCriacao('form') : (onVoltar || (() => setMostrarCriar(false)))} className="btn-ghost">{etapaCriacao === 'confirmacao' ? 'Editar dados' : 'Cancelar'}</button>
                            <button type="submit" disabled={criando || !usuarioValido || !senhaValida} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">{criando ? 'Criando…' : (etapaCriacao === 'confirmacao' ? 'Confirmar criação' : 'Continuar')}</button>
                        </div>
                    </form>
                </section>
            </div>
        );
    }

    return (
        <div className="w-full">
            <PageHeader
                title="Gerenciamento de usuários"
                meta="administração de contas e permissões"
                actions={<button onClick={onCriarUsuario || (() => { setMostrarCriar((v) => !v); setErroCriacao(''); })} className="btn-primary">+ Novo usuário</button>}
            />

            {bannerCredencial}

            {mostrarCriar && (
                <section className="u-surface mb-4 p-4">
                    <SectionTitle>Novo usuário</SectionTitle>
                    <form onSubmit={handleCriar} className="mt-2 grid gap-3 md:grid-cols-3">
                        <div>
                            <label className="u-label">Usuário</label>
                            <input type="text" placeholder="ex.: joao.silva" aria-label="Novo usuário" autoComplete="off" maxLength={40}
                                className={`u-input ${novoUsuario && !usuarioValido ? '!border-red-500' : ''}`}
                                value={novoUsuario} onChange={(e) => { setNovoUsuario(e.target.value); setErroCriacao(''); }} />
                            <p className={`mt-1 text-xs ${usuarioValido ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                {usuarioValido ? '✓ Nome de usuário válido' : '3 a 40 caracteres: a-z, 0-9, ponto, _ ou -'}
                            </p>
                        </div>
                        <div>
                            <label className="u-label">Senha inicial</label>
                            <CampoSenha minLength="8" autoComplete="new-password" aria-label="Senha inicial" value={novaSenha} onChange={(e) => { setNovaSenha(e.target.value); setErroCriacao(''); }} />
                            <div className="mt-1 flex items-center justify-between gap-2">
                                <p className={`text-xs ${senhaValida ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    {senhaValida ? '✓ Tamanho mínimo atingido' : `${novaSenha.length}/8 caracteres mínimos`}
                                </p>
                                <span className="flex gap-2 text-xs">
                                    <button type="button" onClick={() => setNovaSenha(gerarSenhaTemporaria())} className="text-[#0E3263] underline underline-offset-2 dark:text-sky-300">Gerar</button>
                                    <button type="button" disabled={!novaSenha} onClick={() => copiar(novaSenha)} className="text-[#0E3263] underline underline-offset-2 disabled:opacity-40 dark:text-sky-300">Copiar</button>
                                </span>
                            </div>
                        </div>
                        <div>
                            <label className="u-label">Cargo</label>
                            <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} aria-label="Cargo" className="u-input">
                                {PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        </div>
                        {erroCriacao && (
                            <div role="alert" className="md:col-span-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{erroCriacao}</div>
                        )}
                        <div className="md:col-span-3">
                            <button type="submit" disabled={criando || !usuarioValido || !senhaValida} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">{criando ? 'Criando…' : 'Criar usuário'}</button>
                        </div>
                    </form>
                </section>
            )}

            {/* indicadores */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
                {[['Total', total], ['Ativos', ativos], ['Suspensos', suspensos], ['Bloqueados', bloqueados], ['Admins ativos', admins], ['Atendentes sem grupo', atendentesSemGrupo], ['Inconsistências', inconsistencias]].map(([label, val]) => (
                    <div key={label} className="u-surface p-3 text-center">
                        <div className="text-xl font-semibold tabular-nums">{val}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
                    </div>
                ))}
            </div>

            {/* abas */}
            <div className="u-surface mb-3 flex gap-1 p-1">
                {[['usuarios', 'Usuários'], ['auditoria', 'Auditoria']].map(([v, l]) => (
                    <button key={v} onClick={() => setAba(v)} className={`rounded px-3 py-1.5 text-xs ${aba === v ? 'bg-[#0E3263] text-white' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
                ))}
            </div>

            {aba === 'usuarios' ? (
                <>
                    <div className="u-surface mb-3 flex flex-col gap-2 p-2 sm:flex-row">
                        <input type="text" placeholder="Pesquisar por nome ou e-mail…" className="u-input flex-1" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} />
                        <select value={filtroPapel} onChange={(e) => { setFiltroPapel(e.target.value); setPagina(1); }} className="u-input sm:max-w-[170px]">
                            <option value="TODOS">Cargo: todos</option>
                            {PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <select value={filtroGrupo} onChange={(e) => { setFiltroGrupo(e.target.value); setPagina(1); }} className="u-input sm:max-w-[170px]">
                            <option value="TODOS">Grupo: todos</option>
                            {gruposLista.map((grupo) => <option key={grupo} value={grupo}>{grupo}</option>)}
                        </select>
                        <select value={filtroStatus} onChange={(e) => { setFiltroStatus(e.target.value); setPagina(1); }} className="u-input sm:max-w-[170px]">
                            <option value="TODOS">Situação: todas</option>
                            <option value="ATIVO">Ativos</option>
                            <option value="INATIVO">Inativos</option>
                            <option value="BLOQUEADO">Bloqueados</option>
                        </select>
                        <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)} className="u-input sm:max-w-[180px]">
                            <option value="criadoEm_desc">Mais recentes</option>
                            <option value="criadoEm_asc">Mais antigos</option>
                            <option value="nome_asc">Nome A-Z</option>
                            <option value="nome_desc">Nome Z-A</option>
                        </select>
                    </div>

                    {carregando ? (
                        <div className="u-surface"><EmptyState numero="…" title="Carregando usuários." /></div>
                    ) : visiveis.length === 0 ? (
                        <div className="u-surface"><EmptyState numero="0" title="Nenhum usuário encontrado." /></div>
                    ) : (
                        <>
                            <div className="u-surface overflow-x-auto">
                                <table className="u-table u-table-pin">
                                    <thead>
                                        <tr>
                                            <th>Nome</th><th>E-mail</th><th>Cargo</th><th>Grupos</th><th>Situação</th>
                                            <th>Cadastro</th><th>Último acesso</th><th>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visiveis.map((u) => (
                                            <tr key={u.id}>
                                                <td className="font-medium">{u.usuario}</td>
                                                <td className="text-xs text-slate-500">{u.email}</td>
                                                <td>{chipPapel(u.papel)}</td>
                                                <td>
                                                    {u.papel === 'atendente' ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {(Array.isArray(u.grupos) && u.grupos.length > 0 ? u.grupos : ['sem grupo']).map((g) => (
                                                                <span key={`${u.id}-${g}`} className={`rounded px-1.5 py-0.5 text-[10px] ${g === 'sem grupo' ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : 'bg-[#0E3263]/10 text-[#0E3263] dark:bg-sky-400/10 dark:text-sky-300'}`}>
                                                                    {g === 'sem grupo' ? 'sem grupo' : g}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-500 dark:text-slate-400">Todos</span>
                                                    )}
                                                </td>
                                                <td>{chipStatus(u)}</td>
                                                <td className="text-xs tabular-nums">{fmtData(u.criadoEm)}</td>
                                                <td className="text-xs tabular-nums">{u.ultimoAcessoEm ? fmtData(u.ultimoAcessoEm) : 'Nunca'}</td>
                                                <td>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => { setDetalheId(u.id); setConfirmarExclusao(false); setResetSenha(''); }} className="btn-ghost !min-h-[32px] !px-2 !py-0.5 !text-xs">Ver</button>
                                                        <select aria-label={`Cargo de ${u.usuario}`} value={u.papel} disabled={agindo || ehEu(u)} title={ehEu(u) ? 'Você não pode alterar o próprio cargo' : undefined} onChange={(e) => acaoPapel(u, e.target.value)} className={SELECT_COMPACTO}>
                                                            {PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                                        </select>
                                                        <button disabled={agindo} onClick={() => acaoStatus(u, !u.ativo)} className={`${u.ativo ? 'btn-danger' : 'btn-success'} !min-h-[32px] !px-2 !py-0.5 !text-xs disabled:opacity-60`}>
                                                            {u.ativo ? 'Suspender' : 'Reativar'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {totalPaginas > 1 && (
                                <div className="mt-3 flex items-center justify-center gap-1">
                                    <button disabled={paginaAtual === 1} onClick={() => setPagina(paginaAtual - 1)} className="btn-page">‹</button>
                                    <span className="px-2 text-xs text-slate-500">{paginaAtual} / {totalPaginas}</span>
                                    <button disabled={paginaAtual === totalPaginas} onClick={() => setPagina(paginaAtual + 1)} className="btn-page">›</button>
                                </div>
                            )}
                        </>
                    )}
                </>
            ) : (
                carregandoAud ? (
                    <div className="u-surface"><EmptyState numero="…" title="Carregando auditoria." /></div>
                ) : auditoria.length === 0 ? (
                    <div className="u-surface"><EmptyState numero="0" title="Sem registros de auditoria." /></div>
                ) : (
                    <div className="u-surface overflow-x-auto">
                        <table className="u-table">
                            <thead><tr><th>Data</th><th>Ação</th><th>Alvo</th><th>Por</th><th>Detalhe</th></tr></thead>
                            <tbody>
                                {auditoria.map((a) => (
                                    <tr key={a.id}>
                                        <td className="text-xs tabular-nums">{a.criado_em ? new Date(a.criado_em).toLocaleString('pt-BR') : '-'}</td>
                                        <td className="text-xs font-medium">{a.acao}</td>
                                        <td className="text-xs">{a.alvo_usuario_nome || '-'}</td>
                                        <td className="text-xs">{a.feito_por_nome || '-'}</td>
                                        <td className="text-xs text-slate-500">{a.detalhe || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </div>
    );
}
