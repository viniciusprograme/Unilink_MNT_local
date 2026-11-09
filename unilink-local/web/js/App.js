// ==========================================================
// APP: UNILINK — lógica preservada; navegação corporativa
// (breadcrumb + menu por ambiente, sem telas de apresentação).
// ==========================================================
function TelaAusente({ nome }) {
    return (
        <div className="u-surface mx-auto w-full max-w-[480px] p-6 text-center">
            <p className="text-sm text-slate-700 dark:text-slate-200">Não foi possível carregar a tela ({nome}).</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Recarregue com Ctrl+Shift+R — pode ser cache ou CDN bloqueado.</p>
            <button onClick={() => window.location.reload()} className="btn-primary mt-3">Recarregar</button>
        </div>
    );
}

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { erro: null };
    }
    static getDerivedStateFromError(erro) { return { erro }; }
    componentDidCatch(erro, info) {
        try {
            console.warn('ErrorBoundary capturou:', erro && erro.message, info && info.componentStack);
            if (window.UnilinkLogger) window.UnilinkLogger.warn('ErrorBoundary: ' + (erro && erro.message));
        } catch {}
    }
    render() {
        if (this.state.erro) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] p-4 dark:bg-[#0B1220]">
                    <div className="u-surface w-full max-w-[480px] p-6 text-center">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Algo falhou ao renderizar.</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente recarregar (pode ser cache). Se persistir, anote o horário e avise o suporte.</p>
                        <div className="mt-4 flex justify-center gap-2">
                            <button onClick={() => window.location.reload()} className="btn-primary">Recarregar</button>
                            <button onClick={() => this.setState({ erro: null })} className="btn-ghost">Tentar de novo</button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// Hierarquia usada pelo botão Voltar quando não há histórico (ex.: tela aberta direto).
const PAI_TELA = {
    login: 'login', ambientes: 'login', menu: 'splash', solicitante: 'splash', manutencao: 'splash',
    corretiva: 'solicitante', acompanhamento: 'solicitante', sucesso: 'solicitante',
    pendencia: 'manutencao', historico: 'manutencao', dashboard: 'manutencao', admin: 'manutencao',
    'gerenciar-usuarios': 'admin', 'criar-usuario': 'gerenciar-usuarios', 'usuario-detalhe': 'gerenciar-usuarios'
};
// Telas que nunca entram no histórico (não faz sentido "voltar" para elas).
const TELAS_SEM_RETORNO = ['sucesso', 'primeiro-acesso'];

// Busca o perfil com novas tentativas. Falha transitória (rede, API lenta, timeout) NÃO pode
// virar "sem perfil": isso fazia o admin ser tratado como solicitante e expulso da Manutenção.
async function buscarPerfilComRetry() {
    const TENTATIVAS = 3;
    let ultimoErro = null;
    for (let i = 0; i < TENTATIVAS; i++) {
        try {
            const perfil = await Promise.race([
                ChamadosService.obterMeuPerfil(),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout perfil')), 8000))
            ]);
            if (perfil) return perfil;
            ultimoErro = new Error('perfil indisponível');
        } catch (e) {
            if (e?.status === 401 || e?.status === 403) throw e; // sessão inválida: não adianta tentar de novo
            ultimoErro = e;
        }
        if (i < TENTATIVAS - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
    throw ultimoErro || new Error('perfil indisponível');
}

function App() {
    const [telaAtual, setTelaAtual] = React.useState('login');
    const [chamados, setChamados] = React.useState([]);
    const [exibirLogin, setExibirLogin] = React.useState(false);
    const [destinoAposLogin, setDestinoAposLogin] = React.useState('pendencia');
    const [chamadoRecemCriado, setChamadoRecemCriado] = React.useState(null);
    const [detalheRapido, setDetalheRapido] = React.useState(null);
    const [protocoloBusca, setProtocoloBusca] = React.useState('');
    const [meuPerfil, setMeuPerfil] = React.useState(null);
    const [usuarioDetalhe, setUsuarioDetalhe] = React.useState(null);
    const [autenticado, setAutenticado] = React.useState(false);
    const [carregandoAuth, setCarregandoAuth] = React.useState(true);
    const [perfilErro, setPerfilErro] = React.useState(false);

    // ---------- Navegação: botão Voltar do app + botão/gesto voltar do navegador e do celular ----------
    const pilhaTelasRef = React.useRef([]);          // telas visitadas antes da atual
    const telaAnteriorRef = React.useRef('splash');
    const voltandoRef = React.useRef(false);         // a troca de tela atual veio de um "voltar"
    const armadilhaRef = React.useRef(false);        // existe 1 entrada extra no histórico do navegador
    const ignorarPopRef = React.useRef(false);
    const estadoNavRef = React.useRef({});
    estadoNavRef.current = { telaAtual, exibirLogin, detalheRapido };

    const voltar = () => {
        const e = estadoNavRef.current;
        if (e.exibirLogin) { setExibirLogin(false); return; }       // 1º fecha modal de login
        if (e.detalheRapido) { setDetalheRapido(null); return; }    // ou o detalhe aberto
        if (e.telaAtual === 'splash' || e.telaAtual === 'primeiro-acesso') return;
        const pilha = pilhaTelasRef.current;
        const destino = pilha.length ? pilha[pilha.length - 1] : (PAI_TELA[e.telaAtual] || 'splash');
        if (destino === e.telaAtual) return;
        if (pilha.length) pilha.pop();
        voltandoRef.current = true;
        setTelaAtual(destino);
    };

    // mantém a pilha de telas
    React.useEffect(() => {
        const anterior = telaAnteriorRef.current;
        if (anterior === telaAtual) return;
        telaAnteriorRef.current = telaAtual;
        const pilha = pilhaTelasRef.current;
        if (voltandoRef.current) { voltandoRef.current = false; }
        else if (telaAtual === 'splash') { pilha.length = 0; }
        else if (pilha.length && pilha[pilha.length - 1] === telaAtual) { pilha.pop(); }
        else if (!TELAS_SEM_RETORNO.includes(anterior) && !TELAS_SEM_RETORNO.includes(telaAtual)) { pilha.push(anterior); }
    }, [telaAtual]);

    // fora do início, mantém 1 entrada extra no histórico para o "voltar" do navegador/celular ser capturado
    React.useEffect(() => {
        if (telaAtual === 'splash') {
            if (armadilhaRef.current) {
                armadilhaRef.current = false;
                ignorarPopRef.current = true;
                window.history.back();
            }
        } else if (!armadilhaRef.current) {
            window.history.pushState({ unilink: true }, '');
            armadilhaRef.current = true;
        }
    }, [telaAtual]);

    React.useEffect(() => {
        const aoVoltarNavegador = () => {
            if (ignorarPopRef.current) { ignorarPopRef.current = false; return; }
            armadilhaRef.current = false;                       // a entrada extra foi consumida
            const e = estadoNavRef.current;
            const trocaTela = !e.exibirLogin && !e.detalheRapido && e.telaAtual !== 'splash' && e.telaAtual !== 'primeiro-acesso';
            voltar();
            if (!trocaTela && e.telaAtual !== 'splash') {       // só fechou modal / tela travada: rearma
                window.history.pushState({ unilink: true }, '');
                armadilhaRef.current = true;
            }
        };
        window.addEventListener('popstate', aoVoltarNavegador);
        return () => window.removeEventListener('popstate', aoVoltarNavegador);
    }, []);
    const [darkMode, setDarkMode] = React.useState(() => {
        try {
            const salvo = localStorage.getItem('unilink_dark');
            if (salvo !== null) return salvo === 'true';
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch { return false; }
    });

    React.useEffect(() => {
        try { localStorage.setItem('unilink_dark', String(darkMode)); } catch {}
        document.documentElement.classList.toggle('dark', darkMode);
    }, [darkMode]);

    React.useEffect(() => {
        const unsubscribe = ChamadosService.assinarChamados(setChamados);
        return () => unsubscribe();
    }, []);

    const lastSessionIdRef = React.useRef(null);
    const isFetchingPerfilRef = React.useRef(false);
    const meuPerfilRef = React.useRef(meuPerfil);
    React.useEffect(() => { meuPerfilRef.current = meuPerfil; }, [meuPerfil]);
    React.useEffect(() => {
        const aplicarSessao = async (session) => {
            const sessionId = session?.user?.id || null;
            if (sessionId && lastSessionIdRef.current === sessionId && !session) return;
            if (isFetchingPerfilRef.current) return;
            lastSessionIdRef.current = sessionId;
            const isAuth = !!session;
            if (isAuth) setCarregandoAuth(true);
            setAutenticado(isAuth);
            if (isAuth) {
                if (isFetchingPerfilRef.current) { setCarregandoAuth(false); return; }
                isFetchingPerfilRef.current = true;
                try {
                    const perfil = await buscarPerfilComRetry();
                    setMeuPerfil(perfil);
                    setPerfilErro(false);
                } catch (e) {
                    const authInvalida = e?.status === 401 || e?.status === 403 || /sess[ãa]o/i.test(e?.message || '');
                    if (authInvalida) {
                        console.warn('Sessão inválida ao obter perfil; encerrando sessão.', e?.message);
                        window.notifyWarning && window.notifyWarning(e?.message || 'Sessão expirada. Faça login novamente.');
                        try { await supabase.auth.signOut(); } catch {}
                        lastSessionIdRef.current = null;
                        setAutenticado(false);
                        setMeuPerfil(null);
                    } else if (meuPerfilRef.current && meuPerfilRef.current.email === (session?.user?.email || '')) {
                        console.warn('obterMeuPerfil falhou; mantendo o perfil anterior para evitar rebaixamento indevido.', e?.message);
                        setMeuPerfil(meuPerfilRef.current);
                    } else {
                        console.warn('obterMeuPerfil falhou após novas tentativas; exibindo opção de tentar novamente.', e?.message);
                        setMeuPerfil(null);
                        setPerfilErro(true);
                    }
                } finally {
                    isFetchingPerfilRef.current = false;
                }
            } else {
                setMeuPerfil(null);
                setPerfilErro(false);
                lastSessionIdRef.current = null;
            }
            setCarregandoAuth(false);
        };
        const timeout = setTimeout(() => setCarregandoAuth(false), 3000);
        try {
            if (typeof supabase === 'undefined' || !supabase?.auth) {
                console.error('Supabase não carregou (CDN bloqueado?)');
                setCarregandoAuth(false);
            } else {
                supabase.auth.getSession().then(({ data: { session } }) => {
                    clearTimeout(timeout);
                    aplicarSessao(session);
                }).catch(err => {
                    console.error('getSession falhou:', err);
                    clearTimeout(timeout);
                    setCarregandoAuth(false);
                    setAutenticado(false);
                });
                const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
                    const newId = session?.user?.id || null;
                    if (event === 'TOKEN_REFRESHED' && newId && lastSessionIdRef.current === newId && meuPerfilRef.current) return;
                    await aplicarSessao(session);
                });
                return () => { clearTimeout(timeout); listener?.subscription?.unsubscribe(); };
            }
        } catch (e) {
            console.error('Erro inicial auth:', e);
            setCarregandoAuth(false);
        }
        return () => clearTimeout(timeout);
    }, []);

    const papelUsuario = () => {
        const p = String(meuPerfil?.papel || '').trim().toLowerCase();
        return ['solicitante', 'atendente', 'supervisor', 'administrador'].includes(p) ? p : '';
    };
    const ehAdministrador = () => papelUsuario() === 'administrador';
    const ehSupervisor = () => ['supervisor', 'administrador'].includes(papelUsuario());
    const ehAtendente = () => papelUsuario() === 'atendente';
    const ambientesPermitidosPorPapel = (papel) => {
        const p = String(papel || '').trim().toLowerCase();
        if (!p) return ['solicitante'];
        if (p === 'solicitante') return ['solicitante'];
        if (['atendente', 'supervisor', 'administrador'].includes(p)) return ['solicitante', 'manutencao'];
        return ['solicitante'];
    };
    const ambientesPermitidos = Array.isArray(meuPerfil?.ambientesPermitidos)
        ? meuPerfil.ambientesPermitidos
        : (meuPerfil ? ambientesPermitidosPorPapel(meuPerfil?.papel) : ['solicitante']);
    const podeSolicitar = ambientesPermitidos.includes('solicitante');
    const podeManutencao = !!meuPerfil && (ehSupervisor() || ambientesPermitidos.includes('manutencao') || ehAdministrador());

    React.useEffect(() => {
        if (!carregandoAuth && autenticado && telaAtual === 'login' && !exibirLogin) {
            setTelaAtual('splash');
        }
    }, [autenticado, carregandoAuth, telaAtual, exibirLogin]);

    React.useEffect(() => {
        if (!carregandoAuth && !autenticado && telaAtual !== 'login' && !exibirLogin && telaAtual !== 'primeiro-acesso') {
            setTelaAtual('login');
        }
    }, [autenticado, carregandoAuth, telaAtual, exibirLogin]);

    React.useEffect(() => {
        const telasManutencao = ['manutencao', 'pendencia', 'historico', 'dashboard', 'admin', 'gerenciar-usuarios', 'criar-usuario', 'usuario-detalhe'];
        if (autenticado && meuPerfil && !podeManutencao && (telasManutencao.includes(telaAtual) || telaAtual === 'splash')) {
            setTelaAtual(podeSolicitar ? 'solicitante' : 'login');
        }
    }, [autenticado, meuPerfil, podeManutencao, podeSolicitar, telaAtual]);

    const irManutencao = () => {
        if (!autenticado) { setTelaAtual('login'); return; }
        if (!podeManutencao) { window.notifyWarning && window.notifyWarning('Seu perfil não possui acesso ao ambiente de Manutenção.'); return; }
        setTelaAtual('manutencao');
    };
    const solicitarLoginUnico = () => setTelaAtual('login');

    const handleSair = async () => {
        await ChamadosService.logout();
        setMeuPerfil(null);
        setAutenticado(false);
        setTelaAtual('login');
        window.notifyInfo && window.notifyInfo('Sessão encerrada.');
    };
    const handleLoginSucesso = () => {
        setExibirLogin(false);
        setTelaAtual('login'); // o efeito de sessão encaminha para o ambiente permitido
    };

    const adicionarChamado = async (novoChamado) => {
        try {
            const { fotos, ...dadosChamado } = novoChamado;
            const criado = await ChamadosService.criarChamado(dadosChamado);
            if (fotos && fotos.length > 0) {
                for (const foto of fotos) {
                    try { await ChamadosService.uploadEvidencia(criado.idFirebase, foto, 'ABERTURA'); }
                    catch (erroFoto) { console.error('Erro ao enviar evidência da abertura:', erroFoto); window.notifyWarning && window.notifyWarning('Chamado aberto, mas falha ao enviar foto: ' + erroFoto.message); }
                }
            }
            setChamadoRecemCriado(criado);
            setTelaAtual('sucesso');
            window.notifySuccess && window.notifySuccess('Protocolo ' + criado.protocolo + ' registrado.');
        } catch (e) {
            console.error("Erro ao adicionar chamado: ", e);
            window.notifyError && window.notifyError('Não foi possível abrir o chamado. Verifique sua conexão e tente novamente. (' + e.message + ')');
        }
    };

    const abrirAcompanhamento = (protocolo = '') => {
        setProtocoloBusca(protocolo);
        setTelaAtual('acompanhamento');
    };
    const [chamadoPendenteAcao, setChamadoPendenteAcao] = React.useState(null);
    const assumirChamado = async (chamado) => {
        try {
            await ChamadosService.assumirChamado(chamado);
            setChamadoPendenteAcao(null);
            window.notifySuccess && window.notifySuccess(`${chamado.protocolo || ''} em atendimento.`.trim());
        }
        catch (e) {
            console.error("Erro ao assumir: ", e);
            const msg = e.message || 'Não foi possível assumir.';
            if (msg.includes('Sessão') || msg.includes('expirada') || msg.includes('Token')) {
                setChamadoPendenteAcao(chamado);
                setDestinoAposLogin('pendencia');
                setExibirLogin(true);
                window.notifyWarning && window.notifyWarning('Sessão expirada. Faça login para assumir.');
            } else {
                window.notifyError && window.notifyError(msg);
                if (msg.includes('conectar à API')) setChamadoPendenteAcao(chamado);
            }
            throw e;
        }
    };
    React.useEffect(() => {
        if (autenticado && chamadoPendenteAcao && !carregandoAuth) {
            const c = chamadoPendenteAcao;
            setChamadoPendenteAcao(null);
            assumirChamado(c).catch(() => {});
        }
    }, [autenticado, carregandoAuth]);
    React.useEffect(() => {
        if (autenticado && !carregandoAuth && meuPerfil?.precisaTrocarSenha) setTelaAtual('primeiro-acesso');
    }, [autenticado, carregandoAuth, meuPerfil]);

    // Roteamento inicial baseado no perfil: solicitante não precisa escolher ambiente.
    React.useEffect(() => {
        if (carregandoAuth) return;
        if (!autenticado) {
            if (telaAtual !== 'login') setTelaAtual('login');
            return;
        }
        if (meuPerfil?.precisaTrocarSenha) {
            if (telaAtual !== 'primeiro-acesso') setTelaAtual('primeiro-acesso');
            return;
        }
        if (telaAtual === 'login') {
            const ambientes = Array.isArray(meuPerfil?.ambientesPermitidos)
                ? meuPerfil.ambientesPermitidos
                : (meuPerfil && papelUsuario() ? ambientesPermitidosPorPapel(papelUsuario()) : ['solicitante', 'manutencao']);
            setTelaAtual(ambientes.length === 1 && ambientes[0] === 'solicitante' ? 'solicitante' : 'splash');
        }
    }, [autenticado, carregandoAuth, meuPerfil, telaAtual]);
    const toggleAtendimento = async (chamado) => {
        try { await ChamadosService.toggleAtendimento(chamado); }
        catch (e) {
            console.error("Erro ao atualizar atendimento: ", e);
            window.notifyError && window.notifyError(e.message || 'Não foi possível atualizar. Faça login novamente.');
        }
    };
    const encerrarChamado = async (chamado, servicoFeito, pendencia) => {
        try { await ChamadosService.encerrarChamado(chamado, servicoFeito, pendencia); }
        catch (e) {
            console.error("Erro ao encerrar chamado: ", e);
            window.notifyError && window.notifyError(e.message || 'Não foi possível encerrar. Faça login novamente.');
        }
    };
    const concluirChamado = async (chamado, dados) => {
        try {
            const res = await ChamadosService.concluirChamado(chamado, dados);
            window.notifySuccess && window.notifySuccess(res?.tipo === 'parcial' ? 'Conclusão parcial registrada.' : 'Chamado concluído.');
            return res;
        } catch (e) {
            console.error("Erro ao concluir: ", e);
            window.notifyError && window.notifyError(e.message || 'Não foi possível concluir.');
            throw e;
        }
    };

    const ToggleDark = () => (
        <button
            onClick={() => setDarkMode(v => !v)}
            title={darkMode ? 'Modo claro' : 'Modo escuro'}
            aria-label={darkMode ? 'Modo claro' : 'Modo escuro'}
            className="icon-btn"
        >
            {darkMode ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
            )}
        </button>
    );

    const ambiente = ['pendencia', 'historico', 'dashboard', 'manutencao', 'admin'].includes(telaAtual)
        ? 'Manutenção'
        : ['corretiva', 'acompanhamento', 'sucesso', 'solicitante'].includes(telaAtual)
            ? 'Solicitante'
            : null;

    const NAV = {
        'Solicitante': [
            { k: 'corretiva', l: 'Novo', icon: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg> },
            { k: 'acompanhamento', l: 'Acompanhar', icon: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg> }
        ],
        'Manutenção': [
            { k: 'pendencia', l: 'Chamados', icon: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.734-.05a2.5 2.5 0 111.316 4.813 2.5 2.5 0 01-3.05-3.05z" /></svg> },
            { k: 'historico', l: 'Histórico', icon: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
            { k: 'dashboard', l: 'Dashboard', icon: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 12l3-3 3 3 4-4" /></svg> }
        ]
    };

    const irNav = (k) => {
        if (meuPerfil?.precisaTrocarSenha) { setTelaAtual('primeiro-acesso'); return; }
        if (k === 'admin') {
            if (!autenticado) { setDestinoAposLogin('admin'); setExibirLogin(true); return; }
            if (!ehAdministrador()) { window.notifyWarning && window.notifyWarning('Acesso restrito ao administrador.'); return; }
            setTelaAtual('admin');
            return;
        }
        if (['pendencia', 'historico', 'dashboard', 'admin', 'gerenciar-usuarios'].includes(k) && !podeManutencao) {
            window.notifyWarning && window.notifyWarning('Seu perfil não possui acesso ao ambiente de Manutenção.');
            return;
        }
        if (k === 'pendencia' || k === 'historico' || k === 'dashboard') {
            if (autenticado && podeManutencao) { setTelaAtual(k); return; }
            setDestinoAposLogin(k);
            setExibirLogin(true);
            return;
        }
        setTelaAtual(k);
    };

    const pendentesCount = chamados.filter(c => !c.concluido).length;
    const telasConteudo = ['corretiva', 'acompanhamento', 'sucesso', 'pendencia', 'historico', 'dashboard', 'admin', 'gerenciar-usuarios', 'criar-usuario', 'usuario-detalhe'];
    const showDock = telasConteudo.includes(telaAtual) && telaAtual !== 'login' && (ambiente === 'Solicitante' ? podeSolicitar : autenticado && podeManutencao);
    const emAtendimento = chamados
        .filter(c => !c.concluido && (c.status === 'EM_ATENDIMENTO' || c.emAtendimento || c.status === 'AGUARDANDO_USUARIO'))
        .sort((a, b) => {
            const ua = a.prioridade === 'Urgente';
            const ub = b.prioridade === 'Urgente';
            if (ua !== ub) return ua ? -1 : 1;
            return calcularDiasDecorridos(b.dataAbertura) - calcularDiasDecorridos(a.dataAbertura);
        })
        .slice(0, 5);

    const abertosOp = chamados.filter(c => !c.concluido);
    const emAtendOp = abertosOp.filter(c => c.status === 'EM_ATENDIMENTO' || c.emAtendimento);
    const urgOp = abertosOp.filter(c => c.prioridade === 'Urgente');
    const hojeOp = chamados.filter(c => {
        try {
            if (typeof parseDataBR !== 'function') return false;
            const dt = parseDataBR(c.dataAbertura);
            const h = new Date();
            return dt && dt.getFullYear() === h.getFullYear() && dt.getMonth() === h.getMonth() && dt.getDate() === h.getDate();
        } catch { return false; }
    });
    const recentesSol = obterProtocolosRecentes();

    const EnvRow = ({ icon, label, badge, onClick, destaque }) => (
        <button onClick={onClick} className="u-surface flex w-full items-center gap-3 p-4 text-left transition hover:border-slate-300 dark:hover:border-slate-600">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${destaque ? 'bg-[#0E3263] text-white dark:bg-sky-400/15 dark:text-sky-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{icon}</span>
            <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
            {badge}
            <svg className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
    );
    const ICONS = {
        plus: <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>,
        search: <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>,
        wrench: <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.734-.05a2.5 2.5 0 111.316 4.813 2.5 2.5 0 01-3.05-3.05z" /></svg>,
        clock: <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
        chart: <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 12l3-3 3 3 4-4" /></svg>,
        shield: <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /></svg>
    };

    if (carregandoAuth) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] px-4 dark:bg-[#0B1220]">
                <div className="u-surface w-full max-w-[360px] p-6 text-center">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-[#0E3263] dark:border-slate-700 dark:border-t-sky-400" />
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Validando sessão...</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Aguarde enquanto a autenticação é restaurada.</p>
                </div>
            </div>
        );
    }

    if (autenticado && !meuPerfil && perfilErro) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] px-4 dark:bg-[#0B1220]">
                <div className="u-surface w-full max-w-[400px] p-6 text-center">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Não foi possível carregar o seu perfil.</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Isso não altera o seu cargo. Verifique a conexão e tente novamente.</p>
                    <div className="mt-4 flex justify-center gap-2">
                        <button onClick={() => window.location.reload()} className="btn-primary">Tentar novamente</button>
                        <button onClick={handleSair} className="btn-ghost">Sair</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#F4F6F8] text-slate-900 antialiased selection:bg-[#0E3263]/10 dark:bg-[#0B1220] dark:text-slate-100">
            <ToastContainer />
            {exibirLogin && (
                <ModalLogin
                    aoAutenticar={handleLoginSucesso}
                    fechar={() => setExibirLogin(false)}
                />
            )}
            {detalheRapido && (
                <ModalDetalhes
                    chamado={detalheRapido}
                    chamados={chamados}
                    aoFechar={() => setDetalheRapido(null)}
                    aoImprimir={(c) => imprimirOrdemServico(c)}
                />
            )}

            {!['login', 'splash'].includes(telaAtual) && (
                <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-[#1F2937] dark:bg-[#0B1220]/80">
                    <div className="mx-auto flex h-12 w-full max-w-[1280px] items-center gap-3 px-4 sm:px-5">
                        {telaAtual !== 'primeiro-acesso' && (
                            <button
                                type="button"
                                onClick={voltar}
                                title="Voltar"
                                aria-label="Voltar"
                                className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                        )}
                        <button onClick={() => setTelaAtual(podeManutencao ? 'splash' : 'solicitante')} className="flex min-w-0 items-baseline gap-1.5" title="Início">
                            <span className="text-[15px] font-extrabold italic tracking-tight text-[#0E3263] dark:text-white">UNILINK</span>
                            {ambiente && <span className="whitespace-nowrap text-[13px] text-slate-400">/ {ambiente}</span>}
                        </button>
                        <div className="ml-auto flex items-center gap-1">
                            {autenticado && meuPerfil && (
                                <span className="mr-1 hidden items-center gap-2 md:flex">
                                    <span className="max-w-[220px] truncate text-xs text-slate-500 dark:text-slate-400">{meuPerfil.usuario || extrairUsuario(meuPerfil.email)}</span>
                                    <button onClick={handleSair} className="text-xs text-slate-500 hover:text-slate-800 hover:underline dark:hover:text-slate-200">Sair</button>
                                </span>
                            )}
                            {autenticado && meuPerfil && (
                                <button onClick={handleSair} className="mr-1 text-xs text-slate-500 hover:underline md:hidden">Sair</button>
                            )}
                            <ToggleDark />
                        </div>
                    </div>
                </header>
            )}

            <main key={telaAtual} className={`screen-enter app-main mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-4 sm:px-5 ${showDock ? 'pb-28' : 'pb-6'}`}>
                {telaAtual === 'login' && (
                    typeof TelaLogin !== 'undefined'
                        ? <TelaLogin aoAutenticar={handleLoginSucesso} />
                        : <TelaAusente nome="login" />
                )}
                {telaAtual === 'splash' && (
                    <div className="splash-art mx-auto flex w-full max-w-[640px] flex-1 flex-col py-6">
                        <div className="absolute right-3 top-3"><ToggleDark /></div>
                        <div className="m-auto w-full">
                        <div className="anim-rise d1 u-surface mb-4 overflow-hidden">
                              <div className="h-1.5 bg-[#0E3263] dark:bg-sky-400"></div>
                              <div className="p-6 text-center sm:p-8">
                                      <div className="mx-auto mb-5 max-w-[300px]">
                                <Logo variant="full" />
                                </div>
                               <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Escolha um ambiente</h1>
                               <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Os ambientes disponíveis para sua conta.</p>
                          </div>
                      </div>
                        <div className={`grid gap-3 ${podeSolicitar && podeManutencao ? 'sm:grid-cols-2' : 'mx-auto max-w-[420px] grid-cols-1'}`}>
                            {podeSolicitar && <div className="anim-rise d2">
                            <button onClick={() => setTelaAtual('solicitante')} className="env-card u-surface h-full w-full p-5 text-left sm:p-6">
                                <span className="env-ic flex h-11 w-11 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                </span>
                                <span className="mt-4 flex items-center justify-between text-[15px] font-medium text-slate-800 dark:text-slate-100">
                                    Solicitante
                                    <svg className="h-4 w-4 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </span>
                            </button>
                            </div>}
                            {podeManutencao && <div className="anim-rise d3">
                            <button onClick={irManutencao} className="env-card u-surface h-full w-full border-[#0E3263]/30 p-5 text-left sm:p-6 dark:border-sky-400/20 dark:hover:border-sky-400/40">
                                <span className="env-ic flex h-11 w-11 items-center justify-center rounded-md bg-[#0E3263] text-white dark:bg-sky-400/15 dark:text-sky-300">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.734-.05a2.5 2.5 0 111.316 4.813 2.5 2.5 0 01-3.05-3.05z" /></svg>
                                </span>
                                <span className="mt-4 flex items-center justify-between text-[15px] font-medium text-slate-800 dark:text-slate-100">
                                    <span className="flex items-center gap-2">
                                        Manutenção
                                        {pendentesCount > 0 && <span className="rounded bg-[#0E3263]/10 px-1.5 py-0.5 text-[11px] tabular-nums text-[#0E3263] dark:bg-sky-400/10 dark:text-sky-300">{pendentesCount}</span>}
                                    </span>
                                    <svg className="h-4 w-4 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </span>
                            </button>
                            </div>}
                        </div>
                        <div className="anim-rise d4 mt-5 flex items-center justify-center gap-1.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                            <span className="relative flex w-1.5 h-1.5">
                                <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-[#1B7A4D]"></span>
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#1B7A4D]"></span>
                            </span>
                            {abertosOp.length} abertos, {emAtendOp.length} em atendimento
                        </div>
                    </div>
                    </div>
                )}

                {telaAtual === 'menu' && (
                    <div className="u-surface mx-auto w-full max-w-[480px] p-6 text-center">
                        <p className="text-sm text-slate-500">Área reorganizada.</p>
                        <button onClick={() => setTelaAtual('splash')} className="btn-primary mt-3">Início</button>
                    </div>
                )}

                {telaAtual === 'solicitante' && podeSolicitar && (
                    <div className="page-art mx-auto my-auto w-full max-w-[720px] py-6">
                        <PageHeader
                            title="Solicitante"
                            actions={podeManutencao ? (
                                <button onClick={() => setTelaAtual('splash')} className="btn-ghost !min-h-[32px] !px-3 !py-1.5 !text-xs" title="Trocar de ambiente">
                                    <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>
                                    Ambientes
                                </button>
                            ) : null}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <EnvRow destaque label="Novo chamado" onClick={() => setTelaAtual('corretiva')} icon={ICONS.plus} />
                            <EnvRow label="Acompanhar chamados" badge={recentesSol.length > 0 ? <span className="font-mono text-[11px] text-slate-400">#{String(recentesSol[0]).replace(/^#/, '')}</span> : null} onClick={() => abrirAcompanhamento()} icon={ICONS.search} />
                        </div>
                    </div>
                )}
                {telaAtual === 'corretiva' && (typeof TelaCorretiva !== 'undefined' ? <TelaCorretiva aoSalvar={adicionarChamado} /> : <TelaAusente nome="corretiva" />)}
                {telaAtual === 'acompanhamento' && (
                    typeof TelaAcompanhamento !== 'undefined' ? <TelaAcompanhamento protocoloInicial={protocoloBusca} autenticado={autenticado} /> : <TelaAusente nome="acompanhamento" />
                )}
                {telaAtual === 'manutencao' && autenticado && podeManutencao && (
                    <div className="page-art mx-auto my-auto w-full max-w-[960px] py-6">
                        <PageHeader
                            title="Manutenção"
                            meta={meuPerfil ? `${meuPerfil.usuario || extrairUsuario(meuPerfil.email)}, ${meuPerfil.papel}` : null}
                            actions={
                                <span className="flex items-center gap-2">
                                    {podeSolicitar && <button onClick={() => setTelaAtual('splash')} className="btn-ghost !min-h-[32px] !px-3 !py-1.5 !text-xs" title="Trocar de ambiente">
                                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>
                                        Ambientes
                                    </button>}
                                    <button onClick={handleSair} className="btn-ghost !min-h-[32px] !px-3 !py-1.5 !text-xs">Sair</button>
                                </span>
                            }
                        />
                        <div className="grid items-start gap-4 lg:grid-cols-2">
                        <div className="u-surface mb-4 grid grid-cols-4 divide-x u-divider lg:col-start-1 lg:mb-0">
                            {[
                                ['Abertos', abertosOp.length, false],
                                ['Em atendimento', emAtendOp.length, false],
                                ['Urgentes', urgOp.length, urgOp.length > 0],
                                ['Hoje', hojeOp.length, false]
                            ].map(([rotulo, valor, alerta]) => (
                                <div key={rotulo} className="px-3 py-2.5 text-center">
                                    <div className={`text-xl font-semibold tabular-nums leading-none ${alerta ? 'text-[#B3261E] dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>{valor}</div>
                                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{rotulo}</div>
                                </div>
                            ))}
                        </div>
                        <div className="u-surface mb-4 px-4 py-3 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:mb-0">
                            <SectionTitle action={emAtendimento.length > 0 ? <span className="text-[11px] tabular-nums text-slate-400">{emAtendimento.length}</span> : null}>Em atendimento</SectionTitle>
                            {emAtendimento.length === 0 ? (
                                <p className="py-1 text-xs text-slate-500 dark:text-slate-400">Nenhum chamado em atendimento.</p>
                            ) : (
                                <ul className="divide-y u-divider">
                                    {emAtendimento.map(c => (
                                        <li key={c.idFirebase}>
                                            <button onClick={() => setDetalheRapido(c)} className="flex w-full items-center gap-3 py-2 text-left">
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.equipamento}</span>
                                                    <ProtocoloTag codigo={c.protocolo} copiar={false} />
                                                </span>
                                                <PriorityBadge prioridade={c.prioridade} />
                                                <span className="w-14 shrink-0 text-right"><TempoAberto dataAbertura={c.dataAbertura} /></span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="grid gap-3 lg:col-start-1">
                            <EnvRow destaque label="Chamados" badge={pendentesCount > 0 ? <span className="rounded bg-[#0E3263]/10 px-1.5 py-0.5 text-[11px] tabular-nums text-[#0E3263] dark:bg-sky-400/10 dark:text-sky-300">{pendentesCount}</span> : null} onClick={() => setTelaAtual('pendencia')} icon={ICONS.wrench} />
                            <EnvRow label="Histórico" onClick={() => setTelaAtual('historico')} icon={ICONS.clock} />
                            <EnvRow label="Dashboard" onClick={() => setTelaAtual('dashboard')} icon={ICONS.chart} />
                            {ehAdministrador() && <EnvRow destaque label="Gerenciar usuários" onClick={() => setTelaAtual('gerenciar-usuarios')} icon={ICONS.shield} />}
                        </div>
                        </div>
                    </div>
                )}
                {telaAtual === 'manutencao' && (!autenticado || !podeManutencao) && (
                    <div className="page-art mx-auto my-auto w-full max-w-[420px] py-6">
                        <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Manutenção</h1>
                        <div className="u-surface mt-3 flex items-center justify-between gap-3 px-4 py-3">
                            <p className="text-sm text-slate-500 dark:text-slate-400">Acesso restrito.</p>
                            <button onClick={solicitarLoginUnico} className="btn-primary shrink-0">Entrar</button>
                        </div>
                        <button onClick={() => setTelaAtual('solicitante')} className="mt-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Entrar como solicitante</button>
                    </div>
                )}
                {telaAtual === 'pendencia' && (
                    typeof TelaPendencia !== 'undefined' ? (
                    <TelaPendencia
                        chamados={chamados}
                        assumir={assumirChamado}
                        concluir={concluirChamado}
                        encerrar={encerrarChamado}
                        toggleAtendimento={toggleAtendimento}
                        aoNovo={() => setTelaAtual('corretiva')}
                    />
                    ) : <TelaAusente nome="pendencia" />
                )}
                {telaAtual === 'historico' && (
                    typeof TelaHistorico !== 'undefined' ? <TelaHistorico chamados={chamados} assumir={assumirChamado} /> : <TelaAusente nome="historico" />
                )}
                {telaAtual === 'dashboard' && (
                    typeof TelaDashboard !== 'undefined' ? <TelaDashboard chamados={chamados} /> : <TelaAusente nome="dashboard" />
                )}
                {telaAtual === 'usuario-detalhe' && (
                    typeof TelaUsuarioDetalhe !== 'undefined' ? (
                        <TelaUsuarioDetalhe
                            usuario={usuarioDetalhe}
                            onVoltar={() => setTelaAtual('admin')}
                            usuarios={usuarios}
                            onAtualizar={(u) => setUsuarioDetalhe(u)}
                        />
                    ) : <TelaAusente nome="usuario-detalhe" />
                )}
                {telaAtual === 'admin' && (
                    autenticado && ehAdministrador()
                        ? (typeof TelaAdmin !== 'undefined' ? <TelaAdmin onAbrirGerenciar={() => setTelaAtual('gerenciar-usuarios')} /> : <TelaAusente nome="admin" />)
                        : <div className="u-surface mx-auto w-full max-w-[480px] p-6 text-center"><p className="text-sm text-slate-500">Acesso restrito ao administrador.</p><button onClick={() => setTelaAtual('splash')} className="btn-primary mt-3">Início</button></div>
                )}
                {telaAtual === 'gerenciar-usuarios' && (
                    autenticado && ehAdministrador()
                        ? (typeof TelaGerenciarUsuarios !== 'undefined' ? <TelaGerenciarUsuarios onVoltar={() => setTelaAtual('admin')} onCriarUsuario={() => setTelaAtual('criar-usuario')} /> : <TelaAusente nome="gerenciar-usuarios" />)
                        : <div className="u-surface mx-auto w-full max-w-[480px] p-6 text-center"><p className="text-sm text-slate-500">Acesso restrito ao administrador.</p><button onClick={() => setTelaAtual('splash')} className="btn-primary mt-3">Início</button></div>
                )}
                {telaAtual === 'criar-usuario' && (
                    autenticado && ehAdministrador()
                        ? (typeof TelaGerenciarUsuarios !== 'undefined' ? <TelaGerenciarUsuarios modo="criar" onVoltar={() => setTelaAtual('gerenciar-usuarios')} onCriarUsuario={() => setTelaAtual('criar-usuario')} /> : <TelaAusente nome="criar-usuario" />)
                        : <div className="u-surface mx-auto w-full max-w-[480px] p-6 text-center"><p className="text-sm text-slate-500">Acesso restrito ao administrador.</p><button onClick={() => setTelaAtual('splash')} className="btn-primary mt-3">Início</button></div>
                )}
                {telaAtual === 'primeiro-acesso' && (
                    typeof TelaRedefinirSenha !== 'undefined' ? (
                    <TelaRedefinirSenha
                        semVoltar
                        aoSucesso={async () => {
                            try { await ApiClient.patch('/meu-perfil/senha-trocada'); } catch {}
                            setMeuPerfil((p) => p ? { ...p, precisaTrocarSenha: false } : p);
                            window.history.replaceState(null, '', window.location.pathname);
                            setTelaAtual('login');
                            window.notifySuccess && window.notifySuccess('Senha criada. Bem-vindo!');
                        }}
                    />
                    ) : <TelaAusente nome="primeiro-acesso" />
                )}
                {telaAtual === 'sucesso' && (
                    typeof TelaSucesso !== 'undefined' ? (
                    <TelaSucesso
                        chamado={chamadoRecemCriado}
                        voltarInicio={() => setTelaAtual(podeManutencao ? 'splash' : 'solicitante')}
                        aoNovo={() => setTelaAtual('corretiva')}
                        aoAcompanhar={() => abrirAcompanhamento(chamadoRecemCriado?.protocolo)}
                    />
                    ) : <TelaAusente nome="sucesso" />
                )}
            </main>

            {showDock && (
                <nav className="print:hidden fixed inset-x-0 bottom-0 z-30 flex justify-center px-4" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                    <div className="flex items-center gap-0.5 rounded-2xl border border-slate-200 bg-white/95 px-1.5 py-1.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
                        <button
                            onClick={() => setTelaAtual(podeManutencao ? 'splash' : 'solicitante')}
                            title="Voltar ao início"
                            aria-label="Voltar ao início"
                            className="flex items-center justify-center rounded-xl px-3 py-2 text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" /></svg>
                        </button>
                        <span className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700"></span>
                        {(NAV[ambiente] || []).map(item => {
                            const ativo = telaAtual === item.k;
                            return (
                                <button
                                    key={item.k}
                                    onClick={() => irNav(item.k)}
                                    className={`dock-btn flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] [&>*]:relative [&>*]:z-[1] ${ativo ? 'dock-btn-ativo font-medium' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                >
                                    {item.icon}
                                    {item.l}
                                    {ambiente === 'Manutenção' && item.k === 'pendencia' && pendentesCount > 0 && (
                                        <span className="rounded-full bg-[#0E3263] px-1.5 text-[10px] font-medium tabular-nums text-white dark:bg-sky-400 dark:text-slate-950">{pendentesCount}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </nav>
            )}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);
