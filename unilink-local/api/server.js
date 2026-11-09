// UNILINK API — PostgreSQL local + auth própria (JWT/bcrypt) + upload em disco.
// Substitui: Supabase Auth, PostgREST (acesso direto do front), RLS e Storage.
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const logger = require('./logger');

const {
  DATABASE_URL,
  JWT_SECRET,
  PORT = 3001,
  TOKEN_TTL = '12h',
  UPLOAD_DIR = path.join(__dirname, 'uploads')
} = process.env;

if (!DATABASE_URL || !JWT_SECRET) {
  logger.error('Defina DATABASE_URL e JWT_SECRET no ambiente (.env).');
  process.exit(1);
}
if (JWT_SECRET.length < 32) {
  logger.error('JWT_SECRET muito curto: use pelo menos 32 caracteres (openssl rand -hex 32).');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
pool.on('error', (e) => logger.error('Erro no pool do Postgres', e?.message));
const q = (text, params) => pool.query(text, params);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const UPLOAD_ROOT = path.resolve(UPLOAD_DIR);

const app = express();
app.set('etag', false);
app.set('trust proxy', 1); // nginx na frente
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// CORS: em produção o front é servido pelo mesmo domínio (nginx /api), então CORS_ORIGIN é opcional.
const corsOrigens = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    try { const u = new URL(origin); if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return cb(null, true); } catch {}
    cb(null, corsOrigens.includes(origin));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
const limiteGlobal = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const limiteAdmin = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const limiteLogin = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const limiteEscritaPublica = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use(limiteGlobal);
app.use('/admin', limiteAdmin);
app.use('/auth/login', limiteLogin);
app.use(logger.requestLogger);

// ---------------------------------------------------------- constantes
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMINIO_USUARIO = '@unilink.local';
const PAPEIS = ['solicitante', 'atendente', 'supervisor', 'administrador'];
const UNIDADES = ['MATRIZ', 'PECÉM'];
const PRIORIDADES = ['Urgente', 'Alta', 'Média', 'Baixa'];
const ETAPAS = ['ABERTURA', 'ATENDIMENTO', 'RESOLUCAO'];
const TIPOS_EVENTO = ['EM_ATENDIMENTO_INICIADO', 'EM_ATENDIMENTO_PAUSADO', 'EVIDENCIA_ADICIONADA', 'ENCERRAMENTO', 'OBSERVACAO'];
const STATUS_TODOS = ['ABERTO', 'EM_ANALISE', 'ATRIBUIDO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'RESOLVIDO', 'FECHADO'];
const TRANS = {
  ABERTO: ['EM_ANALISE', 'ATRIBUIDO', 'EM_ATENDIMENTO', 'FECHADO'],
  EM_ANALISE: ['ATRIBUIDO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'FECHADO'],
  ATRIBUIDO: ['EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'FECHADO'],
  EM_ATENDIMENTO: ['AGUARDANDO_USUARIO', 'RESOLVIDO', 'FECHADO'],
  AGUARDANDO_USUARIO: ['EM_ATENDIMENTO', 'RESOLVIDO', 'FECHADO'],
  RESOLVIDO: ['FECHADO', 'EM_ATENDIMENTO'],
  FECHADO: []
};
const podeTransitar = (de, para) => de === para || (TRANS[de] || []).includes(para);
const JANELA_UPLOAD_PUBLICO_MIN = 30; // anexar foto sem login só logo após abrir o chamado
const MAX_EVIDENCIAS_PUBLICAS = 10;
const BLOQUEIO_ANOS = 100; // bloqueio "indefinido" até o admin desbloquear
const HASH_FALSO = bcrypt.hashSync('senha-falsa-para-tempo-constante', 10);

const normalizarCodigoGrupo = (valor) => String(valor ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
const normalizarServicosDoChamado = (valor) => String(valor || '').split(',').map((item) => String(item).trim().toUpperCase()).filter(Boolean).filter((item) => item !== 'NÃO INFORMADO');

async function gruposDoUsuario(userId) {
  if (!UUID_RE.test(String(userId || ''))) return [];
  const { rows } = await q(
    `select g.codigo
       from usuario_grupos ug
       join grupos_servico g on g.id = ug.grupo_id
      where ug.user_id = $1 and g.ativo = true
      order by g.codigo asc`, [userId]);
  return rows.map((row) => row.codigo);
}

async function podeAtenderChamado(perfil, chamado, userId = perfil?.userId || perfil?.id) {
  if (!perfil || !chamado) return false;
  if (perfil.papel === 'supervisor' || perfil.papel === 'administrador') return true;
  if (perfil.papel !== 'atendente') return false;
  const uid = userId || perfil.userId || perfil.id;
  if (!uid) return false;
  const grupos = await gruposDoUsuario(uid);
  if (!grupos.length) return false;
  const servicos = normalizarServicosDoChamado(chamado.servico);
  if (!servicos.length) return false;
  return servicos.some((servico) => grupos.includes(servico));
}

async function garantirAcessoChamadoAtendente(req, id) {
  const perfil = req.perfil || {};
  if (perfil.papel === 'supervisor' || perfil.papel === 'administrador') return { ok: true, chamado: null };
  if (perfil.papel === 'solicitante') return { ok: false, status: 403, mensagem: 'Seu perfil não possui acesso ao ambiente de Manutenção.' };
  if (perfil.papel !== 'atendente') return { ok: false, status: 403, mensagem: 'Perfil sem acesso ao ambiente de manutenção.' };

  const { rows: [chamado] } = await q('select * from chamados_unilink where id=$1', [id]);
  if (!chamado) return { ok: false, status: 404, mensagem: 'Chamado não encontrado.' };
  const permitido = await podeAtenderChamado({ ...perfil, id: req.authUser.id, userId: req.authUser.id }, chamado, req.authUser.id);
  if (!permitido) return { ok: false, status: 403, mensagem: 'Você não tem acesso a este chamado com base nos grupos de serviço do seu perfil.' };
  return { ok: true, chamado };
}

app.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(404).json({ mensagem: 'Registro não encontrado.' });
  next();
});

// ---------------------------------------------------------- helpers de auth
const normalizarUsuario = (u) => String(u || '').trim().toLowerCase();
const usuarioValido = (u) => /^[a-z0-9._-]{3,40}$/.test(u);
const emailDeUsuario = (u) => (u.includes('@') ? u : `${u}${DOMINIO_USUARIO}`);
const nomeDeExibicao = (email) => String(email || '').split('@')[0] || email;
const assinarToken = (u) => jwt.sign({ sub: u.id, email: u.email }, JWT_SECRET, { algorithm: 'HS256', expiresIn: TOKEN_TTL });

async function getUsuario(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); } catch { return null; }
  if (!UUID_RE.test(payload.sub || '')) return null;
  const { rows } = await q(
    `select u.id, u.email, p.papel, p.ativo, p.precisa_trocar_senha
       from usuarios u left join perfis_usuario p on p.user_id = u.id where u.id = $1`, [payload.sub]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, email: r.email,
    perfil: { papel: r.papel || 'atendente', ativo: r.ativo !== false, precisa_trocar_senha: !!r.precisa_trocar_senha }
  };
}

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const exigirLogin = asyncH(async (req, res, next) => {
  const u = await getUsuario(req);
  if (!u) return res.status(401).json({ mensagem: 'Sessão expirada. Faça login novamente.' });
  if (!u.perfil.ativo) return res.status(403).json({ mensagem: 'Usuário desativado. Fale com o administrador.' });
  req.authUser = u; req.perfil = u.perfil;
  next();
});

const exigirManutencao = asyncH(async (req, res, next) => {
  const u = await getUsuario(req);
  if (!u) return res.status(401).json({ mensagem: 'Sessão expirada. Faça login novamente.' });
  if (!u.perfil.ativo) return res.status(403).json({ mensagem: 'Usuário desativado. Fale com o administrador.' });
  if (u.perfil.papel === 'solicitante') return res.status(403).json({ mensagem: 'Seu perfil não possui acesso ao ambiente de Manutenção.' });
  req.authUser = u; req.perfil = u.perfil;
  next();
});

const exigirAdmin = asyncH(async (req, res, next) => {
  const u = await getUsuario(req);
  if (!u) return res.status(401).json({ mensagem: 'Sessão expirada. Faça login novamente.' });
  if (u.perfil.papel !== 'administrador' || !u.perfil.ativo) {
    logger.warn(`Acesso admin negado para ${u.email}`);
    return res.status(403).json({ mensagem: 'Acesso restrito ao administrador.' });
  }
  req.authUser = u; req.perfil = u.perfil;
  req.adminIp = req.ip || null;
  next();
});

async function auditar(acao, alvo, feitoPor, detalhe, ip) {
  try {
    await q(`insert into admin_auditoria (acao, alvo_usuario_id, alvo_usuario_nome, feito_por, feito_por_nome, detalhe, ip_origem)
             values ($1,$2,$3,$4,$5,$6,$7)`,
      [acao, alvo?.id || null, alvo?.nome || null, feitoPor?.id || null, feitoPor?.email || null, detalhe || null, ip || null]);
  } catch (e) { logger.warn('Falha ao auditar ' + acao, e?.message); }
}

async function contarAdministradoresAtivos() {
  const { rows } = await q(`select count(*)::int as n from perfis_usuario where papel='administrador' and ativo=true`);
  return rows[0].n;
}
async function getPerfil(userId) {
  const { rows } = await q('select papel, precisa_trocar_senha, ativo from perfis_usuario where user_id=$1', [userId]);
  return rows[0] || null;
}
async function emailDoUsuario(id) {
  const { rows } = await q('select email from usuarios where id=$1', [id]);
  return rows[0]?.email || null;
}

async function registrarEvento(db, chamadoId, tipo, descricao, usuario) {
  await db.query(
    `insert into chamado_eventos (chamado_id, tipo_evento, descricao, usuario_id, usuario_nome) values ($1,$2,$3,$4,$5)`,
    [chamadoId, tipo, descricao || null, usuario?.id || null, usuario?.email || null]);
}

const txt = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const ambientesPermitidosPorPapel = (papel) => {
  const papelNormalizado = String(papel || '').trim().toLowerCase();
  if (papelNormalizado === 'solicitante') return ['solicitante'];
  if (['atendente', 'supervisor', 'administrador'].includes(papelNormalizado)) return ['solicitante', 'manutencao'];
  return ['solicitante'];
};

// ---------------------------------------------------------- health + logs do front
app.get('/health', asyncH(async (req, res) => {
  await q('select 1');
  res.json({ ok: true, time: new Date().toISOString() });
}));

app.post('/logs/frontend', limiteEscritaPublica, (req, res) => {
  try {
    const { level = 'info', message = '' } = req.body || {};
    const nivel = ['info', 'warn', 'error'].includes(level) ? level : 'info';
    logger[nivel](`[front] ${txt(message, 500)}`);
  } catch {}
  res.status(204).end();
});

// ---------------------------------------------------------- AUTH
app.post('/auth/login', asyncH(async (req, res) => {
  const email = emailDeUsuario(normalizarUsuario(req.body?.usuario || req.body?.email));
  const senha = String(req.body?.senha || '');
  if (!email || !senha) return res.status(400).json({ mensagem: 'Informe usuário e senha.' });

  const { rows } = await q(
    `select u.id, u.email, u.senha_hash, p.ativo, p.tentativas_login,
            (p.bloqueado_ate is not null and p.bloqueado_ate > now()) as bloqueado
       from usuarios u left join perfis_usuario p on p.user_id = u.id
      where lower(u.email) = $1`, [email]);
  const u = rows[0];
  if (!u) { await bcrypt.compare(senha, HASH_FALSO); return res.status(401).json({ mensagem: 'Usuário ou senha incorretos.' }); }

  if (u.bloqueado) return res.status(423).json({ mensagem: 'Usuário bloqueado após 3 tentativas incorretas. Contate o administrador para desbloquear.' });
  if (u.ativo === false) return res.status(403).json({ mensagem: 'Usuário desativado. Fale com o administrador.' });

  const ok = await bcrypt.compare(senha, u.senha_hash);
  if (!ok) {
    const { rows: r2 } = await q(
      `update perfis_usuario
          set tentativas_login = tentativas_login + 1,
              ultima_tentativa_em = now(),
              bloqueado_ate = case when tentativas_login + 1 >= 3 then now() + make_interval(years => $2) else bloqueado_ate end
        where user_id = $1 returning tentativas_login`, [u.id, BLOQUEIO_ANOS]);
    const tent = r2[0]?.tentativas_login || 0;
    logger.warn(`Login falhou ${u.email} (tentativa ${tent})`);
    if (tent >= 3) return res.status(423).json({ mensagem: 'Usuário bloqueado após 3 tentativas incorretas. Contate o administrador para desbloquear.' });
    return res.status(401).json({ mensagem: 'Usuário ou senha incorretos.', tentativas: tent });
  }

  await q(`update perfis_usuario set tentativas_login=0, bloqueado_ate=null, ultima_tentativa_em=now() where user_id=$1`, [u.id]);
  await q(`update usuarios set ultimo_acesso_em=now() where id=$1`, [u.id]);
  logger.info(`Login ok ${u.email}`);
  res.json({ access_token: assinarToken(u), user: { id: u.id, email: u.email } });
}));

app.post('/auth/refresh', exigirLogin, (req, res) => {
  res.json({ access_token: assinarToken(req.authUser), user: { id: req.authUser.id, email: req.authUser.email } });
});

// troca de senha do próprio usuário (1º acesso)
app.post('/auth/trocar-senha', exigirLogin, asyncH(async (req, res) => {
  const nova = String(req.body?.novaSenha || '');
  if (nova.length < 8) return res.status(400).json({ mensagem: 'A senha deve ter pelo menos 8 caracteres.' });
  const hash = await bcrypt.hash(nova, 10);
  await q('update usuarios set senha_hash=$2 where id=$1', [req.authUser.id, hash]);
  await q('update perfis_usuario set precisa_trocar_senha=false where user_id=$1', [req.authUser.id]);
  logger.info(`Senha trocada por ${req.authUser.email}`);
  res.json({ ok: true });
}));

app.get('/meu-perfil', exigirLogin, asyncH(async (req, res) => {
  const papel = String(req.perfil.papel || 'atendente').trim().toLowerCase();
  // Grupos só importam para atendente; uma falha aqui não pode impedir o carregamento do papel.
  let grupos = [];
  if (papel === 'atendente') {
    try { grupos = await gruposDoUsuario(req.authUser.id); }
    catch (e) { logger.warn(`Falha ao carregar grupos de ${req.authUser.email}`, e?.message); }
  }
  res.json({
    id: req.authUser.id,
    usuario: nomeDeExibicao(req.authUser.email),
    email: req.authUser.email,
    papel,
    grupos,
    ambientesPermitidos: ambientesPermitidosPorPapel(papel),
    precisaTrocarSenha: !!req.perfil.precisa_trocar_senha
  });
}));

app.patch('/meu-perfil/senha-trocada', exigirLogin, asyncH(async (req, res) => {
  await q('update perfis_usuario set precisa_trocar_senha=false where user_id=$1', [req.authUser.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------- CHAMADOS (leitura)
// Fila completa: só logado. Público acompanha por protocolo/uuid.
app.get('/chamados', exigirManutencao, asyncH(async (req, res) => {
  if (req.perfil.papel === 'supervisor' || req.perfil.papel === 'administrador') {
    const { rows } = await q('select * from chamados_unilink order by data_abertura desc');
    return res.json({ chamados: rows });
  }
  if (req.perfil.papel !== 'atendente') {
    return res.json({ chamados: [] });
  }
  const grupos = await gruposDoUsuario(req.authUser.id);
  if (!grupos.length) return res.json({ chamados: [] });
  const { rows } = await q(
    `select *
       from chamados_unilink
      where exists (
          select 1
            from unnest(normalizar_servicos(servico)) as s
           where s = any($1)
      )
      order by data_abertura desc`, [grupos]);
  res.json({ chamados: rows });
}));

// Chamados do próprio solicitante: nunca aceita user_id vindo do navegador.
// Encerrados deixam de aparecer nessa lista, mas continuam no banco/histórico operacional.
app.get('/meus-chamados/abertos', exigirLogin, asyncH(async (req, res) => {
  const { rows } = await q(
    `select * from chamados_unilink
      where criado_por = $1 and status not in ('RESOLVIDO','FECHADO') and concluido = false
      order by data_abertura desc`, [req.authUser.id]);
  res.json({ chamados: rows });
}));

app.get('/chamados/protocolo/:protocolo', asyncH(async (req, res) => {
  const { rows } = await q('select * from chamados_unilink where protocolo = $1', [String(req.params.protocolo).trim().toUpperCase()]);
  if (!rows[0]) return res.status(404).json({ mensagem: 'Protocolo não encontrado.' });
  res.json({ chamado: rows[0] });
}));

app.get('/chamados/:id/eventos', exigirManutencao, asyncH(async (req, res) => {
  const acesso = await garantirAcessoChamadoAtendente(req, req.params.id);
  if (!acesso.ok) return res.status(acesso.status).json({ mensagem: acesso.mensagem });
  const { rows } = await q('select id, tipo_evento, descricao, usuario_nome, criado_em from chamado_eventos where chamado_id=$1 order by criado_em asc', [req.params.id]);
  res.json({ eventos: rows });
}));

app.get('/chamados/:id/historico-status', exigirManutencao, asyncH(async (req, res) => {
  const acesso = await garantirAcessoChamadoAtendente(req, req.params.id);
  if (!acesso.ok) return res.status(acesso.status).json({ mensagem: acesso.mensagem });
  const { rows } = await q('select id, status_anterior, status_novo, usuario_nome, criado_em from chamado_status_historico where chamado_id=$1 order by criado_em asc', [req.params.id]);
  res.json({ historico: rows });
}));

app.get('/chamados/:id/evidencias', exigirManutencao, asyncH(async (req, res) => {
  const acesso = await garantirAcessoChamadoAtendente(req, req.params.id);
  if (!acesso.ok) return res.status(acesso.status).json({ mensagem: acesso.mensagem });
  const { rows } = await q('select id, nome_arquivo, etapa, enviado_por_nome, criado_em from chamado_evidencias where chamado_id=$1 order by criado_em desc', [req.params.id]);
  res.json({ evidencias: rows });
}));

// ---------------------------------------------------------- CHAMADOS (criação pública)
app.post('/chamados', limiteEscritaPublica, exigirLogin, asyncH(async (req, res) => {
  const b = req.body || {};
  const dados = {
    unidade: txt(b.unidade, 20) || 'MATRIZ',
    prioridade: txt(b.prioridade, 20),
    equipamento: txt(b.equipamento, 200),
    servico: txt(b.servico, 500),
    descricao: txt(b.descricao, 4000),
    localizacao: txt(b.localizacao, 300)
  };
  if (!UNIDADES.includes(dados.unidade)) return res.status(400).json({ mensagem: 'Unidade inválida.' });
  if (!PRIORIDADES.includes(dados.prioridade)) return res.status(400).json({ mensagem: 'Prioridade inválida.' });
  for (const campo of ['equipamento', 'servico', 'descricao', 'localizacao']) {
    if (!dados[campo]) return res.status(400).json({ mensagem: `Campo obrigatório: ${campo}.` });
  }
  const usuario = await getUsuario(req); // opcional
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `insert into chamados_unilink (unidade, prioridade, equipamento, servico, descricao, localizacao, criado_por)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [dados.unidade, dados.prioridade, dados.equipamento, dados.servico, dados.descricao, dados.localizacao, usuario?.id || null]);
    await registrarEvento(client, rows[0].id, 'ABERTURA', 'Chamado aberto pelo solicitante.', usuario);
    await client.query('commit');
    logger.info(`Chamado criado ${rows[0].protocolo}`);
    res.status(201).json({ chamado: rows[0] });
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally { client.release(); }
}));

// ---------------------------------------------------------- CHAMADOS (ações autenticadas)
// Assumir agora EXIGE login (antes era público).
app.patch('/chamados/:id/assumir', exigirManutencao, asyncH(async (req, res) => {
  const { id } = req.params;
  const acesso = await garantirAcessoChamadoAtendente(req, id);
  if (!acesso.ok) return res.status(acesso.status).json({ mensagem: acesso.mensagem });
  const { rows: [atual] } = await q('select status from chamados_unilink where id=$1', [id]);
  if (!atual) return res.status(404).json({ mensagem: 'Chamado não encontrado.' });
  if (['FECHADO', 'RESOLVIDO'].includes(atual.status)) return res.status(409).json({ mensagem: 'Chamado já encerrado.' });
  if (atual.status === 'EM_ATENDIMENTO') return res.json({ ok: true, status: 'EM_ATENDIMENTO', jaAssumido: true });
  if (!podeTransitar(atual.status, 'EM_ATENDIMENTO')) return res.status(409).json({ mensagem: `Não é possível assumir no status ${atual.status}.` });
  const nome = req.authUser.email;
  const r = await q(
    `update chamados_unilink set status='EM_ATENDIMENTO', atribuido_para=$2, atribuido_para_nome=$3, atribuido_em=now()
      where id=$1 and status=$4`, [id, req.authUser.id, nome, atual.status]);
  if (r.rowCount === 0) return res.status(409).json({ mensagem: 'O chamado foi alterado por outra pessoa. Atualize a lista.' });
  await registrarEvento(pool, id, 'EM_ATENDIMENTO_INICIADO', `Assumido por ${nome}`, req.authUser);
  logger.info(`Assumido ${id} por ${nome}`);
  res.json({ ok: true, status: 'EM_ATENDIMENTO' });
}));

app.patch('/chamados/:id/concluir', exigirManutencao, asyncH(async (req, res) => {
  const { id } = req.params;
  const acesso = await garantirAcessoChamadoAtendente(req, id);
  if (!acesso.ok) return res.status(acesso.status).json({ mensagem: acesso.mensagem });

  const { itensConcluidos = [], servicoFeito, pendencia, observacoes } = req.body || {};
  if (!servicoFeito || !String(servicoFeito).trim()) return res.status(400).json({ mensagem: 'Descreva o serviço executado.' });
  const { rows: [atual] } = await q('select status, servico, itens_concluidos from chamados_unilink where id=$1', [id]);
  if (!atual) return res.status(404).json({ mensagem: 'Chamado não encontrado.' });
  if (!['EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'ATRIBUIDO'].includes(atual.status)) {
    return res.status(409).json({ mensagem: `Só é possível concluir após assumir (status: ${atual.status}).` });
  }
  const feito = txt(servicoFeito, 4000);
  const obs = txt(observacoes, 4000);
  const pend = txt(pendencia, 2000);
  const todosItens = String(atual.servico || '').split(',').map(s => s.trim()).filter(Boolean);
  const concluidos = Array.isArray(itensConcluidos) ? itensConcluidos.map(s => String(s).trim()).filter(Boolean) : [];
  for (const it of concluidos) if (!todosItens.includes(it)) return res.status(400).json({ mensagem: `Item "${it}" não pertence a este chamado.` });

  if (req.perfil.papel === 'atendente') {
    const gruposAtendente = await gruposDoUsuario(req.authUser.id);
    const itensNaoPermitidos = concluidos.filter((item) => !gruposAtendente.includes(item));
    if (itensNaoPermitidos.length) {
      return res.status(403).json({ mensagem: `Você só pode concluir itens dos grupos de serviço que você atende: ${itensNaoPermitidos.join(', ')}.` });
    }
  }

  const todosConcluidos = todosItens.length > 0 && concluidos.length === todosItens.length;
  const parcial = !todosConcluidos && concluidos.length > 0;

  let sql, params, eventoDesc, novoStatus;
  if (parcial) {
    const pendentes = todosItens.filter(i => !concluidos.includes(i));
    novoStatus = 'AGUARDANDO_USUARIO';
    const textoPend = pendentes.length ? `Itens pendentes: ${pendentes.join(', ')}` + (pend ? ` | ${pend}` : '') : pend;
    sql = `update chamados_unilink set status=$2, servico_feito=$3, pendencia=$4, observacoes=$5, itens_concluidos=$6, conclusao_parcial=true where id=$1`;
    params = [id, novoStatus, feito, textoPend, obs || null, concluidos];
    eventoDesc = `Conclusão parcial: ${concluidos.join(', ')} | pendentes: ${pendentes.join(', ')} • ${feito}`;
  } else {
    novoStatus = 'FECHADO';
    sql = `update chamados_unilink set status=$2, servico_feito=$3, pendencia=$4, observacoes=$5, itens_concluidos=$6,
                  conclusao_parcial=false, data_encerramento=now(), encerrado_por=$7 where id=$1`;
    params = [id, novoStatus, feito, pend || 'NENHUMA', obs || null, todosConcluidos ? concluidos : (atual.itens_concluidos || []), req.authUser.id];
    eventoDesc = (todosConcluidos ? 'Concluído (total)' : 'Concluído') + ` • ${feito}` + (obs ? ` • Obs: ${obs}` : '');
  }
  await q(sql, params);
  await registrarEvento(pool, id, parcial ? 'OBSERVACAO' : 'ENCERRAMENTO', eventoDesc, req.authUser);
  logger.info(`Concluído ${id} por ${req.authUser.email} tipo=${parcial ? 'parcial' : 'total'}`);
  res.json({ ok: true, status: novoStatus, tipo: parcial ? 'parcial' : 'total' });
}));

// Compatibilidade com o cliente atual; o encerramento detalhado usa /concluir.
app.patch('/chamados/:id/encerrar', exigirManutencao, asyncH(async (req, res) => {
  const { id } = req.params;
  const { rows: [atual] } = await q('select status from chamados_unilink where id=$1', [id]);
  if (!atual) return res.status(404).json({ mensagem: 'Chamado não encontrado.' });
  if (atual.status === 'FECHADO') return res.status(409).json({ mensagem: 'Chamado já encerrado.' });
  const feito = txt(req.body?.servicoFeito, 4000) || 'NENHUM';
  const pend = txt(req.body?.pendencia, 2000) || 'NENHUMA';
  await q(`update chamados_unilink set status='FECHADO', servico_feito=$2, pendencia=$3, conclusao_parcial=false,
                  data_encerramento=now(), encerrado_por=$4 where id=$1`, [id, feito, pend, req.authUser.id]);
  await registrarEvento(pool, id, 'ENCERRAMENTO', `Chamado encerrado. Serviço feito: ${feito}.`, req.authUser);
  res.json({ ok: true, status: 'FECHADO' });
}));

app.patch('/chamados/:id/status', exigirManutencao, asyncH(async (req, res) => {
  const { id } = req.params;
  const acesso = await garantirAcessoChamadoAtendente(req, id);
  if (!acesso.ok) return res.status(acesso.status).json({ mensagem: acesso.mensagem });
  const novo = String(req.body?.status || '');
  if (!STATUS_TODOS.includes(novo)) return res.status(400).json({ mensagem: 'Status inválido.' });
  const { rows: [atual] } = await q('select status from chamados_unilink where id=$1', [id]);
  if (!atual) return res.status(404).json({ mensagem: 'Chamado não encontrado.' });
  if (!podeTransitar(atual.status, novo)) return res.status(409).json({ mensagem: `Transição ${atual.status} → ${novo} não permitida.` });
  const obs = txt(req.body?.observacao, 2000);
  await q('update chamados_unilink set status=$2 where id=$1', [id, novo]);
  const tipo = novo === 'EM_ATENDIMENTO' ? 'EM_ATENDIMENTO_INICIADO' : novo === 'FECHADO' ? 'ENCERRAMENTO' : 'OBSERVACAO';
  await registrarEvento(pool, id, tipo, `Status → ${novo}${obs ? ': ' + obs : ''}`, req.authUser);
  res.json({ ok: true, status: novo });
}));

app.patch('/chamados/:id/atribuir', exigirManutencao, asyncH(async (req, res) => {
  const { id } = req.params;
  const acesso = await garantirAcessoChamadoAtendente(req, id);
  if (!acesso.ok) return res.status(acesso.status).json({ mensagem: acesso.mensagem });
  const alvoId = String(req.body?.atribuidoPara || '');
  if (!UUID_RE.test(alvoId)) return res.status(400).json({ mensagem: 'Usuário inválido.' });
  const email = await emailDoUsuario(alvoId);
  if (!email) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
  const { rows: [perfilAlvo] } = await q('select papel from perfis_usuario where user_id=$1', [alvoId]);
  if (perfilAlvo?.papel === 'atendente') {
    const { rows: [chamado] } = await q('select servico from chamados_unilink where id=$1', [id]);
    const gruposAlvo = await gruposDoUsuario(alvoId);
    const servicos = normalizarServicosDoChamado(chamado?.servico || '');
    if (!servicos.length || !gruposAlvo.length || !servicos.some((s) => gruposAlvo.includes(s))) {
      return res.status(403).json({ mensagem: 'O usuário de destino não possui grupo compatível com este chamado.' });
    }
  }
  const r = await q('update chamados_unilink set atribuido_para=$2, atribuido_para_nome=$3, atribuido_em=now() where id=$1', [id, alvoId, email]);
  if (!r.rowCount) return res.status(404).json({ mensagem: 'Chamado não encontrado.' });
  await registrarEvento(pool, id, 'OBSERVACAO', `Atribuído a ${email}`, req.authUser);
  res.json({ ok: true });
}));

app.post('/chamados/:id/observacao', exigirManutencao, asyncH(async (req, res) => {
  const acesso = await garantirAcessoChamadoAtendente(req, req.params.id);
  if (!acesso.ok) return res.status(acesso.status).json({ mensagem: acesso.mensagem });
  const texto = txt(req.body?.texto, 2000);
  if (!texto) return res.status(400).json({ mensagem: 'Texto obrigatório.' });
  await registrarEvento(pool, req.params.id, 'OBSERVACAO', texto, req.authUser);
  res.status(201).json({ ok: true });
}));

app.post('/chamados/:id/eventos', exigirManutencao, asyncH(async (req, res) => {
  const acesso = await garantirAcessoChamadoAtendente(req, req.params.id);
  if (!acesso.ok) return res.status(acesso.status).json({ mensagem: acesso.mensagem });
  const tipo = String(req.body?.tipoEvento || '');
  if (!TIPOS_EVENTO.includes(tipo)) return res.status(400).json({ mensagem: 'Tipo de evento inválido.' });
  await registrarEvento(pool, req.params.id, tipo, txt(req.body?.descricao, 2000), req.authUser);
  res.status(201).json({ ok: true });
}));

// ---------------------------------------------------------- EVIDÊNCIAS (upload em disco)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5 } });

function detectarImagem(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

app.post('/chamados/:id/evidencias', limiteEscritaPublica, exigirLogin, (req, res, next) => {
  upload.single('arquivo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ mensagem: 'Arquivo muito grande: o limite é 8MB por foto.' });
    return res.status(400).json({ mensagem: 'Falha ao receber o arquivo.' });
  });
}, asyncH(async (req, res) => {
  const { id } = req.params;
  const etapa = String(req.body?.etapa || 'ABERTURA');
  if (!ETAPAS.includes(etapa)) return res.status(400).json({ mensagem: 'Etapa inválida.' });
  if (!req.file) return res.status(400).json({ mensagem: 'Envie o arquivo no campo "arquivo".' });
  const tipo = detectarImagem(req.file.buffer);
  if (!tipo) return res.status(400).json({ mensagem: 'Arquivo inválido: apenas JPG, PNG ou WEBP são aceitos.' });

  const { rows: [chamado] } = await q('select id, data_abertura from chamados_unilink where id=$1', [id]);
  if (!chamado) return res.status(404).json({ mensagem: 'Chamado não encontrado.' });

  const usuario = req.authUser || await getUsuario(req);
  if (!usuario || !usuario.perfil.ativo) return res.status(401).json({ mensagem: 'Faça login para anexar evidências.' });
  if (usuario.perfil.papel === 'solicitante') {
    if (etapa !== 'ABERTURA') return res.status(403).json({ mensagem: 'Seu perfil só pode anexar evidências na abertura do chamado.' });
    const { rows: [dono] } = await q('select criado_por from chamados_unilink where id=$1', [id]);
    if (!dono || dono.criado_por !== usuario.id) return res.status(403).json({ mensagem: 'Você só pode anexar evidências aos seus próprios chamados.' });
  }
  if (usuario.perfil.papel === 'atendente' && !['supervisor', 'administrador'].includes(usuario.perfil.papel)) {
    const { rows: [chamadoAcesso] } = await q('select servico from chamados_unilink where id=$1', [id]);
    const gruposUsuario = await gruposDoUsuario(usuario.id);
    const servicos = normalizarServicosDoChamado(chamadoAcesso?.servico || '');
    if (!gruposUsuario.length || !servicos.some((s) => gruposUsuario.includes(s))) {
      return res.status(403).json({ mensagem: 'Você não tem acesso a este chamado para anexar evidências.' });
    }
  }

  const nomeOriginal = txt(req.file.originalname, 200) || `foto.${tipo.ext}`;
  const nomeSan = nomeOriginal.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const storagePath = `${id}/${Date.now()}_${nomeSan}`;
  const destino = path.resolve(UPLOAD_ROOT, storagePath);
  if (!destino.startsWith(UPLOAD_ROOT + path.sep)) return res.status(400).json({ mensagem: 'Nome de arquivo inválido.' });
  await fs.promises.mkdir(path.dirname(destino), { recursive: true });
  await fs.promises.writeFile(destino, req.file.buffer, { flag: 'wx' });

  const nomeEnvio = usuario?.email || 'Solicitante (sem login)';
  try {
    await q(`insert into chamado_evidencias (chamado_id, storage_path, nome_arquivo, tipo_mime, tamanho_bytes, enviado_por, enviado_por_nome, etapa)
             values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, storagePath, nomeOriginal, tipo.mime, req.file.size, usuario?.id || null, nomeEnvio, etapa]);
  } catch (e) {
    await fs.promises.unlink(destino).catch(() => {});
    throw e;
  }
  await registrarEvento(pool, id, 'EVIDENCIA_ADICIONADA', `Foto anexada (${etapa.toLowerCase()}): ${nomeOriginal}`, usuario);
  res.status(201).json({ ok: true });
}));

// o <img> do navegador não manda Authorization; o id da evidência é um UUID não adivinhável
app.get('/evidencias/:id/arquivo', asyncH(async (req, res) => {
  const { rows: [ev] } = await q('select storage_path, tipo_mime from chamado_evidencias where id=$1', [req.params.id]);
  if (!ev) return res.status(404).json({ mensagem: 'Evidência não encontrada.' });
  const arquivo = path.resolve(UPLOAD_ROOT, ev.storage_path);
  if (!arquivo.startsWith(UPLOAD_ROOT + path.sep) || !fs.existsSync(arquivo)) return res.status(404).json({ mensagem: 'Arquivo não encontrado.' });
  res.setHeader('Content-Type', ev.tipo_mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(arquivo);
}));

// ---------------------------------------------------------- ADMIN
const mapUsuarioLinha = (r) => ({
  id: r.id,
  usuario: nomeDeExibicao(r.email),
  email: r.email,
  papel: r.papel || 'atendente',
  grupos: Array.isArray(r.grupos) ? r.grupos.filter(Boolean) : [],
  precisaTrocarSenha: !!r.precisa_trocar_senha,
  ativo: r.ativo !== false,
  bloqueado: !!r.bloqueado_ate,
  bloqueadoAte: r.bloqueado_ate || null,
  tentativasLogin: r.tentativas_login || 0,
  criadoEm: r.criado_em,
  criadoPerfilEm: r.perfil_criado_em || null,
  ultimoAcessoEm: r.ultimo_acesso_em || null
});
const SELECT_USUARIOS = `select u.id, u.email, u.criado_em, u.ultimo_acesso_em, p.papel, p.precisa_trocar_senha, p.ativo,
       p.criado_em as perfil_criado_em, p.tentativas_login, p.bloqueado_ate,
       coalesce(g.grupos, '{}'::text[]) as grupos
  from usuarios u
  left join perfis_usuario p on p.user_id = u.id
  left join (
    select ug.user_id, array_agg(g.codigo order by g.codigo) as grupos
      from usuario_grupos ug
      join grupos_servico g on g.id = ug.grupo_id
     where g.ativo = true
     group by ug.user_id
  ) g on g.user_id = u.id`;

app.get('/admin/grupos', exigirAdmin, asyncH(async (req, res) => {
  const { rows } = await q('select codigo, nome, ativo from grupos_servico where ativo = true order by codigo asc');
  res.json({ grupos: rows.map((row) => ({ codigo: row.codigo, nome: row.nome, ativo: row.ativo })) });
}));

app.get('/admin/usuarios', exigirAdmin, asyncH(async (req, res) => {
  const { rows } = await q(`${SELECT_USUARIOS} order by u.criado_em asc`);
  res.json({ usuarios: rows.map(mapUsuarioLinha), total: rows.length });
}));

app.get('/admin/usuarios/:id/grupos', exigirAdmin, asyncH(async (req, res) => {
  const { rows: [usuario] } = await q('select id from usuarios where id=$1', [req.params.id]);
  if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
  const grupos = await gruposDoUsuario(req.params.id);
  res.json({ grupos });
}));

app.put('/admin/usuarios/:id/grupos', exigirAdmin, asyncH(async (req, res) => {
  const { id } = req.params;
  const { rows: [usuario] } = await q('select email from usuarios where id=$1', [id]);
  if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });

  const gruposSolicitados = Array.isArray(req.body?.grupos) ? req.body.grupos.map((g) => normalizarCodigoGrupo(g)).filter(Boolean) : [];
  const gruposUnicos = [...new Set(gruposSolicitados)];
  if (gruposUnicos.some((g) => !g)) return res.status(400).json({ mensagem: 'Lista de grupos inválida.' });

  const { rows: gruposValidos } = await q('select codigo from grupos_servico where ativo = true and codigo = any($1::text[])', [gruposUnicos]);
  const validos = new Set(gruposValidos.map((row) => row.codigo));
  const invalidos = gruposUnicos.filter((codigo) => !validos.has(codigo));
  if (invalidos.length) return res.status(400).json({ mensagem: `Grupo(s) inválido(s): ${invalidos.join(', ')}` });

  const { rows: antesRows } = await q(
    `select g.codigo
       from usuario_grupos ug
       join grupos_servico g on g.id = ug.grupo_id
      where ug.user_id = $1 and g.ativo = true
      order by g.codigo asc`, [id]);
  const antes = antesRows.map((row) => row.codigo);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from usuario_grupos where user_id=$1', [id]);
    for (const codigo of gruposUnicos) {
      await client.query(
        `insert into usuario_grupos (user_id, grupo_id, criado_por)
         values ($1, (select id from grupos_servico where codigo=$2 and ativo=true), $3)
         on conflict do nothing`,
        [id, codigo, req.authUser.id]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const depois = gruposUnicos.slice().sort();
  await auditar('ALTERAR_GRUPOS', { id, nome: nomeDeExibicao(usuario.email) }, req.authUser, JSON.stringify({ antes, depois }), req.adminIp);
  logger.info(`Grupos do usuário ${id} alterados por ${req.authUser.email}: antes=${antes.join(',') || 'nenhum'} depois=${depois.join(',') || 'nenhum'}`);
  res.json({ ok: true, grupos: depois });
}));

app.get('/admin/usuarios/:id', exigirAdmin, asyncH(async (req, res) => {
  const { rows } = await q(`${SELECT_USUARIOS} where u.id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
  res.json(mapUsuarioLinha(rows[0]));
}));

app.post('/admin/usuarios', exigirAdmin, asyncH(async (req, res) => {
  const usuario = normalizarUsuario(req.body?.usuario);
  const papel = String(req.body?.papel || 'atendente');
  const senha = String(req.body?.senha || '');
  if (!usuarioValido(usuario)) return res.status(400).json({ mensagem: 'Usuário inválido: use 3–40 letras minúsculas, números, ponto, _ ou -.' });
  if (!PAPEIS.includes(papel)) return res.status(400).json({ mensagem: 'Papel inválido.' });
  if (senha.length < 8) return res.status(400).json({ mensagem: 'Senha inicial deve ter pelo menos 8 caracteres.' });
  const email = emailDeUsuario(usuario);
  const hash = await bcrypt.hash(senha, 10);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query('insert into usuarios (email, senha_hash) values ($1,$2) returning id', [email, hash]);
    await client.query(`insert into perfis_usuario (user_id, nome, papel, precisa_trocar_senha) values ($1,$2,$3,true)`, [rows[0].id, usuario, papel]);
    await client.query('commit');
    await auditar('CRIAR_USUARIO', { id: rows[0].id, nome: usuario }, req.authUser, `papel=${papel}`, req.adminIp);
    logger.info(`Usuario criado ${usuario} (${papel}) por ${req.authUser.email}`);
    res.status(201).json({ ok: true, id: rows[0].id, usuario, senhaDefinida: true });
  } catch (e) {
    await client.query('rollback').catch(() => {});
    if (e.code === '23505') return res.status(409).json({ mensagem: `Usuário "${usuario}" já existe.` });
    throw e;
  } finally { client.release(); }
}));

app.patch('/admin/usuarios/:id', exigirAdmin, asyncH(async (req, res) => {
  const { id } = req.params;
  if (id === req.authUser.id && req.body?.ativo === false) return res.status(400).json({ mensagem: 'Você não pode desativar a própria conta.' });
  const patch = {};
  if (typeof req.body?.nome === 'string' && req.body.nome.trim()) patch.nome = req.body.nome.trim().slice(0, 100);
  if (typeof req.body?.ativo === 'boolean') patch.ativo = req.body.ativo;
  const chaves = Object.keys(patch);
  if (!chaves.length) return res.status(400).json({ mensagem: 'Nenhum campo válido para atualizar.' });
  const sets = chaves.map((k, i) => `${k}=$${i + 2}`).join(', '); // chaves vêm do código, não do cliente
  const r = await q(`update perfis_usuario set ${sets} where user_id=$1`, [id, ...chaves.map(k => patch[k])]);
  if (!r.rowCount) return res.status(404).json({ mensagem: 'Perfil não encontrado.' });
  const email = await emailDoUsuario(id);
  await auditar('ATUALIZAR_USUARIO', { id, nome: email ? nomeDeExibicao(email) : id }, req.authUser, JSON.stringify(patch), req.adminIp);
  res.json({ ok: true });
}));

async function alterarPapel(req, res, id, papel) {
  if (!PAPEIS.includes(papel)) return res.status(400).json({ mensagem: 'Papel inválido.' });
  // O administrador não altera o próprio cargo (evita auto-rebaixamento acidental).
  if (id === req.authUser.id) return res.status(400).json({ mensagem: 'Você não pode alterar o próprio cargo. Peça a outro administrador.' });

  const client = await pool.connect();
  let papelAnterior;
  try {
    await client.query('begin');
    // trava as linhas de administradores para a checagem do "último admin" ser segura contra requisições simultâneas
    await client.query(`select 1 from perfis_usuario where papel='administrador' for update`);
    const { rows: [alvo] } = await client.query('select papel from perfis_usuario where user_id=$1 for update', [id]);
    if (!alvo) { await client.query('rollback'); return res.status(404).json({ mensagem: 'Perfil não encontrado.' }); }
    papelAnterior = alvo.papel;
    if (alvo.papel === papel) { await client.query('rollback'); return res.json({ ok: true, papel, inalterado: true }); }
    if (alvo.papel === 'administrador' && papel !== 'administrador') {
      const { rows: [c] } = await client.query(`select count(*)::int as n from perfis_usuario where papel='administrador' and ativo=true`);
      if (c.n <= 1) { await client.query('rollback'); return res.status(409).json({ mensagem: 'Não é possível rebaixar o último administrador ativo.' }); }
    }
    await client.query('update perfis_usuario set papel=$2 where user_id=$1', [id, papel]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally { client.release(); }

  const email = await emailDoUsuario(id);
  await auditar('ALTERAR_PAPEL', { id, nome: email ? nomeDeExibicao(email) : id }, req.authUser, `papel: ${papelAnterior} -> ${papel}`, req.adminIp);
  logger.info(`Papel alterado ${id}: ${papelAnterior} -> ${papel} por ${req.authUser.email}`);
  res.json({ ok: true, papel });
}
app.patch('/admin/usuarios/:id/role', exigirAdmin, asyncH((req, res) => alterarPapel(req, res, req.params.id, String(req.body?.papel || ''))));
// rota usada pelas telas antigas
app.post('/admin/usuarios/role', exigirAdmin, asyncH(async (req, res) => {
  const uid = String(req.body?.usuarioId || '');
  if (!UUID_RE.test(uid)) return res.status(400).json({ mensagem: 'usuarioId e papel válido são obrigatórios.' });
  return alterarPapel(req, res, uid, String(req.body?.papel || ''));
}));

app.patch('/admin/usuarios/:id/status', exigirAdmin, asyncH(async (req, res) => {
  const { id } = req.params;
  const ativo = !!req.body?.ativo;
  if (id === req.authUser.id && !ativo) return res.status(400).json({ mensagem: 'Você não pode suspender a própria conta.' });
  const alvo = await getPerfil(id);
  if (!alvo) return res.status(404).json({ mensagem: 'Perfil não encontrado.' });
  if (alvo.papel === 'administrador' && !ativo && (await contarAdministradoresAtivos()) <= 1) {
    return res.status(409).json({ mensagem: 'Não é possível suspender o último administrador ativo.' });
  }
  await q('update perfis_usuario set ativo=$2 where user_id=$1', [id, ativo]); // sessões caem na hora: exigirLogin checa "ativo" a cada request
  const email = await emailDoUsuario(id);
  await auditar(ativo ? 'REATIVAR_USUARIO' : 'SUSPENDER_USUARIO', { id, nome: email ? nomeDeExibicao(email) : id }, req.authUser, `ativo=${ativo}`, req.adminIp);
  logger.info(`Usuario ${id} ${ativo ? 'reativado' : 'suspenso'} por ${req.authUser.email}`);
  res.json({ ok: true, ativo });
}));

app.post('/admin/usuarios/:id/reset-senha', exigirAdmin, asyncH(async (req, res) => {
  const { id } = req.params;
  const nova = String(req.body?.novaSenha || '');
  if (nova.length < 8) return res.status(400).json({ mensagem: 'Nova senha deve ter pelo menos 8 caracteres.' });
  const hash = await bcrypt.hash(nova, 10);
  const r = await q('update usuarios set senha_hash=$2 where id=$1', [id, hash]);
  if (!r.rowCount) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
  await q('update perfis_usuario set precisa_trocar_senha=true where user_id=$1', [id]);
  const email = await emailDoUsuario(id);
  await auditar('RESET_SENHA', { id, nome: email ? nomeDeExibicao(email) : id }, req.authUser, null, req.adminIp);
  logger.info(`Senha resetada ${id} por ${req.authUser.email}`);
  res.json({ ok: true });
}));

app.post('/admin/usuarios/unlock', exigirAdmin, asyncH(async (req, res) => {
  const uid = String(req.body?.usuarioId || '');
  if (!UUID_RE.test(uid)) return res.status(400).json({ mensagem: 'usuarioId é obrigatório.' });
  await q('update perfis_usuario set tentativas_login=0, bloqueado_ate=null, ultima_tentativa_em=null where user_id=$1', [uid]);
  const email = await emailDoUsuario(uid);
  await auditar('DESBLOQUEAR_USUARIO', { id: uid, nome: email ? nomeDeExibicao(email) : uid }, req.authUser, null, req.adminIp);
  logger.info(`Usuario desbloqueado ${uid} por ${req.authUser.email}`);
  res.json({ ok: true });
}));

app.delete('/admin/usuarios/:id', exigirAdmin, asyncH(async (req, res) => {
  const { id } = req.params;
  if (id === req.authUser.id) return res.status(400).json({ mensagem: 'Você não pode excluir o próprio usuário.' });
  const alvo = await getPerfil(id);
  if (alvo?.papel === 'administrador' && (await contarAdministradoresAtivos()) <= 1) {
    return res.status(409).json({ mensagem: 'Não é possível excluir o último administrador ativo.' });
  }
  const email = await emailDoUsuario(id);
  if (!email) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
  try {
    await q('delete from usuarios where id=$1', [id]);
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ mensagem: 'Usuário possui chamados vinculados e não pode ser excluído. Considere suspender.' });
    throw e;
  }
  await auditar('EXCLUIR_USUARIO', { id, nome: nomeDeExibicao(email) }, req.authUser, null, req.adminIp);
  logger.info(`Usuario excluido ${email} por ${req.authUser.email}`);
  res.json({ ok: true });
}));

app.get('/admin/audit-logs', exigirAdmin, asyncH(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10) || 50));
  const [{ rows }, { rows: [c] }] = await Promise.all([
    q(`select id, acao, alvo_usuario_id, alvo_usuario_nome, feito_por, feito_por_nome, detalhe, ip_origem, criado_em
         from admin_auditoria order by criado_em desc limit $1 offset $2`, [limit, (page - 1) * limit]),
    q('select count(*)::int as n from admin_auditoria')
  ]);
  res.json({ logs: rows, total: c.n, page, limit });
}));

app.get('/admin/movimentos', exigirAdmin, asyncH(async (req, res) => {
  const limite = Math.min(parseInt(req.query.limite || '50', 10) || 50, 200);
  const uid = UUID_RE.test(String(req.query.usuarioId || '')) ? String(req.query.usuarioId) : null;
  const [ev, st, au] = await Promise.all([
    q(`select id, chamado_id, tipo_evento, descricao, usuario_id, usuario_nome, criado_em from chamado_eventos
        where ($2::uuid is null or usuario_id = $2) order by criado_em desc limit $1`, [limite, uid]),
    q(`select id, chamado_id, status_anterior, status_novo, usuario_id, usuario_nome, criado_em from chamado_status_historico
        where ($2::uuid is null or usuario_id = $2) order by criado_em desc limit $1`, [limite, uid]),
    q(`select id, acao, alvo_usuario_id, alvo_usuario_nome, feito_por, feito_por_nome, detalhe, ip_origem, criado_em from admin_auditoria
        where ($2::uuid is null or alvo_usuario_id = $2 or feito_por = $2) order by criado_em desc limit $1`, [limite, uid])
  ]);
  const movs = [
    ...ev.rows.map(e => ({ origem: 'evento', ...e })),
    ...st.rows.map(s => ({ origem: 'status', ...s })),
    ...au.rows.map(a => ({ origem: 'admin', ...a }))
  ].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)).slice(0, limite);
  res.json({ movimentos: movs });
}));

// ---------------------------------------------------------- erro final
app.use((err, req, res, _next) => {
  logger.error(`Erro não tratado ${req.method} ${req.originalUrl}`, err?.stack || String(err));
  if (res.headersSent) return;
  res.status(500).json({ mensagem: 'Erro interno.' });
});

const server = app.listen(PORT, () => logger.info(`UNILINK API rodando na porta ${PORT}`));
const encerrar = () => { server.close(() => pool.end().then(() => process.exit(0))); };
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
