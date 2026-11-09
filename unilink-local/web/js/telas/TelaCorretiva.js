// TELA: Novo chamado — solicitação + contexto
const Grupo = ({ titulo, children }) => (
    <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">{titulo}</p>
);

function TelaCorretiva({ aoSalvar }) {
    const [form, setForm] = React.useState({ unidade: 'MATRIZ', equipamento: '', servico: [], descricao: '', localizacao: '', prioridade: 'Média' });
    const [enviando, setEnviando] = React.useState(false);
    const [processandoEvidencias, setProcessandoEvidencias] = React.useState(false);
    const [fotos, setFotos] = React.useState([]);
    const [erroFoto, setErroFoto] = React.useState('');
    const EXTENSOES_ACEITAS = ['jpg', 'jpeg', 'png', 'webp'];
    const TAMANHO_MAX_MB = 8;

    const handleSelecionarFotos = (items) => {
        const arquivos = Array.from(items || []);
        const validos = [];
        const invalidos = [];
        const hash = new Set();

        for (const item of arquivos) {
            const file = item.file || item;
            const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
            if (hash.has(fingerprint)) continue;
            hash.add(fingerprint);

            const url = item.url || URL.createObjectURL(file);
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            const mimeOk = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
            const extOk = EXTENSOES_ACEITAS.includes(ext);
            if (!mimeOk && !extOk) {
                invalidos.push(`"${file.name}" formato não permitido. Use JPG, PNG ou WEBP.`);
                continue;
            }
            if (file.size > TAMANHO_MAX_MB * 1024 * 1024) {
                invalidos.push(`"${file.name}" excede ${TAMANHO_MAX_MB}MB.`);
                continue;
            }
            validos.push({ file, url, name: file.name });
        }

        if (invalidos.length) {
            setErroFoto(invalidos.join(' '));
            window.notifyWarning && window.notifyWarning(invalidos.join(' '));
        } else {
            setErroFoto('');
        }

        const restante = Math.max(0, 5 - fotos.length);
        const paraAdicionar = validos.slice(0, restante);
        if (paraAdicionar.length === 0 && validos.length > 0) {
            setErroFoto('Limite de 5 fotos atingido.');
            window.notifyWarning && window.notifyWarning('Limite de 5 fotos atingido.');
            return;
        }

        setFotos(prev => {
            const combinadas = [...prev, ...paraAdicionar];
            return combinadas.slice(0, 5);
        });
    };

    const handleCaptureFoto = (item) => handleSelecionarFotos([item]);

    const removerFoto = (idx) => {
        setFotos(prev => {
            const removida = prev[idx];
            if (removida?.url) URL.revokeObjectURL(removida.url);
            return prev.filter((_, i) => i !== idx);
        });
        setErroFoto('');
    };

    const toggleServico = (srv) => {
        setForm(prev => {
            const jaExiste = prev.servico.includes(srv);
            return { ...prev, servico: jaExiste ? prev.servico.filter(s => s !== srv) : [...prev.servico, srv] };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.equipamento) { window.notifyWarning && window.notifyWarning('Informe o equipamento.'); return; }
        if (form.servico.length === 0) { window.notifyWarning && window.notifyWarning('Selecione ao menos um serviço.'); return; }
        if (!form.descricao.trim()) { window.notifyWarning && window.notifyWarning('Descreva o problema.'); return; }
        if (!form.localizacao.trim()) { window.notifyWarning && window.notifyWarning('Informe a localização.'); return; }
        const fotosValidas = fotos.filter((f) => f && f.file);
        if (fotosValidas.length > 5) {
            const msg = 'A lista de evidências não pode ultrapassar 5 fotos.';
            setErroFoto(msg);
            window.notifyWarning && window.notifyWarning(msg);
            return;
        }
        setEnviando(true);
        setProcessandoEvidencias(true);
        try { await aoSalvar({ ...form, servico: form.servico.join(', '), fotos: fotosValidas.map(f => f.file) }); }
        catch (err) { window.notifyError && window.notifyError(err.message || 'Falha ao abrir chamado.'); }
        finally { setEnviando(false); setProcessandoEvidencias(false); }
    };

    const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Urgente'];

    return (
        <div className="mx-auto w-full max-w-[1024px]">
            <PageHeader title="Novo chamado" />

            <form onSubmit={handleSubmit} className="u-surface overflow-clip">
                <div className="grid md:grid-cols-[1.25fr_1fr]">
                    <div className="flex flex-col px-4 py-4 sm:px-5 md:border-r u-divider">
                        <Grupo titulo="Solicitação" />
                        <label className="u-label">Descrição</label>
                        <textarea required maxLength="1000" rows="3" className="u-input min-h-[96px] flex-1 resize-none uppercase placeholder:normal-case" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value.toUpperCase() })} />
                        <div className="mt-4">
                            <div className="mb-1.5 flex items-center justify-between">
                                <label className="u-label !mb-0">Evidências</label>
                                <span className="text-[11px] tabular-nums text-slate-400">{fotos.length}/5</span>
                            </div>
                            <CameraCapture onCapture={handleCaptureFoto} onSelectFiles={handleSelecionarFotos} maxFiles={5} currentCount={fotos.length} disabled={enviando || processandoEvidencias} processing={processandoEvidencias} />
                            {erroFoto ? <p className="mt-1.5 text-xs text-[#B3261E] dark:text-red-400">{erroFoto}</p> : <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">JPG, PNG ou WEBP. Máximo de 5 imagens, 8 MB cada.</p>}
                            {fotos.length > 0 && (
                                <div className="mt-2 grid grid-cols-4 gap-2">
                                    {fotos.map((f, idx) => (
                                        <div key={idx} className="relative aspect-square overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                                            <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
                                            <span className="absolute left-1 top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-950/70 px-1 text-[10px] font-semibold text-white tabular-nums">{idx + 1}</span>
                                            <button type="button" onClick={() => removerFoto(idx)} aria-label="Remover foto" className="icon-btn absolute right-1 top-1 !rounded-full !bg-slate-950/70 !p-0 !text-white">×</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="divide-y u-divider border-t u-divider md:border-t-0">
                        <div className="px-4 py-4 sm:px-5">
                            <Grupo titulo="Contexto" />
                            <label className="u-label">Unidade</label>
                            <SegmentedControl
                                options={[
                                    { value: 'MATRIZ', label: 'Matriz' },
                                    { value: 'PECÉM', label: 'Pecém' }
                                ]}
                                value={form.unidade}
                                onChange={v => setForm({ ...form, unidade: v })}
                            />
                            <div className="mt-3">
                                <label className="u-label">Localização</label>
                                <input type="text" required maxLength="120" className="u-input uppercase placeholder:normal-case" value={form.localizacao} onChange={(e) => setForm({ ...form, localizacao: e.target.value.toUpperCase() })} />
                            </div>
                        </div>
                        <div className="px-4 py-4 sm:px-5">
                            <label className="u-label">Equipamento</label>
                            <input type="text" required maxLength="120" className="u-input uppercase placeholder:normal-case" value={form.equipamento} onChange={(e) => setForm({ ...form, equipamento: e.target.value.toUpperCase() })} />
                            <div className="mt-3">
                                <label className="u-label">Serviço</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {['PINTURA', 'ELETRICA', 'SOLDA', 'MECANICA', 'BORRACHARIA', 'TRANSLADO'].map(srv => (
                                        <ServiceBadge key={srv} servico={srv} selected={form.servico.includes(srv)} onClick={() => toggleServico(srv)} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="px-4 py-4 sm:px-5">
                            <label className="u-label">Prioridade</label>
                            <SegmentedControl
                                options={['Baixa', 'Média', 'Alta', 'Urgente'].map(p => ({ value: p, label: p }))}
                                value={form.prioridade}
                                onChange={v => setForm({ ...form, prioridade: v })}
                            />
                        </div>
                    </div>
                </div>
                <div className="sticky bottom-[4.5rem] z-10 rounded-b-[8px] border-t u-divider bg-white px-4 py-3 dark:bg-[#111827] sm:px-5">
                    <button type="submit" disabled={enviando || processandoEvidencias} className="btn-primary w-full !justify-center !text-sm disabled:opacity-60 md:w-auto md:min-w-[220px]">
                        {enviando || processandoEvidencias ? 'Enviando…' : 'Abrir chamado'}
                    </button>
                </div>
            </form>
        </div>
    );
}