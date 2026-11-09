// TELA: Redefinir Senha — uso exclusivo do 1º acesso forçado (semVoltar).
// Não há mais entrada voluntária: sem "Esqueci a senha", sem "Alterar senha".
function TelaRedefinirSenha({ voltar, aoSucesso, semVoltar }) {
    const [novaSenha, setNovaSenha] = React.useState('');
    const [confirmar, setConfirmar] = React.useState('');
    const [erro, setErro] = React.useState('');
    const [ok, setOk] = React.useState('');
    const [carregando, setCarregando] = React.useState(false);

    const handleRedefinir = async (e) => {
        e.preventDefault();
        setErro(''); setOk('');
        if (novaSenha.length < 8) { setErro('A senha deve ter pelo menos 8 caracteres.'); return; }
        if (novaSenha !== confirmar) { setErro('As senhas não conferem.'); return; }
        setCarregando(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: novaSenha });
            if (error) throw error;
            setOk('Senha redefinida.');
            setTimeout(() => aoSucesso && aoSucesso(), 1500);
        } catch (err) {
            console.error('Erro redefinir:', err.message);
            setErro(err.message || 'Não foi possível redefinir. O link pode ter expirado.');
        } finally { setCarregando(false); }
    };

    return (
        <div className="page-art mx-auto w-full max-w-[400px] pt-6">
            <PageHeader title="Redefinir senha" />
            {erro && <p className="mb-3 rounded-md bg-[#B3261E]/10 px-3 py-2 text-[13px] text-[#B3261E] dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
            {ok && <p className="mb-3 rounded-md bg-[#1B7A4D]/10 px-3 py-2 text-[13px] text-[#1B7A4D] dark:bg-emerald-500/10 dark:text-emerald-300">{ok}</p>}
            <form onSubmit={handleRedefinir} className="space-y-3">
                <div>
                    <label className="u-label">Nova senha</label>
                    <CampoSenha required minLength="8" autoComplete="new-password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
                </div>
                <div>
                    <label className="u-label">Confirmar senha</label>
                    <CampoSenha required minLength="8" autoComplete="new-password" value={confirmar} onChange={e => setConfirmar(e.target.value)} />
                </div>
                <div className="flex gap-2 pt-1">
                    {!semVoltar && voltar && <button type="button" onClick={voltar} className="btn-ghost flex-1 !justify-center">Voltar</button>}
                    <button type="submit" disabled={carregando} className="btn-primary flex-1 !justify-center disabled:opacity-60">
                        {carregando ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </form>
        </div>
    );
}
