// TELA: Sucesso — confirmação objetiva
function TelaSucesso({ voltarInicio, chamado, aoAcompanhar, aoNovo }) {
    return (
        <div className="page-art mx-auto my-auto w-full max-w-[400px] py-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B7A4D]/10 text-[#1B7A4D] dark:text-emerald-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h1 className="mt-3 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Chamado registrado</h1>
            <span className="mx-auto mt-3 block h-0.5 w-10 rounded-full bg-[#0E3263] dark:bg-sky-400"></span>

            {chamado?.protocolo && (
                <div className="u-surface mt-4 px-5 py-4 text-center">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Protocolo</p>
                    <p className="mt-1 font-mono text-2xl font-medium tracking-wide text-slate-900 dark:text-slate-100">#{String(chamado.protocolo).replace(/^#/, '')}</p>
                    <button onClick={() => { try { navigator.clipboard.writeText(chamado.protocolo).then(() => window.notifySuccess && window.notifySuccess('Protocolo copiado.')); } catch {} }} className="mt-1.5 text-xs text-[#0E3263] hover:underline dark:text-sky-300">Copiar</button>
                </div>
            )}

            <div className="mt-4 space-y-2">
                {chamado?.protocolo && (
                    <button onClick={aoAcompanhar} className="btn-primary w-full !justify-center">Acompanhar chamado</button>
                )}
                <button onClick={aoNovo || voltarInicio} className="btn-ghost w-full !justify-center">Novo chamado</button>
            </div>
        </div>
    );
}
