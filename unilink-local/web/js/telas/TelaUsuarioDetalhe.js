// TELA: Detalhes do Usuário — gestão completa de perfil
function TelaUsuarioDetalhe({ usuario, onVoltar, usuarios, onAtualizar }) {
    const [editando, setEditando] = React.useState(false);
    const [papelEditando, setPapelEditando] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [desbloqueando, setDesbloqueando] = React.useState(false);
    const [excluindo, setExcluindo] = React.useState(false);
    const [resetandoSenha, setResetandoSenha] = React.useState(false);
    const [novaSenha, setNovaSenha] = React.useState('');
    const [confirmarSenha, setConfirmarSenha] = React.useState('');
    const [erroSenha, setErroSenha] = React.useState('');
    const [confirmarExclusao, setConfirmarExclusao] = React.useState(false);

    const papelAtual = usuario?.papel || 'atendente';
    const PAPEIS = ['atendente', 'supervisor', 'administrador'];

    const papelLabel = {
        atendente: 'Atendente',
        supervisor: 'Supervisor',
        administrador: 'Administrador'
    };

    const papelCor = {
        atendente: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        supervisor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        administrador: 'bg-[#0E3263]/10 text-[#0E3263] dark:bg-sky-400/20 dark:text-sky-300'
    };

    const formatarData = (iso) => {
        if (!iso) return '-';
        try {
            const d = new Date(iso);
            return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return '-'; }
    };

    const handleSalvarPapel = async () => {
        if (papelEditando === papelAtual) { setEditando(false); return; }
        try {
            await ApiClient.post('/admin/usuarios/role', { usuarioId: usuario.id, papel: papelEditando });
            window.notifySuccess && window.notifySuccess(`Papel alterado para ${papelLabel[papelEditando]}.`);
            onAtualizar && onAtualizar({ ...usuario, papel: papelEditando });
            setEditando(false);
        } catch (err) { window.notifyError && window.notifyError(err.message || 'Erro ao alterar papel.'); }
    };

    const handleDesbloquear = async () => {
        try {
            await ApiClient.post('/admin/usuarios/unlock', { usuarioId: usuario.id });
            window.notifySuccess && window.notifySuccess('Usuário desbloqueado com sucesso.');
            onAtualizar && onAtualizar({ ...usuario, bloqueado: false, tentativasLogin: 0, bloqueadoAte: null });
        } catch (err) { window.notifyError && window.notifyError(err.message || 'Erro ao desbloquear.'); }
    };

    const handleResetSenha = async () => {
        if (novaSenha.length < 8) { setErroSenha('Senha deve ter pelo menos 8 caracteres.'); return; }
        if (novaSenha !== confirmarSenha) { setErroSenha('As senhas não conferem.'); return; }
        setErroSenha('');
        setResetandoSenha(true);
        try {
            await ApiClient.post(`/admin/usuarios/${usuario.id}/reset-senha`, { novaSenha });
            window.notifySuccess && window.notifySuccess('Senha redefinida. O usuário deve trocar no próximo acesso.');
            setNovaSenha(''); setConfirmarSenha(''); setResetandoSenha(false);
        } catch (err) { window.notifyError && window.notifyError(err.message || 'Erro ao redefinir senha.'); }
    };

    const handleExcluir = async () => {
        try {
            await ApiClient.del(`/admin/usuarios/${usuario.id}`);
            window.notifySuccess && window.notifySuccess('Usuário excluído com sucesso.');
            onVoltar();
        } catch (err) { window.notifyError && window.notifyError(err.message || 'Erro ao excluir.'); }
    };

    const ultimoAcesso = usuario?.ultimoAcessoEm ? formatarDataBR(usuario.ultimoAcessoEm) : 'Nunca';
    const criadoEm = usuario?.criadoEm ? formatarDataBR(usuario.criadoEm) : '-';

    return (
        <div className="w-full">
            <PageHeader
                title="Detalhes do Usuário"
                meta={`ID: ${usuario.id?.slice(0, 8)}...`}
                actions={
                    <button onClick={onVoltar} className="btn-ghost">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        Voltar
                    </button>
                }
            />

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                    <section className="u-surface p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                <div className="w-14 h-14 rounded-xl bg-[#0E3263]/10 flex items-center justify-center shrink-0 dark:bg-[#0E3263]/20">
                                    <span className="text-xl font-bold text-[#0E3263] dark:text-sky-400">
                                        {(usuario.usuario || 'U')[0].toUpperCase()}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{usuario.usuario}</h2>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${papelCor[papelAtual]}`}>
                                            {papelLabel[papelAtual]}
                                        </span>
                                        {usuario.bloqueado && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#B3261E]/10 text-[#B3261E] dark:bg-red-500/10 dark:text-red-400">Bloqueado</span>}
                                        {usuario.precisaTrocarSenha && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Troca pendente</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {editando ? (
                                    <button onClick={() => { setPapelEditando(usuario.papel); setEditando(false); }} className="btn-ghost !min-h-[36px] !px-3">Cancelar</button>
                                ) : (
                                    <button onClick={() => { setPapelEditando(usuario.papel); setEditando(true); }} className="btn-ghost !min-h-[36px] !px-3" disabled={salvando}>Editar papel</button>
                                )}
                                <button onClick={handleDesbloquear} disabled={!usuario.bloqueado || desbloqueando} className="btn-ghost !min-h-[36px] !px-3" style={{display: usuario.bloqueado ? 'flex' : 'none'}}>
                                    {desbloqueando ? 'Desbloqueando…' : 'Desbloquear'}
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Último acesso</p>
                                <p className="font-medium text-slate-900 dark:text-slate-100">{ultimoAcesso}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Criado em</p>
                                <p className="font-medium text-slate-900 dark:text-slate-100">{criadoEm}</p>
                            </div>
                        </div>

                        {editando && (
                            <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Alterar cargo</h4>
                                <select value={papelEditando} onChange={(e) => setPapelEditando(e.target.value)} className="u-input w-full max-w-xs">
                                    {['atendente', 'supervisor', 'administrador'].map(p => (
                                        <option key={p} value={p}>{papelLabel[p]}</option>
                                    ))}
                                </select>
                                <div className="mt-3 flex justify-end gap-2">
                                    <button onClick={() => setEditando(false)} className="btn-ghost !min-h-[36px] !px-3">Cancelar</button>
                                    <button onClick={handleSalvarPapel} disabled={salvando || papelEditando === usuario.papel} className="btn-primary !min-h-[36px] !px-4">{salvando ? 'Salvando…' : 'Salvar alteração'}</button>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="u-surface p-4">
                        <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Redefinir senha</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Defina uma nova senha para o usuário. Ele será obrigado a trocar no próximo acesso.</p>
                        <div className="space-y-3">
                            <div>
                                <label className="u-label">Nova senha</label>
                                <CampoSenha minLength="8" autoComplete="new-password" value={novaSenha} onChange={(e) => { setNovaSenha(e.target.value); setErroSenha(''); }} />
                            </div>
                            <div>
                                <label className="u-label">Confirmar senha</label>
                                <CampoSenha minLength="8" autoComplete="new-password" value={confirmarSenha} onChange={(e) => { setConfirmarSenha(e.target.value); setErroSenha(''); }} />
                            </div>
                            {erroSenha && <p className="text-xs text-[#B3261E] dark:text-red-400">{erroSenha}</p>}
                            <button onClick={handleResetSenha} disabled={resetandoSenha || novaSenha.length < 8 || novaSenha !== confirmarSenha} className="btn-primary w-full sm:w-auto !justify-center disabled:opacity-60">{resetandoSenha ? 'Redefinindo…' : 'Redefinir senha'}</button>
                        </div>
                    </section>

                    <section className="u-surface p-4 border-t border-red-200 dark:border-red-900/30">
                        <h3 className="font-medium text-[#B3261E] dark:text-red-400 mb-3">Zona de perigo</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">A exclusão é irreversível. O usuário perderá acesso permanentemente e seus chamados permanecerão vinculados ao registro histórico.</p>
                        {confirmarExclusao ? (
                            <div className="flex gap-2">
                                <button onClick={handleExcluir} disabled={excluindo} className="btn-danger w-full sm:w-auto !justify-center disabled:opacity-60">{excluindo ? 'Excluindo…' : 'Confirmar exclusão'}</button>
                                <button onClick={() => setConfirmarExclusao(false)} className="btn-ghost !min-h-[36px]">Cancelar</button>
                            </div>
                        ) : (
                            <button onClick={() => setConfirmarExclusao(true)} className="btn-danger w-full sm:w-auto !justify-center">Excluir usuário permanentemente</button>
                        )}
                    </section>
                </div>

                <div className="space-y-4">
                    <section className="u-surface p-4">
                        <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Histórico de ações administrativas</h3>
                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                            Integração com <code className="font-mono text-[#0E3263]">admin_auditoria</code> a implementar
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
