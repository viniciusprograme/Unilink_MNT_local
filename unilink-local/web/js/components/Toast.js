// COMPONENTE: Toast — notificações objetivas
function ToastContainer() {
    const [toasts, setToasts] = React.useState([]);

    const addToast = React.useCallback((msg, type = "info", duration = 3500) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev.slice(-3), { id, msg, type }]);
        if (duration > 0) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }, []);

    const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id));

    React.useEffect(() => {
        window.showToast = addToast;
        window.notifySuccess = (m, d) => addToast(m, "success", d || 3000);
        window.notifyError = (m, d) => addToast(m, "error", d || 5000);
        window.notifyWarning = (m, d) => addToast(m, "warning", d || 4000);
        window.notifyInfo = (m, d) => addToast(m, "info", d || 3500);
        return () => {};
    }, [addToast]);

    const dot = {
        success: "bg-[#1B7A4D]",
        error: "bg-[#B3261E]",
        warning: "bg-[#B9770E]",
        info: "bg-[#2563A8]"
    };

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-5 sm:translate-x-0 z-[100] w-[92vw] sm:w-auto sm:max-w-sm flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
                <div key={t.id} className="toast-in pointer-events-auto flex items-center gap-2.5 rounded-md border border-slate-200 bg-white py-2.5 pl-3.5 pr-2 text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[t.type] || dot.info}`}></span>
                    <span className="flex-1 text-[13px] leading-snug break-words">{t.msg}</span>
                    <button onClick={() => remove(t.id)} aria-label="Fechar" className="icon-btn shrink-0">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            ))}
        </div>
    );
}
