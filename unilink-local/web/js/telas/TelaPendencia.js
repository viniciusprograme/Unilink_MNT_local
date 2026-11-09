// TELA: Chamados — operação de triagem
function TelaPendencia({ chamados, assumir, concluir, encerrar, aoNovo }) {

    const [busca, setBusca] = React.useState('');
    const [unidadeFiltro, setUnidadeFiltro] = React.useState('TODOS');
    const [statusFiltro, setStatusFiltro] = React.useState('TODOS');
    const [prioridadeFiltro, setPrioridadeFiltro] = React.useState('TODOS');
    const [servicoFiltro, setServicoFiltro] = React.useState('TODOS');
    const [dataFiltro, setDataFiltro] = React.useState('TODOS');
    const [ordenarPorPrioridade, setOrdenarPorPrioridade] = React.useState(true);
    const [paginaAtual, setPaginaAtual] = React.useState(1);
    const [notificacaoAtiva, setNotificacaoAtiva] = React.useState(null);
    const [chamadoEmEncerramento, setChamadoEmEncerramento] = React.useState(null);
    const [mostrarFiltros, setMostrarFiltros] = React.useState(false);
    const itensPorPagina = 10;
    const pendentes = chamados.filter(c => !c.concluido);
    const idsConhecidos = React.useRef(new Set());
    const primeiroCarregamento = React.useRef(true);
    React.useEffect(() => {
        const idsAtuais = new Set(pendentes.map(c => c.idFirebase));
        if (primeiroCarregamento.current) { idsConhecidos.current = idsAtuais; primeiroCarregamento.current = false; }
        else {
            const novoChamado = pendentes.find(c => !idsConhecidos.current.has(c.idFirebase));
            if (novoChamado) { tocarSomPorPrioridade(novoChamado.prioridade); setNotificacaoAtiva(novoChamado); setTimeout(() => setNotificacaoAtiva(null), 5000); }
            idsConhecidos.current = idsAtuais;
        }
    }, [chamados]);
    React.useEffect(() => { setPaginaAtual(1); }, [busca, unidadeFiltro, statusFiltro, prioridadeFiltro, servicoFiltro, dataFiltro, ordenarPorPrioridade]);
    const [assumindoId, setAssumindoId] = React.useState(null);
    const [detalhes, setDetalhes] = React.useState(null);

    const podeAssumir = (c) => ['ABERTO', 'EM_ANALISE', 'ATRIBUIDO', 'AGUARDANDO_USUARIO'].includes(c.status) && !c.emAtendimento;
    const emAtendimento = (c) => c.status === 'EM_ATENDIMENTO' || c.emAtendimento;
    const aguardando = (c) => c.status === 'AGUARDANDO_USUARIO';

    const handleAssumir = async (chamado) => {
        if (!chamado.idFirebase || chamado.idFirebase.length < 10) {
            window.notifyError && window.notifyError('ID do chamado inválido. Recarregue a página.');
            return;
        }
        setAssumindoId(chamado.idFirebase);
        try {
            // Usa a prop `assumir` do App (com retry de sessão + modal de login); fallback direto só se prop ausente
            if (typeof assumir === 'function') {
                await assumir(chamado);
            } else if (typeof ChamadosService !== 'undefined' && ChamadosService.assumirChamado) {
                await ChamadosService.assumirChamado(chamado);
            } else {
                await ChamadosService.atualizarStatus(chamado, 'EM_ATENDIMENTO');
            }
        } catch (e) {
            // App.assumirChamado já notificou + abriu login quando sessão expirou — evita toast duplicado
            const msg = (e && e.message) || '';
            const jaTratado = msg.includes('Sessão') || msg.includes('expirada') || msg.includes('conectar à API');
            if (!jaTratado) window.notifyError && window.notifyError(msg || 'Falha ao assumir');
            if (window.UnilinkLogger) window.UnilinkLogger.error('handleAssumir', e);
        }
        finally { setAssumindoId(null); }
    };

    const handleIniciarEncerramento = (chamado) => {
        if (!emAtendimento(chamado) && !aguardando(chamado)) {
            window.notifyWarning && window.notifyWarning('Assuma o chamado antes de concluir.');
            return;
        }
        setChamadoEmEncerramento(chamado);
    };

    let listaExibicao = pendentes.filter(c => {
        const q = busca.toLowerCase();
        const atendeBusca = !q || (c.equipamento && c.equipamento.toLowerCase().includes(q)) || (c.descricao && c.descricao.toLowerCase().includes(q)) || (c.protocolo && c.protocolo.toLowerCase().includes(q));
        const atendeUnidade = unidadeFiltro === 'TODOS' || (c.unidade || 'MATRIZ') === unidadeFiltro;
        const atendeStatus = statusFiltro === 'TODOS' || (c.status || 'ABERTO') === statusFiltro;
        const atendePrioridade = prioridadeFiltro === 'TODOS' || c.prioridade === prioridadeFiltro;
        const atendeServico = servicoFiltro === 'TODOS' || String(c.servico || '').toUpperCase().split(',').map(s => s.trim()).includes(servicoFiltro);
        return atendeBusca && atendeUnidade && atendeStatus && atendePrioridade && atendeServico;
    });
    if (dataFiltro !== 'TODOS') {
        listaExibicao = filtrarChamadosPorData(listaExibicao, dataFiltro);
    }
    const pesoStatus = { 'EM_ATENDIMENTO': 0, 'AGUARDANDO_USUARIO': 1, 'ATRIBUIDO': 2, 'ABERTO': 3, 'EM_ANALISE': 3 };
    listaExibicao.sort((a, b) => {
        const pa = pesoStatus[a.status] ?? 9; const pb = pesoStatus[b.status] ?? 9;
        if (pa !== pb) return pa - pb;
        return ordenarPorPrioridade ? priorityWeights[a.prioridade] - priorityWeights[b.prioridade] : b.id - a.id;
    });
    const totalPaginas = Math.ceil(listaExibicao.length / itensPorPagina);
    const listaExibicaoPaginada = listaExibicao.slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina);
    const filtrosAtivos = (unidadeFiltro !== 'TODOS' ? 1 : 0) + (statusFiltro !== 'TODOS' ? 1 : 0) + (prioridadeFiltro !== 'TODOS' ? 1 : 0) + (servicoFiltro !== 'TODOS' ? 1 : 0) + (dataFiltro !== 'TODOS' ? 1 : 0);
    const limparFiltros = () => { setStatusFiltro('TODOS'); setPrioridadeFiltro('TODOS'); setServicoFiltro('TODOS'); setDataFiltro('TODOS'); setUnidadeFiltro('TODOS'); setBusca(''); };
    const emAtendCount = pendentes.filter(c => c.status === 'EM_ATENDIMENTO' || c.emAtendimento).length;

    const acao = (c) => {
        if (podeAssumir(c)) {
            return <button onClick={(e) => { e.stopPropagation(); handleAssumir(c); }} disabled={assumindoId === c.idFirebase} className="btn-primary-outline !min-h-[32px] !px-3 !py-1.5 !text-xs disabled:opacity-60">{assumindoId === c.idFirebase ? 'Assumindo…' : 'Assumir'}</button>;
        }
        if (emAtendimento(c) || aguardando(c)) {
            return <button onClick={(e) => { e.stopPropagation(); handleIniciarEncerramento(c); }} className="btn-success !min-h-[32px] !px-3 !py-1.5 !text-xs">Concluir</button>;
        }
        return <StatusBadge status={c.status} concluido={c.concluido} />;
    };

    return (
        <div className="w-full">
            {notificacaoAtiva && ReactDOM.createPortal(
                <div className="toast-in fixed left-1/2 top-4 z-50 w-[92vw] max-w-sm -translate-x-1/2 rounded-md border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:left-auto sm:right-5 sm:translate-x-0">
                    <p className="text-[13px] text-slate-700 dark:text-slate-200">Novo chamado: {notificacaoAtiva.equipamento}</p>
                    <p className="truncate text-xs text-slate-500">{notificacaoAtiva.servico}</p>
                </div>,
                document.body
            )}

            {chamadoEmEncerramento && (
                <ModalConcluir chamado={chamadoEmEncerramento} aoFechar={() => setChamadoEmEncerramento(null)} />
            )}

            <PageHeader
                title="Chamados"
                meta={`${pendentes.length} registros, ${listaExibicao.length} filtrados, ${emAtendCount} em atendimento`}
                actions={
                    <React.Fragment>
                        {aoNovo && (
                            <button onClick={aoNovo} className="btn-primary">
                                Novo chamado
                            </button>
                        )}
                        <DownloadPopover dados={pendentes} unidadeFiltro={unidadeFiltro} statusFiltro={statusFiltro} dataFiltro={dataFiltro} busca={busca} />
                        <button onClick={() => setOrdenarPorPrioridade(v => !v)} className="btn-ghost" title="Ordenação">
                            {ordenarPorPrioridade ? 'Prioridade' : 'Recentes'}
                        </button>
                    </React.Fragment>
                }
            />

            <div className="u-surface mb-3 flex flex-wrap items-center gap-2 p-2">
                <input type="text" placeholder="Buscar protocolo, equipamento ou assunto..." aria-label="Buscar" className="u-input min-w-[200px] flex-1" value={busca} onChange={(e) => setBusca(e.target.value)} />
                <button onClick={() => setMostrarFiltros(v => !v)} className="btn-ghost shrink-0 sm:hidden">
                    Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ''}
                </button>
                <div className={`${mostrarFiltros ? 'flex' : 'hidden'} w-full flex-col gap-2 sm:contents`}>
                    <select value={unidadeFiltro} onChange={e => setUnidadeFiltro(e.target.value)} aria-label="Filial" className="u-input sm:max-w-[150px]">
                        <option value="TODOS">Filial: todas</option>
                        <option value="MATRIZ">Matriz</option>
                        <option value="PECÉM">Pecém</option>
                    </select>
                    <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} aria-label="Status" className="u-input sm:max-w-[170px]">
                        <option value="TODOS">Status: todos</option>
                        <option value="ABERTO">Aberto</option>
                        <option value="EM_ATENDIMENTO">Em atendimento</option>
                        <option value="AGUARDANDO_USUARIO">Parcial</option>
                        <option value="ATRIBUIDO">Atribuído</option>
                    </select>
                    <select value={prioridadeFiltro} onChange={e => setPrioridadeFiltro(e.target.value)} aria-label="Prioridade" className="u-input sm:max-w-[160px]">
                        <option value="TODOS">Prioridade: todas</option>
                        <option value="Urgente">Urgente</option>
                        <option value="Alta">Alta</option>
                        <option value="Média">Média</option>
                        <option value="Baixa">Baixa</option>
                    </select>
                    <select value={servicoFiltro} onChange={e => setServicoFiltro(e.target.value)} aria-label="Serviço" className="u-input sm:max-w-[160px]">
                        <option value="TODOS">Serviço: todos</option>
                        <option value="PINTURA">Pintura</option>
                        <option value="ELETRICA">Elétrica</option>
                        <option value="SOLDA">Solda</option>
                        <option value="MECANICA">Mecânica</option>
                        <option value="BORRACHARIA">Borracharia</option>
                        <option value="TRANSLADO">Translado</option>
                    </select>
                    <select value={dataFiltro} onChange={e => setDataFiltro(e.target.value)} aria-label="Período" className="u-input sm:max-w-[160px]">
                        <option value="TODOS">Período: todo</option>
                        <option value="HOJE">Hoje</option>
                        <option value="7d">7 dias</option>
                        <option value="30d">30 dias</option>
                        <option value="MES_ATUAL">Mês atual</option>
                        <option value="MES_ANTERIOR">Mês anterior</option>
                    </select>
                    {filtrosAtivos > 0 && (
                        <button onClick={limparFiltros} className="shrink-0 px-2 text-xs text-[#0E3263] underline underline-offset-2 hover:text-[#0A2447] dark:text-sky-300 dark:hover:text-sky-200">Limpar</button>
                    )}
                </div>
            </div>

            {listaExibicaoPaginada.length === 0 ? (
                <div className="u-surface"><EmptyState numero="0" title="Nenhum chamado encontrado." action={(filtrosAtivos > 0 || busca) ? <button onClick={limparFiltros} className="btn-ghost">Limpar filtros</button> : null} /></div>
            ) : (
                <React.Fragment>
                    <ul className="u-surface divide-y u-divider px-4">
                        {listaExibicaoPaginada.map((c, idx) => {
                            const assunto = extrairAssunto(c.descricao);
                            const protoCurto = String(c.protocolo || '').replace(/^#/, '').slice(-6);
                            const corPrio = c.prioridade === 'Urgente' ? 'bg-[#B3261E]' : c.prioridade === 'Alta' ? 'bg-[#B9770E]' : 'bg-slate-300 dark:bg-slate-600';
                            return (
                            <li key={c.idFirebase} className="row-enter" style={{ animationDelay: `${Math.min(idx * 50, 300)}ms` }}>
                                <div onClick={() => setDetalhes(c)} className="flex cursor-pointer items-center gap-2 py-2" title={`${c.protocolo || ''} — ${c.descricao || ''}`}>
                                    <span className={`h-6 w-1 shrink-0 rounded-full ${corPrio}`} title={c.prioridade} />
                                    <span className="hidden shrink-0 sm:inline-flex"><ProtocoloTag codigo={c.protocolo} copiar={false} /></span>
                                    <p className="min-w-0 flex-1 truncate text-[13px] leading-5">
                                        {protoCurto !== '' && <span className="font-mono text-[11px] text-slate-400 sm:hidden">{protoCurto} · </span>}
                                        <span className="font-medium text-slate-900 dark:text-slate-100">{c.equipamento}</span>
                                        <span className="text-slate-500 dark:text-slate-400"> · {assunto}</span>
                                    </p>
                                    <span onClick={(e) => e.stopPropagation()} className="shrink-0">{acao(c)}</span>
                                </div>
                            </li>
                            );
                        })}
                    </ul>

                </React.Fragment>
            )}

            {detalhes && <ModalDetalhes chamado={detalhes} chamados={chamados} aoFechar={() => setDetalhes(null)} aoImprimir={(c) => imprimirOrdemServico(c)} aoAssumir={(c) => handleAssumir(c)} aoConcluir={(c) => { setDetalhes(null); handleIniciarEncerramento(c); }} />}
            <Paginacao pagina={paginaAtual} total={totalPaginas} aoMudar={setPaginaAtual} />
        </div>
    );
}
