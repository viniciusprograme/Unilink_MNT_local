// COMPONENTE: DateBadge — data de abertura, texto simples
const DateBadge = ({ dataStr }) => {
    const dias = calcularDiasDecorridos(dataStr);
    const critico = dias > 3;
    return (
        <span className={`text-xs tabular-nums whitespace-nowrap ${critico ? 'font-medium text-[#B3261E] dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`} title={dias >= 1 ? `há ${dias} dias` : 'hoje'}>
            {formatarApenasData(dataStr)}
        </span>
    );
};
