// COMPONENTE: ModalDetalhes — registro operacional com abas
function ModalDetalhes({ chamado, chamados = [], aoFechar, aoImprimir, aoAssumir, aoConcluir }) {
    const [eventos, setEventos] = React.useState([]);
    const [evidencias, setEvidencias] = React.useState([]);
    const [aba, setAba] = React.useState('geral'); // geral | atividade | evidencias
    const [imgAmpliada, setImgAmpliada] = React.useState(null);

    React.useEffect(() => {
        if (!chamado) return;
        setAba('geral');
        ChamadosService.listarEventos(chamado.idFirebase).then(setEventos).catch(() => {});
        ChamadosService.listarEvidencias(chamado.idFirebase).then(setEvidencias).catch(() => {});
    }, [chamado]);

    React.useEffect(() => {
        const esc = (e) => { if (e.key === 'Escape') aoFechar && aoFechar(); };
        document.addEventListener('keydown', esc);
        return () => document.removeEventListener('keydown', esc);
    }, [aoFechar]);

    if (!chamado) return null;
    const tempo = tempoAbertoInfo(chamado.dataAbertura);
    const podeAssumir = ['ABERTO', 'EM_ANALISE', 'ATRIBUIDO', 'AGUARDANDO_USUARIO'].includes(chamado.status) && !chamado.emAtendimento && typeof aoAssumir === 'function';
    const podeConcluir = (chamado.status === 'EM_ATENDIMENTO' || chamado.emAtendimento || chamado.status === 'AGUARDANDO_USUARIO') && typeof aoConcluir === 'function';

    const equipStats = (() => {
        try {
            const k = (chamado.equipamento || '-').toUpperCase();
            const lista = (chamados || []).filter(c => (c.equipamento || '-').toUpperCase() === k);
            if (lista.length === 0) return null;
            let ultimo = null;
            lista.forEach(c => {
                try {
                    const dt = parseDataBR(c.dataAbertura);
                    if (dt && (!ultimo || dt > ultimo)) ultimo = dt;
                } catch {}
            });
            const n = lista.length;
            return {
                total: n,
                ultimo: ultimo ? ultimo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-',
                nivel: n > 3 ? 'Alta' : n > 1 ? 'Média' : 'Baixa'
            };
        } catch { return null; }
    })();

    const Linha = ({ rotulo, valor }) => {
        if (!valor || valor === 'NENHUMA') return null;
        return (
            <div className="flex gap-3 py-1.5">
                <dt className="w-24 shrink-0 text-xs text-slate-500 dark:text-slate-400">{rotulo}</dt>
                <dd className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{valor}</dd>
            </div>
        );
    };

    return (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex bg-slate-950/50 p-3 sm:p-6 backdrop-in" onClick={aoFechar}>
            {imgAmpliada !== null && evidencias.length > 0 && (
                <GaleriaAmpliada
                    fotos={evidencias}
                    indice={imgAmpliada}
                    aoMudar={setImgAmpliada}
                    aoFechar={() => setImgAmpliada(null)}
                />
            )}
            <div className="modal-pop modal-panel m-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
                <div className="border-b u-divider px-5 pb-3 pt-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Detalhes do chamado</h3>
                        <button onClick={aoFechar} aria-label="Fechar" className="icon-btn">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <ProtocoloTag codigo={chamado.protocolo} />
                        <h4 className="w-full text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:w-auto">{chamado.equipamento}</h4>
                        <StatusBadge status={chamado.status} concluido={chamado.concluido} />
                        <PriorityBadge prioridade={chamado.prioridade} />
                    </div>
                    <div className="mt-3 flex gap-1 border-t u-divider pt-2">
                        {[
                            ['geral', 'Geral'],
                            ['atividade', `Atividade${eventos.length > 0 ? ` (${eventos.length})` : ''}`],
                            ['evidencias', `Evidências${evidencias.length > 0 ? ` (${evidencias.length})` : ''}`]
                        ].map(([k, l]) => (
                            <button key={k} onClick={() => setAba(k)} className={`rounded-md px-3 py-1.5 text-[13px] transition ${aba === k ? 'bg-[#0E3263]/[0.07] font-medium text-[#0E3263] dark:bg-sky-400/10 dark:text-sky-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>{l}</button>
                        ))}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {aba === 'geral' && (
                        <div className="grid gap-x-8 md:grid-cols-[1fr_230px]">
                            <div className="min-w-0">
                                <SectionTitle>Descrição</SectionTitle>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">{chamado.descricao || '-'}</p>
                                {(chamado.servicoFeito || chamado.pendencia || chamado.observacoes) && (
                                    <div className="mt-4 border-t u-divider pt-3">
                                        <Linha rotulo="Serviço feito" valor={chamado.servicoFeito} />
                                        <Linha rotulo="Pendência" valor={chamado.pendencia} />
                                        <Linha rotulo="Observações" valor={chamado.observacoes} />
                                    </div>
                                )}
                                {equipStats && (
                                    <div className="mt-4 rounded-md border-l-2 border-[#0E3263] bg-slate-50 p-3.5 dark:border-sky-400 dark:bg-slate-800/60">
                                        <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Equipamento</p>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div>
                                                <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{equipStats.total}</p>
                                                <p className="text-[11px] text-slate-500">Chamados</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{equipStats.ultimo}</p>
                                                <p className="text-[11px] text-slate-500">Último</p>
                                            </div>
                                            <div>
                                                <p className={`text-lg font-semibold ${equipStats.nivel === 'Alta' ? 'text-[#B3261E] dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>{equipStats.nivel}</p>
                                                <p className="text-[11px] text-slate-500">Recorrência</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <aside className="mt-5 md:mt-0">
                                <dl>
                                    <Linha rotulo="Unidade" valor={chamado.unidade || 'MATRIZ'} />
                                    <Linha rotulo="Equipamento" valor={chamado.equipamento} />
                                    <Linha rotulo="Serviço" valor={chamado.servico} />
                                    <Linha rotulo="Localização" valor={chamado.localizacao} />
                                    <Linha rotulo="Responsável" valor={chamado.atribuidoParaNome} />
                                    <Linha rotulo="Abertura" valor={chamado.dataAbertura} />
                                    <Linha rotulo="Tempo aberto" valor={tempo.texto} />
                                    <Linha rotulo="Encerramento" valor={chamado.dataEncerramento} />
                                </dl>
                            </aside>
                        </div>
                    )}
                    {aba === 'atividade' && <TimelineView eventos={eventos} />}
                    {aba === 'evidencias' && <EvidenceGallery fotos={evidencias} onExpand={setImgAmpliada} />}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t u-divider px-5 py-3">
                    <button onClick={aoFechar} className="btn-ghost">Fechar</button>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => aoImprimir && aoImprimir(chamado)} className="btn-ghost">
                            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            Imprimir OS
                        </button>
                        {podeAssumir && <button onClick={() => aoAssumir(chamado)} className="btn-primary-outline">Assumir</button>}
                        {podeConcluir && <button onClick={() => aoConcluir(chamado)} className="btn-success">Concluir</button>}
                    </div>
                </div>
            </div>
        </div>
        </ModalPortal>
    );
}
