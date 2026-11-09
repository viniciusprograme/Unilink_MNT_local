// ==========================================================
// FUNÇÕES UTILITÁRIAS
// ==========================================================

const priorityWeights = { 'Urgente': 1, 'Alta': 2, 'Média': 3, 'Baixa': 4 };

// ==========================================================
// ASSUNTO — resumo curto da descrição para as listas
// ----------------------------------------------------------
// Não existe coluna `assunto` no banco; a descrição carrega o
// texto livre (ex.: "[DEMO] Porta travada — registro fictício
// para apresentação."). Nas listas (Chamados/Histórico) a
// descrição completa polui a linha, então derivamos um assunto:
// remove o marcador [DEMO], corta no primeiro separador
// (" — ", " – ", " - ", ":", ";") e limita a ~60 caracteres.
// A descrição completa continua na busca, no tooltip (title)
// e no ModalDetalhes.
// ==========================================================
const extrairAssunto = (descricao) => {
    if (!descricao) return '-';
    let t = String(descricao).replace(/\s+/g, ' ').trim();
    t = t.replace(/^\[DEMO\]\s*/i, '').trim();
    if (!t) return '-';
    let corte = t.length;
    for (const sep of [' — ', ' – ', ' - ', ': ', '; ']) {
        const i = t.indexOf(sep);
        if (i >= 3) corte = Math.min(corte, i);
    }
    if (corte === t.length) {
        for (const ch of ['—', '–', ':']) {
            const i = t.indexOf(ch);
            if (i >= 3) { corte = Math.min(corte, i); break; }
        }
    }
    let assunto = (corte < t.length ? t.slice(0, corte) : t).trim();
    const LIMITE = 60;
    if (assunto.length > LIMITE) assunto = assunto.slice(0, LIMITE).trim() + '…';
    return assunto || '-';
};

const formatarApenasData = (dataStr) => {
    if (!dataStr) return '-';
    return dataStr.split(/[, ]+/)[0];
};

// Nome de usuário a partir do e-mail sintético (joao@unilink.local → joao)
const extrairUsuario = (email) => {
    const e = String(email || '').trim();
    if (!e) return 'usuário';
    const local = e.split('@')[0].trim();
    return local || e;
};

const calcularDiasDecorridos = (dataStr) => {
    if (!dataStr || dataStr === '-') return 0;
    const parteData = dataStr.split(/[, ]+/)[0];
    const partes = parteData.split('/');
    if (partes.length < 3) return 0;

    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const ano = parseInt(partes[2], 10);

    const dataAbertura = new Date(ano, mes, dia);
    const dataHoje = new Date();

    dataAbertura.setHours(0, 0, 0, 0);
    dataHoje.setHours(0, 0, 0, 0);

    const diffTime = dataHoje - dataAbertura;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
};

const tocarSomPorPrioridade = (prioridade) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const volume = {
        Urgente: 1,
        Alta: 0.75,
        'Média': 0.45,
        Baixa: 0.2
    }[prioridade] ?? 0.45;
    const context = new AudioContextClass();
    const agora = context.currentTime;

    for (let i = 0; i < 6; i++) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const inicio = agora + i * 0.5;
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(volume * 0.12, inicio);
        gain.gain.exponentialRampToValueAtTime(0.001, inicio + 0.12);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(inicio);
        oscillator.stop(inicio + 0.12);
    }
    setTimeout(() => context.close(), 3500);
};

const exportarCSVFallback = (dados, sufixo = '') => {
    if (!dados || dados.length === 0) return;
    const headers = ["Unidade", "Prioridade", "Data", "Equipamento", "Servico", "Descricao", "Localizacao", "ServicoFeito", "Pendencia", "Encerramento", "Status"];

    let csvContent = "\uFEFF";
    csvContent += headers.join(";") + "\n";

    dados.forEach(c => {
        const row = [
            `"${(c.unidade || 'MATRIZ').replace(/"/g, '""')}"`,
            `"${(c.prioridade || '-').replace(/"/g, '""')}"`,
            `"${(c.dataAbertura || '-').replace(/"/g, '""')}"`,
            `"${(c.equipamento || '-').replace(/"/g, '""')}"`,
            `"${(c.servico || '-').replace(/"/g, '""')}"`,
            `"${(c.descricao || '-').replace(/"/g, '""')}"`,
            `"${(c.localizacao || '-').replace(/"/g, '""')}"`,
            `"${(c.servicoFeito || '-').replace(/"/g, '""')}"`,
            `"${(c.pendencia || '-').replace(/"/g, '""')}"`,
            `"${(c.dataEncerramento || '-').replace(/"/g, '""')}"`,
            `"${c.concluido ? "CONCLUÍDO" : "PENDENTE"}"`
        ];
        csvContent += row.join(";") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Relatorio_Chamados_Unilink${sufixo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// ==========================================================
// PDF — Ordem de Serviço individual (impressão via navegador)
// ----------------------------------------------------------
// Evolui o "Imprimir OS" que já existia isoladamente dentro de
// TelaHistorico/TelaPendencia: agora é uma função única e
// reutilizável por qualquer tela, para não duplicar HTML/CSS.
// ==========================================================
const gerarHTMLOrdemServico = (c) => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Ordem de Serviço - ${c.equipamento || '-'}</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #0E3263; padding-bottom: 10px; margin-bottom: 20px; }
            .header h1 { color: #0E3263; margin: 0; font-size: 20px; }
            .header p { margin: 5px 0 0; font-weight: bold; color: #555; }
            .badge { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; }
            .status-concluido { background: #d1fae5; color: #065f46; }
            .status-pendente { background: #fef3c7; color: #92400e; }
            .section { margin-bottom: 15px; }
            .section-title { background: #0E3263; color: white; padding: 6px 10px; font-weight: bold; font-size: 13px; text-transform: uppercase; }
            .content-box { border: 1px solid #ccc; padding: 10px; margin-top: 5px; font-size: 13px; background: #fafafa; white-space: pre-wrap; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; font-size: 13px; }
            .signatures { margin-top: 50px; display: flex; justify-content: space-between; }
            .sig-line { border-top: 1px solid #333; width: 45%; text-align: center; padding-top: 5px; font-size: 11px; font-weight: bold; }
            .footer { margin-top: 24px; font-size: 10px; color: #999; text-align: center; }
            @media print { .no-print { display: none; } }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>UNILINK TRANSPORTES INTEGRADOS LTDA.</h1>
            <p>ORDEM DE SERVIÇO DE MANUTENÇÃO</p>
        </div>
        <div class="grid section">
            <div><strong>UNIDADE:</strong> ${c.unidade || 'MATRIZ'}</div>
            <div><strong>PRIORIDADE:</strong> ${c.prioridade || '-'}</div>
            <div><strong>EQUIPAMENTO:</strong> ${c.equipamento || '-'}</div>
            <div><strong>SERVIÇO(S):</strong> ${c.servico || '-'}</div>
            <div><strong>LOCALIZAÇÃO:</strong> ${c.localizacao || '-'}</div>
            <div><strong>STATUS:</strong> <span class="badge ${c.concluido ? 'status-concluido' : 'status-pendente'}">${c.concluido ? 'CONCLUÍDO' : 'PENDENTE'}</span></div>
            <div><strong>DATA ABERTURA:</strong> ${c.dataAbertura || '-'}</div>
            <div><strong>DATA ENCERRAMENTO:</strong> ${c.dataEncerramento || '-'}</div>
        </div>
        <div class="section">
            <div class="section-title">Descrição do Problema</div>
            <div class="content-box">${c.descricao || '-'}</div>
        </div>
        <div class="section">
            <div class="section-title">Serviço Executado</div>
            <div class="content-box">${c.servicoFeito || (c.concluido ? 'NENHUM' : 'Chamado ainda em aberto')}</div>
        </div>
        <div class="section">
            <div class="section-title">Pendências Observadas</div>
            <div class="content-box">${c.pendencia || (c.concluido ? 'NENHUMA' : '-')}</div>
        </div>
        <div class="signatures">
            <div class="sig-line"><br/>Responsável pela Manutenção</div>
            <div class="sig-line"><br/>Operador / Solicitante</div>
        </div>
        <div class="footer">Documento gerado em ${new Date().toLocaleString('pt-BR')} — Sistema UNILINK</div>
    </body>
    </html>
`;

const imprimirOrdemServico = (chamado) => {
    const win = window.open('', '_blank');
    if (!win) {
        window.notifyWarning && window.notifyWarning('Permita pop-ups no navegador para gerar o PDF'); return;
    }
    win.document.write(gerarHTMLOrdemServico(chamado));
    win.document.close();
    win.focus();
    win.print();
};

// ==========================================================
// PDF — Relatório consolidado (lista de chamados / histórico)
// ==========================================================
const imprimirRelatorioLista = (lista, tituloRelatorio = 'Relatório de Chamados', filtroLabel = '') => {
    if (!lista || lista.length === 0) {
        window.notifyWarning && window.notifyWarning('Nenhum dado para exportar ou gerar relatório'); return;
    }
    const win = window.open('', '_blank');
    if (!win) {
        window.notifyWarning && window.notifyWarning('Permita pop-ups no navegador para gerar o PDF'); return;
    }

    const linhas = lista.map(c => `
        <tr>
            <td>${c.unidade || 'MATRIZ'}</td>
            <td>${c.prioridade || '-'}</td>
            <td>${c.equipamento || '-'}</td>
            <td>${c.servico || '-'}</td>
            <td>${formatarApenasData(c.dataAbertura)}</td>
            <td>${c.concluido ? formatarApenasData(c.dataEncerramento) : '-'}</td>
            <td>${c.concluido ? 'CONCLUÍDO' : 'PENDENTE'}</td>
        </tr>
    `).join('');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${tituloRelatorio}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 24px; color: #333; }
                .header { text-align: center; border-bottom: 2px solid #0E3263; padding-bottom: 10px; margin-bottom: 16px; }
                .header h1 { color: #0E3263; margin: 0; font-size: 20px; }
                .header p { margin: 4px 0 0; font-weight: bold; color: #555; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
                th { background: #0E3263; color: white; padding: 6px; text-align: left; text-transform: uppercase; }
                td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
                tr:nth-child(even) { background: #f8fafc; }
                .footer { margin-top: 18px; font-size: 10px; color: #999; text-align: center; }
                .resumo { font-size: 12px; margin-bottom: 8px; color: #444; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>UNILINK TRANSPORTES INTEGRADOS LTDA.</h1>
                <p>${tituloRelatorio}${filtroLabel ? ' — ' + filtroLabel : ''}</p>
            </div>
            <div class="resumo">Total de registros: <strong>${lista.length}</strong> — Gerado em ${new Date().toLocaleString('pt-BR')}</div>
            <table>
                <thead>
                    <tr>
                        <th>Unidade</th><th>Prioridade</th><th>Equipamento</th><th>Serviço</th>
                        <th>Abertura</th><th>Encerramento</th><th>Status</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
            <div class="footer">Documento gerado automaticamente pelo sistema UNILINK</div>
        </body>
        </html>
    `;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
};

// ==========================================================
// MÉTRICAS — usadas pelo Dashboard e pelo relatório quinzenal
// ----------------------------------------------------------
// Todo cálculo aqui usa exclusivamente dados já existentes em
// `chamados` (sem inventar campos que o sistema não possui).
// ==========================================================

// Converte "dd/mm/aaaa, hh:mm:ss" (formato usado no app) em Date.
const parseDataBR = (dataStr) => {
    if (!dataStr || dataStr === '-') return null;
    const [dataParte, horaParte] = dataStr.split(',').map(s => s.trim());
    const partesData = (dataParte || '').split('/');
    if (partesData.length < 3) return null;
    const [dia, mes, ano] = partesData.map(n => parseInt(n, 10));
    let hora = 0, min = 0, seg = 0;
    if (horaParte) {
        const partesHora = horaParte.split(':').map(n => parseInt(n, 10));
        [hora = 0, min = 0, seg = 0] = partesHora;
    }
    const d = new Date(ano, (mes || 1) - 1, dia || 1, hora, min, seg);
    return isNaN(d.getTime()) ? null : d;
};

const diferencaEmHoras = (dataInicioStr, dataFimStr) => {
    const inicio = parseDataBR(dataInicioStr);
    const fim = parseDataBR(dataFimStr);
    if (!inicio || !fim) return null;
    const diffMs = fim - inicio;
    if (diffMs < 0) return null;
    return diffMs / (1000 * 60 * 60);
};

const formatarHoras = (horas) => {
    if (horas === null || horas === undefined || isNaN(horas)) return '-';
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}h${String(m).padStart(2, '0')}`;
};

/**
 * Filtra chamados por período (em dias, a partir de hoje). period = null → sem filtro (tudo).
 */
const filtrarChamadosPorPeriodo = (chamados, dias) => {
    if (!dias) return chamados;
    const limite = new Date();
    limite.setHours(0, 0, 0, 0);
    limite.setDate(limite.getDate() - dias);
    return chamados.filter(c => {
        const dataAbertura = parseDataBR(c.dataAbertura);
        return dataAbertura && dataAbertura >= limite;
    });
};

/**
 * Filtra chamados por um intervalo de datas [inicio, fim] (inclusive),
 * usado pelos atalhos "Hoje", "Ontem", "Mês atual", "Mês anterior".
 */
const filtrarChamadosPorIntervalo = (chamados, inicio, fim) => {
    return chamados.filter(c => {
        const dataAbertura = parseDataBR(c.dataAbertura);
        return dataAbertura && dataAbertura >= inicio && dataAbertura <= fim;
    });
};

const obterIntervaloHoje = () => {
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
    const fim = new Date(); fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
};

const obterIntervaloOntem = () => {
    const inicio = new Date(); inicio.setDate(inicio.getDate() - 1); inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio); fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
};

const obterIntervaloMesAtual = () => {
    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);
    return { inicio, fim };
};

const obterIntervaloMesAnterior = () => {
    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0, 0);
    const fim = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59, 999);
    return { inicio, fim };
};

/**
 * Calcula métricas agregadas por serviço a partir da lista de chamados.
 * Um chamado pode ter múltiplos serviços (ex: "PINTURA, SOLDA") — cada
 * serviço listado soma para as métricas do próprio serviço.
 */
const STATUS_ENCERRADO = ['RESOLVIDO','FECHADO'];
const isEncerrado = (c) => !!c.concluido || STATUS_ENCERRADO.includes(c.status);
const isAberto = (c) => !isEncerrado(c);

const calcularMetricasPorServico = (chamados) => {
    const mapa = {};

    chamados.forEach(c => {
        const servicos = String(c.servico || '-').split(',').map(s => s.trim()).filter(Boolean);
        const servicosUnicos = servicos.length ? servicos : ['NÃO INFORMADO'];

        servicosUnicos.forEach(srv => {
            if (!mapa[srv]) {
                mapa[srv] = {
                    servico: srv,
                    total: 0,
                    abertos: 0,
                    encerrados: 0,
                    somaHorasAtendimento: 0,
                    qtdComTempo: 0,
                    atrasados: 0, // pendente há mais de 3 dias
                    equipamentos: {}
                };
            }
            const m = mapa[srv];
            m.total += 1;
            if (isEncerrado(c)) {
                m.encerrados += 1;
                const horas = diferencaEmHoras(c.dataAbertura, c.dataEncerramento);
                if (horas !== null) {
                    m.somaHorasAtendimento += horas;
                    m.qtdComTempo += 1;
                }
            } else {
                m.abertos += 1;
                const diasAberto = calcularDiasDecorridos(c.dataAbertura);
                if (diasAberto > 3) m.atrasados += 1;
            }
            const chaveEquip = c.equipamento || '-';
            m.equipamentos[chaveEquip] = (m.equipamentos[chaveEquip] || 0) + 1;
        });
    });

    return Object.values(mapa).map(m => ({
        servico: m.servico,
        total: m.total,
        abertos: m.abertos,
        encerrados: m.encerrados,
        tempoMedioHoras: m.qtdComTempo ? m.somaHorasAtendimento / m.qtdComTempo : null,
        atrasados: m.atrasados,
        taxaResolucao: m.total ? Math.round((m.encerrados / m.total) * 100) : 0,
        // "Recorrente" = mesmo equipamento apareceu em mais de 1 chamado para este serviço
        recorrentes: Object.values(m.equipamentos).filter(qtd => qtd > 1).length
    })).sort((a, b) => b.total - a.total);
};

/**
 * Resumo geral (visão macro) usado no topo do Dashboard.
 */
const calcularResumoGeral = (chamados) => {
    const total = chamados.length;
    const abertos = chamados.filter(isAberto).length;
    const emAtendimento = chamados.filter(c => isAberto(c) && (c.emAtendimento || c.status === 'EM_ATENDIMENTO')).length;
    const encerrados = chamados.filter(isEncerrado).length;
    const atrasados = chamados.filter(c => isAberto(c) && calcularDiasDecorridos(c.dataAbertura) > 3).length;

    const temposResolucao = chamados
        .filter(isEncerrado)
        .map(c => diferencaEmHoras(c.dataAbertura, c.dataEncerramento))
        .filter(h => h !== null);

    const tempoMedioResolucao = temposResolucao.length
        ? temposResolucao.reduce((a, b) => a + b, 0) / temposResolucao.length
        : null;

    const taxaResolucao = total ? Math.round((encerrados / total) * 100) : 0;

    return { total, abertos, emAtendimento, pendentesSemAtendimento: abertos - emAtendimento, encerrados, atrasados, tempoMedioResolucao, taxaResolucao };
};

const calcularDistribuicaoPorPrioridade = (chamados) => {
    const base = { 'Urgente': 0, 'Alta': 0, 'Média': 0, 'Baixa': 0 };
    chamados.forEach(c => { if (base[c.prioridade] !== undefined) base[c.prioridade] += 1; });
    return base;
};

const calcularDistribuicaoPorStatus = (chamados) => {
    const base = { 'ABERTO':0, 'EM_ANALISE':0, 'ATRIBUIDO':0, 'EM_ATENDIMENTO':0, 'AGUARDANDO_USUARIO':0, 'RESOLVIDO':0, 'FECHADO':0 };
    chamados.forEach(c => {
        const s = c.status || (c.concluido ? 'FECHADO' : 'ABERTO');
        if (base[s] !== undefined) base[s] += 1;
        else base[s] = (base[s]||0)+1;
    });
    return base;
};

const filtrarChamadosPorStatus = (chamados, status) => {
    if (!status || status === 'TODOS') return chamados;
    return chamados.filter(c => (c.status || (c.concluido?'FECHADO':'ABERTO')) === status);
};
const filtrarChamadosPorData = (chamados, tipo) => {
    if (!tipo || tipo === 'TODOS') return chamados;
    const agora = new Date();
    let inicio, fim;
    if (tipo === 'HOJE') { inicio = new Date(); inicio.setHours(0,0,0,0); fim = new Date(); fim.setHours(23,59,59,999); }
    else if (tipo === '7d') { inicio = new Date(); inicio.setDate(inicio.getDate()-7); inicio.setHours(0,0,0,0); fim = new Date(); fim.setHours(23,59,59,999); }
    else if (tipo === '30d') { inicio = new Date(); inicio.setDate(inicio.getDate()-30); inicio.setHours(0,0,0,0); fim = new Date(); fim.setHours(23,59,59,999); }
    else if (tipo === 'MES_ATUAL') { const r=obterIntervaloMesAtual(); inicio=r.inicio; fim=r.fim; }
    else if (tipo === 'MES_ANTERIOR') { const r=obterIntervaloMesAnterior(); inicio=r.inicio; fim=r.fim; }
    else return chamados;
    return filtrarChamadosPorIntervalo(chamados, inicio, fim);
};

const calcularDistribuicaoPorUnidade = (chamados) => {
    const base = {};
    chamados.forEach(c => {
        const u = c.unidade || 'MATRIZ';
        base[u] = (base[u] || 0) + 1;
    });
    return base;
};

/**
 * PDF do relatório de métricas/dashboard (usado no Dashboard e,
 * futuramente, pelo relatório automático quinzenal — ver
 * DOCUMENTACAO_MELHORIAS.md).
 */
const imprimirRelatorioMetricas = (resumo, metricasServico, periodoLabel) => {
    const win = window.open('', '_blank');
    if (!win) {
        window.notifyWarning && window.notifyWarning('Permita pop-ups no navegador para gerar o PDF'); return;
    }

    const linhasServico = metricasServico.map(m => `
        <tr>
            <td>${m.servico}</td>
            <td>${m.total}</td>
            <td>${m.abertos}</td>
            <td>${m.encerrados}</td>
            <td>${formatarHoras(m.tempoMedioHoras)}</td>
            <td>${m.atrasados}</td>
            <td>${m.taxaResolucao}%</td>
            <td>${m.recorrentes}</td>
        </tr>
    `).join('');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Relatório de Indicadores - UNILINK</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 24px; color: #333; }
                .header { text-align: center; border-bottom: 2px solid #0E3263; padding-bottom: 10px; margin-bottom: 16px; }
                .header h1 { color: #0E3263; margin: 0; font-size: 20px; }
                .header p { margin: 4px 0 0; font-weight: bold; color: #555; font-size: 12px; }
                .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
                .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px; text-align: center; }
                .card .valor { font-size: 20px; font-weight: bold; color: #0E3263; }
                .card .label { font-size: 10px; text-transform: uppercase; color: #666; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
                th { background: #0E3263; color: white; padding: 6px; text-align: left; text-transform: uppercase; }
                td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
                tr:nth-child(even) { background: #f8fafc; }
                .section-title { background: #0E3263; color: white; padding: 6px 10px; font-weight: bold; font-size: 13px; text-transform: uppercase; margin-top: 20px; }
                .footer { margin-top: 18px; font-size: 10px; color: #999; text-align: center; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>UNILINK TRANSPORTES INTEGRADOS LTDA.</h1>
                <p>RELATÓRIO DE INDICADORES DE MANUTENÇÃO — ${periodoLabel}</p>
            </div>

            <div class="cards">
                <div class="card"><div class="valor">${resumo.total}</div><div class="label">Total de Chamados</div></div>
                <div class="card"><div class="valor">${resumo.abertos}</div><div class="label">Abertos</div></div>
                <div class="card"><div class="valor">${resumo.encerrados}</div><div class="label">Encerrados</div></div>
                <div class="card"><div class="valor">${resumo.atrasados}</div><div class="label">Atrasados (+3d)</div></div>
                <div class="card"><div class="valor">${formatarHoras(resumo.tempoMedioResolucao)}</div><div class="label">Tempo Médio Resolução</div></div>
                <div class="card"><div class="valor">${resumo.taxaResolucao}%</div><div class="label">Taxa de Resolução</div></div>
                <div class="card"><div class="valor">${resumo.emAtendimento}</div><div class="label">Em Atendimento</div></div>
                <div class="card"><div class="valor">${resumo.pendentesSemAtendimento}</div><div class="label">Pendentes s/ Atend.</div></div>
            </div>

            <div class="section-title">Indicadores por Serviço</div>
            <table>
                <thead>
                    <tr>
                        <th>Serviço</th><th>Chamados</th><th>Abertos</th><th>Encerrados</th>
                        <th>Tempo Médio</th><th>Atrasados</th><th>Taxa Resolução</th><th>Recorrentes</th>
                    </tr>
                </thead>
                <tbody>${linhasServico}</tbody>
            </table>

            <div class="footer">Documento gerado em ${new Date().toLocaleString('pt-BR')} — Sistema UNILINK</div>
        </body>
        </html>
    `;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
};

// ==========================================================
// EXPORTAÇÃO XML
// ==========================================================
const escaparXML = (valor) => String(valor ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const exportarParaXML = (dados, unidadeFiltro = 'TODOS') => {
    if (!dados || dados.length === 0) {
        window.notifyWarning && window.notifyWarning('Nenhum dado para exportar ou gerar relatório'); return;
    }

    const sufixo = unidadeFiltro !== 'TODOS' ? `_${unidadeFiltro}` : '';

    const itens = dados.map(c => `
    <chamado>
        <protocolo>${escaparXML(c.protocolo)}</protocolo>
        <unidade>${escaparXML(c.unidade || 'MATRIZ')}</unidade>
        <prioridade>${escaparXML(c.prioridade)}</prioridade>
        <equipamento>${escaparXML(c.equipamento)}</equipamento>
        <servico>${escaparXML(c.servico)}</servico>
        <descricao>${escaparXML(c.descricao)}</descricao>
        <localizacao>${escaparXML(c.localizacao)}</localizacao>
        <servicoFeito>${escaparXML(c.servicoFeito)}</servicoFeito>
        <pendencia>${escaparXML(c.pendencia)}</pendencia>
        <dataAbertura>${escaparXML(c.dataAbertura)}</dataAbertura>
        <dataEncerramento>${escaparXML(c.dataEncerramento)}</dataEncerramento>
        <status>${escaparXML(c.status || (c.concluido ? 'FECHADO' : 'ABERTO'))}</status>
        <atribuidoPara>${escaparXML(c.atribuidoParaNome || '-')}</atribuidoPara>
    </chamado>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<chamadosUnilink geradoEm="${new Date().toISOString()}" totalRegistros="${dados.length}">${itens}\n</chamadosUnilink>`;

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Relatorio_Chamados_Unilink${sufixo}.xml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window.notifySuccess && window.notifySuccess(`XML exportado: ${dados.length} registros`);
};

const exportarParaExcel = (dados, unidadeFiltro = 'TODOS') => {
    if (!dados || dados.length === 0) {
        window.notifyWarning && window.notifyWarning('Nenhum dado para exportar ou gerar relatório'); return;
    }

    const sufixo = unidadeFiltro !== 'TODOS' ? `_${unidadeFiltro}` : '';

    try {
        const dadosFormatados = dados.map(c => ({
            Protocolo: c.protocolo || '-',
            Unidade: c.unidade || 'MATRIZ',
            Prioridade: c.prioridade || '-',
            Data: c.dataAbertura || '-',
            Equipamento: c.equipamento || '-',
            Servico: c.servico || '-',
            Descricao: c.descricao || '-',
            Localizacao: c.localizacao || '-',
            ServicoFeito: c.servicoFeito || '-',
            Pendencia: c.pendencia || '-',
            Encerramento: c.dataEncerramento || '-',
            Status: c.status || (c.concluido ? "FECHADO" : "ABERTO"),
            AtribuidoPara: c.atribuidoParaNome || '-'
        }));

        if (window.XLSX && typeof XLSX.utils !== 'undefined') {
            const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Chamados");
            XLSX.writeFile(workbook, `Relatorio_Chamados_Unilink${sufixo}.xlsx`);
            window.notifySuccess && window.notifySuccess(`Excel exportado: ${dados.length} registros`);
        } else {
            exportarCSVFallback(dados, sufixo);
        }
    } catch (erro) {
        console.error("Erro ao gerar arquivo Excel:", erro);
        exportarCSVFallback(dados, sufixo);
    }
};