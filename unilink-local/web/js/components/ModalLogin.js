// COMPONENTE: ModalLogin — acesso por usuário, com limite de tentativas e exibir senha
function ModalLogin({ aoAutenticar, fechar }) {
    const [usuario, setUsuario] = React.useState('');
    const [senha, setSenha] = React.useState('');
    const [erro, setErro] = React.useState('');
    const [carregando, setCarregando] = React.useState(false);
    const [mostrarSenha, setMostrarSenha] = React.useState(false);
    const [tentativas, setTentativas] = React.useState(0);
    const [bloqueado, setBloqueado] = React.useState(false);

    // Carrega tentativas salvas no localStorage (persistência entre sessões)
    React.useEffect(() => {
        try {
            const salvo = localStorage.getItem('unilink_tentativas_' + usuario.toLowerCase());
            if (salvo) {
                const data = JSON.parse(salvo);
                if (data.tentativas >= 3) {
                    setTentativas(data.tentativas);
                    setBloqueado(true);
                } else {
                    setTentativas(data.tentativas || 0);
                }
            }
        } catch {}
    }, [usuario]);

    const salvarTentativas = (usuario, tentativas) => {
        try {
            if (usuario) {
                localStorage.setItem('unilink_tentativas_' + usuario.toLowerCase(), JSON.stringify({ tentativas, atualizadoEm: Date.now() }));
            }
        } catch {}
    };

    const limparTentativas = (usuario) => {
        try {
            if (usuario) {
                localStorage.removeItem('unilink_tentativas_' + usuario.toLowerCase());
            }
        } catch {}
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setErro('');
        
        if (bloqueado || tentativas >= 3) {
            setErro('Usuário bloqueado após 3 tentativas incorretas. Contate o administrador para desbloquear.');
            return;
        }

        setCarregando(true);
        try {
            const login = usuario.trim().toLowerCase();
            const emailLogin = login.includes('@') ? login : `${login}@unilink.local`;
            const { error, data } = await supabase.auth.signInWithPassword({ email: emailLogin, password: senha });
            
            if (error) {
                // Verifica se é erro de credenciais inválidas
                if (error.message.includes('Invalid login credentials') || error.message.includes('Invalid credentials')) {
                    const novasTentativas = tentativas + 1;
                    setTentativas(novasTentativas);
                    salvarTentativas(usuario.trim().toLowerCase(), novasTentativas);
                    
                    if (novasTentativas >= 3) {
                        setBloqueado(true);
                        setErro('Usuário bloqueado após 3 tentativas incorretas. Contate o administrador para desbloquear.');
                    } else {
                        setErro(`Usuário ou senha incorretos. Tentativa ${novasTentativas} de 3.`);
                    }
                } else {
                    // Outros erros (rede, etc)
                    setErro(error.message || 'Erro ao autenticar.');
                }
                throw error;
            }
            
            // Login bem-sucedido - limpa tentativas
            limparTentativas(usuario.trim().toLowerCase());
            setTentativas(0);
            setBloqueado(false);
            
            window.notifySuccess && window.notifySuccess('Login efetuado.');
            aoAutenticar();
        } catch (err) {
            console.warn('Erro de autenticação:', err.message);
        } finally {
            setCarregando(false);
        }
    };

    const toggleMostrarSenha = () => {
        setMostrarSenha(!mostrarSenha);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 fade-in" onClick={fechar}>
            <div className="modal-pop w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Acesso</h3>
                    <button type="button" onClick={fechar} aria-label="Fechar" className="icon-btn">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <form onSubmit={handleLogin} className="space-y-3">
                    {erro && <p className="rounded-md bg-[#B3261E]/10 px-3 py-2 text-[13px] text-[#B3261E] dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
                    
                    <div>
                        <label className="u-label">Usuário</label>
                        <input type="text" required autoComplete="username" className="u-input" value={usuario} onChange={(e) => setUsuario(e.target.value)} disabled={carregando} />
                    </div>
                    
                    <div className="relative">
                        <label className="u-label">Senha</label>
                        <div className="relative">
                            <input 
                                type={mostrarSenha ? 'text' : 'password'} 
                                required 
                                autoComplete="current-password" 
                                className="u-input pr-10" 
                                value={senha} 
                                onChange={(e) => setSenha(e.target.value)} 
                                disabled={carregando}
                            />
                            <button 
                                type="button" 
                                onClick={toggleMostrarSenha} 
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                aria-label={mostrarSenha ? 'Ocultar senha' : 'Exibir senha'}
                            >
                                {mostrarSenha ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.061 9.061 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.05 10.05 0 01-4.243 7.825M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={fechar} className="btn-ghost flex-1 !justify-center">Cancelar</button>
                        <button type="submit" disabled={carregando} className="btn-primary flex-1 !justify-center">
                            {carregando ? 'Entrando…' : 'Entrar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}