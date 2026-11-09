// ==========================================================
// UNILINK — Design System corporativo
// Fala pouco, mostra muito: tabelas, listas, divisores.
// Badges só para status e prioridade. Azul com parcimônia.
// ==========================================================

const BRAND = '#0E3263';

// ---------- Portal de modal ----------
// Renderiza o overlay direto no <body> e trava a rolagem da página enquanto houver modal aberto.
// Sem isso, um "position: fixed" dentro de <main class="screen-enter"> fica preso à altura do <main>
// (e não da janela): o modal nasce cortado e a tela ganha duas barras de rolagem.
let __modaisAbertos = 0;
function ModalPortal({ children }) {
    React.useEffect(() => {
        __modaisAbertos++;
        document.documentElement.classList.add('modal-open');
        return () => {
            __modaisAbertos = Math.max(0, __modaisAbertos - 1);
            if (__modaisAbertos === 0) document.documentElement.classList.remove('modal-open');
        };
    }, []);
    return ReactDOM.createPortal(children, document.body);
}

// ---------- Status ----------
const STATUS_LABEL = {
    ABERTO: 'Aberto',
    EM_ANALISE: 'Em análise',
    ATRIBUIDO: 'Atribuído',
    EM_ATENDIMENTO: 'Em atendimento',
    AGUARDANDO_USUARIO: 'Aguardando usuário',
    RESOLVIDO: 'Resolvido',
    FECHADO: 'Encerrado'
};

const STATUS_STYLE = {
    ABERTO: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    EM_ANALISE: 'bg-sky-50 text-[#2563A8] dark:bg-sky-500/10 dark:text-sky-300',
    ATRIBUIDO: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
    EM_ATENDIMENTO: 'bg-[#B9770E]/10 text-[#B9770E] dark:bg-[#B9770E]/15 dark:text-amber-300',
    AGUARDANDO_USUARIO: 'bg-[#B9770E]/10 text-[#B9770E] dark:bg-[#B9770E]/15 dark:text-amber-300',
    RESOLVIDO: 'bg-[#1B7A4D]/10 text-[#1B7A4D] dark:bg-emerald-500/10 dark:text-emerald-300',
    FECHADO: 'bg-[#1B7A4D]/10 text-[#1B7A4D] dark:bg-emerald-500/10 dark:text-emerald-300'
};

function StatusBadge({ status, concluido }) {
    const s = status || (concluido ? 'FECHADO' : 'ABERTO');
    const label = STATUS_LABEL[s] || String(s).replace(/_/g, ' ').toLowerCase();
    return (
        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap ${STATUS_STYLE[s] || STATUS_STYLE.ABERTO}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
            {label}
        </span>
    );
}

// ---------- Protocolo (identificador técnico) ----------
function ProtocoloTag({ codigo, copiar = true }) {
    if (!codigo) return null;
    const copiarFn = (e) => {
        e && e.stopPropagation && e.stopPropagation();
        try {
            navigator.clipboard.writeText(codigo).then(
                () => window.notifySuccess && window.notifySuccess('Protocolo copiado')
            ).catch(() => {});
        } catch {}
    };
    return (
        <span className="inline-flex items-center gap-1 rounded bg-[#0E3263]/[0.06] px-1.5 py-px font-mono text-[11px] font-medium tracking-wide text-[#0E3263] dark:bg-sky-400/10 dark:text-sky-300">
            #{String(codigo).replace(/^#/, '')}
            {copiar && (
                <button onClick={copiarFn} title="Copiar protocolo" aria-label="Copiar protocolo" className="icon-btn !min-w-0 !p-0.5">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
            )}
        </span>
    );
}

// ---------- Indicador de atualização (pulso discreto) ----------
function LiveDot({ label = 'Atualizado agora' }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="relative flex w-1.5 h-1.5">
                <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-[#1B7A4D]"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#1B7A4D]"></span>
            </span>
            {label}
        </span>
    );
}

// ---------- Contador animado (números do dashboard) ----------
function useCountUp(valor, duracao = 650) {
    const reduz = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const [exibido, setExibido] = React.useState(typeof valor === 'number' && !reduz ? 0 : valor);
    React.useEffect(() => {
        if (reduz || typeof valor !== 'number') { setExibido(valor); return; }
        let raf;
        const inicio = performance.now();
        const passo = (t) => {
            const p = Math.min(1, (t - inicio) / duracao);
            setExibido(Math.round((1 - Math.pow(1 - p, 3)) * valor));
            if (p < 1) raf = requestAnimationFrame(passo);
        };
        raf = requestAnimationFrame(passo);
        return () => cancelAnimationFrame(raf);
    }, [valor]);
    return exibido;
}

// ---------- Cabeçalho de página ----------
function PageHeader({ title, meta, actions }) {
    return (
        <div className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-baseline gap-3">
                    <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
                    {meta && <span className="text-xs text-slate-500 dark:text-slate-400">{meta}</span>}
                </div>
                {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
            </div>
        </div>
    );
}

// ---------- Título de seção (com filete institucional) ----------
function SectionTitle({ children, action }) {
    return (
        <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <span className="h-3.5 w-[3px] rounded-full bg-[#0E3263] dark:bg-sky-400"></span>
                {children}
            </h2>
            {action}
        </div>
    );
}

// ---------- Estado vazio ----------
function EmptyState({ title = 'Nenhum resultado.', numero = null, action = null }) {
    return (
        <div className="px-6 py-10 text-center">
            {numero !== null && <p className="font-mono text-4xl text-slate-200 dark:text-slate-700">{numero}</p>}
            <p className={`text-sm text-slate-700 dark:text-slate-300 ${numero !== null ? 'mt-2' : ''}`}>{title}</p>
            {action && <div className="mt-3">{action}</div>}
        </div>
    );
}

// ---------- Data curta operacional: Hoje · 16:38 / 09/09 · 16:38 ----------
function dataCurta(dataStr) {
    try {
        if (typeof parseDataBR !== 'function') return dataStr || '-';
        const dt = parseDataBR(dataStr);
        if (!dt) return '-';
        const hh = String(dt.getHours()).padStart(2, '0');
        const mm = String(dt.getMinutes()).padStart(2, '0');
        const hoje = new Date();
        const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
        if (mesmoDia(dt, hoje)) return `Hoje · ${hh}:${mm}`;
        const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
        if (mesmoDia(dt, ontem)) return `Ontem · ${hh}:${mm}`;
        const dd = String(dt.getDate()).padStart(2, '0');
        const mo = String(dt.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mo} · ${hh}:${mm}`;
    } catch { return '-'; }
}

// ---------- Atividade operacional global (abertura/atendimento/encerramento) ----------
function atividadeRecente(chamados, limite = 8) {
    const itens = [];
    try {
        (chamados || []).forEach(c => {
            const push = (campo, texto) => {
                if (typeof parseDataBR !== 'function') return;
                const dt = parseDataBR(c[campo]);
                if (!dt) return;
                itens.push({ ts: dt.getTime(), protocolo: c.protocolo, texto, id: `${c.idFirebase}-${campo}` });
            };
            push('dataAbertura', 'Novo chamado');
            push('atribuidoEm', 'Atendimento iniciado');
            push('dataEncerramento', 'Chamado concluído');
        });
    } catch {}
    return itens.sort((a, b) => b.ts - a.ts).slice(0, limite);
}

// ---------- Protocolos recentes do solicitante (localStorage) ----------
function obterProtocolosRecentes() {
    try {
        const raw = localStorage.getItem('unilink_protocolos_recentes');
        const arr = JSON.parse(raw || '[]');
        return Array.isArray(arr) ? arr.filter(Boolean).slice(0, 3) : [];
    } catch { return []; }
}

function salvarProtocoloRecente(protocolo) {
    try {
        if (!protocolo) return;
        const atual = obterProtocolosRecentes().filter(p => p !== protocolo);
        localStorage.setItem('unilink_protocolos_recentes', JSON.stringify([protocolo, ...atual].slice(0, 3)));
    } catch {}
}

// ---------- Skeleton ----------
function SkeletonRows({ linhas = 4 }) {
    return (
        <div className="divide-y u-divider border-y u-divider" aria-hidden="true">
            {Array.from({ length: linhas }, (_, i) => (
                <div key={i} className="py-3"><div className="u-skeleton h-4 rounded" style={{ width: `${92 - i * 7}%` }}></div></div>
            ))}
        </div>
    );
}

// ---------- Timeline simples: hora + evento, linha vertical ----------
function horaCurta(dataStr) {
    if (!dataStr) return '';
    const m = String(dataStr).match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

const EVENTO_LABEL = {
    ABERTURA: 'Chamado aberto',
    ATRIBUICAO: 'Técnico atribuído',
    EM_ATENDIMENTO_INICIADO: 'Atendimento iniciado',
    EM_ATENDIMENTO_PAUSADO: 'Atendimento pausado',
    OBSERVACAO: 'Atualização adicionada',
    EVIDENCIA_ADICIONADA: 'Evidência anexada',
    CONCLUSAO_PARCIAL: 'Conclusão parcial registrada',
    ENCERRAMENTO: 'Chamado encerrado'
};

function TimelineView({ eventos = [] }) {
    if (!eventos || eventos.length === 0) {
        return <p className="py-2 text-xs text-slate-500 dark:text-slate-400">Sem atividade registrada.</p>;
    }
    return (
        <ol className="ml-1 space-y-3.5 border-l-2 border-slate-200 pl-5 dark:border-slate-700">
            {eventos.map((ev, idx) => (
                <li key={ev.id || idx} className="relative min-w-0">
                    <span className={`absolute -left-[25px] top-1 h-2 w-2 rounded-full ${idx === 0 ? 'bg-[#0E3263] dark:bg-sky-400' : 'bg-white ring-2 ring-slate-300 dark:bg-slate-900 dark:ring-slate-600'}`}></span>
                    <div className="flex items-baseline gap-2">
                        <span className="w-9 shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500" title={ev.criadoEm || ''}>{horaCurta(ev.criadoEm)}</span>
                        <p className="truncate text-sm text-slate-700 dark:text-slate-200">{EVENTO_LABEL[ev.tipoEvento] || ev.tipoEvento}</p>
                    </div>
                    {ev.descricao && <p className="mt-0.5 break-words pl-11 text-xs text-slate-500 dark:text-slate-400">{ev.descricao}</p>}
                </li>
            ))}
        </ol>
    );
}

// ---------- Galeria simples (miniaturas + ampliada com navegação) ----------
function GaleriaAmpliada({ fotos = [], indice = 0, aoMudar, aoFechar }) {
    const total = fotos.length;
    const atual = fotos[Math.min(Math.max(indice, 0), Math.max(total - 1, 0))];
    const url = typeof atual === 'string' ? atual : atual?.url;
    const nome = (atual && atual.nomeArquivo) || '';
    React.useEffect(() => {
        const nav = (e) => {
            if (e.key === 'Escape' && aoFechar) aoFechar();
            if (e.key === 'ArrowRight' && aoMudar) aoMudar((indice + 1) % total);
            if (e.key === 'ArrowLeft' && aoMudar) aoMudar((indice - 1 + total) % total);
        };
        document.addEventListener('keydown', nav);
        return () => document.removeEventListener('keydown', nav);
    }, [indice, total]);
    if (!url) return null;
    return (
        <ModalPortal>
        <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/90 fade-in" onClick={aoFechar}>
            <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <button onClick={aoFechar} aria-label="Voltar" className="flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-white/10">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="font-mono text-xs text-white/80">Imagem {indice + 1} de {total}</span>
                <button onClick={aoFechar} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-white/10">✕</button>
            </div>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden px-12 pb-4" onClick={(e) => e.stopPropagation()}>
                {total > 1 && (
                    <React.Fragment>
                        <button onClick={() => aoMudar((indice - 1 + total) % total)} aria-label="Anterior" className="absolute left-2 flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20">‹</button>
                        <button onClick={() => aoMudar((indice + 1) % total)} aria-label="Próxima" className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20">›</button>
                    </React.Fragment>
                )}
                <img src={url} alt={nome || `Evidência ${indice + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
            </div>
            {nome && <p className="truncate px-4 pb-4 text-center text-xs text-white/60" onClick={(e) => e.stopPropagation()}>{nome}</p>}
        </div>
        </ModalPortal>
    );
}

function EvidenceGallery({ fotos = [], onExpand }) {
    const [indice, setIndice] = React.useState(null);
    const abrir = (i) => { if (onExpand) onExpand(i); else setIndice(i); };
    if (fotos.length === 0) {
        return <p className="py-1 text-xs text-slate-500 dark:text-slate-400">Sem evidências.</p>;
    }
    return (
        <React.Fragment>
            {(!onExpand && indice !== null) && (
                <GaleriaAmpliada fotos={fotos} indice={indice} aoMudar={setIndice} aoFechar={() => setIndice(null)} />
            )}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {fotos.map((f, i) => {
                    const url = typeof f === 'string' ? f : f.url;
                    const nome = (f && f.nomeArquivo) || `Evidência ${i + 1}`;
                    return (
                        <button key={(f && f.id) || i} onClick={() => abrir(i)} title={nome} className="aspect-square overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                            <img src={url} alt={nome} loading="lazy" className="h-full w-full object-cover hover:opacity-85" />
                        </button>
                    );
                })}
            </div>
        </React.Fragment>
    );
}

// ---------- Tempo em aberto ----------
function tempoAbertoInfo(dataAberturaStr) {
    try {
        const dt = (typeof parseDataBR === 'function') ? parseDataBR(dataAberturaStr) : null;
        if (!dt) return { texto: '-', minutos: 0, dias: 0, critico: false };
        const diffMs = Date.now() - dt.getTime();
        const minutos = Math.max(0, Math.floor(diffMs / 60000));
        const horas = Math.floor(minutos / 60);
        const dias = Math.floor(horas / 24);
        let texto;
        if (dias >= 1) texto = dias === 1 ? '1 dia' : `${dias} dias`;
        else if (horas >= 1) { const m = minutos % 60; texto = m ? `${horas}h ${String(m).padStart(2, '0')}` : `${horas}h`; }
        else texto = minutos <= 1 ? 'agora' : `${minutos} min`;
        return { texto, minutos, dias, critico: dias >= 3 };
    } catch { return { texto: '-', minutos: 0, dias: 0, critico: false }; }
}

function TempoAberto({ dataAbertura }) {
    const info = tempoAbertoInfo(dataAbertura);
    return (
        <span title={dataAbertura || ''} className={`text-xs tabular-nums ${info.critico ? 'font-medium text-[#B3261E] dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {info.texto}
        </span>
    );
}

// ---------- Paginação ----------
function Paginacao({ pagina, total, aoMudar }) {
    if (!total || total <= 1) return null;
    const ir = (n) => { if (n >= 1 && n <= total && n !== pagina) aoMudar(n); };
    const nums = [];
    for (let n = 1; n <= total; n++) {
        if (total <= 7 || n === 1 || n === total || Math.abs(n - pagina) <= 1) nums.push(n);
        else if (nums[nums.length - 1] !== '…') nums.push('…');
    }
    return (
        <div className="mt-4 flex items-center justify-center gap-1">
            <button disabled={pagina === 1} onClick={() => ir(pagina - 1)} aria-label="Anterior" className="btn-page">‹</button>
            {nums.map((n, i) => n === '…' ? (
                <span key={`e${i}`} className="px-1 text-xs text-slate-400">…</span>
            ) : (
                <button key={n} onClick={() => ir(n)} className={`btn-page ${pagina === n ? 'btn-page-ativo' : ''}`}>{n}</button>
            ))}
            <button disabled={pagina === total} onClick={() => ir(pagina + 1)} aria-label="Próxima" className="btn-page">›</button>
        </div>
    );
}

// ---------- Controle Segmentado (Unidade, Prioridade, etc.) ----------
function SegmentedControl({ options, value, onChange, disabled, className }) {
    const n = options.length;
    const idx = options.findIndex(o => o.value === value);
    return (
        <div
            role="radiogroup"
            className={`relative grid w-full rounded-lg bg-slate-200/60 p-1 dark:bg-slate-800 ${className || ''}`}
            style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
            {idx >= 0 && (
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-md bg-[#0E3263] shadow-sm transition-transform duration-150 ease-out"
                    style={{ width: `calc((100% - 0.5rem) / ${n})`, transform: `translateX(${idx * 100}%)` }}
                />
            )}
            {options.map(opt => {
                const ativo = value === opt.value;
                const off = disabled || opt.disabled;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        disabled={off}
                        onClick={() => !off && onChange(opt.value)}
                        className={`relative z-10 flex h-10 min-w-0 items-center justify-center whitespace-nowrap rounded-md bg-transparent px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 ${
                            ativo ? 'text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                        } ${off ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
