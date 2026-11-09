// COMPONENTE: ModalConcluir — encerramento (total ou parcial) de chamado
// Usado por TelaPendencia e TelaHistorico. Centraliza o formulário,
// a chamada ao service e o upload das fotos de resolução, para o
// botão "Concluir" existir igual nas duas telas.
function ModalConcluir({ chamado, aoFechar }) {
    const ch = chamado || {};
    const getItens = (c) => String(c.servico || '').split(',').map(s => s.trim()).filter(Boolean);
    const pendentesIniciais = (() => {
        const itens = getItens(ch);
        const jaConcluidos = ch.itensConcluidos || [];
        const pend = itens.filter(i => !jaConcluidos.includes(i));
        return pend.length ? pend : itens;
    })();
    const [servicoFeito, setServicoFeito] = React.useState('');
    const [pendencia, setPendencia] = React.useState('');
    const [observacoes, setObservacoes] = React.useState('');
    const [itensSelecionados, setItensSelecionados] = React.useState(pendentesIniciais);
    const [fotosResolucao, setFotosResolucao] = React.useState([]);
    const [erroFotoResolucao, setErroFotoResolucao] = React.useState('');
    const [enviandoFinalizacao, setEnviandoFinalizacao] = React.useState(false);
    const [processandoEvidencias, setProcessandoEvidencias] = React.useState(false);

    if (!chamado) return null;

    const toggleItem = (item) => {
        setItensSelecionados(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
    };
    const handleSelecionarFotoResolucao = (files) => {
        const arquivos = Array.from(files || []); setErroFotoResolucao(''); const validos = [];
        for (const arq of arquivos) {
            const ext = (arq.name.split('.').pop() || '').toLowerCase();
            if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) { setErroFotoResolucao(`"${arq.name}" formato não permitido.`); continue; }
            if (arq.size > 8 * 1024 * 1024) { setErroFotoResolucao(`"${arq.name}" excede 8MB.`); continue; }
            validos.push(arq);
        }
        if (fotosResolucao.length + validos.length > 5) window.notifyWarning && window.notifyWarning('Limite de 5 fotos.');
        setFotosResolucao(prev => [...prev, ...validos].slice(0, 5));
    };
    const handleCaptureResolucao = (file) => handleSelecionarFotoResolucao([file]);
    const handleConfirmarFinalizacao = async (e) => {
        e.preventDefault(); if (!chamado) return;
        if (itensSelecionados.length === 0) { window.notifyWarning && window.notifyWarning('Selecione ao menos um item concluído.'); return; }
        if (!servicoFeito.trim()) { window.notifyWarning && window.notifyWarning('Descreva o serviço executado.'); return; }
        setEnviandoFinalizacao(true);
        setProcessandoEvidencias(true);
        try {
            await ChamadosService.concluirChamado(chamado, {
                itensConcluidos: itensSelecionados,
                servicoFeito: servicoFeito.trim(),
                pendencia: pendencia.trim(),
                observacoes: observacoes.trim()
            });
            for (const foto of fotosResolucao) {
                try { await ChamadosService.uploadEvidencia(chamado.idFirebase, foto, 'RESOLUCAO'); }
                catch (err) { console.error(err); window.notifyWarning && window.notifyWarning('Foto não enviada: ' + err.message); }
            }
            aoFechar && aoFechar();
            window.notifySuccess && window.notifySuccess('Chamado atualizado.');
        } catch (err) {
            window.notifyError && window.notifyError(err.message || 'Falha ao concluir.');
            if (window.UnilinkLogger) window.UnilinkLogger.error('ModalConcluir.confirmar', err);
        }
        finally { setEnviandoFinalizacao(false); setProcessandoEvidencias(false); }
    };

    return (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex bg-slate-950/50 p-3 sm:p-4 backdrop-in" onClick={() => aoFechar && aoFechar()}>
            <div className="modal-pop modal-panel m-auto flex w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b u-divider px-5 py-3">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Concluir chamado</h3>
                    <button onClick={() => aoFechar && aoFechar()} aria-label="Fechar" className="icon-btn">✕</button>
                </div>
                <form onSubmit={handleConfirmarFinalizacao} className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
                    <div>
                        <p className="u-label">Itens</p>
                        <div className="space-y-1.5">
                            {getItens(chamado).map(item => {
                                const checked = itensSelecionados.includes(item);
                                const jaFeito = (chamado.itensConcluidos || []).includes(item);
                                return (
                                    <label key={item} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 ${checked ? 'border-[#1B7A4D] bg-[#1B7A4D]/[0.06] dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700'} ${jaFeito ? 'opacity-50' : ''}`}>
                                        <input type="checkbox" checked={checked} disabled={jaFeito} onChange={() => toggleItem(item)} className="h-4 w-4 accent-[#1B7A4D]" />
                                        <span className="text-sm text-slate-700 dark:text-slate-200">{item}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <label className="u-label">Serviço executado</label>
                        <textarea required rows="3" maxLength="1000" className="u-input resize-none uppercase placeholder:normal-case" value={servicoFeito} onChange={(e) => setServicoFeito(e.target.value.toUpperCase())} />
                    </div>
                    <div>
                        <label className="u-label">Observações</label>
                        <textarea rows="2" maxLength="1000" className="u-input resize-none" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
                    </div>
                    <div>
                        <label className="u-label">Pendência</label>
                        <textarea rows="2" maxLength="1000" className="u-input resize-none uppercase placeholder:normal-case" value={pendencia} onChange={(e) => setPendencia(e.target.value.toUpperCase())} />
                    </div>
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <label className="u-label !mb-0">Fotos</label>
                            <span className="text-[11px] tabular-nums text-slate-400">{fotosResolucao.length}/5</span>
                        </div>
                        <CameraCapture onCapture={handleCaptureResolucao} onSelectFiles={handleSelecionarFotoResolucao} maxFiles={5} currentCount={fotosResolucao.length} disabled={enviandoFinalizacao || processandoEvidencias} processing={processandoEvidencias} />
                        {erroFotoResolucao && <p className="mt-1.5 text-xs text-[#B3261E] dark:text-red-400">{erroFotoResolucao}</p>}
                        {fotosResolucao.length > 0 && (
                            <div className="mt-2 grid grid-cols-5 gap-2">
                                {fotosResolucao.map((f, idx) => (
                                    <div key={idx} className="relative aspect-square overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                                        <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
                                        <span className="absolute left-1 top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-950/70 px-1 text-[10px] font-semibold text-white tabular-nums">{idx + 1}</span>
                                        <button type="button" onClick={() => setFotosResolucao(prev => prev.filter((_, i) => i !== idx))} aria-label="Remover" className="icon-btn absolute right-1 top-1 !rounded-full !bg-slate-950/70 !p-0 !text-white">×</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-end gap-2 border-t u-divider bg-white px-5 py-3 dark:bg-slate-900">
                        <button type="button" onClick={() => aoFechar && aoFechar()} className="btn-ghost">Cancelar</button>
                        <button type="submit" disabled={enviandoFinalizacao || processandoEvidencias} className="btn-success disabled:opacity-60">{enviandoFinalizacao || processandoEvidencias ? 'Salvando…' : 'Salvar'}</button>
                    </div>
                </form>
            </div>
        </div>
        </ModalPortal>
    );
}
