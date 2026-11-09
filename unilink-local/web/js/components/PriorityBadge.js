// COMPONENTE: PriorityBadge — apenas ponto + rótulo
const PriorityBadge = ({ prioridade }) => {
    const mapa = {
        'Urgente': 'bg-[#B3261E]/10 text-[#B3261E] dark:bg-red-500/10 dark:text-red-300',
        'Alta': 'bg-[#B9770E]/10 text-[#B9770E] dark:bg-amber-500/10 dark:text-amber-300',
        'Média': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        'Media': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        'Baixa': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    };
    const ponto = {
        'Urgente': 'bg-[#B3261E]',
        'Alta': 'bg-[#B9770E]',
        'Média': 'bg-slate-400',
        'Media': 'bg-slate-400',
        'Baixa': 'bg-slate-400'
    };
    const cls = mapa[prioridade] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    const dot = ponto[prioridade] || 'bg-slate-400';
    return (
        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap ${cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
            {prioridade || '-'}
        </span>
    );
};
