// TELA: Login principal do UNILINK
function TelaLogin({ aoAutenticar }) {
    const [usuario, setUsuario] = React.useState('');
    const [senha, setSenha] = React.useState('');
    const [erro, setErro] = React.useState('');
    const [carregando, setCarregando] = React.useState(false);
    const [mostrarSenha, setMostrarSenha] = React.useState(false);

    const entrar = async (e) => {
        e.preventDefault();
        if (carregando) return;
        setErro('');
        setCarregando(true);
        try {
            const login = usuario.trim().toLowerCase();
            const email = login.includes('@') ? login : `${login}@unilink.local`;
            const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
            if (error) {
                setErro(error.status === 423
                    ? 'Acesso bloqueado após tentativas incorretas. Solicite o desbloqueio ao administrador.'
                    : error.status === 403
                        ? (error.message || 'Este usuário está desativado. Fale com o administrador.')
                        : error.status === 0
                            ? (error.message || 'Não foi possível conectar ao sistema.')
                            : error.message === 'Invalid login credentials'
                                ? 'Usuário ou senha incorretos.'
                                : (error.message || 'Não foi possível autenticar.'));
                return;
            }
            window.notifySuccess && window.notifySuccess('Login efetuado.');
            aoAutenticar();
        } catch (e) {
            setErro(e?.message || 'Não foi possível autenticar. Tente novamente.');
        } finally {
            setCarregando(false);
        }
    };

        return (
        <section className="splash-art flex min-h-[70dvh] w-full flex-1 items-center justify-center py-8">
            <div className="w-full max-w-[420px]">
                <div className="u-surface overflow-hidden">
                    <div className="h-1.5 bg-[#0E3263] dark:bg-sky-400"></div>
                    <div className="p-6 sm:p-8">
                        <div className="mx-auto mb-6 flex max-w-[300px] justify-center">
                            <Logo variant="full" />
                        </div>

                        <form onSubmit={entrar} className="space-y-4">
                            {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{erro}</div>}
                            <div>
                                <label htmlFor="login-usuario" className="u-label">Usuário</label>
                                <input id="login-usuario" type="text" autoComplete="username" autoFocus required className="u-input !h-11" value={usuario} onChange={e => setUsuario(e.target.value)} disabled={carregando} placeholder="Seu usuário" />
                            </div>
                            <div>
                                <label htmlFor="login-senha" className="u-label">Senha</label>
                                <div className="relative">
                                    <input id="login-senha" type={mostrarSenha ? 'text' : 'password'} autoComplete="current-password" required className="u-input !h-11 !pr-12" value={senha} onChange={e => setSenha(e.target.value)} disabled={carregando} placeholder="Sua senha" />
                                    <button type="button" onClick={() => setMostrarSenha(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}>{mostrarSenha ? 'Ocultar' : 'Mostrar'}</button>
                                </div>
                            </div>
                            <button type="submit" disabled={carregando || !usuario.trim() || !senha} className="btn-primary flex !h-11 w-full !justify-center disabled:cursor-not-allowed disabled:opacity-60">
                                {carregando ? 'Verificando acesso…' : 'Entrar'}
                                {!carregando && <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" /></svg>}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </section>
    );
}