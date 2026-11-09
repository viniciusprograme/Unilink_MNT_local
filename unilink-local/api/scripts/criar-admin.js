// Cria (ou promove/reseta) um administrador direto no banco.
// Uso:  docker compose run --rm api node scripts/criar-admin.js admin 'SenhaForte123'
// A senha precisa ter 8+ caracteres; no 1º login o sistema pede para trocar.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const [usuarioArg, senha] = process.argv.slice(2);
if (!usuarioArg || !senha) { console.error("Uso: node scripts/criar-admin.js <usuario> '<senha>'"); process.exit(1); }
if (senha.length < 8) { console.error('A senha precisa ter pelo menos 8 caracteres.'); process.exit(1); }
const usuario = usuarioArg.trim().toLowerCase();
if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) { console.error('Usuário inválido: 3–40 letras minúsculas, números, ponto, _ ou -.'); process.exit(1); }
const email = `${usuario}@unilink.local`;

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcrypt.hash(senha, 10);
  const { rows } = await pool.query(
    `insert into usuarios (email, senha_hash) values ($1,$2)
     on conflict (lower(email)) do update set senha_hash = excluded.senha_hash returning id`, [email, hash]);
  await pool.query(
    `insert into perfis_usuario (user_id, nome, papel, ativo, precisa_trocar_senha, tentativas_login, bloqueado_ate)
     values ($1,$2,'administrador',true,true,0,null)
     on conflict (user_id) do update set papel='administrador', ativo=true, precisa_trocar_senha=true, tentativas_login=0, bloqueado_ate=null`,
    [rows[0].id, usuario]);
  console.log(`OK: administrador "${usuario}" pronto (troca de senha obrigatória no 1º login).`);
  await pool.end();
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
