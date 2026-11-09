// COMPONENTE: ServiceBadge
// Exibição: texto simples (badge só para status/prioridade).
// Seleção (formulário, com onClick): opção delimitada.
const ServiceBadge = ({ servico, selected, onClick, className = "" }) => {
    const renderTexto = (nomeServico) => {
        const srvClean = nomeServico.trim().toUpperCase();
        return <span key={srvClean}>{srvClean}</span>;
    };

    if (onClick) {
        const srvClean = String(servico).trim().toUpperCase();
        return (
            <button
                type="button"
                onClick={onClick}
                aria-pressed={!!selected}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${selected ? 'border-[#0E3263] bg-white text-[#0E3263] dark:border-sky-400 dark:bg-transparent dark:text-sky-300' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-300'}`}
            >
                {srvClean}
            </button>
        );
    }

    if (!servico) return null;
    const lista = String(servico).split(',').map(s => s.trim()).filter(Boolean);
    if (lista.length === 0) return null;

    return (
        <span className={`text-[13px] text-slate-600 dark:text-slate-400 ${className}`}>
            {lista.map(s => s.toUpperCase()).join(', ')}
        </span>
    );
};
