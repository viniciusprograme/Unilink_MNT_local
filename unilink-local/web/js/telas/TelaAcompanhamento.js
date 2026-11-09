// TELA: Acompanhamento — consulta direta por protocolo
function TelaAcompanhamento({ protocoloInicial = '', autenticado = false }) {
    const [protocolo, setProtocolo] = React.useState(protocoloInicial || '');
    const [carregando, setCarregando] = React.useState(false);
    const [erro, setErro] = React.useState('');
    const [chamado, setChamado] = React.useState(null);
    const [eventos, setEventos] = React.useState([]);
    const [evidencias, setEvidencias] = React.useState([]);
    const [meusChamados, setMeusChamados] = React.useState([]);
    const [carregandoMeus, setCarregandoMeus] = React.useState(false);
    const [erroMeus, setErroMeus] = React.useState('');
    const carregarMeusChamados = React.useCallback(async () => {
        if (!autenticado) { setMeusChamados([]); return; }
        setCarregandoMeus(true); setErroMeus('');
        try { setMeusChamados(await ChamadosService.listarMeusChamadosAbertos()); }
        catch (e) { setErroMeus(e?.message || 'Não foi possível carregar seus chamados.'); }
        finally { setCarregandoMeus(false); }
    }, [autenticado]);
    const buscarChamado = React.useCallback(async (protocoloBusca) => {
        if (!protocoloBusca || !protocoloBusca.trim()) { window.notifyWarning && window.notifyWarning('Informe o protocolo.'); return; }
        setCarregando(true); setErro(''); setChamado(null); setEventos([]); setEvidencias([]);
        try {
            const encontrado = await ChamadosService.buscarPorProtocolo(protocoloBusca);
            if (!encontrado) { setErro('Protocolo não encontrado.'); return; }
            setChamado(encontrado);
            salvarProtocoloRecente(encontrado.protocolo);
            const [ev, fotos] = await Promise.all([ChamadosService.listarEventos(encontrado.idFirebase), ChamadosService.listarEvidencias(encontrado.idFirebase)]);
            setEventos(ev); setEvidencias(fotos);
        } catch (e) {
            console.error(e);
            setErro('Não foi possível carregar o chamado.');
            if (window.UnilinkLogger) window.UnilinkLogger.error('buscarChamado', e);
        }
        finally { setCarregando(false); }
    }, []);
    React.useEffect(() => { if (protocoloInicial) buscarChamado(protocoloInicial); }, [protocoloInicial, buscarChamado]);
    React.useEffect(() => {
        carregarMeusChamados();
        if (!autenticado) return;
        const timer = setInterval(carregarMeusChamados, 15000);
        return () => clearInterval(timer);
    }, [carregarMeusChamados, autenticado]);
    const handleSubmit = (e) => { e.preventDefault(); buscarChamado(protocolo); };
    const tempo = chamado ? tempoAbertoInfo(chamado.dataAbertura) : null;
    const etapa = (() => {
        if (!chamado) return -1;
        const s = chamado.status || (chamado.concluido ? 'FECHADO' : 'ABERTO');
        if (s === 'RESOLVIDO' || s === 'FECHADO' || chamado.concluido) return 2;
        if (s === 'EM_ATENDIMENTO' || s === 'AGUARDANDO_USUARIO' || s === 'ATRIBUIDO') return 1;
        return 0;
    })();
    const ETAPAS_ACOMP = ['Aberto', 'Em atendimento', 'Concluído'];
    const ultimaAtualizacao = eventos.length > 0 ? eventos[eventos.length - 1].criadoEm : (chamado?.dataAbertura || '-');

    return (
        <div className="page-art mx-auto w-full max-w-[960px]">
            <PageHeader title="Acompanhar chamados" meta={autenticado ? 'Seus chamados em aberto' : null} />

            {autenticado && (
                <section className="mb-6">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Meus chamados</h2>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Chamados abertos por você. Eles saem desta lista quando forem encerrados.</p>
                        </div>
                        <button type="button" onClick={carregarMeusChamados} disabled={carregandoMeus} className="btn-ghost !min-h-[32px] !px-3 !py-1.5 !text-xs">{carregandoMeus ? 'Atualizando…' : 'Atualizar'}</button>
                    </div>
                    {carregandoMeus && <div className="u-surface p-3"><SkeletonRows linhas={2} /></div>}
                    {!carregandoMeus && erroMeus && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{erroMeus}</p>}
                    {!carregandoMeus && !erroMeus && meusChamados.length === 0 && (
                        <div className="u-surface px-4 py-5 text-center">
                            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                            </div>
                            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">Nenhum chamado em aberto</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Quando você abrir um chamado, ele aparecerá aqui até ser encerrado.</p>
                        </div>
                    )}
                    {!carregandoMeus && meusChamados.length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2">
                            {meusChamados.map(c => (
                                <button key={c.idFirebase} type="button" onClick={() => { setProtocolo(c.protocolo || ''); buscarChamado(c.protocolo); }} className="u-surface flex w-full items-start gap-3 p-3 text-left transition hover:border-[#0E3263]/40 dark:hover:border-sky-400/40">
                                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#0E3263]/10 text-[#0E3263] dark:bg-sky-400/10 dark:text-sky-300">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-4M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.equipamento || 'Chamado'}</span>
                                        <span className="mt-1 block font-mono text-[11px] text-slate-500 dark:text-slate-400">{c.protocolo}</span>
                                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{c.dataAbertura} · {c.unidade || 'Unidade não informada'}</span>
                                    </span>
                                    <span className="shrink-0"><StatusBadge status={c.status} concluido={c.concluido} /></span>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            )}

            <div className="mb-2">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Consultar por protocolo</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Você também pode consultar um protocolo específico.</p>
            </div>
            <form onSubmit={handleSubmit} className="mb-5 flex gap-2">
                <input type="text" placeholder="Protocolo" aria-label="Protocolo" className="u-input flex-1 font-mono uppercase" value={protocolo} onChange={(e) => setProtocolo(e.target.value.toUpperCase())} />
                <button type="submit" disabled={carregando} className="btn-primary shrink-0 disabled:opacity-60">{carregando ? '…' : 'Buscar'}</button>
            </form>

            {carregando && <SkeletonRows linhas={3} />}
            {erro && !carregando && <p className="py-6 text-center text-sm text-slate-500">{erro}</p>}

            {chamado && !carregando && (
                <div className="grid items-start gap-5 lg:grid-cols-2">
                    <div className="min-w-0">
                    <ProtocoloTag codigo={chamado.protocolo} />
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{chamado.equipamento}</h2>
                    <div className="mt-2"><StatusBadge status={chamado.status} concluido={chamado.concluido} /></div>

                    <div className="mt-4">
                        <SectionTitle>Status</SectionTitle>
                        <div className="flex items-center">
                            {ETAPAS_ACOMP.map((label, idx) => {
                                const feito = idx < etapa;
                                const atual = idx === etapa;
                                return (
                                    <React.Fragment key={label}>
                                        {idx > 0 && <span className={`mx-1 h-0.5 flex-1 rounded-full ${idx <= etapa ? 'bg-[#0E3263] dark:bg-sky-400' : 'bg-slate-200 dark:bg-slate-700'}`}></span>}
                                        <span className="flex flex-col items-center gap-1">
                                            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${atual ? 'bg-[#0E3263] font-medium text-white dark:bg-sky-400 dark:text-slate-950' : feito ? 'bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900' : 'bg-slate-200 text-slate-400 dark:bg-slate-700'}`}>
                                                {feito && !atual ? '✓' : idx + 1}
                                            </span>
                                            <span className={`whitespace-nowrap text-[10px] ${atual ? 'font-medium text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>{label}</span>
                                        </span>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>

                    <dl className="u-surface mt-4 divide-y u-divider px-4">
                        <div className="flex gap-3 py-2">
                            <dt className="w-28 shrink-0 text-xs text-slate-500 dark:text-slate-400">Problema</dt>
                            <dd className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{chamado.descricao || '-'}</dd>
                        </div>
                        <div className="flex gap-3 py-2">
                            <dt className="w-28 shrink-0 text-xs text-slate-500 dark:text-slate-400">Equipamento</dt>
                            <dd className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{chamado.equipamento || '-'}</dd>
                        </div>
                        <div className="flex gap-3 py-2">
                            <dt className="w-28 shrink-0 text-xs text-slate-500 dark:text-slate-400">Localização</dt>
                            <dd className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{[chamado.localizacao, chamado.unidade].filter(Boolean).join(', ') || '-'}</dd>
                        </div>
                        <div className="flex gap-3 py-2">
                            <dt className="w-28 shrink-0 text-xs text-slate-500 dark:text-slate-400">Aberto em</dt>
                            <dd className="min-w-0 flex-1 text-sm tabular-nums text-slate-700 dark:text-slate-200">{chamado.dataAbertura || '-'}</dd>
                        </div>
                        <div className="flex gap-3 py-2">
                            <dt className="w-28 shrink-0 text-xs text-slate-500 dark:text-slate-400">Tempo decorrido</dt>
                            <dd className="min-w-0 flex-1 text-sm tabular-nums text-slate-700 dark:text-slate-200">{tempo ? tempo.texto : '-'}</dd>
                        </div>
                        <div className="flex gap-3 py-2">
                            <dt className="w-28 shrink-0 text-xs text-slate-500 dark:text-slate-400">Responsável</dt>
                            <dd className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{chamado.atribuidoParaNome || '—'}</dd>
                        </div>
                        <div className="flex gap-3 py-2">
                            <dt className="w-28 shrink-0 text-xs text-slate-500 dark:text-slate-400">Última atualização</dt>
                            <dd className="min-w-0 flex-1 text-sm tabular-nums text-slate-700 dark:text-slate-200">{ultimaAtualizacao}</dd>
                        </div>
                    </dl>
                    </div>

                    <div className="min-w-0">
                    <div>
                        <SectionTitle>Atividade</SectionTitle>
                        <TimelineView eventos={eventos} />
                    </div>

                    {evidencias.length > 0 && (
                        <div className="mt-5">
                            <SectionTitle action={<span className="text-[11px] tabular-nums text-slate-400">{evidencias.length}</span>}>Evidências</SectionTitle>
                            <EvidenceGallery fotos={evidencias} />
                        </div>
                    )}
                    </div>
                </div>
            )}
        </div>
    );
}
